"""Growa social interactions: public privacy, mutual consent and moderation."""
from __future__ import annotations
import os
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

SECRET="StrongPassphrase!2026ForSocialDemo"


def register(client,alias):
    e=f"{alias}-{uuid4().hex[:12]}@example.test"
    response=client.post("/api/community/register",json={
        "email":e,"password":SECRET,"name":alias,
        "terms":True,"age18":True})
    assert response.status_code==201,response.text
    assert response.json()["account"]["role"]=="member"
    return response.json()["account"]["id"]


def auth_headers(client):
    token=client.cookies.get("growa_csrf")
    assert token
    return {"x-csrf-token":token}


def test_community_lifecycle_with_mutual_consent_and_privacy():
    with TestClient(app) as alice,TestClient(app) as bob:
        alice_id=register(alice,"Alicia Prueba")
        bob_id=register(bob,"Beto Prueba")
        assert alice.get("/api/community/me").json()["discoverable"] is False
        public=bob.get("/api/community/members").json()["items"]
        assert all(p["id"]!=alice_id for p in public)
        assert bob.post("/api/community/connect",json={"member_id":alice_id},
                        headers=auth_headers(bob)).status_code==404
        profile={
            "display_name":"Alicia Prueba",
            "headline":"Cultura y ciudad","bio":"Me interesa la historia del puerto.",
            "profile_kind":"local","languages":"es,en","interests":["cultura"],
            "discoverable":True,
        }
        assert alice.put("/api/community/me",json=profile,headers=auth_headers(alice)).status_code==200
        visible=bob.get("/api/community/members",params={"kind":"local"}).json()["items"]
        assert any(p["id"]==alice_id and "email" not in p for p in visible)
        connect=bob.post("/api/community/connect",json={"member_id":alice_id},
                         headers=auth_headers(bob))
        assert connect.status_code==201,connect.text
        connection_id=connect.json()["id"]
        assert bob.post(f"/api/community/messages/{connection_id}",
                        json={"message":"¿Hola?"},headers=auth_headers(bob)).status_code==403
        assert alice.post(f"/api/community/connections/{connection_id}/action",
                          json={"action":"accept"}).status_code==403
        accepted=alice.post(f"/api/community/connections/{connection_id}/action",
                            json={"action":"accept"},headers=auth_headers(alice))
        assert accepted.status_code==200,accepted.text
        assert accepted.json()["status"]=="accepted"
        message=bob.post(f"/api/community/messages/{connection_id}",
                         json={"message":"Hola, ¿cómo estás?"},
                         headers=auth_headers(bob))
        assert message.status_code==201,message.text
        body=alice.get(f"/api/community/messages/{connection_id}").json()
        assert body["items"][-1]["body"]=="Hola, ¿cómo estás?"
        assert body["items"][-1]["mine"] is False
        assert bob.get(f"/api/community/messages/{uuid4().hex}").status_code==403
        hidden=alice.post("/api/community/me/withdraw",headers=auth_headers(alice))
        assert hidden.status_code==200,hidden.text
        others=bob.get("/api/community/members").json()["items"]
        assert all(p["id"]!=alice_id for p in others)
        assert bob.get(f"/api/community/messages/{connection_id}").status_code==403
        assert all("email" not in item for item in others)


def test_frontend_routes_and_assets():
    with TestClient(app) as client:
        homepage=client.get("/")
        assert homepage.status_code==200
        html=homepage.text
        assert 'id="view-mazatlan"' in html
        assert 'id="view-community"' in html
        assert 'id="community-register-form"' in html
        for path in ("/static/community.js","/static/app.js","/static/styles.css"):
            response=client.get(path)
            assert response.status_code==200,path
        status=client.get("/api/community/status")
        assert status.status_code==200
        assert status.json()["requires_mutual_consent"] is True


def test_admin_moderation_and_report_queue():
    with TestClient(app) as client:
        login=client.post("/api/login",json={
            "email":"admin@example.test",
            "password":"CiOnlyStrongSecret-2026-NotProduction"})
        assert login.status_code==200,login.text
        report=client.get("/api/community/moderation/reports")
        assert report.status_code==200,report.text
        assert "items" in report.json()
