"""Private-by-default Growa community: opt-in profiles, mutual connections and inbox.

Community features are social/logistical, NEVER clinical. Email/password and
private messages are not public directory fields. Unverified public signup
is intentionally disabled in production without an explicit rollout flag.
"""
from __future__ import annotations
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta
from time import monotonic
from fastapi import APIRouter, Request, Response, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, select, or_, and_, delete
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.exc import IntegrityError
from .db import Base, PRODUCTION, SessionLocal, User, Audit, now, uid
from . import security

router=APIRouter(prefix="/api/community",tags=["Community"])
_limit:dict[str,list[float]]=defaultdict(list)
ROLE_LABELS={"visitor":"Visitante","local":"Residente","host":"Anfitrión","guide":"Guía cultural"}
INTERESTS={"cultura","gastronomia","movilidad","hospedaje","idiomas","naturaleza","negocios","acompanantes"}


class CommunityProfile(Base):
    __tablename__="community_profiles"
    user_id:Mapped[str]=mapped_column(ForeignKey("users.id"),primary_key=True)
    display_name:Mapped[str]=mapped_column(String(55))
    headline:Mapped[str]=mapped_column(String(90),default="")
    bio:Mapped[str]=mapped_column(String(400),default="")
    profile_kind:Mapped[str]=mapped_column(String(16),default="visitor")
    languages:Mapped[str]=mapped_column(String(80),default="es")
    interests:Mapped[str]=mapped_column(String(220),default="")
    discoverable:Mapped[bool]=mapped_column(Boolean,default=False)
    updated_at:Mapped[datetime]=mapped_column(DateTime,default=now,onupdate=now)


class CommunityConnection(Base):
    __tablename__="community_connections"
    id:Mapped[str]=mapped_column(String(32),primary_key=True,default=uid)
    requester_id:Mapped[str]=mapped_column(ForeignKey("users.id"),index=True)
    recipient_id:Mapped[str]=mapped_column(ForeignKey("users.id"),index=True)
    status:Mapped[str]=mapped_column(String(16),default="pending")
    created_at:Mapped[datetime]=mapped_column(DateTime,default=now)
    __table_args__=(UniqueConstraint("requester_id","recipient_id",name="ux_community_direction"),)


class CommunityMessage(Base):
    __tablename__="community_messages"
    id:Mapped[str]=mapped_column(String(32),primary_key=True,default=uid)
    connection_id:Mapped[str]=mapped_column(ForeignKey("community_connections.id"),index=True)
    sender_id:Mapped[str]=mapped_column(ForeignKey("users.id"),index=True)
    recipient_id:Mapped[str]=mapped_column(ForeignKey("users.id"),index=True)
    body:Mapped[str]=mapped_column(String(600))
    created_at:Mapped[datetime]=mapped_column(DateTime,default=now,index=True)


class CommunityReport(Base):
    __tablename__="community_reports"
    id:Mapped[str]=mapped_column(String(32),primary_key=True,default=uid)
    reporter_id:Mapped[str]=mapped_column(ForeignKey("users.id"),index=True)
    target_id:Mapped[str]=mapped_column(ForeignKey("users.id"),index=True)
    reason:Mapped[str]=mapped_column(String(20))
    created_at:Mapped[datetime]=mapped_column(DateTime,default=now)


def throttle(key:str,max_count:int,window:int):
    time=monotonic()
    attempts=_limit[key]=[t for t in _limit[key] if time-t<window]
    if len(attempts)>=max_count:
        raise HTTPException(429,"Límite temporal alcanzado. Intenta más tarde.")
    attempts.append(time)


def signup_enabled():
    # Email ownership verification is not implemented; production self-signup
    # cannot be enabled with an env flag alone.
    return not PRODUCTION and os.getenv("COMMUNITY_DEMO_SIGNUP_ENABLED","true").lower()=="true"


def valid_email(email:str)->str:
    x=email.strip().lower()
    if not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}",x) or len(x)>180:
        raise HTTPException(422,"Correo electrónico inválido.")
    return x


def profile_public(user_id:str,profile:CommunityProfile)->dict:
    return {"id":user_id,"name":profile.display_name,"headline":profile.headline,
            "bio":profile.bio,"kind":profile.profile_kind,"role_label":ROLE_LABELS[profile.profile_kind],
            "languages":profile.languages,"interests":profile.interests.split(",") if profile.interests else [],
            "demo":not PRODUCTION}


