"""OAuth Google Calendar for an authorized coordinator, never a universal medical schedule."""
import json
import os
from datetime import timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo
import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from sqlalchemy import select
from .db import CalendarToken, Booking, BookingLeg, SessionLocal, now

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
GOOGLE_FREEBUSY = "https://www.googleapis.com/calendar/v3/freeBusy"
SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy"

def configured():
    return all(os.getenv(x) for x in ("GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REDIRECT_URI",
                                       "GOOGLE_TOKEN_FERNET_KEY","SESSION_SECRET"))

def cipher():
    try:return Fernet(os.environ["GOOGLE_TOKEN_FERNET_KEY"].encode())
    except (KeyError,ValueError) as e:raise HTTPException(503,"Falta clave de cifrado de Calendar.") from e

def signer():
    secret=os.getenv("SESSION_SECRET","")
    if len(secret)<32:raise HTTPException(503,"SESSION_SECRET no configurado.")
    return URLSafeTimedSerializer(secret,salt="growa-google-calendar")

def authorize_url(user_id:str):
    if not configured():raise HTTPException(409,"Configura primero Google OAuth en Render.")
    state=signer().dumps({"user_id":user_id})
    return GOOGLE_AUTH+"?"+urlencode({
        "client_id":os.environ["GOOGLE_CLIENT_ID"],
        "redirect_uri":os.environ["GOOGLE_REDIRECT_URI"],
        "response_type":"code","scope":SCOPES,"access_type":"offline",
        "prompt":"consent","state":state})

def exchange(code:str,state:str,user_id:str):
    try:claim=signer().loads(state,max_age=600)
    except (BadSignature,SignatureExpired) as e:raise HTTPException(400,"Autorización caducada o inválida.") from e
    if claim.get("user_id")!=user_id:raise HTTPException(403,"La autorización pertenece a otra cuenta.")
    with httpx.Client(timeout=15) as client:
        r=client.post(GOOGLE_TOKEN,data={"code":code,"client_id":os.environ["GOOGLE_CLIENT_ID"],
            "client_secret":os.environ["GOOGLE_CLIENT_SECRET"],"redirect_uri":os.environ["GOOGLE_REDIRECT_URI"],
            "grant_type":"authorization_code"})
    if r.status_code!=200:raise HTTPException(502,"Google rechazó la autorización.")
    token=r.json()
    if "access_token" not in token:raise HTTPException(502,"Respuesta de Google incompleta.")
    with SessionLocal.begin() as db:
        old=db.get(CalendarToken,user_id)
        if old:
            try:
                old_data=json.loads(cipher().decrypt(old.ciphertext.encode()))
                if "refresh_token" not in token and "refresh_token" in old_data:
                    token["refresh_token"]=old_data["refresh_token"]
            except (InvalidToken,ValueError):pass
        encrypted=cipher().encrypt(json.dumps(token).encode()).decode()
        if old:old.ciphertext=encrypted
        else:db.add(CalendarToken(user_id=user_id,ciphertext=encrypted))

def token_for(user_id:str):
    with SessionLocal() as db:
        stored=db.get(CalendarToken,user_id)
        if not stored:return None
        try:return json.loads(cipher().decrypt(stored.ciphertext.encode()))
        except (InvalidToken,ValueError):raise HTTPException(503,"No se pudo descifrar Calendar.")

def access_token(user_id:str):
    payload=token_for(user_id)
    if not payload:raise HTTPException(409,"Google Calendar no está autorizado.")
    refresh=payload.get("refresh_token")
    if refresh:
        with httpx.Client(timeout=15) as client:
            r=client.post(GOOGLE_TOKEN,data={"client_id":os.environ["GOOGLE_CLIENT_ID"],
                "client_secret":os.environ["GOOGLE_CLIENT_SECRET"],
                "refresh_token":refresh,"grant_type":"refresh_token"})
        if r.status_code!=200:raise HTTPException(502,"No fue posible renovar autorización de Google.")
        payload.update(r.json())
        with SessionLocal.begin() as db:
            record=db.get(CalendarToken,user_id)
            record.ciphertext=cipher().encrypt(json.dumps(payload).encode()).decode()
    return payload["access_token"]

def freebusy(user_id:str,start,end):
    tok=access_token(user_id)
    with httpx.Client(timeout=15) as client:
        r=client.post(GOOGLE_FREEBUSY,headers={"Authorization":"Bearer "+tok},
                      json={"timeMin":start.isoformat(),"timeMax":end.isoformat(),"timeZone":"America/Mazatlan",
                            "items":[{"id":"primary"}]})
    if r.status_code!=200:raise HTTPException(502,"Google no devolvió disponibilidad.")
    return r.json().get("calendars",{}).get("primary",{}).get("busy",[])

def publish(user_id:str,booking:Booking,leg:BookingLeg):
    tz=ZoneInfo("America/Mazatlan")
    start=leg.starts_at.replace(tzinfo=tz);end=leg.ends_at.replace(tzinfo=tz)
    busy=freebusy(user_id,start,end)
    if busy:raise HTTPException(409,"El calendario del coordinador está ocupado en ese horario.")
    tok=access_token(user_id)
    with httpx.Client(timeout=15) as client:
        r=client.post(GOOGLE_EVENTS,headers={"Authorization":"Bearer "+tok},
            json={"summary":"Coordinación de estancia · Growa",
                  "description":"Referencia administrativa: "+booking.id+". Sin información clínica.",
                  "start":{"dateTime":start.isoformat(),"timeZone":"America/Mazatlan"},
                  "end":{"dateTime":end.isoformat(),"timeZone":"America/Mazatlan"}})
    if r.status_code not in (200,201):
        raise HTTPException(502,"No fue posible publicar el evento de coordinación.")
    return r.json().get("id")

def disconnect(user_id:str):
    with SessionLocal.begin() as db:
        old=db.get(CalendarToken,user_id)
        if old:db.delete(old)
