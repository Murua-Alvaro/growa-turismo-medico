"""Dentistry directory uses existing listings and never invents clinical evidence."""
import os
os.environ.setdefault("PRODUCTION","false")
os.environ.setdefault("DEMO_SEED","true")
os.environ.setdefault("DATABASE_URL","sqlite:///./test_growa.sqlite3")
os.environ.setdefault("PUBLIC_BASE_URL","http://testserver")
os.environ.setdefault("ALLOWED_HOSTS","testserver,localhost,127.0.0.1")
os.environ.setdefault("BOOTSTRAP_ADMIN_EMAIL","admin@example.test")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD","CiOnlyStrongSecret-2026-NotProduction")

from fastapi.testclient import TestClient
from app.main import app


def test_dentistry_page_and_assets_are_public():
    with TestClient(app) as client:
        home=client.get("/odontologia")
        assert home.status_code==200
        assert 'id="quote-form"' in home.text
        assert "/static/dental.js" in home.text
        assert "/static/dental.css" in home.text
        for path in ("/static/dental.js","/static/dental.css"):
            assert client.get(path).status_code==200


def test_dental_directory_filters_and_procedure_disclaimer():
    with TestClient(app) as client:
        treatments=client.get("/api/dental/treatments")
        assert treatments.status_code==200
        assert len(treatments.json()["items"])==6
        resp=client.get("/api/dental/clinics")
        assert resp.status_code==200,resp.text
        data=resp.json()
        assert data["total"]>=3
        assert all(not item["accreditations"] and item["rating"] is None for item in data["items"])
        assert all(item["procedures_confirmed"]==[] for item in data["items"])
        demo=[x for x in data["items"] if x["demo"]]
        assert demo
        assert all(not item["verified"] and not item["contact_url"] for item in demo)
        assert all("DEMO" in item["price_label"] for item in demo)
        english=client.get("/api/dental/clinics?english=true").json()["items"]
        assert all(x["english"] for x in english)
        verified=client.get("/api/dental/clinics?verified=true").json()["items"]
        assert all(x["verified"] for x in verified)
        invalid=client.get("/api/dental/clinics?sort=best_success_rate")
        assert invalid.status_code==422


def test_individual_dental_pages_and_anonymous_quote_preview():
    with TestClient(app) as client:
        clinic=client.get("/api/dental/clinics").json()["items"][0]
        target=clinic["id"]
        page=client.get("/odontologia/clinicas/"+target)
        assert page.status_code==200
        detail=client.get("/api/dental/clinics/"+target)
        assert detail.status_code==200
        assert detail.json()["clinic"]["id"]==target
        response=client.post("/api/dental/quote-preview",json={
            "clinic_id":target, "treatment":"implantes",
            "travel_window":"tres_meses", "language":"en",
            "needs_hotel":True, "needs_transport":True
        })
        assert response.status_code==200,response.text
        data=response.json()
        assert data["status"]=="preview_only"
        assert data["sent"] is False
        assert data["procedure_price_mxn"] is None
        assert data["needs_hotel"] is True
        bad=client.post("/api/dental/quote-preview",json={
            "clinic_id":target,"treatment":"unknown-medical-service"})
        assert bad.status_code==422
        assert client.get("/api/dental/clinics/"+"f"*32).status_code==404
        assert client.get("/odontologia/clinicas/"+"f"*32).status_code==404