class Signup(BaseModel):
    email:str=Field(min_length=6,max_length=180)
    password:str=Field(min_length=14,max_length=160)
    name:str=Field(min_length=2,max_length=55)
    terms:bool=False
    age18:bool=False


@router.get("/status")
def status():
    return {"signup_enabled":signup_enabled(),"demo":not PRODUCTION,
            "requires_mutual_consent":True,"emails_public":False,
            "notice":"Comunidad de interés turístico, sin perfiles clínicos ni datos de salud."}


@router.post("/register",status_code=201)
def register(body:Signup,request:Request,response:Response):
    if not signup_enabled():raise HTTPException(403,"El registro está cerrado hasta completar verificación de correo.")
    if not body.terms or not body.age18:
        raise HTTPException(422,"Acepta las reglas de comunidad y confirma mayoría de edad.")
    origin=request.headers.get("origin")
    expected=os.getenv("PUBLIC_BASE_URL",str(request.base_url)).rstrip("/")
    if origin and origin.rstrip("/")!=expected:raise HTTPException(403,"Origen no autorizado.")
    ip=request.client.host if request.client else "unknown"
    throttle("signup:"+ip,4,3600)
    email=valid_email(body.email)
    if not re.fullmatch(r"[\wÁÉÍÓÚÜÑáéíóúüñ .'-]{2,55}",body.name,re.UNICODE):
        raise HTTPException(422,"Usa un nombre visible sin información de contacto.")
    try:
        with SessionLocal.begin() as db:
            if db.scalar(select(User.id).where(User.email==email)):
                raise HTTPException(409,"El correo ya está registrado.")
            u=User(email=email,name=body.name.strip(),role="member",
                   password_hash=security.hash_password(body.password))
            db.add(u);db.flush()
            db.add(CommunityProfile(user_id=u.id,display_name=body.name.strip(),discoverable=False))
            db.add(Audit(user_id=u.id,action="community_signup",target_id=u.id))
            account=security.create_session(db,response,u)
        return {"account":account,"notice":"Cuenta creada. Tu perfil permanece privado hasta que decidas publicarlo."}
    except IntegrityError as err:
        raise HTTPException(409,"El correo ya está registrado.") from err


class ProfileUpdate(BaseModel):
    display_name:str=Field(min_length=2,max_length=55)
    headline:str=Field(default="",max_length=90)
    bio:str=Field(default="",max_length=400)
    profile_kind:str="visitor"
    languages:str=Field(default="es",max_length=80)
    interests:list[str]=Field(default_factory=list,max_length=8)
    discoverable:bool=False


@router.get("/me")
def my_profile(user:User=Depends(security.current_user)):
    with SessionLocal() as db:
        p=db.get(CommunityProfile,user.id)
        return {"profile":profile_public(user.id,p) if p else None,
                "discoverable":p.discoverable if p else False}


@router.put("/me",dependencies=[Depends(security.check_csrf)])
def update_my_profile(body:ProfileUpdate,user:User=Depends(security.current_user)):
    if body.profile_kind not in ROLE_LABELS or not set(body.interests).issubset(INTERESTS):
        raise HTTPException(422,"Tipo de perfil o intereses inválidos.")
    if not re.fullmatch(r"[\wÁÉÍÓÚÜÑáéíóúüñ .'-]{2,55}",body.display_name,re.UNICODE):
        raise HTTPException(422,"Nombre visible inválido.")
    for field in (body.headline,body.bio,body.languages):
        if re.search(r"\b(?:https?://|www\.|@\w+\.|\+?\d[\d -]{8,})",field,re.I):
            raise HTTPException(422,"No publiques correos, teléfonos ni enlaces en tu perfil.")
    with SessionLocal.begin() as db:
        p=db.get(CommunityProfile,user.id)
        if p is None:p=CommunityProfile(user_id=user.id,display_name=body.display_name)
        p.display_name=body.display_name.strip()
        p.headline=body.headline.strip()
        p.bio=body.bio.strip()
        p.profile_kind=body.profile_kind
        p.languages=body.languages.strip()
        p.interests=",".join(sorted(set(body.interests)))
        p.discoverable=body.discoverable
        db.add(p)
        db.add(Audit(user_id=user.id,action="community_profile_saved",target_id=user.id))
        return {"profile":profile_public(user.id,p),"discoverable":p.discoverable}


