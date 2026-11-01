"""Bounded Valhalla adapter. Network routes are estimates, never booking guarantees.

Only the operator-configured endpoint is called. No user-provided URL is fetched.
Public demonstration instances must not be used as a commercial routing backend.
"""
from __future__ import annotations
import json
import math
import os
import threading
import time
from urllib.parse import urlparse
import httpx
from .services import distance_km

_LOCK = threading.Lock()
_CACHE: dict[tuple, tuple[float, dict]] = {}
_CALLS: list[float] = []


def _endpoint() -> str:
    url = os.getenv("ROUTING_BASE_URL", "").strip().rstrip("/")
    if not url:
        return ""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        return ""
    return url


def status() -> str:
    return "valhalla" if _endpoint() else "straight-line-only"


def _fallback(a, b, reason: str) -> dict:
    return {"mode": "straight_line", "distance_km": round(distance_km(a, b), 1),
            "minutes": None, "geometry": [],
            "notice": reason + " Distancia geográfica aproximada, no vial."}


def _decode_polyline(encoded: str, precision: int = 6) -> list[list[float]]:
    # Valhalla encodes trip legs as polyline6, [latitude, longitude].
    lat = lon = index = 0
    points = []
    while index < len(encoded) and len(points) < 1800:
        coords = []
        for _ in range(2):
            result = shift = 0
            while True:
                if index >= len(encoded):
                    return []
                value = ord(encoded[index]) - 63
                index += 1
                result |= (value & 31) << shift
                shift += 5
                if shift > 35:
                    return []
                if value < 32:
                    break
            coords.append((result >> 1) ^ -(result & 1))
        lat += coords[0]
        lon += coords[1]
        points.append([round(lon / 10**precision, 6), round(lat / 10**precision, 6)])
    return points


def route_between(a, b) -> dict:
    fallback = _fallback(a, b, "Servicio de ruteo vial no disponible.")
    base = _endpoint()
    if not base:
        return fallback
    coords = [float(a.latitude), float(a.longitude), float(b.latitude), float(b.longitude)]
    if not all(math.isfinite(x) for x in coords) or not all(-90 <= x <= 90 for x in (coords[0], coords[2])) or not all(-180 <= x <= 180 for x in (coords[1], coords[3])):
        return _fallback(a, b, "Coordenadas inválidas.")
    key = tuple(round(x, 5) for x in coords)
    t = time.monotonic()
    with _LOCK:
        previous = _CACHE.get(key)
        if previous and t - previous[0] < 900:
            return dict(previous[1])
        _CALLS[:] = [moment for moment in _CALLS if t - moment < 60]
        if len(_CALLS) >= 12:
            return _fallback(a, b, "Límite temporal del servicio de rutas alcanzado.")
        _CALLS.append(t)
    try:
        payload = {"locations": [{"lat": coords[0], "lon": coords[1]},
                                 {"lat": coords[2], "lon": coords[3]}],
                   "costing": "auto", "units": "kilometers", "directions_options": {"units": "kilometers"}}
        with httpx.Client(timeout=httpx.Timeout(3.5, connect=1.6), follow_redirects=False) as client:
            response = client.get(base + "/route",
                                  params={"json": json.dumps(payload, separators=(",", ":"))},
                                  headers={"X-Client-Id": "growa-turismo-medico-demo", "Accept": "application/json"})
            response.raise_for_status()
            data = response.json()
        summary = data["trip"]["summary"]
        km = float(summary["length"])
        seconds = float(summary["time"])
        if not all(math.isfinite(v) and v >= 0 for v in (km, seconds)):
            raise ValueError("Invalid route measurements")
        parts = [_decode_polyline(leg.get("shape", "")) for leg in data["trip"].get("legs", [])]
        geometry = []
        for part in parts:
            if len(part) > 1:
                geometry.extend(part if not geometry else part[1:])
        result = {"mode": "valhalla", "distance_km": round(km, 1),
                  "minutes": max(1, round(seconds / 60)), "geometry": geometry,
                  "notice": "Estimación de recorrido vial basada en OpenStreetMap; no considera tránsito en tiempo real."}
        with _LOCK:
            if len(_CACHE) > 400:
                _CACHE.clear()
            _CACHE[key] = (t, result)
        return result
    except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError):
        return _fallback(a, b, "No se pudo calcular la ruta vial.")
