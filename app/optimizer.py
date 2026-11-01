"""Bounded, explainable multi-objective itinerary shortlist.

The availability engine builds *feasible* options first. This module ranks those
options; it never changes confirmed bookings or invents supplier availability.
Optional OR-Tools CP-SAT selects a diverse shortlist; a deterministic bounded
greedy fallback is used when OR-Tools is not installed or the solver times out.
"""
from __future__ import annotations
from collections import Counter
from math import isfinite

PRIORITIES = {"balanced", "economy", "proximity", "comfort"}
try:
    from ortools.sat.python import cp_model
except ImportError:
    cp_model = None


def utility(item: dict, priority: str = "balanced") -> int:
    if priority not in PRIORITIES:
        raise ValueError("Unknown priority")
    amount = max(0.0, float(item.get("price_mxn", 0)))
    km = max(0.0, float(item.get("distance_km", 0)))
    hour, minute = map(int, str(item.get("time", "10:00")).split(":")[:2])
    desired = max(6, min(20, int(item.get("preferred_hour", 10))))
    delay = abs((hour * 60 + minute) - desired * 60) / 60
    if not all(isfinite(v) for v in (amount, km)):
        return -1000000
    weights = {
        "balanced": (0.17, 5.0, 7.0),
        "economy": (0.37, 2.0, 6.0),
        # A proximity preference must actually prefer nearer providers even
        # when their reference price is moderately higher.
        "proximity": (0.03, 50.0, 8.0),
        "comfort": (0.06, 26.0, 16.0),
    }
    wc, wd, wt = weights[priority]
    return round(10000 - amount * wc - km * wd - delay * wt)


def explain(item: dict, priority: str) -> str:
    distance = float(item.get("distance_km", 0))
    desc = {
        "balanced": "Equilibrio entre costo, cercanía y horario",
        "economy": "Prioriza el menor costo total",
        "proximity": "Prioriza una menor distancia al servicio",
        "comfort": "Da mayor peso a la cercanía y al horario",
    }[priority]
    return f"{desc}. Distancia en línea recta: {distance:.1f} km; sujeto a confirmación."


def shortlist(options: list[dict], *, priority: str = "balanced",
              max_results: int = 6) -> tuple[list[dict], str]:
    if priority not in PRIORITIES:
        raise ValueError("Invalid priority")
    max_results = max(1, min(int(max_results), 12))
    candidates = []
    for original in options[:650]:
        row = dict(original)
        row["preferred_hour"] = int(row.get("preferred_hour", 10))
        row["utility"] = utility(row, priority)
        row["recommendation"] = explain(row, priority)
        candidates.append(row)
    if not candidates:
        return [], "none"
    candidates.sort(key=lambda r: (-r["utility"], r["price_mxn"], r["slot_id"], r["hotel_id"], r["transport_id"]))
    # Bound solver size and execution on the 512 MB Render free tier.
    candidates = candidates[:180]
    chosen = []
    engine = "deterministic"
    if cp_model is not None:
        model = cp_model.CpModel()
        x = [model.new_bool_var(f"o{i}") for i in range(len(candidates))]
        model.add(sum(x) >= 1)
        model.add(sum(x) <= max_results)
        for key, cap in (("hotel_id", 2), ("slot_id", 2), ("transport_id", 4)):
            for value in {row[key] for row in candidates}:
                model.add(sum(x[i] for i, row in enumerate(candidates) if row[key] == value) <= cap)
        # Shift scores to be positive to prefer filling the shortlist when feasible.
        low = min(r["utility"] for r in candidates)
        model.maximize(sum((row["utility"] - low + 1000) * x[i] for i, row in enumerate(candidates)))
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 0.35
        solver.parameters.num_search_workers = 1
        status = solver.solve(model)
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            chosen = [row for i, row in enumerate(candidates) if solver.value(x[i])]
            engine = "ortools-cp-sat"
    if not chosen:
        counts = {"hotel_id": Counter(), "slot_id": Counter(), "transport_id": Counter()}
        for row in candidates:
            if len(chosen) >= max_results:
                break
            if counts["hotel_id"][row["hotel_id"]] >= 2 or counts["slot_id"][row["slot_id"]] >= 2 or counts["transport_id"][row["transport_id"]] >= 4:
                continue
            chosen.append(row)
            for key in counts:
                counts[key][row[key]] += 1
    chosen.sort(key=lambda r: (-r["utility"], r["price_mxn"]))
    for i, row in enumerate(chosen):
        row["rank"] = i + 1
        row["score"] = round(row["utility"] / 100, 1)
        row.pop("preferred_hour", None)
    return chosen, engine