@router.get("/members")
def members(q:str=Query("",max_length=80),kind:str="all",limit:int=Query(36,ge=1,le=60)):
    # Directory is public but contains only expressly opted-in names/interests.
    if kind!="all" and kind not in ROLE_LABELS:raise HTTPException(422,"Filtro no válido.")
    with SessionLocal() as db:
        stmt=select(CommunityProfile,User).join(User,User.id==CommunityProfile.user_id).where(
            CommunityProfile.discoverable.is_(True),User.active.is_(True))
        if kind!="all":stmt=stmt.where(CommunityProfile.profile_kind==kind)
        if q:
            from sqlalchemy import func
            term="%"+q.strip().lower()+"%"
            stmt=stmt.where(or_(func.lower(CommunityProfile.display_name).like(term),
                                func.lower(CommunityProfile.headline).like(term),
                                func.lower(CommunityProfile.interests).like(term)))
        results=db.execute(stmt.order_by(CommunityProfile.display_name).limit(limit)).all()
        return {"items":[profile_public(u.id,p) for p,u in results],"notice":"Solo perfiles publicados voluntariamente; identidad no verificada."}


def _connections(db,user_id:str):
    return list(db.scalars(select(CommunityConnection).where(
        or_(CommunityConnection.requester_id==user_id,CommunityConnection.recipient_id==user_id))
        .order_by(CommunityConnection.created_at.desc()).limit(250)))


@router.get("/connections")
def connections(user:User=Depends(security.current_user)):
    with SessionLocal() as db:
        results=[]
        for x in _connections(db,user.id):
            other=x.recipient_id if x.requester_id==user.id else x.requester_id
            p=db.get(CommunityProfile,other)
            results.append({"id":x.id,"with_id":other,"with_name":p.display_name if p else "Miembro",
                            "status":x.status,"outgoing":x.requester_id==user.id})
        return {"items":results}


class Connect(BaseModel):
    member_id:str=Field(min_length=10,max_length=40)


@router.post("/connect",dependencies=[Depends(security.check_csrf)],status_code=201)
def connect(body:Connect,user:User=Depends(security.current_user)):
    if body.member_id==user.id:raise HTTPException(422,"No puedes conectarte contigo.")
    throttle("connect:"+user.id,12,3600)
    with SessionLocal.begin() as db:
        p=db.get(CommunityProfile,body.member_id)
        if not p or not p.discoverable:raise HTTPException(404,"El perfil no está disponible.")
        existing=db.scalar(select(CommunityConnection).where(
            or_(and_(CommunityConnection.requester_id==user.id,CommunityConnection.recipient_id==body.member_id),
                and_(CommunityConnection.requester_id==body.member_id,CommunityConnection.recipient_id==user.id))))
        if existing:raise HTTPException(409,"Ya existe una solicitud o conexión entre ambos perfiles.")
        c=CommunityConnection(requester_id=user.id,recipient_id=body.member_id)
        db.add(c);db.flush()
        db.add(Audit(user_id=user.id,action="community_connection_requested",target_id=c.id))
        return {"id":c.id,"status":"pending","notice":"La persona debe aceptar antes de poder recibir mensajes."}


class ConnectionAction(BaseModel):
    action:str


@router.post("/connections/{connection_id}/action",dependencies=[Depends(security.check_csrf)])
def connection_action(connection_id:str,body:ConnectionAction,user:User=Depends(security.current_user)):
    if body.action not in {"accept","reject","block","remove"}:raise HTTPException(422,"Acción inválida.")
    with SessionLocal.begin() as db:
        c=db.get(CommunityConnection,connection_id)
        if not c or user.id not in (c.requester_id,c.recipient_id):
            raise HTTPException(404,"Conexión no encontrada.")
        if body.action=="accept":
            if c.recipient_id!=user.id or c.status!="pending":
                raise HTTPException(409,"Solo la persona invitada puede aceptar una solicitud pendiente.")
            c.status="accepted"
        elif body.action=="reject":
            if c.recipient_id!=user.id or c.status!="pending":raise HTTPException(409,"Solicitud no rechazable.")
            c.status="rejected"
        elif body.action=="block":c.status="blocked"
        else:c.status="removed"
        db.add(Audit(user_id=user.id,action="community_"+body.action,target_id=c.id))
        return {"id":c.id,"status":c.status}


