"""Growa Journey: auditable, non-clinical patient / provider coordination.

Deliberately excludes medical histories, diagnostic notes, uploads and payments.
Access is enforced on every operation, never only through the frontend.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from time import monotonic
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, mapped_column

from . import security
from .db import Audit, Base, Listing, SessionLocal, User, now, uid

router = APIRouter(prefix="/api/journey", tags=["Patient journey"])

STAGES = ["request", "review", "planning", "scheduled", "completed"]
LABELS = {
    "request": "Solicitud recibida",
    "review": "Revisión administrativa",
    "planning": "Organizando la visita",
    "scheduled": "Cita confirmada",
    "completed": "Proceso finalizado",
    "cancelled": "Proceso cancelado",
}
CATEGORIES = {"cita", "viaje", "documentacion", "presupuesto", "general"}
TASK_TYPES = {"documentacion", "cita", "viaje", "presupuesto", "general"}
ROLES = {"patient", "provider"}
attempts: dict[str, list[float]] = defaultdict(list)


class JourneyCase(Base):
    __tablename__ = "journey_cases"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    patient_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    patient_email: Mapped[str] = mapped_column(String(180), index=True)
    patient_name: Mapped[str] = mapped_column(String(140))
    provider_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    listing_id: Mapped[str] = mapped_column(ForeignKey("listings.id"), index=True)
    service_label: Mapped[str] = mapped_column(String(110))
    preferred_language: Mapped[str] = mapped_column(String(2), default="es")
    stage: Mapped[str] = mapped_column(String(20), default="request", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class JourneyInvite(Base):
    __tablename__ = "journey_invites"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("journey_cases.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class JourneyTask(Base):
    __tablename__ = "journey_tasks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("journey_cases.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    detail: Mapped[str] = mapped_column(String(320), default="")
    kind: Mapped[str] = mapped_column(String(24), default="general")
    assigned_to: Mapped[str] = mapped_column(String(16), default="patient")
    completed: Mapped[bool] = mapped_column(default=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class JourneyMessage(Base):
    __tablename__ = "journey_messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("journey_cases.id"), index=True)
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    category: Mapped[str] = mapped_column(String(24), default="general")
    text: Mapped[str] = mapped_column(String(700))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class JourneyAppointment(Base):
    __tablename__ = "journey_appointments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("journey_cases.id"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    mode: Mapped[str] = mapped_column(String(20), default="presencial")
    state: Mapped[str] = mapped_column(String(20), default="proposed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class JourneyEvent(Base):
    __tablename__ = "journey_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("journey_cases.id"), index=True)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    event: Mapped[str] = mapped_column(String(40))
    label: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


def digest(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def event(db, case_id: str, actor: str | None, code: str, label: str):
    db.add(JourneyEvent(case_id=case_id, actor_id=actor, event=code, label=label[:160]))


def access(db, case_id: str, user: User) -> JourneyCase:
    record = db.get(JourneyCase, case_id)
    if not record:
        raise HTTPException(404, "Proceso no encontrado.")
    if user.role in ("admin", "coordinator"):
        return record
    if record.patient_user_id == user.id or (user.role == "provider" and record.provider_user_id == user.id):
        return record
    # Do not distinguish between missing and unauthorized records.
    raise HTTPException(404, "Proceso no encontrado.")


def staff(user: User, case: JourneyCase):
    if user.role not in ("admin", "coordinator") and not (user.role == "provider" and case.provider_user_id == user.id):
        raise HTTPException(403, "Solo el equipo autorizado puede realizar esta acción.")


def task_data(row):
    return {"id": row.id, "title": row.title, "detail": row.detail, "kind": row.kind,
            "assigned_to": row.assigned_to, "completed": row.completed,
            "due_date": row.due_date.isoformat() if row.due_date else None}


def summary(db, c):
    tasks = list(db.scalars(select(JourneyTask).where(JourneyTask.case_id == c.id)))
    return {"id": c.id, "patient_name": c.patient_name, "service_label": c.service_label,
            "stage": c.stage, "stage_label": LABELS.get(c.stage, c.stage),
            "provider": db.get(User, c.provider_user_id).name,
            "clinic": db.get(Listing, c.listing_id).name,
            "tasks_done": sum(t.completed for t in tasks), "tasks_total": len(tasks),
            "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat(),
            "claimed": bool(c.patient_user_id)}


def throttle(ip: str):
    t = monotonic()
    key = "join:" + ip
    attempts[key] = [s for s in attempts[key] if t - s < 3600]
    if len(attempts[key]) >= 8:
        raise HTTPException(429, "Demasiados intentos. Inténtalo más tarde.")
    attempts[key].append(t)


def check_origin(request: Request):
    origin = request.headers.get("origin")
    expected = os.getenv("PUBLIC_BASE_URL", str(request.base_url)).rstrip("/")
    if origin and origin.rstrip("/") != expected:
        raise HTTPException(403, "Origen no autorizado.")


class NewCase(BaseModel):
    patient_name: str = Field(min_length=2, max_length=140)
    patient_email: str = Field(min_length=6, max_length=180)
    listing_id: str
    service_label: str = Field(min_length=3, max_length=110)
    preferred_language: Literal["es", "en"] = "es"


@router.get("/providers")
def providers(user: User = Depends(security.require("admin", "coordinator"))):
    with SessionLocal() as db:
        rows = list(db.scalars(select(Listing).where(
            Listing.category == "medico", Listing.active.is_(True),
            Listing.demo.is_(False), Listing.verified.is_(True), Listing.provider_user_id.is_not(None)
        ).order_by(Listing.name)))
        return [{"id": r.id, "name": r.name, "provider": db.get(User, r.provider_user_id).name}
                for r in rows if db.get(User, r.provider_user_id).active]


@router.post("/cases", status_code=201, dependencies=[Depends(security.check_csrf)])
def create_case(body: NewCase, request: Request, user: User = Depends(security.require("admin", "coordinator"))):
    email = body.patient_email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(422, "Correo no válido.")
    with SessionLocal.begin() as db:
        listing = db.get(Listing, body.listing_id)
        if not listing or not listing.active or listing.demo or not listing.verified or listing.category != "medico" or not listing.provider_user_id:
            raise HTTPException(422, "Selecciona una clínica real verificada y con cuenta profesional asignada.")
        provider = db.get(User, listing.provider_user_id)
        if not provider or not provider.active:
            raise HTTPException(422, "El proveedor no tiene cuenta activa.")
        existing = db.scalar(select(User).where(User.email == email))
        case = JourneyCase(patient_user_id=None, patient_email=email,
                           patient_name=body.patient_name.strip(), provider_user_id=provider.id,
                           listing_id=listing.id, service_label=body.service_label.strip(),
                           preferred_language=body.preferred_language)
        db.add(case)
        db.flush()
        raw = secrets.token_urlsafe(36)
        db.add(JourneyInvite(case_id=case.id, token_hash=digest(raw), expires_at=now() + timedelta(days=7)))
        event(db, case.id, user.id, "created", "Solicitud administrativa registrada")
        db.add(Audit(user_id=user.id, action="journey_created", target_id=case.id))
        result = {"case": summary(db, case),
                  "invitation_url": os.getenv("PUBLIC_BASE_URL", str(request.base_url)).rstrip("/") + "/mi-proceso#invite=" + raw,
                  "expires_in_days": 7, "existing_account": bool(existing),
                  "notice": "Entrega este enlace privado al paciente por un canal seguro. No se envían correos automáticamente."}
        return result


class ReissueRequest(BaseModel):
    # Explicit action; the response returns the link only to authorized staff.
    reason: str = Field(default="Reemisión solicitada", min_length=3, max_length=100)


@router.post("/cases/{case_id}/reissue", dependencies=[Depends(security.check_csrf)])
def reissue_invitation(case_id: str, body: ReissueRequest, request: Request,
                       user: User = Depends(security.require("admin", "coordinator"))):
    with SessionLocal.begin() as db:
        c = access(db, case_id, user)
        if c.patient_user_id:
            raise HTTPException(409, "El paciente ya activó su acceso.")
        existing = list(db.scalars(select(JourneyInvite)
                                   .where(JourneyInvite.case_id == c.id, JourneyInvite.redeemed_at.is_(None))))
        for invitation in existing:
            invitation.expires_at = now()
        raw = secrets.token_urlsafe(36)
        db.add(JourneyInvite(case_id=c.id, token_hash=digest(raw),
                             expires_at=now() + timedelta(days=7)))
        event(db, c.id, user.id, "invite_reissued", "Invitación privada renovada")
        db.add(Audit(user_id=user.id, action="journey_invite_reissued", target_id=c.id))
        return {"invitation_url": os.getenv("PUBLIC_BASE_URL", str(request.base_url)).rstrip("/")
                + "/mi-proceso#invite=" + raw, "expires_in_days": 7,
                "notice": "El enlace anterior dejó de ser válido. Comparte únicamente el nuevo."}


class Claim(BaseModel):
    token: str = Field(min_length=30, max_length=200)
    email: str = Field(min_length=6, max_length=180)
    name: str = Field(min_length=2, max_length=140)
    password: str = Field(min_length=14, max_length=200)
    accept_terms: bool = False


def valid_invite(db, token: str, email: str):
    if not 30 <= len(token) <= 200:
        raise HTTPException(400, "Invitación inválida.")
    invite = db.scalar(select(JourneyInvite).where(JourneyInvite.token_hash == digest(token)).with_for_update())
    if not invite or invite.redeemed_at or invite.expires_at < now():
        raise HTTPException(400, "Invitación inválida o vencida.")
    case = db.get(JourneyCase, invite.case_id)
    if not case or not hmac.compare_digest(case.patient_email, email.strip().lower()) or case.patient_user_id:
        raise HTTPException(400, "La invitación no coincide con la cuenta.")
    return invite, case


@router.post("/claim", status_code=201)
def claim(body: Claim, request: Request, response: Response):
    check_origin(request)
    if not body.accept_terms:
        raise HTTPException(422, "Debes aceptar el aviso de privacidad y las condiciones del piloto.")
    throttle(request.client.host if request.client else "unknown")
    try:
        with SessionLocal.begin() as db:
            invite, case = valid_invite(db, body.token, body.email)
            if db.scalar(select(User.id).where(User.email == case.patient_email)):
                raise HTTPException(409, "Ya existe una cuenta: inicia sesión y acepta la invitación.")
            user = User(email=case.patient_email, name=body.name.strip(),
                        password_hash=security.hash_password(body.password), role="patient")
            db.add(user)
            db.flush()
            case.patient_user_id = user.id
            case.updated_at = now()
            invite.redeemed_at = now()
            event(db, case.id, user.id, "claimed", "El paciente activó su espacio")
            db.add(Audit(user_id=user.id, action="journey_claimed", target_id=case.id))
            security.create_session(db, response, user)
        return {"ok": True}
    except IntegrityError as exc:
        raise HTTPException(409, "Ya existe una cuenta con ese correo.") from exc


class ClaimExisting(BaseModel):
    token: str = Field(min_length=30, max_length=200)


@router.post("/claim-existing", dependencies=[Depends(security.check_csrf)])
def claim_existing(body: ClaimExisting, user: User = Depends(security.current_user)):
    with SessionLocal.begin() as db:
        invite, case = valid_invite(db, body.token, user.email)
        case.patient_user_id = user.id
        case.updated_at = now()
        invite.redeemed_at = now()
        event(db, case.id, user.id, "claimed", "El paciente vinculó su cuenta")
        db.add(Audit(user_id=user.id, action="journey_claimed", target_id=case.id))
    return {"ok": True}


@router.get("/cases")
def list_cases(user: User = Depends(security.current_user)):
    with SessionLocal() as db:
        q = select(JourneyCase)
        if user.role == "provider":
            q = q.where(JourneyCase.provider_user_id == user.id)
        elif user.role not in ("admin", "coordinator"):
            q = q.where(JourneyCase.patient_user_id == user.id)
        cases = list(db.scalars(q.order_by(JourneyCase.updated_at.desc()).limit(150)))
        return {"role": user.role, "items": [summary(db, c) for c in cases]}


@router.get("/cases/{case_id}")
def case_detail(case_id: str, user: User = Depends(security.current_user)):
    with SessionLocal() as db:
        c = access(db, case_id, user)
        tasks = list(db.scalars(select(JourneyTask).where(JourneyTask.case_id == c.id)
                                .order_by(JourneyTask.completed, JourneyTask.created_at)))
        messages = list(db.scalars(select(JourneyMessage).where(JourneyMessage.case_id == c.id)
                                   .order_by(JourneyMessage.created_at)))
        appointments = list(db.scalars(select(JourneyAppointment).where(JourneyAppointment.case_id == c.id)
                                       .order_by(JourneyAppointment.starts_at.desc())))
        events = list(db.scalars(select(JourneyEvent).where(JourneyEvent.case_id == c.id)
                                 .order_by(JourneyEvent.created_at.desc()).limit(40)))
        return {
            "case": summary(db, c), "patient_email": c.patient_email if user.role in ("admin", "coordinator", "provider") else None,
            "stages": [{"code": x, "label": LABELS[x]} for x in STAGES],
            "tasks": [task_data(t) for t in tasks],
            "messages": [{"id": m.id, "sender": db.get(User, m.sender_id).name,
                          "self": m.sender_id == user.id, "category": m.category,
                          "text": m.text, "created_at": m.created_at.isoformat()} for m in messages],
            "appointments": [{"id": a.id, "starts_at": a.starts_at.isoformat(),
                              "duration_minutes": a.duration_minutes, "mode": a.mode, "state": a.state} for a in appointments],
            "events": [{"label": e.label, "created_at": e.created_at.isoformat(),
                        "by": db.get(User, e.actor_id).name if e.actor_id and db.get(User, e.actor_id) else "Sistema"} for e in events],
            "can_manage": user.role in ("admin", "coordinator") or (user.role == "provider" and c.provider_user_id == user.id),
            "notice": "Solo coordinación administrativa. No compartas diagnósticos, estudios, imágenes ni expedientes médicos."
        }


class NewTask(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    detail: str = Field(default="", max_length=320)
    kind: Literal["documentacion", "cita", "viaje", "presupuesto", "general"] = "general"
    assigned_to: Literal["patient", "provider"] = "patient"
    due_date: date | None = None


@router.post("/cases/{case_id}/tasks", status_code=201, dependencies=[Depends(security.check_csrf)])
def add_task(case_id: str, body: NewTask, user: User = Depends(security.current_user)):
    with SessionLocal.begin() as db:
        c = access(db, case_id, user)
        staff(user, c)
        if c.stage in ("completed", "cancelled"):
            raise HTTPException(409, "El proceso está cerrado.")
        row = JourneyTask(case_id=c.id, **body.model_dump())
        db.add(row)
        db.flush()
        c.updated_at = now()
        event(db, c.id, user.id, "task_added", "Nuevo pendiente administrativo: " + row.title)
        return task_data(row)


class TaskUpdate(BaseModel):
    completed: bool


@router.patch("/cases/{case_id}/tasks/{task_id}", dependencies=[Depends(security.check_csrf)])
def update_task(case_id: str, task_id: str, body: TaskUpdate, user: User = Depends(security.current_user)):
    with SessionLocal.begin() as db:
        c = access(db, case_id, user)
        if c.stage in ("completed", "cancelled"):
            raise HTTPException(409, "El proceso está cerrado.")
        row = db.scalar(select(JourneyTask).where(JourneyTask.id == task_id, JourneyTask.case_id == c.id).with_for_update())
        if not row:
            raise HTTPException(404, "Pendiente no encontrado.")
        manager = user.role in ("admin", "coordinator") or (user.role == "provider" and c.provider_user_id == user.id)
        if not manager and (c.patient_user_id != user.id or row.assigned_to != "patient"):
            raise HTTPException(403, "No puedes modificar este pendiente.")
        row.completed = body.completed
        row.completed_at = now() if body.completed else None
        c.updated_at = now()
        event(db, c.id, user.id, "task_updated", ("Pendiente completado: " if body.completed else "Pendiente reabierto: ") + row.title)
        return task_data(row)


class NewMessage(BaseModel):
    text: str = Field(min_length=2, max_length=700)
    category: Literal["cita", "viaje", "documentacion", "presupuesto", "general"] = "general"


@router.post("/cases/{case_id}/messages", status_code=201, dependencies=[Depends(security.check_csrf)])
def add_message(case_id: str, body: NewMessage, user: User = Depends(security.current_user)):
    with SessionLocal.begin() as db:
        c = access(db, case_id, user)
        if c.stage in ("completed", "cancelled"):
            raise HTTPException(409, "El proceso está cerrado.")
        text = body.text.strip()
        if not text:
            raise HTTPException(422, "Escribe un mensaje.")
        row = JourneyMessage(case_id=c.id, sender_id=user.id, category=body.category, text=text)
        db.add(row)
        c.updated_at = now()
        event(db, c.id, user.id, "message", "Nueva consulta administrativa")
        return {"ok": True}


class StageUpdate(BaseModel):
    stage: Literal["request", "review", "planning", "scheduled", "completed", "cancelled"]


@router.patch("/cases/{case_id}/stage", dependencies=[Depends(security.check_csrf)])
def set_stage(case_id: str, body: StageUpdate, user: User = Depends(security.current_user)):
    with SessionLocal.begin() as db:
        c = access(db, case_id, user)
        staff(user, c)
        if c.stage in ("completed", "cancelled"):
            raise HTTPException(409, "Este proceso está cerrado.")
        if body.stage not in ("cancelled", c.stage):
            current = STAGES.index(c.stage)
            if STAGES.index(body.stage) != current + 1:
                raise HTTPException(422, "Avanza de una etapa a la siguiente.")
            if body.stage == "scheduled" and not db.scalar(select(JourneyAppointment.id).where(
                    JourneyAppointment.case_id == c.id, JourneyAppointment.state == "confirmed")):
                raise HTTPException(409, "Primero confirma una cita real.")
        c.stage = body.stage
        c.updated_at = now()
        event(db, c.id, user.id, "stage", LABELS[body.stage])
        db.add(Audit(user_id=user.id, action="journey_stage_changed", target_id=c.id))
        return {"stage": c.stage, "label": LABELS[c.stage]}


class NewAppointment(BaseModel):
    starts_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=240)
    mode: Literal["presencial", "videollamada"] = "presencial"


@router.post("/cases/{case_id}/appointments", status_code=201, dependencies=[Depends(security.check_csrf)])
def propose_appointment(case_id: str, body: NewAppointment, user: User = Depends(security.current_user)):
    with SessionLocal.begin() as db:
        c = access(db, case_id, user)
        staff(user, c)
        if c.stage in ("completed", "cancelled"):
            raise HTTPException(409, "El proceso está cerrado.")
        # Mazatlán local wall time; never convert timezone-aware datetimes silently.
        if body.starts_at.tzinfo is not None:
            raise HTTPException(422, "Usa hora local de Mazatlán, sin zona horaria.")
        if body.starts_at <= datetime.now(ZoneInfo("America/Mazatlan")).replace(tzinfo=None):
            raise HTTPException(422, "La fecha debe estar en el futuro.")
        row = JourneyAppointment(case_id=c.id, starts_at=body.starts_at,
                                 duration_minutes=body.duration_minutes, mode=body.mode)
        db.add(row)
        db.flush()
        c.updated_at = now()
        event(db, c.id, user.id, "appointment", "Cita propuesta · pendiente de confirmación")
        return {"id": row.id, "state": row.state}


class AppointmentUpdate(BaseModel):
    state: Literal["confirmed", "cancelled"]


@router.patch("/cases/{case_id}/appointments/{appointment_id}", dependencies=[Depends(security.check_csrf)])
def change_appointment(case_id: str, appointment_id: str, body: AppointmentUpdate, user: User = Depends(security.current_user)):
    with SessionLocal.begin() as db:
        c = access(db, case_id, user)
        staff(user, c)
        row = db.scalar(select(JourneyAppointment).where(
            JourneyAppointment.case_id == c.id, JourneyAppointment.id == appointment_id).with_for_update())
        if not row:
            raise HTTPException(404, "Cita no encontrada.")
        if row.state != "proposed":
            raise HTTPException(409, "La cita ya fue resuelta.")
        if c.stage in ("completed", "cancelled"):
            raise HTTPException(409, "Proceso cerrado.")
        if body.state == "confirmed":
            # Prevent two local confirmations for the same provider from overlapping.
            confirmed = list(db.scalars(select(JourneyAppointment)
                .join(JourneyCase, JourneyCase.id == JourneyAppointment.case_id)
                .where(JourneyCase.provider_user_id == c.provider_user_id,
                       JourneyAppointment.state == "confirmed")))
            start = row.starts_at
            finish = start + timedelta(minutes=row.duration_minutes)
            for old in confirmed:
                old_end = old.starts_at + timedelta(minutes=old.duration_minutes)
                if old.id != row.id and start < old_end and old.starts_at < finish:
                    raise HTTPException(409, "Ya hay una cita confirmada para ese proveedor en este horario.")
        row.state = body.state
        c.updated_at = now()
        event(db, c.id, user.id, "appointment", "Cita " + ("confirmada por el proveedor" if body.state == "confirmed" else "cancelada"))
        return {"id": row.id, "state": row.state}
