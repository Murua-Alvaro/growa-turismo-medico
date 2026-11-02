"""Journey acceptance and role-isolation tests. Synthetic data only."""
from __future__ import annotations

import os
from uuid import uuid4
from urllib.parse import urlparse
os.environ.setdefault("PRODUCTION", "false")
os.environ.setdefault("DATABASE_URL", f"sqlite:///./test_growa_{os.getpid()}.sqlite3")
os.environ.setdefault("DEMO_SEED", "true")
os.environ.setdefault("BOOTSTRAP_ADMIN_EMAIL", "admin@example.test")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "CiOnlyStrongSecret-2026-NotProduction")
os.environ.setdefault("PUBLIC_BASE_URL", "http://testserver")
os.environ.setdefault("ALLOWED_HOSTS", "testserver,localhost,127.0.0.1")

from fastapi.testclient import TestClient
from app.db import SessionLocal, Listing, User
from app.security import hash_password
from app.main import app

PASS = "UniqueSyntheticPassword!2026"


def login(c, email, password):
    r = c.post("/api/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"x-csrf-token": c.cookies.get("growa_csrf")}


def test_journey_pages_and_public_isolation():
    with TestClient(app) as c:
        for page in ("/mi-proceso", "/panel-medico", "/static/journey.html",
                     "/static/journey.css", "/static/journey.js"):
            r = c.get(page)
            assert r.status_code == 200, (page, r.text)
        assert c.get("/api/journey/cases").status_code == 401
        assert c.get("/api/journey/providers").status_code == 401
        assert c.post("/api/journey/cases", json={}).status_code in (401, 403)


def test_journey_invite_tasks_appointments_and_role_isolation():
    token = uuid4().hex[:12]
    provider_email = f"provider-{token}@example.test"
    patient_email = f"patient-{token}@example.test"
    stranger_email = f"stranger-{token}@example.test"
    with TestClient(app) as admin, TestClient(app) as patient, TestClient(app) as provider, TestClient(app) as stranger:
        with SessionLocal.begin() as db:
            doctor = User(email=provider_email, name="Profesional ficticio",
                          password_hash=hash_password(PASS), role="provider")
            outsider = User(email=stranger_email, name="Persona ajena",
                            password_hash=hash_password(PASS), role="patient")
            db.add_all([doctor, outsider]); db.flush()
            clinic = Listing(category="medico", name="Clínica ficticia Journey " + token,
                             demo=False, active=True, verified=False,
                             provider_user_id=doctor.id, zone="Mazatlán",
                             description="Prestador de prueba")
            db.add(clinic);db.flush()
            clinic_id = clinic.id
        admin_csrf = login(admin, "admin@example.test", "CiOnlyStrongSecret-2026-NotProduction")
        provider_csrf = login(provider, provider_email, PASS)
        stranger_csrf = login(stranger, stranger_email, PASS)
        assert clinic_id in [x["id"] for x in admin.get("/api/journey/providers").json()]
        request = {"patient_name": "Paciente ficticio", "patient_email": patient_email,
                   "listing_id": clinic_id, "service_label": "Consulta de orientación",
                   "preferred_language": "es"}
        assert admin.post("/api/journey/cases",json=request).status_code == 403
        created = admin.post("/api/journey/cases",json=request,headers=admin_csrf)
        assert created.status_code == 201, created.text
        case_id = created.json()["case"]["id"]
        link = created.json()["invitation_url"]
        assert urlparse(link).fragment.startswith("invite=")
        invite_token = urlparse(link).fragment.split("=", 1)[1]
        assert "invite=" not in urlparse(link).path
        assert stranger.get("/api/journey/cases/"+case_id).status_code == 404
        claim = patient.post("/api/journey/claim", json={
            "token": invite_token, "email": patient_email,
            "name": "Paciente ficticio", "password": PASS, "accept_terms": True})
        assert claim.status_code == 201, claim.text
        csrf = {"x-csrf-token": patient.cookies.get("growa_csrf")}
        assert patient.get("/api/journey/cases/"+case_id).status_code == 200
        assert patient.post("/api/journey/claim",json={
            "token":invite_token,"email":patient_email,"name":"Paciente ficticio","password":PASS
        }).status_code == 400
        assert provider.get("/api/journey/cases/"+case_id).status_code == 200
        assert provider.get("/api/journey/providers").status_code == 403
        assert patient.get("/api/journey/providers").status_code == 403
        assert patient.patch(f"/api/journey/cases/{case_id}/stage",
                             json={"stage":"review"},headers=csrf).status_code == 403
        # Patient cannot create tasks or complete provider-assigned tasks.
        t = provider.post(f"/api/journey/cases/{case_id}/tasks", json={
            "title":"Organizar el traslado","kind":"viaje","assigned_to":"patient",
            "detail":"Confirmar punto de encuentro"},headers=provider_csrf)
        assert t.status_code == 201,t.text
        assert patient.patch(f"/api/journey/cases/{case_id}/tasks/{t.json()['id']}",
                             json={"completed":True},headers=csrf).status_code == 200
        staff_task = provider.post(f"/api/journey/cases/{case_id}/tasks",json={
            "title":"Revisar agenda","assigned_to":"provider"},headers=provider_csrf)
        assert staff_task.status_code == 201
        assert patient.patch(f"/api/journey/cases/{case_id}/tasks/{staff_task.json()['id']}",
                             json={"completed":True},headers=csrf).status_code == 403
        m = patient.post(f"/api/journey/cases/{case_id}/messages",
                         json={"text":"¿Qué horario propondrían?","category":"cita"},headers=csrf)
        assert m.status_code == 201,m.text
        assert len(provider.get("/api/journey/cases/"+case_id).json()["messages"]) == 1
        assert provider.patch(f"/api/journey/cases/{case_id}/stage",
                              json={"stage":"scheduled"},headers=provider_csrf).status_code == 422
        for stage in ("review","planning"):
            r=provider.patch(f"/api/journey/cases/{case_id}/stage",
                             json={"stage":stage},headers=provider_csrf)
            assert r.status_code == 200,r.text
        assert provider.patch(f"/api/journey/cases/{case_id}/stage",
                              json={"stage":"scheduled"},headers=provider_csrf).status_code == 409
        appt=provider.post(f"/api/journey/cases/{case_id}/appointments",json={
            "starts_at":"2027-04-12T10:00:00","duration_minutes":45,"mode":"presencial"
        },headers=provider_csrf)
        assert appt.status_code == 201,appt.text
        confirm=provider.patch(f"/api/journey/cases/{case_id}/appointments/{appt.json()['id']}",
                               json={"state":"confirmed"},headers=provider_csrf)
        assert confirm.status_code == 200,confirm.text
        assert provider.patch(f"/api/journey/cases/{case_id}/stage",
                              json={"stage":"scheduled"},headers=provider_csrf).status_code == 200
        detail=patient.get("/api/journey/cases/"+case_id).json()
        assert detail["case"]["stage"]=="scheduled"
        assert len(detail["events"]) >= 5
        assert not detail["can_manage"]
        assert stranger.get("/api/journey/cases/"+case_id).status_code == 404
        assert stranger.patch(f"/api/journey/cases/{case_id}/tasks/{t.json()['id']}",
                              json={"completed":True},headers=stranger_csrf).status_code == 404
