"""Growa Hospitality Platform API - catalog public, operations permissioned."""
from __future__ import annotations
import os
import re
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from collections import defaultdict
from time import monotonic
from fastapi import FastAPI, Request, Response, Depends, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from typing import Literal
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .db import (ROOT, PRODUCTION, SessionLocal, init_db, User, Listing, Slot,
                 Booking, BookingLeg, Audit, uid, now)
from . import security,services,google_calendar,discovery,routing,optimizer

@asynccontextmanager
async def lifespan(app:FastAPI):
    if PRODUCTION and len(os.getenv("SESSION_SECRET",""))<32:
        raise RuntimeError("A unique SESSION_SECRET with 32+ characters is required.")
    init_db()
    security.bootstrap_admin()
    if os.getenv("DEMO_SEED","false").lower()=="true":
        if PRODUCTION:raise RuntimeError("DEMO_SEED is not permitted in production.")
        from .seed import seed_demo
        seed_demo()
    if discovery.prepare_index():
        with SessionLocal.begin() as db:
            discovery.sync_index(db)
    yield

app=FastAPI(title="Growa Hospitality Platform",version="0.5.0",lifespan=lifespan)
hosts=[x.strip() for x in os.getenv("ALLOWED_HOSTS","localhost,127.0.0.1,testserver").split(",") if x.strip()]
app.add_middleware(TrustedHostMiddleware,allowed_hosts=hosts)
app.mount("/static",StaticFiles(directory=str(ROOT/"static")),name="static")
login_attempts=defaultdict(list)

@app.middleware("http")
async def headers(request,call_next):
    result=await call_next(request)
    result.headers["X-Content-Type-Options"]="nosniff"
    result.headers["X-Frame-Options"]="DENY"
    result.headers["Referrer-Policy"]="strict-origin-when-cross-origin"
    result.headers["Permissions-Policy"]="camera=(), microphone=(), geolocation=()"
    result.headers["Cache-Control"]="no-store" if request.url.path.startswith(("/api/","/auth/")) else "public, max-age=120"
    return result

@app.get("/")
def home():
    return FileResponse(ROOT/"static"/"index.html")

@app.get("/api/health")
def health():
    return {"status":"ok","version":"0.5.0","public_ready":False,
            "medical_availability":"only explicitly declared or authorized partner slots",
            "features":{"optimizer":"ortools-cp-sat" if optimizer.cp_model is not None else "deterministic",
                        "routing":routing.status(),
                        "discovery":"pgvector-hybrid" if os.getenv("VECTOR_SEARCH_ENABLED","false").lower()=="true" and PRODUCTION else "contextual-local",
                        "calendar":"FullCalendar standard (client-side)"}}

class LoginPayload(BaseModel):
    email:str=Field(min_length=5,max_length=180)
    password:str=Field(min_length=8,max_length=200)

@app.post("/api/login")
def login(data:LoginPayload,request:Request,response:Response):
    key=request.client.host if request.client else "unknown"
    t=monotonic();login_attempts[key]=[x for x in login_attempts[key] if t-x<300]
    if len(login_attempts[key])>=10:raise HTTPException(429,"Demasiados intentos de acceso.")
    with SessionLocal.begin() as db:
        user=db.scalar(select(User).where(User.email==data.email.lower().strip()))
        if not user or not user.active or not security.verify_password(user.password_hash,data.password):
            login_attempts[key].append(t)
            raise HTTPException(401,"Credenciales incorrectas.")
        profile=security.create_session(db,response,user)
    return profile

@app.get("/api/me")
def me(user:User=Depends(security.current_user)):
    return {"id":user.id,"name":user.name,"role":user.role,"email":user.email}

@app.post("/api/logout",dependencies=[Depends(security.check_csrf)])
def logout(request:Request,response:Response,user:User=Depends(security.current_user)):
    security.revoke_session(request,response)
    return {"ok":True}

@app.get("/api/catalog")
def catalog(category:str="all",q:str="",zone:str="",max_price:int=Query(0,ge=0),
            accessible:bool=False,english:bool=False,verified:bool=False):
    with SessionLocal() as db:
        return {"items":services.search_catalog(db,category,q,zone,max_price,accessible,english,verified),
                "notice":"Inventario de demo o declarado. La plataforma no certifica servicios médicos."}

