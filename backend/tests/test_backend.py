import os
import tempfile
from concurrent.futures import ThreadPoolExecutor

import pytest

# Set before importing the application so its engine uses an isolated file.
_test_directory = tempfile.TemporaryDirectory(prefix="agentarena-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_directory.name}/test.db"

from fastapi.testclient import TestClient
from app.database import Base, engine
from app.engine import simulate
from app.main import app


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def config():
    return {"name": "Example", "seed": 42, "target": 100, "max_rounds": 20,
            "agents": [{"name": "One", "strategy": "random"},
                       {"name": "Two", "strategy": "cautious"}]}


def test_engine_reproducible_and_strategy_and_seed_matter(config):
    result, trace = simulate(config)
    assert (result, trace) == simulate(config)
    assert sum(score["contribution"] for score in result["scores"]) == result["final_value"]
    assert [event["sequence"] for event in trace] == list(range(1, len(trace) + 1))
    assert all(event["value_after"] == event["value_before"] + event["action"] for event in trace)
    assert simulate({**config, "seed": 43})[1] != trace
    assert simulate({**config, "agents": [{"name": "One", "strategy": "greedy"}, config["agents"][1]]})[1] != trace


def test_bounded_unreached_target(config):
    result, trace = simulate({**config, "target": 1000, "max_rounds": 1})
    assert result["rounds"] == 1
    assert result["total_actions"] == len(trace) == 2
    assert result["target_reached"] is False


def test_api_persists_and_repeat_run_is_idempotent(client, config):
    assert client.get("/health").json() == {"status": "ok"}
    created = client.post("/experiments", json=config).json()
    assert created["status"] == "draft" and created["trace"] == [] and created["result"] is None
    experiment_id = created["id"]
    completed = client.post(f"/experiments/{experiment_id}/run").json()
    assert completed["status"] == "completed"
    assert completed["result"], completed
    assert client.post(f"/experiments/{experiment_id}/run").json() == completed
    assert client.get(f"/experiments/{experiment_id}/trace").json() == completed["trace"]
    assert client.get(f"/experiments/{experiment_id}").json() == completed
    assert client.get("/experiments").json()[0] == completed
    # A new client/session sees the committed result.
    with TestClient(app) as another_client:
        assert another_client.get(f"/experiments/{experiment_id}").json() == completed


@pytest.mark.parametrize("change", [
    {"name": "   "}, {"seed": -1}, {"seed": 2147483648}, {"seed": True},
    {"target": 1}, {"target": 1001}, {"max_rounds": 0}, {"max_rounds": 101},
    {"agents": [{"name": "One", "strategy": "greedy"}]},
    {"agents": [{"name": " One ", "strategy": "greedy"}, {"name": "one", "strategy": "random"}]},
    {"agents": [{"name": "One", "strategy": "unknown"}, {"name": "Two", "strategy": "random"}]},
])
def test_validation(client, config, change):
    assert client.post("/experiments", json={**config, **change}).status_code == 422


def test_missing_ids(client):
    for method, path in [("get", "/experiments/999"), ("get", "/experiments/999/trace"),
                         ("post", "/experiments/999/run")]:
        assert getattr(client, method)(path).status_code == 404


@pytest.mark.parametrize("method,suffix", [("get", ""), ("get", "/trace"), ("post", "/run")])
@pytest.mark.parametrize("experiment_id,expected", [
    (0, 422), (-1, 422), (2147483647, 404), (2147483648, 422),
    (999999999999999999999999999999, 422),
])
def test_id_bounds(client, method, suffix, experiment_id, expected):
    response = getattr(client, method)(f"/experiments/{experiment_id}{suffix}")
    assert response.status_code == expected


def test_concurrent_run_requests_return_one_result(client, config):
    experiment_id = client.post("/experiments", json=config).json()["id"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda _: client.post(f"/experiments/{experiment_id}/run"), range(4)))
    assert all(response.status_code == 200 for response in responses)
    assert all(response.json() == responses[0].json() for response in responses)
    assert len(client.get(f"/experiments/{experiment_id}/trace").json()) == responses[0].json()["result"]["total_actions"]
