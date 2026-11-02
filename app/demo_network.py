"""Synthetic medical-network sandbox stored in Neon; never stores clinical or real patient data.

Only specially named demonstration tables are read. Real Journey patients are excluded.
Writing appointments requires a logged-in admin/coordinator and CSRF protection.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, select
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, SessionLocal, User, uid, now
from . import security

router = APIRouter(prefix="/api/demo-network", tags=["Synthetic medical network"])


class DemoPerson(Base):
    __tablename__ = "demo_network_people"
    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    display_name: Mapped[str] = mapped_column(String(100))
    specialty: Mapped[str] = mapped_column(String(90), default="")
    city: Mapped[str] = mapped_column(String(70), default="Mazatlán")
    languages: Mapped[str] = mapped_column(String(40), default="Español")
    clinic: Mapped[str] = mapped_column(String(100), default="Centro odontológico · DEMO")
    assigned_doctor_id: Mapped[str | None] = mapped_column(ForeignKey("demo_network_people.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class DemoVisit(Base):
    __tablename__ = "demo_network_visits"
    id: Mapped[str] = mapped_column(String(14), primary_key=True)
    doctor_id: Mapped[str] = mapped_column(ForeignKey("demo_network_people.id"), index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("demo_network_people.id"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=45)
    status: Mapped[str] = mapped_column(String(16), default="proposed")
    service_label: Mapped[str] = mapped_column(String(100), default="Consulta de orientación · DEMO")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


def person_data(p: DemoPerson) -> dict:
    return {"id": p.id, "kind": p.kind, "name": p.display_name, "specialty": p.specialty,
            "city": p.city, "languages": p.languages, "clinic": p.clinic,
            "doctor_id": p.assigned_doctor_id}


def visit_data(v: DemoVisit) -> dict:
    return {"id": v.id, "doctor_id": v.doctor_id, "patient_id": v.patient_id,
            "starts_at": v.starts_at.isoformat(), "duration_minutes": v.duration_minutes,
            "status": v.status, "service": v.service_label}


@router.get("")
def network_overview():
    """Publicly viewable ONLY because this table contains fabricated labels and appointments."""
    with SessionLocal() as db:
        people = list(db.scalars(select(DemoPerson).order_by(DemoPerson.id)))
        visits = list(db.scalars(select(DemoVisit).order_by(DemoVisit.starts_at, DemoVisit.id)))
        return {"demo": True, "notice": "RED FICTICIA · No son médicos, pacientes o citas reales. No se ofrecen horarios reservables.",
                "doctors": [person_data(p) for p in people if p.kind == "doctor"],
                "patients": [person_data(p) for p in people if p.kind == "patient"],
                "appointments": [visit_data(v) for v in visits]}


class VisitRequest(BaseModel):
    doctor_id: str = Field(pattern=r"^DR[0-9]{3}$")
    patient_id: str = Field(pattern=r"^PT[0-9]{3}$")
    starts_at: datetime
    duration_minutes: int = Field(default=45, ge=15, le=180)
    service: str = Field(default="Consulta de orientación · DEMO", min_length=3, max_length=100)


def overlap(db, doctor_id: str, start: datetime, finish: datetime, ignore_id: str | None = None) -> bool:
    rows = db.scalars(select(DemoVisit).where(DemoVisit.doctor_id == doctor_id,
                                             DemoVisit.status != "cancelled"))
    return any(r.id != ignore_id and start < r.starts_at + timedelta(minutes=r.duration_minutes)
               and finish > r.starts_at for r in rows)


@router.post("/appointments", status_code=201, dependencies=[Depends(security.check_csrf)])
def new_visit(body: VisitRequest, user: User = Depends(security.require("admin", "coordinator"))):
    start = body.starts_at
    if start.tzinfo is not None:
        raise HTTPException(422, "Usa la hora local de Mazatlán, sin zona horaria adjunta.")
    if start < now() - timedelta(days=1) or start > now() + timedelta(days=180):
        raise HTTPException(422, "Elige una fecha dentro de los próximos seis meses.")
    if start.hour < 8 or start.hour > 18 or start.weekday() > 4:
        raise HTTPException(422, "La agenda ficticia admite lunes a viernes, de 08:00 a 18:00.")
    with SessionLocal.begin() as db:
        doc, patient = db.get(DemoPerson, body.doctor_id), db.get(DemoPerson, body.patient_id)
        if not doc or not patient or doc.kind != "doctor" or patient.kind != "patient" or patient.assigned_doctor_id != doc.id:
            raise HTTPException(422, "Selecciona un paciente asignado a este médico de demostración.")
        if overlap(db, doc.id, start, start + timedelta(minutes=body.duration_minutes)):
            raise HTTPException(409, "Este horario ya está ocupado en la agenda de prueba.")
        visit = DemoVisit(id="AP" + uid()[:10].upper(), doctor_id=doc.id, patient_id=patient.id,
                          starts_at=start, duration_minutes=body.duration_minutes,
                          status="proposed", service_label=body.service.strip())
        db.add(visit)
        db.flush()
        return visit_data(visit)


class VisitStatus(BaseModel):
    status: Literal["proposed", "confirmed", "cancelled"]


@router.patch("/appointments/{visit_id}", dependencies=[Depends(security.check_csrf)])
def set_visit_status(visit_id: str, body: VisitStatus,
                     user: User = Depends(security.require("admin", "coordinator"))):
    with SessionLocal.begin() as db:
        row = db.get(DemoVisit, visit_id)
        if not row:
            raise HTTPException(404, "Cita de demostración no encontrada.")
        if body.status != "cancelled" and overlap(db, row.doctor_id, row.starts_at,
                row.starts_at + timedelta(minutes=row.duration_minutes), row.id):
            raise HTTPException(409, "Existe una cita de prueba en este horario.")
        row.status = body.status
        db.flush()
        return visit_data(row)
