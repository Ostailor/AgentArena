from contextlib import asynccontextmanager
from datetime import datetime
import os
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StringConstraints, model_validator
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from .database import Base, Experiment, SessionLocal, engine
from .engine import simulate

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
ExperimentId = Annotated[int, Path(ge=1, le=2147483647)]


class Agent(BaseModel):
    name: Name
    strategy: Literal["greedy", "cautious", "random"]


class ExperimentInput(BaseModel):
    name: Name
    seed: int = Field(ge=0, le=2147483647, strict=True)
    target: int = Field(ge=2, le=1000, strict=True)
    max_rounds: int = Field(ge=1, le=100, strict=True)
    agents: list[Agent] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def distinct_names(self):
        if self.agents[0].name.casefold() == self.agents[1].name.casefold():
            raise ValueError("Agent names must be distinct")
        return self


class Observation(BaseModel):
    value: int
    target: int


class TraceEvent(BaseModel):
    sequence: int
    round: int
    agent: str
    strategy: Literal["greedy", "cautious", "random"]
    observation: Observation
    action: int
    reasoning: str
    value_before: int
    value_after: int


class Score(BaseModel):
    agent: str
    contribution: int


class Result(BaseModel):
    final_value: int
    target_reached: bool
    rounds: int
    total_actions: int
    scores: list[Score]


class ExperimentDetail(ExperimentInput):
    id: int
    status: Literal["draft", "running", "completed", "error"]
    result: Result | None
    trace: list[TraceEvent]
    created_at: datetime


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="AgentArena API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
                   allow_methods=["*"], allow_headers=["*"])


def db_session():
    with SessionLocal() as session:
        yield session


def detail(experiment: Experiment) -> dict:
    return {key: getattr(experiment, key) for key in
            ("id", "name", "seed", "target", "max_rounds", "agents", "status", "result", "trace", "created_at")}


def get_experiment(db: Session, experiment_id: int) -> Experiment:
    experiment = db.get(Experiment, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@app.get("/health")
def health(db: Session = Depends(db_session)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.post("/experiments", response_model=ExperimentDetail)
def create_experiment(config: ExperimentInput, db: Session = Depends(db_session)):
    experiment = Experiment(**config.model_dump(), status="draft", result=None, trace=[])
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    return detail(experiment)


@app.get("/experiments", response_model=list[ExperimentDetail])
def list_experiments(db: Session = Depends(db_session)):
    return [detail(item) for item in db.scalars(select(Experiment).order_by(Experiment.created_at.desc(), Experiment.id.desc()))]


@app.get("/experiments/{experiment_id}", response_model=ExperimentDetail)
def read_experiment(experiment_id: ExperimentId, db: Session = Depends(db_session)):
    return detail(get_experiment(db, experiment_id))


@app.post("/experiments/{experiment_id}/run", response_model=ExperimentDetail)
def run_experiment(experiment_id: ExperimentId, db: Session = Depends(db_session)):
    # The conditional write locks the row until the result and trace commit together.
    claimed = db.execute(update(Experiment).where(Experiment.id == experiment_id, Experiment.status == "draft")
                         .values(status="running").execution_options(synchronize_session=False))
    if claimed.rowcount == 0:
        db.rollback()
        experiment = get_experiment(db, experiment_id)
        if experiment.status == "completed":
            return detail(experiment)
        raise HTTPException(status_code=409, detail=f"Experiment is {experiment.status}")
    experiment = get_experiment(db, experiment_id)
    result, trace = simulate(detail(experiment))
    experiment.result, experiment.trace, experiment.status = result, trace, "completed"
    db.commit()
    db.refresh(experiment)
    return detail(experiment)


@app.get("/experiments/{experiment_id}/trace", response_model=list[TraceEvent])
def read_trace(experiment_id: ExperimentId, db: Session = Depends(db_session)):
    return get_experiment(db, experiment_id).trace
