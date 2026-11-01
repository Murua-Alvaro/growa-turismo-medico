"""Executable API smoke tests with synthetic inventory and no real clinical data."""
from __future__ import annotations
import os
from datetime import date,timedelta
os.environ["PRODUCTION"]="false"
os.environ["DATABASE_URL"]=f"sqlite:///./test_growa_{os.getpid()}.sqlite3"
os.environ["DEMO_SEED"]="true"
os.environ["BOOTSTRAP_ADMIN_EMAIL"]="admin@example.test"
os.environ["BOOTSTRAP_ADMIN_PASSWORD"]="CiOnlyStrongSecret-2026-NotProduction"
os.environ["PUBLIC_BASE_URL"]="http://testserver"
os.environ["ALLOWED_HOSTS"]="testserver,localhost,127.0.0.1"

from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db import SessionLocal, Slot, Listing

def next_day():
    with SessionLocal() as db:
        slot=db.scalar(select(Slot).order_by(Slot.slot_date,Slot.time_hhmm))
        return slot.slot_date.isoformat(),slot.listing_id

def login(client):
    r=client.post("/api/login",json={"email":"admin@example.test",
                       "password":"CiOnlyStrongSecret-2026-NotProduction"})
    assert r.status_code==200,r.text
    return {"x-csrf-token":client.cookies.get("growa_csrf")}

def test_health_public_search_and_filters():
    with TestClient(app) as c:
        r=c.get("/api/health");assert r.status_code==200
        data=c.get("/api/catalog").json()["items"]
        assert len(data)>=8
        assert all(x["demo"] for x in data)
        assert all(not x["verified"] for x in data)
        assert c.get("/api/catalog?category=hotel").status_code==200
        assert c.get("/api/catalog?category=invalid").status_code==422
        assert c.get("/api/catalog?verified=true").json()["items"]==[]

def test_login_and_csrf():
    with TestClient(app) as c:
        assert c.get("/api/me").status_code==401
        header=login(c)
        assert c.get("/api/me").json()["role"]=="admin"
        assert c.post("/api/logout").status_code==403
        assert c.post("/api/logout",headers=header).status_code==200
        assert c.get("/api/me").status_code==401

def test_availability_reservation_idempotency_and_conflict():
    with TestClient(app) as c:
        head=login(c)
        day,medical_id=next_day()
        data=c.post("/api/plan",json={"medical_id":medical_id,"day":day,"nights":2,"max_budget":10000}).json()
        assert data["options"]
        opt=data["options"][0]
        payload={"slot_id":opt["slot_id"],"hotel_id":opt["hotel_id"],
                 "transport_id":opt["transport_id"],"nights":2,"guests":1,
                 "guest_alias":"Visitante de prueba","idempotency_key":"test-idempotent-1"}
        first=c.post("/api/bookings",json=payload,headers=head)
        assert first.status_code==201,first.text
        second=c.post("/api/bookings",json=payload,headers=head)
        assert second.status_code==201
        assert second.json()["id"]==first.json()["id"]
        payload["idempotency_key"]="test-idempotent-2"
        conflict=c.post("/api/bookings",json=payload,headers=head)
        assert conflict.status_code==409
        legs=first.json()["legs"]
        assert len(legs)==3
        for leg in legs:
            r=c.patch("/api/legs/"+leg["id"]+"/confirmed",headers=head)
            assert r.status_code==200,r.text
        books=c.get("/api/bookings").json()
        confirmed=[b for b in books if b["id"]==first.json()["id"]][0]
        assert confirmed["status"]=="confirmed"
        assert c.post("/api/bookings/"+confirmed["id"]+"/cancel",headers=head).status_code==200

def test_google_requires_authorization():
    with TestClient(app) as c:
        head=login(c)
        status=c.get("/api/google/status")
        assert status.status_code==200
        assert status.json()["connected"] is False
        assert c.post("/api/google/connect",headers=head).status_code==409
