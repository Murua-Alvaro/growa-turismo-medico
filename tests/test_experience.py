"""Smoke coverage for the public interactive journey using synthetic inventory only."""
from __future__ import annotations
import os
os.environ.setdefault("PRODUCTION", "false")
os.environ.setdefault("DATABASE_URL", f"sqlite:///./test_growa_{os.getpid()}.sqlite3")
os.environ.setdefault("DEMO_SEED", "true")
os.environ.setdefault("BOOTSTRAP_ADMIN_EMAIL", "admin@example.test")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "CiOnlyStrongSecret-2026-NotProduction")
os.environ.setdefault("PUBLIC_BASE_URL", "http://testserver")
os.environ.setdefault("ALLOWED_HOSTS", "testserver,localhost,127.0.0.1")

from fastapi.testclient import TestClient
from app.main import app


def test_public_interactive_journey_routes_and_permissions():
    with TestClient(app) as client:
        page = client.get("/experiencia")
        assert page.status_code == 200
        assert "Encontrar y programar" in page.text
        assert "Panel profesional" in page.text
        assert client.get("/experiencia/").status_code == 200
        script = client.get("/static/experiencia.js")
        assert script.status_code == 200
        assert "localStorage" in script.text
        assert "/api/demo-network" in script.text
        assert client.get("/static/experiencia.css").status_code == 200
        source = client.get("/api/demo-network")
        assert source.status_code == 200
        assert source.json()["demo"] is True
        # The public experience never opens permissioned Neon write endpoints.
        forbidden = client.post("/api/demo-network/appointments", json={})
        assert forbidden.status_code in (401, 403)
