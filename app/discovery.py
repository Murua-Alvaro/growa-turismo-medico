"""Spanish contextual discovery with optional Neon pgvector retrieval.

This is a transparent, deterministic domain-aware vector representation, NOT
a foundation model or clinical inference. No query histories or medical data
are stored. Enable VECTOR_SEARCH_ENABLED only with PostgreSQL/pgvector.
"""
from __future__ import annotations
import hashlib
import json
import math
import os
import re
import unicodedata
from collections import Counter
from sqlalchemy import text
from sqlalchemy.orm import Session
from .db import Listing, engine
from .services import public_listing, search_catalog

DIM = 96
ALIASES = {
    "hotel": "hospedaje", "hoteles": "hospedaje", "alojamiento": "hospedaje",
    "habitacion": "hospedaje", "dormir": "hospedaje", "estancia": "hospedaje",
    "doctor": "medico", "doctora": "medico", "especialista": "medico",
    "consulta": "medico", "clinica": "medico", "rehabilitacion": "medico",
    "terapia": "medico", "fisioterapia": "medico", "salud": "medico",
    "taxi": "transporte", "chofer": "transporte", "traslado": "transporte",
    "movilidad": "transporte", "vehiculo": "transporte", "auto": "transporte",
    "restaurante": "negocio", "comercio": "negocio", "tienda": "negocio",
    "accesibilidad": "accesible", "silla": "accesible",
    "rampa": "accesible", "discapacidad": "accesible",
    "ingles": "bilingue", "english": "bilingue", "idioma": "bilingue",
    "calma": "tranquilo", "silencioso": "tranquilo", "descansar": "tranquilo",
    "familia": "acompanantes", "familiar": "acompanantes",
}
STOP = {"de", "el", "la", "los", "las", "para", "por", "con", "en", "un", "una", "y",
        "que", "quiero", "necesito", "busco", "mi", "me", "algo", "del", "al", "cerca"}
CATEGORY = {"hospedaje": "hotel", "medico": "medico", "transporte": "transporte", "negocio": "negocio"}


def tokens(value: str) -> list[str]:
    clean = "".join(c for c in unicodedata.normalize("NFKD", value.casefold())
                    if not unicodedata.combining(c))
    words = re.findall(r"[a-z0-9]{2,}", clean[:1200])
    return [ALIASES.get(word, word) for word in words if word not in STOP]


def document(item: dict) -> str:
    extra = " ".join(["accesible" if item.get("accessible") else "",
                      "bilingue" if item.get("english") else ""])
    return " ".join(str(item.get(key) or "") for key in
                    ("name", "subtype", "category", "zone", "description")) + " " + extra


def vector(value: str) -> list[float]:
    term_list = tokens(value)
    values = [0.0] * DIM
    for term, n in Counter(term_list).items():
        digest = hashlib.sha256(term.encode("utf-8")).digest()
        pos = int.from_bytes(digest[:4], "big") % DIM
        values[pos] += 1.0 + math.log1p(n)
        # Common subword signals help with plurals and simple misspellings.
        if len(term) >= 6:
            stem = term[:5]
            idx = int.from_bytes(hashlib.sha256(stem.encode()).digest()[:4], "big") % DIM
            values[idx] += 0.4
    norm = math.sqrt(sum(x*x for x in values))
    return [round(x/norm, 7) for x in values] if norm else values


def _similar(a: list[float], b: list[float]) -> float:
    return sum(x*y for x, y in zip(a, b))


def _enabled() -> bool:
    return engine.dialect.name == "postgresql" and os.getenv("VECTOR_SEARCH_ENABLED", "false").lower() == "true"


def prepare_index() -> bool:
    if not _enabled():
        return False
    # Explicit opt-in: not executed for the SQLite demonstration.
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text("""CREATE TABLE IF NOT EXISTS growa_listing_vectors (
            listing_id varchar(32) PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
            embedding vector(96) NOT NULL,
            updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""))
        conn.execute(text("""CREATE INDEX IF NOT EXISTS growa_listing_vectors_hnsw
            ON growa_listing_vectors USING hnsw (embedding vector_cosine_ops)"""))
    return True


def sync_index(db: Session) -> int:
    if not _enabled():
        return 0
    from sqlalchemy import select
    rows = list(db.scalars(select(Listing).where(Listing.active.is_(True)).limit(2000)))
    for row in rows:
        upsert(db, row)
    return len(rows)


def upsert(db: Session, item: Listing) -> None:
    if not _enabled():
        return
    data = document(public_listing(item))
    coordinates = "[" + ",".join(str(x) for x in vector(data)) + "]"
    db.execute(text("""INSERT INTO growa_listing_vectors(listing_id, embedding)
        VALUES (:id, CAST(:embedding AS vector))
        ON CONFLICT (listing_id)
        DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = CURRENT_TIMESTAMP"""),
        {"id": item.id, "embedding": coordinates})


def _db_scores(db: Session, q: str) -> dict[str, float]:
    if not _enabled():
        return {}
    coordinates = "[" + ",".join(str(x) for x in vector(q)) + "]"
    try:
        rows = db.execute(text("""SELECT listing_id,
            1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM growa_listing_vectors
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT 250"""), {"embedding": coordinates})
        return {str(id_): max(0.0, float(sim or 0.0)) for id_, sim in rows}
    except Exception:
        # Avoid leaving the transaction unusable if the vector table is absent.
        db.rollback()
        return {}


def discover(db: Session, query: str, *, category: str = "all", zone: str = "",
             max_price: int = 0, accessible: bool = False, english: bool = False,
             verified: bool = False, limit: int = 50) -> dict:
    query = query.strip()[:160]
    items = search_catalog(db, category, "", zone, max_price, accessible, english, verified)
    if not query:
        return {"items": items[:limit], "engine": "catalog", "notice": "Catálogo de proveedores declarados o sintéticos."}
    terms = tokens(query)
    kinds = {CATEGORY[t] for t in terms if t in CATEGORY}
    if category == "all" and len(kinds) == 1:
        items = [item for item in items if item["category"] in kinds]
    query_vector = vector(query)
    db_scores = _db_scores(db, query)
    ranked = []
    for item in items:
        label = document(item)
        wordset = set(tokens(label))
        matched = [t for t in dict.fromkeys(terms) if t in wordset]
        lexical = len(matched) / max(len(set(terms)), 1)
        semantic = db_scores.get(item["id"], _similar(query_vector, vector(label)))
        score = round(0.65 * semantic + 0.35 * lexical, 5)
        if score <= 0:
            continue
        copy = dict(item)
        copy["relevance"] = score
        copy["match_reasons"] = matched[:4]
        ranked.append(copy)
    ranked.sort(key=lambda x: (-x["relevance"], x["price_mxn"], x["name"]))
    return {"items": ranked[:limit], "engine": "pgvector-hybrid" if db_scores else "contextual-local",
            "notice": "Coincidencia por características declaradas; no es una recomendación clínica ni acredita disponibilidad."}
