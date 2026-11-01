"""Intelligence regressions: no network needed, no clinical data used."""
from __future__ import annotations
import os
from types import SimpleNamespace
os.environ.setdefault("PRODUCTION","false")
os.environ.setdefault("DATABASE_URL",f"sqlite:///./test_growa_{os.getpid()}.sqlite3")
os.environ.setdefault("DEMO_SEED","true")
os.environ.setdefault("BOOTSTRAP_ADMIN_EMAIL","admin@example.test")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD","CiOnlyStrongSecret-2026-NotProduction")
os.environ.setdefault("PUBLIC_BASE_URL","http://testserver")
os.environ.setdefault("ALLOWED_HOSTS","testserver,localhost,127.0.0.1")
os.environ["VECTOR_SEARCH_ENABLED"]="false"
os.environ["ROUTING_BASE_URL"]=""

from fastapi.testclient import TestClient
from sqlalchemy import select
from app import discovery, optimizer, routing
from app.main import app
from app.db import SessionLocal, Slot, Listing


def _option(slot, hotel, transport, amount, km, hour="10:00"):
    return {"slot_id":slot,"hotel_id":hotel,"transport_id":transport,
            "price_mxn":amount,"distance_km":km,"time":hour,"preferred_hour":10}


def test_optimizer_priorities_and_diversity():
    rows=[
        _option("s1","h1","t1",3000,9),
        _option("s1","h2","t1",6000,1),
        _option("s2","h1","t2",3600,7),
        _option("s2","h2","t2",7200,2),
    ]
    cheap, engine=optimizer.shortlist(rows,priority="economy",max_results=2)
    close,_=optimizer.shortlist(rows,priority="proximity",max_results=2)
    assert len(cheap)==2 and len(close)==2
    assert cheap[0]["price_mxn"] <= 3600
    assert close[0]["distance_km"] <= 2
    assert engine in {"ortools-cp-sat","deterministic"}
    assert all(r["recommendation"] and r["rank"]>0 for r in cheap)
    assert len({(r["slot_id"],r["hotel_id"],r["transport_id"]) for r in cheap})==2


def test_normalized_context_and_vector():
    assert discovery.tokens("Un hotel accesible con traslado en inglés") == [
        "hospedaje","accesible","transporte","bilingue"]
    v=discovery.vector("hotel tranquilo")
    assert len(v)==96
    assert abs(sum(x*x for x in v)-1.0)<0.00001
    assert discovery.vector("hotel tranquilo")==discovery.vector("hotel tranquilo")


def test_routing_no_url_returns_no_road_eta():
    a=SimpleNamespace(latitude=23.25,longitude=-106.45)
    b=SimpleNamespace(latitude=23.23,longitude=-106.41)
    answer=routing.route_between(a,b)
    assert answer["mode"]=="straight_line"
    assert answer["distance_km"]>0
    assert answer["minutes"] is None
    assert answer["geometry"]==[]


def test_api_intelligence_in_synthetic_demo():
    with TestClient(app) as client:
        h=client.get("/api/health")
        assert h.status_code==200
        assert "optimizer" in h.json()["features"]
        found=client.get("/api/discover",params={"query":"hotel accesible"})
        assert found.status_code==200,found.text
        result=found.json()
        assert result["engine"]=="contextual-local"
        assert all(x["category"]=="hotel" for x in result["items"])
        assert any(x["accessible"] for x in result["items"])
        with SessionLocal() as db:
            slot=db.scalar(select(Slot).order_by(Slot.slot_date,Slot.time_hhmm))
            hotel=db.scalar(select(Listing).where(Listing.category=="hotel"))
            med=db.scalar(select(Listing).where(Listing.id==slot.listing_id))
            route=client.get("/api/route",params={"from_id":hotel.id,"to_id":med.id})
            assert route.status_code==200
            assert route.json()["mode"]=="straight_line"
            payload={"medical_id":med.id,"day":slot.slot_date.isoformat(),
                     "nights":2,"priority":"proximity","max_budget":100000}
        plan=client.post("/api/plan",json=payload)
        assert plan.status_code==200,plan.text
        body=plan.json()
        assert body["optimization"]["priority"]=="proximity"
        assert body["optimization"]["engine"] in {"ortools-cp-sat","deterministic"}
        assert len(body["options"])<=8
        if body["options"]:
            assert body["options"][0]["recommendation"]
        bad=client.post("/api/plan",json={**payload,"priority":"unapproved"})
        assert bad.status_code==422


def test_missing_route_and_category_errors():
    with TestClient(app) as client:
        assert client.get("/api/route",params={"from_id":"1234567890","to_id":"9999999999"}).status_code==404
        assert client.get("/api/discover",params={"query":"x","category":"bad"}).status_code==422