@app.get("/api/discover")
def discover(query:str=Query("",max_length=160),category:str="all",zone:str="",
             max_price:int=Query(0,ge=0),accessible:bool=False,english:bool=False,verified:bool=False):
    with SessionLocal() as db:
        return discovery.discover(db,query,category=category,zone=zone,max_price=max_price,
                                  accessible=accessible,english=english,verified=verified)

@app.get("/api/route")
def route_estimate(from_id:str=Query(...,min_length=10,max_length=40),
                   to_id:str=Query(...,min_length=10,max_length=40)):
    if from_id == to_id:
        raise HTTPException(422,"Selecciona dos servicios distintos.")
    with SessionLocal() as db:
        start=db.get(Listing,from_id)
        finish=db.get(Listing,to_id)
        if not start or not finish or not start.active or not finish.active:
            raise HTTPException(404,"Servicio no encontrado.")
        data=routing.route_between(start,finish)
        return {"from_id":start.id,"to_id":finish.id,"from_name":start.name,
                "to_name":finish.name,**data}

@app.get("/api/zones")
def zones():
    with SessionLocal() as db:
        return sorted(set(x for x in db.scalars(select(Listing.zone).where(Listing.active.is_(True)))))

@app.get("/api/listings/{listing_id}")
def get_listing(listing_id:str):
    with SessionLocal() as db:
        obj=db.get(Listing,listing_id)
        if not obj or not obj.active:raise HTTPException(404,"Ficha no encontrada.")
        return services.public_listing(obj)

class PlanRequest(BaseModel):
    medical_id:str
    day:date
    nights:int=Field(default=2,ge=1,le=30)
    preferred_hour:int=Field(default=10,ge=6,le=20)
    max_budget:int=Field(default=0,ge=0,le=10000000)
    accessible:bool=False
    hotel_id:str|None=None
    transport_id:str|None=None
    priority:Literal["balanced","economy","proximity","comfort"]="balanced"

@app.post("/api/plan")
def plan(body:PlanRequest):
    with SessionLocal() as db:
        result=services.plan(db,body.medical_id,body.day,body.nights,body.preferred_hour,
                             body.max_budget,body.accessible,body.hotel_id,body.transport_id,
                             max_results=8,priority=body.priority)
        medical=db.get(Listing,body.medical_id)
        if not medical or not medical.provider_user_id or not google_calendar.configured():
            result["options"]=result["options"][:18]
            return result
        if not google_calendar.token_for(medical.provider_user_id):
            result["options"]=result["options"][:18]
            return result
        tz=ZoneInfo("America/Mazatlan")
        begin=datetime.combine(body.day,time(0,0)).replace(tzinfo=tz)
        end=begin+timedelta(days=1)
        try:
            busy=google_calendar.freebusy(medical.provider_user_id,begin,end)
        except HTTPException:
            # Fail closed: never advertise availability when the linked provider calendar fails.
            return {"options":[],"total_feasible":0,
                    "notice":"No se pudo verificar la agenda Google del prestador. Reintenta o solicita confirmación directa."}
        filtered=[]
        for option in result["options"]:
            start=datetime.combine(body.day,time.fromisoformat(option["time"])).replace(tzinfo=tz)
            finish=start+timedelta(hours=1)
            overlap=any(datetime.fromisoformat(x["start"].replace("Z","+00:00"))<finish and
                        datetime.fromisoformat(x["end"].replace("Z","+00:00"))>start for x in busy)
            if not overlap:
                option["source"]="declarada + Google FreeBusy"
                filtered.append(option)
        result["options"]=filtered[:18]
        result["total_feasible"]=len(filtered)
        result["notice"]="Horarios del proveedor declarados y filtrados por ocupación del calendario autorizado. Requieren confirmación del prestador."
        return result

class BookingCreate(BaseModel):
    slot_id:str
    hotel_id:str
    transport_id:str
    nights:int=Field(ge=1,le=30)
    guests:int=Field(default=1,ge=1,le=12)
    guest_alias:str=Field(min_length=2,max_length=90)
    idempotency_key:str|None=Field(default=None,max_length=100)

