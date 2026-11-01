"""Dental tourism discovery API.

Providers are drawn from Growa's existing Listings table, never from scraped
Bookimed profiles. Demo records are visibly synthetic. Pricing describes only
the listing's declared reference service, NOT the dental procedure cost.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from .db import Listing, SessionLocal
from .services import public_listing

router = APIRouter(prefix="/api/dental", tags=["Dental"])

TREATMENTS = (
    {"id": "implantes", "name": "Implantes dentales", "subtitle": "Valoración y alternativas restaurativas",
     "about": "Los implantes requieren valoración clínica, diagnóstico e información individual sobre materiales y etapas."},
    {"id": "carillas", "name": "Carillas dentales", "subtitle": "Opciones de estética dental",
     "about": "El abordaje depende de la condición dental y de una valoración profesional previa."},
    {"id": "coronas", "name": "Coronas y prótesis", "subtitle": "Rehabilitación restaurativa",
     "about": "El costo depende del número de piezas, los materiales y el plan establecido por el odontólogo."},
    {"id": "ortodoncia", "name": "Ortodoncia", "subtitle": "Evaluación de alineación dental",
     "about": "El tratamiento y los tiempos deben ser determinados por el profesional responsable."},
    {"id": "endodoncia", "name": "Endodoncia", "subtitle": "Consulta y diagnóstico",
     "about": "La indicación depende de valoración clínica y estudios necesarios."},
    {"id": "limpieza", "name": "Limpieza y prevención", "subtitle": "Atención preventiva",
     "about": "Los procedimientos apropiados se determinan tras la revisión odontológica."},
)
TREATMENT_BY_ID = {x["id"]: x for x in TREATMENTS}


def dental_query():
    return select(Listing).where(
        Listing.active.is_(True), Listing.category == "medico",
        or_(func.lower(Listing.subtype).like("%odont%"),
            func.lower(Listing.subtype).like("%dental%"),
            func.lower(Listing.name).like("%dental%"),
            func.lower(Listing.name).like("%odont%"))
    )


def record(row: Listing) -> dict:
    p = public_listing(row)
    return {
        "id": p["id"], "name": p["name"], "zone": p["zone"],
        "subtype": p["subtype"], "description": p["description"],
        "image_url": p["image_url"], "demo": p["demo"],
        "verified": p["verified"], "english": p["english"],
        "accessible": p["accessible"],
        "latitude": p["latitude"], "longitude": p["longitude"],
        "consultation_reference_mxn": p["price_mxn"] if p["price_mxn"] > 0 else None,
        "price_label": ("Importe de ejemplo · DEMO" if p["demo"] else
                        "Importe declarado por prestador · sin validar" if not p["verified"] else
                        "Importe declarado por prestador"),
        "contact_url": p["contact_url"] if p["verified"] else "",
        "procedures_confirmed": [],
        "rating": None, "reviews": None, "accreditations": [],
        "notice": ("Ficha sintética, no representa una clínica real." if p["demo"] else
                   "Ficha de prestador; documentación pendiente de revisión." if not p["verified"] else
                   "Verifica directamente credenciales, disponibilidad, costos y plan clínico.")
    }


@router.get("/treatments")
def treatments():
    return {"items": list(TREATMENTS), "notice": "Información general, no indicaciones ni precios clínicos."}


@router.get("/clinics")
def clinics(q: str = Query("", max_length=90),
            zone: str = Query("", max_length=80),
            english: bool = False, accessible: bool = False, verified: bool = False,
            sort: str = Query("name", pattern="^(name|reference_asc|reference_desc|zone)$"),
            limit: int = Query(80, ge=1, le=150)):
    with SessionLocal() as db:
        rows = list(db.scalars(dental_query().order_by(Listing.name).limit(300)))
        items = [record(x) for x in rows]
        if q:
            phrase = q.casefold().strip()
            items = [x for x in items if phrase in " ".join(
                [x["name"], x["subtype"], x["zone"], x["description"]]).casefold()]
        if zone:
            items = [x for x in items if x["zone"] == zone]
        if english:
            items = [x for x in items if x["english"]]
        if accessible:
            items = [x for x in items if x["accessible"]]
        if verified:
            items = [x for x in items if x["verified"]]
        if sort == "reference_asc":
            items.sort(key=lambda x: (x["consultation_reference_mxn"] is None,
                                     x["consultation_reference_mxn"] or 0, x["name"]))
        elif sort == "reference_desc":
            items.sort(key=lambda x: (x["consultation_reference_mxn"] is None,
                                      -(x["consultation_reference_mxn"] or 0), x["name"]))
        elif sort == "zone":
            items.sort(key=lambda x: (x["zone"], x["name"]))
        else:
            items.sort(key=lambda x: x["name"])
        return {"items": items[:limit], "total": len(items),
                "zones": sorted({x["zone"] for x in rows and [record(r) for r in rows]}),
                "source": "Growa listings", "verified_count": sum(x["verified"] for x in items),
                "notice": "Los importes son referencias de consulta o ejemplos, nunca precios de tratamientos. No se muestran calificaciones ni acreditaciones no comprobadas."}


@router.get("/clinics/{clinic_id}")
def clinic_detail(clinic_id: str):
    with SessionLocal() as db:
        row = db.get(Listing, clinic_id)
        if not row or not row.active or row.category != "medico" or not any(
            t in (row.name + " " + row.subtype).casefold() for t in ("odont", "dental")):
            raise HTTPException(404, "El perfil odontológico no está disponible.")
        return {"clinic": record(row), "treatments": list(TREATMENTS)}


class QuoteBrief(BaseModel):
    clinic_id: str = Field(min_length=10, max_length=40)
    treatment: str = Field(min_length=3, max_length=32)
    travel_window: str = Field(default="sin_definir", pattern="^(sin_definir|proximo_mes|tres_meses|mas_adelante)$")
    language: str = Field(default="es", pattern="^(es|en)$")
    needs_hotel: bool = False
    needs_transport: bool = False


@router.post("/quote-preview")
def quote_preview(body: QuoteBrief):
    if body.treatment not in TREATMENT_BY_ID:
        raise HTTPException(422, "Selecciona un procedimiento del catálogo.")
    with SessionLocal() as db:
        row = db.get(Listing, body.clinic_id)
        if not row or not row.active or row.category != "medico" or not any(
            t in (row.name + " " + row.subtype).casefold() for t in ("odont", "dental")):
            raise HTTPException(404, "El prestador seleccionado ya no está disponible.")
        return {
            "status": "preview_only", "sent": False, "clinic_id": row.id,
            "clinic_name": row.name,
            "procedure": TREATMENT_BY_ID[body.treatment]["name"],
            "travel_window": body.travel_window,
            "language": body.language,
            "needs_hotel": body.needs_hotel, "needs_transport": body.needs_transport,
            "procedure_price_mxn": None,
            "notice": "Resumen generado en Growa. NO se envió una solicitud ni se recibió cotización de la clínica. El importe final exige valoración y contacto confirmado."
        }
