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


def test_expired_reservation_becomes_review_before_409():
    from datetime import timedelta
    from app.db import Booking, BookingLeg, now
    with TestClient(app) as client:
        login=client.post("/api/login",json={"email":"admin@example.test",
                                 "password":"CiOnlyStrongSecret-2026-NotProduction"})
        assert login.status_code==200
        headers={"x-csrf-token":client.cookies.get("growa_csrf")}
        with SessionLocal() as db:
            med=db.scalar(select(Slot).order_by(Slot.slot_date,Slot.time_hhmm))
        response=client.post("/api/plan",json={"medical_id":med.listing_id,
                                 "day":med.slot_date.isoformat(),"nights":2,"max_budget":100000})
        assert response.status_code==200
        option=response.json()["options"][0]
        booking=client.post("/api/bookings",json={"slot_id":option["slot_id"],
           "hotel_id":option["hotel_id"],"transport_id":option["transport_id"],
           "nights":2,"guests":1,"guest_alias":"Test vencimiento",
           "idempotency_key":"expiry-"+str(os.getpid())},headers=headers)
        assert booking.status_code==201,booking.text
        booking_id=booking.json()["id"]
        leg_id=booking.json()["legs"][0]["id"]
        with SessionLocal.begin() as db:
            row=db.get(Booking,booking_id)
            row.expires_at=now()-timedelta(minutes=1)
        rejection=client.patch("/api/legs/"+leg_id+"/confirmed",headers=headers)
        assert rejection.status_code==409
        with SessionLocal() as db:
            persisted=db.get(Booking,booking_id)
            assert persisted.status=="requires_review"
        client.post("/api/bookings/"+booking_id+"/cancel",headers=headers)


def test_valhalla_adapter_parses_mocked_road_route(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):pass
        def json(self):return {"trip":{"summary":{"length":7.3,"time":780},
                                     "legs":[{"shape":""}]}}
    class Client:
        def __init__(self,*args,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def get(self,*args,**kwargs):
            assert kwargs["headers"]["X-Client-Id"]
            return FakeResponse()
    monkeypatch.setenv("ROUTING_BASE_URL","https://routing.example.test")
    monkeypatch.setattr(routing.httpx,"Client",Client)
    a=SimpleNamespace(latitude=23.252,longitude=-106.441)
    b=SimpleNamespace(latitude=23.241,longitude=-106.410)
    result=routing.route_between(a,b)
    assert result["mode"]=="valhalla"
    assert result["distance_km"]==7.3
    assert result["minutes"]==13


def test_calendar_filter_applied_before_optimization(monkeypatch):
    """Authorized Google conflicts must be excluded before candidate ranking."""
    from app import google_calendar
    from app.db import User
    monkeypatch.setattr(google_calendar, "configured", lambda: True)
    monkeypatch.setattr(google_calendar, "token_for", lambda user_id: "authorized-demo-token")
    with TestClient(app) as client:
        with SessionLocal.begin() as db:
            slot=db.scalar(select(Slot).order_by(Slot.slot_date,Slot.time_hhmm))
            user=db.scalar(select(User).where(User.role=="admin"))
            medical=db.get(Listing,slot.listing_id)
            medical.provider_user_id=user.id
            listing_id=medical.id
            day=slot.slot_date.isoformat()
        def fake_busy(user_id, begin, end):
            assert user_id
            return [{"start":day+"T08:00:00-07:00", "end":day+"T15:10:00-07:00"}]
        monkeypatch.setattr(google_calendar, "freebusy", fake_busy)
        try:
            reply=client.post("/api/plan",json={"medical_id":listing_id,
                               "day":day,"nights":2,"max_budget":100000,
                               "priority":"proximity"})
            assert reply.status_code==200,reply.text
            result=reply.json()
            assert result["optimization"]["calendar_filter"]=="authorized_freebusy"
            assert result["optimization"]["calendar_conflicts"]>=3
            assert result["options"],"Remaining afternoon slot should still be recommended."
            assert all(x["time"]=="15:30" for x in result["options"])
        finally:
            with SessionLocal.begin() as db:
                db.get(Listing,listing_id).provider_user_id=None