@app.post("/api/bookings",dependencies=[Depends(security.check_csrf)],status_code=201)
def create_booking(body:BookingCreate,user:User=Depends(security.require("admin","coordinator"))):
    try:
        with SessionLocal.begin() as db:
            booking=services.make_booking(db,user,body.slot_id,body.hotel_id,body.transport_id,
                                          body.nights,body.guests,body.guest_alias,body.idempotency_key)
            result=services.booking_view(db,booking)
        return result
    except IntegrityError as e:
        raise HTTPException(409,"La solicitud ya existe o hay un conflicto concurrente.") from e

@app.get("/api/bookings")
def list_bookings(user:User=Depends(security.require("admin","coordinator","provider"))):
    with SessionLocal() as db:
        rows=list(db.scalars(select(Booking).order_by(Booking.created_at.desc()).limit(100)))
        out=[]
        for row in rows:
            try:out.append(services.booking_view(db,row,provider_id=user.id if user.role=="provider" else None))
            except HTTPException:continue
        return out

@app.patch("/api/legs/{leg_id}/{action}",dependencies=[Depends(security.check_csrf)])
def update_leg(leg_id:str,action:str,user:User=Depends(security.require("admin","coordinator","provider"))):
    if action not in ("confirmed","rejected"):raise HTTPException(422,"Acción no admitida.")
    with SessionLocal.begin() as db:
        return services.change_leg(db,user,leg_id,action)

@app.post("/api/bookings/{booking_id}/cancel",dependencies=[Depends(security.check_csrf)])
def cancel(booking_id:str,user:User=Depends(security.require("admin","coordinator"))):
    with SessionLocal.begin() as db:
        booking=db.get(Booking,booking_id)
        if not booking:raise HTTPException(404,"Itinerario no encontrado.")
        services.cancel(db,user,booking)
        return {"ok":True,"status":booking.status,
                "notice":"La cancelación local NO cancela automáticamente reservas externas."}

class ListingCreate(BaseModel):
    category:str
    name:str=Field(min_length=3,max_length=150)
    subtype:str=Field(default="",max_length=100)
    zone:str=Field(default="Mazatlán",max_length=80)
    description:str=Field(default="",max_length=1500)
    latitude:float=Field(default=23.2494,ge=-90,le=90)
    longitude:float=Field(default=-106.4111,ge=-180,le=180)
    price_mxn:int=Field(default=0,ge=0,le=1000000)
    capacity:int=Field(default=1,ge=1,le=500)
    accessible:bool=False
    english:bool=False
    contact_url:str=Field(default="",max_length=500)
    image_url:str=Field(default="",max_length=500)

@app.post("/api/providers",dependencies=[Depends(security.check_csrf)],status_code=201)
def create_provider(body:ListingCreate,user:User=Depends(security.require("admin","coordinator"))):
    if body.category not in services.KINDS:raise HTTPException(422,"Categoría inválida.")
    if body.contact_url and not body.contact_url.startswith("https://"):raise HTTPException(422,"Usa HTTPS para contactos.")
    if body.image_url and not body.image_url.startswith("https://"):raise HTTPException(422,"Usa HTTPS para imágenes.")
    with SessionLocal.begin() as db:
        item=Listing(**body.model_dump(),active=True,demo=False,verified=False)
        db.add(item);db.flush()
        discovery.upsert(db,item)
        db.add(Audit(user_id=user.id,action="provider_created",target_id=item.id))
        return {"id":item.id,"verified":False,"notice":"Ficha pendiente de verificación documental."}

class ProviderAccount(BaseModel):
    listing_id:str
    email:str=Field(min_length=5,max_length=180)
    name:str=Field(min_length=3,max_length=140)
    password:str=Field(min_length=14,max_length=200)

@app.post("/api/provider-accounts",dependencies=[Depends(security.check_csrf)])
def provider_account(data:ProviderAccount,user:User=Depends(security.require("admin"))):
    with SessionLocal.begin() as db:
        listing=db.get(Listing,data.listing_id)
        if not listing or listing.demo or listing.provider_user_id:
            raise HTTPException(409,"Proveedor no asignable.")
        if db.scalar(select(User).where(User.email==data.email.strip().lower())):
            raise HTTPException(409,"Correo ya registrado.")
        owner=User(email=data.email.strip().lower(),name=data.name,
                   password_hash=security.hash_password(data.password),role="provider")
        db.add(owner);db.flush();listing.provider_user_id=owner.id
        db.add(Audit(user_id=user.id,action="provider_account_created",target_id=listing.id))
        return {"id":owner.id,"provider_id":listing.id}

