from sqlalchemy import String, Float, Boolean, Text, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from .database import Base

class Visit(Base):
    __tablename__ = "visits"
    __table_args__ = (UniqueConstraint("place_id","user_id", name="uq_place_user"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[str] = mapped_column(String(300), index=True)
    user_id: Mapped[str] = mapped_column(String(100), index=True)
    user_name: Mapped[str] = mapped_column(String(200), default="User")
    name: Mapped[str] = mapped_column(String(500))
    address: Mapped[str] = mapped_column(String(1000), default="")
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    visited: Mapped[bool] = mapped_column(Boolean, default=True)
    sold: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
