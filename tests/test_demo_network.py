"""Neon network API tests using isolated fictitious SQLite records only."""
from __future__ import annotations
import os
from datetime import datetime, timedelta
from uuid import uuid4
os.environ.setdefault("PRODUCTION","false")
os.environ.setdefault("DATABASE_URL",f"sqlite:///./test_growa_{os.getpid()}.sqlite3")
os.environ.setdefault("DEMO_SEED","true")
os.environ.setdefault("BOOTSTRAP_ADMIN_EMAIL","admin@example.test")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD","CiOnlyStrongSecret-2026-NotProduction")
os.environ.setdefault("PUBLIC_BASE_URL","http://testserver")
os.environ.setdefault("ALLOWED_HOSTS","testserver,localhost,127.0.0.1")
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.demo_network import DemoPerson


def test_network_page_and_admin_only_calendar_writes():
    stamp=uuid4().hex[:5].upper()
    doctor_id="DR"+stamp[:3]
    patient_id="PT"+stamp[:3]
    with TestClient(app) as c:
        assert c.get("/red-medica").status_code == 200
        assert c.get("/static/network.js").status_code == 200
        sample=c.get("/api/demo-network")
        assert sample.status_code == 200
        assert sample.json()["demo"] is True
        assert c.post("/api/demo-network/appointments", json={}).status_code in (401,403)
        with SessionLocal.begin() as db:
            db.add(DemoPerson(id=doctor_id,kind="doctor",display_name="Profesional ficticio",
                              specialty="Odontología general",city="Mazatlán",languages="Español",clinic="Clínica DEMO"))
            db.add(DemoPerson(id=patient_id,kind="patient",display_name="Paciente ficticio",
                              specialty="",city="DEMO",languages="Español",clinic="",assigned_doctor_id=doctor_id))
        login=c.post("/api/login",json={"email":"admin@example.test",
                       "password":"CiOnlyStrongSecret-2026-NotProduction"})
        assert login.status_code==200,login.text
        csrf={"x-csrf-token":c.cookies.get("growa_csrf")}
        future=datetime.utcnow()+timedelta(days=7)
        while future.weekday()>=5: future+=timedelta(days=1)
        future=future.replace(hour=10,minute=0,second=0,microsecond=0)
        payload={"doctor_id":doctor_id,"patient_id":patient_id,"starts_at":future.isoformat(),
                 "duration_minutes":45,"service":"Consulta administrativa DEMO"}
        assert c.post("/api/demo-network/appointments",json=payload).status_code==403
        created=c.post("/api/demo-network/appointments",json=payload,headers=csrf)
        assert created.status_code==201,created.text
        visit=created.json()
        assert c.post("/api/demo-network/appointments",json=payload,headers=csrf).status_code==409
        confirmed=c.patch("/api/demo-network/appointments/"+visit["id"],json={"status":"confirmed"},headers=csrf)
        assert confirmed.status_code==200,confirmed.text
        assert any(v["id"]==visit["id"] for v in c.get("/api/demo-network").json()["appointments"])
