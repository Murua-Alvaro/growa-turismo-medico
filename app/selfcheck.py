"""Fast, dependency-contained validation for demo deployments.

These checks do not access patients, credentials, external services or live
reservations. They guard against an incompatible optimizer or broken local
semantic index when a demo web process starts.
"""
from __future__ import annotations
import logging
from types import SimpleNamespace
from . import discovery, optimizer, routing, services, community, dental
from .db import SessionLocal, Listing
from sqlalchemy import select, inspect

LOG = logging.getLogger("growa.selfcheck")


def run_demo_checks() -> dict[str, str]:
    cases = [
        {"slot_id": "slot1", "hotel_id": "a", "transport_id": "x", "time": "10:00",
         "preferred_hour": 10, "price_mxn": 3100, "distance_km": 9.2},
        {"slot_id": "slot2", "hotel_id": "b", "transport_id": "y", "time": "10:00",
         "preferred_hour": 10, "price_mxn": 6800, "distance_km": 1.8},
        {"slot_id": "slot3", "hotel_id": "c", "transport_id": "z", "time": "10:30",
         "preferred_hour": 10, "price_mxn": 5100, "distance_km": 3.4}
    ]
    cheapest, engine = optimizer.shortlist(cases, priority="economy", max_results=2)
    closest, _ = optimizer.shortlist(cases, priority="proximity", max_results=2)
    assert len(cheapest) == 2 and len(closest) == 2
    assert cheapest[0]["price_mxn"] == 3100
    assert closest[0]["distance_km"] <= 1.8
    assert all(x["recommendation"] for x in cheapest)
    assert "hospedaje" in discovery.tokens("Busco un hotel accesible")
    v = discovery.vector("hotel accesible")
    assert len(v) == discovery.DIM and abs(sum(x*x for x in v)-1.0) < 0.001
    left=SimpleNamespace(latitude=23.269,longitude=-106.461)
    right=SimpleNamespace(latitude=23.215,longitude=-106.428)
    approx=round(services.distance_km(left,right),1)
    assert approx > 0
    with SessionLocal() as db:
        assert db.scalar(select(Listing.id).where(Listing.demo.is_(True)).limit(1))
        catalog=services.search_catalog(db, category="hotel", accessible=True)
        assert catalog and all(x["category"]=="hotel" and x["accessible"] for x in catalog)
    with SessionLocal() as db:
        expected={"community_profiles","community_connections","community_messages","community_reports"}
        assert expected.issubset(set(inspect(db.bind).get_table_names()))
    example=community.CommunityProfile(user_id="synthetic",display_name="Visitante",profile_kind="visitor",languages="es",interests="")
    visible=community.profile_public("synthetic",example)
    assert visible["name"]=="Visitante" and "email" not in visible
    assert community.signup_enabled() is True  # only invoked in nonproduction demo
    from .db import ROOT
    for item in ("mazatlan.html", "mazatlan.css", "mazatlan.js", "mazatlan-data.js"):
        assert (ROOT/"static"/item).exists(), "Missing destination asset: "+item
    destination=(ROOT/"static"/"mazatlan.js").read_text(encoding="utf-8")
    assert "function places()" in destination and "function detail(p)" in destination
    for item in ("dental.html","dental.css","dental.js","dental-photos.js","img/dental-fallback.svg"):
        assert (ROOT/"static"/item).exists(), "Missing dental asset: "+item
    dental_assets=(ROOT/"static"/"dental-photos.js").read_text(encoding="utf-8")
    assert "Odontología Marina Norte · DEMO" in dental_assets and "pexels.com" in dental_assets
    dental_ui=(ROOT/"static"/"dental.js").read_text(encoding="utf-8")
    dental_css=(ROOT/"static"/"dental.css").read_text(encoding="utf-8")
    assert all(marker in dental_ui for marker in (
        "market-layout", "result-action", "profile-gallery",
        "comparison-section", "quote-preview", "data-compare"
    )), "Dental directory components missing"
    assert all(marker in dental_css for marker in (
        ".market-layout", ".filter-sidebar", ".result-action", ".profile-gallery"
    )), "Dental directory styles missing"
    with SessionLocal() as db:
        rows=list(db.scalars(dental.dental_query().limit(20)))
        assert len(rows)>=3, "Synthetic dentistry catalogue not initialized"
        for clinic in rows:
            if clinic.demo:
                assert not dental.record(clinic)["verified"]
                assert dental.record(clinic)["rating"] is None
    result={"optimizer":engine,"semantic":"passed","catalog":"passed",
            "geo_distance":"passed","routing":routing.status(),
            "community":"passed","destination":"passed","dental":"passed"}
    LOG.info("GROWA_DEMO_SELFTEST_PASSED %s", result)
    return result
