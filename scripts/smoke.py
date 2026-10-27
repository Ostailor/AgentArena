"""Exercise the running API and its database; leaves named smoke experiments behind."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--verify-id", type=int, help="Verify a persisted completed run after restart")
    args = parser.parse_args()

    def request(path, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = Request(args.api + path, data=data, headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=30) as response:
            return json.load(response)

    assert request("/health") == {"status": "ok"}
    if args.verify_id is not None:
        saved = request(f"/experiments/{args.verify_id}")
        assert saved["status"] == "completed" and saved["trace"]
        assert saved["result"]["total_actions"] == len(saved["trace"])
        print(f"PASS persisted completed experiment {args.verify_id} after restart")
        return

    config = {"name": "Integration smoke", "seed": 42, "target": 70, "max_rounds": 20,
              "agents": [{"name": "Alpha", "strategy": "random"},
                         {"name": "Beta", "strategy": "cautious"}]}
    first = request("/experiments", config)
    assert first["status"] == "draft" and first["trace"] == []
    run_path = f"/experiments/{first['id']}/run"
    with ThreadPoolExecutor(max_workers=4) as pool:
        runs = list(pool.map(lambda _: request(run_path, {}), range(4)))
    completed = runs[0]
    assert all(run == completed for run in runs), "Concurrent requests must return one stored run"
    second = request("/experiments", config)
    reproduced = request(f"/experiments/{second['id']}/run", {})
    assert completed["result"] == reproduced["result"]
    assert completed["trace"] == reproduced["trace"]
    trace = request(f"/experiments/{first['id']}/trace")
    assert trace == completed["trace"]
    previous = 0
    for sequence, event in enumerate(trace, 1):
        assert event["sequence"] == sequence and event["value_before"] == previous
        assert event["value_after"] == previous + event["action"]
        previous = event["value_after"]
    assert previous == completed["result"]["final_value"]
    assert any(item["id"] == first["id"] for item in request("/experiments"))
    try:
        request("/experiments", {**config, "agents": [config["agents"][0]]})
        raise AssertionError("Invalid single-agent configuration was accepted")
    except HTTPError as error:
        assert error.code == 422
    print(f"PASS health, persistence, determinism, 4 concurrent same-run requests, trace invariants, validation; persisted_id={first['id']}")


if __name__ == "__main__":
    main()
