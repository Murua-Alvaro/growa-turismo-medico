"""Real navigable URL tests. No external services or personal data required."""
from __future__ import annotations
import os
os.environ.setdefault("PRODUCTION","false")
os.environ.setdefault("DATABASE_URL","sqlite:///./test_growa.sqlite3")
os.environ.setdefault("DEMO_SEED","true")
os.environ.setdefault("BOOTSTRAP_ADMIN_EMAIL","admin@example.test")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD","CiOnlyStrongSecret-2026-NotProduction")
os.environ.setdefault("PUBLIC_BASE_URL","http://testserver")
os.environ.setdefault("ALLOWED_HOSTS","testserver,localhost,127.0.0.1")
from fastapi.testclient import TestClient
from app.main import app

DESTINATION_ROUTES=[
    "/mazatlan",
    "/mazatlan/historia",
    "/mazatlan/lugares",
    "/mazatlan/cultura",
    "/mazatlan/guia",
    "/mazatlan/lugares/plazuela-machado",
    "/mazatlan/lugares/teatro-angela-peralta",
    "/mazatlan/lugares/olas-altas",
    "/mazatlan/lugares/catedral",
    "/mazatlan/lugares/museo-arqueologico",
    "/mazatlan/lugares/faro",
    "/mazatlan/lugares/malecon",
    "/mazatlan/lugares/mercado-pino-suarez",
    "/mazatlan/lugares/plazuela-republica",
]

def test_destination_deep_links_refreshable():
    with TestClient(app) as client:
        for url in DESTINATION_ROUTES:
            response=client.get(url)
            assert response.status_code==200,(url,response.text[:250])
            assert 'text/html' in response.headers['content-type']
            assert 'id="main"' in response.text
            assert '/static/mazatlan-data.js' in response.text
            assert '/static/mazatlan.js' in response.text
            assert 'id="destination-toggle"' in response.text

def test_missing_editorial_route_is_404():
    with TestClient(app) as client:
        for path in ("/mazatlan/otro","/mazatlan/lugares/ficticio"):
            assert client.get(path).status_code==404

def test_standalone_navigation_and_assets():
    with TestClient(app) as client:
        for route in ("/explorar","/planificar","/comunidad","/itinerarios","/aliados"):
            result=client.get(route)
            assert result.status_code==200,route
            assert 'data-go="explore"' in result.text
        home=client.get("/").text
        assert 'href="/mazatlan"' in home
        assert 'href="/mazatlan/historia"' in home
        assert 'data-story-target="dest-history"' not in home
        for path in ("/static/mazatlan.css","/static/mazatlan-data.js","/static/mazatlan.js"):
            assert client.get(path).status_code==200,path
