import os

from sqlalchemy import JSON, DateTime, Integer, String, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://agentarena:agentarena-local@localhost:5432/agentarena")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Experiment(Base):
    __tablename__ = "experiments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    seed: Mapped[int] = mapped_column(Integer)
    target: Mapped[int] = mapped_column(Integer)
    max_rounds: Mapped[int] = mapped_column(Integer)
    agents: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    trace: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