@router.get("/messages/{connection_id}")
def messages(connection_id:str,user:User=Depends(security.current_user)):
    with SessionLocal() as db:
        c=db.get(CommunityConnection,connection_id)
        if not c or c.status!="accepted" or user.id not in (c.requester_id,c.recipient_id):
            raise HTTPException(403,"La conversación requiere conexión aceptada.")
        rows=list(db.scalars(select(CommunityMessage).where(
            CommunityMessage.connection_id==c.id).order_by(CommunityMessage.created_at.desc()).limit(80)))
        return {"items":[{"id":m.id,"mine":m.sender_id==user.id,"body":m.body,
                          "created_at":m.created_at.isoformat()} for m in reversed(rows)]}


class MessageCreate(BaseModel):
    message:str=Field(min_length=2,max_length=600)


@router.post("/messages/{connection_id}",dependencies=[Depends(security.check_csrf)],status_code=201)
def send_message(connection_id:str,body:MessageCreate,user:User=Depends(security.current_user)):
    throttle("message:"+user.id,12,600)
    msg=body.message.strip()
    if len(msg)<2:raise HTTPException(422,"Escribe un mensaje.")
    if re.search(r"(?:https?://|www\.)",msg,re.I):
        raise HTTPException(422,"Por seguridad no compartas enlaces en la comunidad.")
    with SessionLocal.begin() as db:
        c=db.get(CommunityConnection,connection_id)
        if not c or c.status!="accepted" or user.id not in (c.requester_id,c.recipient_id):
            raise HTTPException(403,"La conversación requiere aceptación mutua.")
        to=c.recipient_id if c.requester_id==user.id else c.requester_id
        m=CommunityMessage(connection_id=c.id,sender_id=user.id,recipient_id=to,body=msg)
        db.add(m);db.flush()
        return {"id":m.id,"created_at":m.created_at.isoformat(),"notice":"Mensaje privado entre personas conectadas."}


class Report(BaseModel):
    member_id:str
    reason:str


@router.post("/report",dependencies=[Depends(security.check_csrf)])
def report(body:Report,user:User=Depends(security.current_user)):
    if body.reason not in {"spam","harassment","privacy","other"} or body.member_id==user.id:
        raise HTTPException(422,"Motivo o usuario no válido.")
    throttle("report:"+user.id,8,3600)
    with SessionLocal.begin() as db:
        if not db.get(User,body.member_id):raise HTTPException(404,"Perfil no encontrado.")
        db.add(CommunityReport(reporter_id=user.id,target_id=body.member_id,reason=body.reason))
        db.add(Audit(user_id=user.id,action="community_report",target_id=body.member_id))
        return {"ok":True,"notice":"Reporte almacenado para revisión administrativa."}


@router.post("/me/withdraw",dependencies=[Depends(security.check_csrf)])
def withdraw_from_directory(user:User=Depends(security.current_user)):
    """Erase optional social profile and authored messages; keep booking account."""
    with SessionLocal.begin() as db:
        p=db.get(CommunityProfile,user.id)
        if p:db.delete(p)
        db.execute(delete(CommunityMessage).where(CommunityMessage.sender_id==user.id))
        for conn in _connections(db,user.id):
            conn.status="removed"
        db.add(Audit(user_id=user.id,action="community_withdrawn",target_id=user.id))
        return {"ok":True,"notice":"Perfil público y mensajes enviados retirados. Tu cuenta de acceso permanece activa."}


@router.get("/moderation/reports")
def moderation_reports(user:User=Depends(security.require("admin"))):
    with SessionLocal() as db:
        rows=list(db.scalars(select(CommunityReport).order_by(
            CommunityReport.created_at.desc()).limit(100)))
        return {"items":[{"id":r.id,"target_id":r.target_id,
                           "reason":r.reason,"created_at":r.created_at.isoformat()} for r in rows]}


@router.post("/moderation/hide/{member_id}",dependencies=[Depends(security.check_csrf)])
def moderation_hide(member_id:str,user:User=Depends(security.require("admin"))):
    with SessionLocal.begin() as db:
        p=db.get(CommunityProfile,member_id)
        if not p:raise HTTPException(404,"Perfil inexistente.")
        p.discoverable=False
        db.add(Audit(user_id=user.id,action="community_moderation_hide",target_id=member_id))
        return {"ok":True,"notice":"Perfil ocultado de búsqueda pública."}
