"""SQLAlchemy models and database initialization. SQLite=local only, Postgres=Neon."""
from __future__ import annotations
import os
import secrets
from datetime import date, datetime, timezone
from pathlib import Path
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, create_engine, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
PRODUCTION = os.getenv("PRODUCTION", "false").lower() == "true"
raw_url = os.getenv("DATABASE_URL", "sqlite:///./growa_local.sqlite3")
if PRODUCTION and not raw_url.startswith(("postgresql://", "postgresql+psycopg://")):
    raise RuntimeError("PRODUCTION requires a PostgreSQL DATABASE_URL (Neon).")
if raw_url.startswith("postgresql://"):
    raw_url = "postgresql+psycopg://" + raw_url[len("postgresql://"):]
if raw_url.startswith("postgres://"):
    raw_url = "postgresql+psycopg://" + raw_url[len("postgres://"):]
sqlite = raw_url.startswith("sqlite:")
engine = create_engine(raw_url, pool_pre_ping=True, pool_recycle=1800, connect_args={"check_same_thread": False} if sqlite else {})
SessionLocal = sessionmaker(engine, autoflush=False, expire_on_commit=False)

def uid() -> str:
    return secrets.token_hex(16)

def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(140))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="coordinator")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class SessionToken(Base):
    __tablename__ = "session_tokens"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)

class Listing(Base):
    __tablename__ = "listings"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    category: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(150))
    subtype: Mapped[str] = mapped_column(String(100), default="")
    zone: Mapped[str] = mapped_column(String(80), index=True, default="Mazatlán")
    description: Mapped[str] = mapped_column(Text, default="")
    latitude: Mapped[float] = mapped_column(Float, default=23.2494)
    longitude: Mapped[float] = mapped_column(Float, default=-106.4111)
    price_mxn: Mapped[int] = mapped_column(Integer, default=0)
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    accessible: Mapped[bool] = mapped_column(Boolean, default=False)
    english: Mapped[bool] = mapped_column(Boolean, default=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    image_url: Mapped[str] = mapped_column(Text, default="")
    contact_url: Mapped[str] = mapped_column(Text, default="")
    provider_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

class Slot(Base):
    __tablename__ = "slots"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    listing_id: Mapped[str] = mapped_column(ForeignKey("listings.id"), index=True)
    slot_date: Mapped[date] = mapped_column(Date, index=True)
    time_hhmm: Mapped[str] = mapped_column(String(5))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(30), default="manual")
    __table_args__ = (Index("ux_slot_unique", "listing_id", "slot_date", "time_hhmm", unique=True),)

class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    guest_alias: Mapped[str] = mapped_column(String(90))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    medical_id: Mapped[str] = mapped_column(ForeignKey("listings.id"))
    hotel_id: Mapped[str] = mapped_column(ForeignKey("listings.id"))
    transport_id: Mapped[str] = mapped_column(ForeignKey("listings.id"))
    slot_id: Mapped[str] = mapped_column(ForeignKey("slots.id"))
    arrival_date: Mapped[datetime.date] = mapped_column(Date)
    nights: Mapped[int] = mapped_column(Integer)
    guests: Mapped[int] = mapped_column(Integer, default=1)
    price_mxn: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    calendar_event_id: Mapped[str | None] = mapped_column(String(180), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (Index("ux_booking_idempotency", "created_by", "idempotency_key", unique=True),)

class BookingLeg(Base):
    __tablename__ = "booking_legs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), index=True)
    listing_id: Mapped[str] = mapped_column(ForeignKey("listings.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    price_mxn: Mapped[int] = mapped_column(Integer)
    confirmed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)

class CalendarToken(Base):
    __tablename__ = "calendar_tokens"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    ciphertext: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

class Audit(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    target_id: Mapped[str] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

def init_db() -> None:
    Base.metadata.create_all(bind=engine)

def session_scope():
    return SessionLocal()