class SlotUpdate(BaseModel):
    slot_date:date
    times:list[str]=Field(min_length=1,max_length=30)

@app.post("/api/providers/{listing_id}/slots",dependencies=[Depends(security.check_csrf)])
def add_slots(listing_id:str,data:SlotUpdate,user:User=Depends(security.require("admin","provider"))):
    services.validate_day(data.slot_date)
    with SessionLocal.begin() as db:
        item=db.get(Listing,listing_id)
        if not item or item.category!="medico":raise HTTPException(404,"Prestador médico no encontrado.")
        if user.role=="provider" and item.provider_user_id!=user.id:raise HTTPException(403,"Prestador no asignado.")
        unique=set(data.times)
        for hour in unique:
            if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d",hour):
                raise HTTPException(422,"Usa HH:MM para los horarios.")
            existing=db.scalar(select(Slot).where(Slot.listing_id==item.id,Slot.slot_date==data.slot_date,
                                                    Slot.time_hhmm==hour))
            if existing:existing.enabled=True
            else:db.add(Slot(listing_id=item.id,slot_date=data.slot_date,time_hhmm=hour,
                             source="synthetic" if item.demo else "provider_declared"))
        db.add(Audit(user_id=user.id,action="slots_updated",target_id=listing_id))
        return {"count":len(unique),"notice":"Declaración manual; no equivale a reserva confirmada."}

class VerifyPayload(BaseModel):
    verified:bool

@app.patch("/api/providers/{listing_id}/verify",dependencies=[Depends(security.check_csrf)])
def verify_provider(listing_id:str,data:VerifyPayload,user:User=Depends(security.require("admin"))):
    with SessionLocal.begin() as db:
        item=db.get(Listing,listing_id)
        if not item or item.demo:raise HTTPException(409,"No se puede verificar esta ficha.")
        item.verified=data.verified
        db.add(Audit(user_id=user.id,action="provider_verified",target_id=listing_id))
        return {"id":listing_id,"verified":item.verified}

@app.get("/api/google/status")
def google_status(user:User=Depends(security.require("admin","coordinator","provider"))):
    return {"configured":google_calendar.configured(),
            "connected":bool(google_calendar.token_for(user.id)) if google_calendar.configured() else False,
            "scope":"Calendario autorizado del coordinador, no disponibilidad universal de médicos."}

@app.post("/api/google/connect",dependencies=[Depends(security.check_csrf)])
def google_connect(user:User=Depends(security.require("admin","coordinator","provider"))):
    return {"url":google_calendar.authorize_url(user.id)}

@app.get("/auth/google/callback")
def google_callback(code:str="",state:str="",error:str="",user:User=Depends(security.current_user)):
    if error or not code:raise HTTPException(400,"Autorización de Google cancelada.")
    google_calendar.exchange(code,state,user.id)
    return RedirectResponse("/?calendar=connected",status_code=303)

@app.post("/api/google/disconnect",dependencies=[Depends(security.check_csrf)])
def google_disconnect(user:User=Depends(security.require("admin","coordinator","provider"))):
    google_calendar.disconnect(user.id)
    return {"connected":False}

@app.post("/api/bookings/{booking_id}/google",dependencies=[Depends(security.check_csrf)])
def google_publish(booking_id:str,user:User=Depends(security.require("admin","coordinator"))):
    with SessionLocal.begin() as db:
        booking=db.scalar(select(Booking).where(Booking.id==booking_id).with_for_update())
        if not booking:raise HTTPException(404,"Itinerario no encontrado.")
        if booking.status!="confirmed":raise HTTPException(409,"Los proveedores deben confirmar antes de publicar.")
        if booking.calendar_event_id:return {"status":"already_synced"}
        leg=db.scalar(select(BookingLeg).where(BookingLeg.booking_id==booking.id,BookingLeg.kind=="medico"))
        event_id=google_calendar.publish(user.id,booking,leg)
        booking.calendar_event_id=event_id
        db.add(Audit(user_id=user.id,action="google_published",target_id=booking.id))
        return {"status":"synced","event_id":event_id}
