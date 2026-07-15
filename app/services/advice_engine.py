from __future__ import annotations

from dataclasses import asdict, replace
from typing import Any

from app.domain.models import CalculationInput
from app.services.capacity_calculator import calculate_capacity


def _scenario_summary(
    current: dict[str, Any],
    scenario: dict[str, Any],
    data: CalculationInput,
    reduction_mm: int,
) -> dict[str, Any]:
    pallets_saved = max(current["annual_pallets"] - scenario["annual_pallets"], 0)
    annual_savings = pallets_saved * data.cost_per_pallet_eur
    capacity_gain = scenario["boxes_per_pallet"] - current["boxes_per_pallet"]
    capacity_gain_pct = (
        capacity_gain / current["boxes_per_pallet"] * 100
        if current["boxes_per_pallet"] > 0
        else 0
    )
    return {
        "reduction_mm": reduction_mm,
        "new_box_height_mm": data.box_height_mm - reduction_mm,
        "new_layers": scenario["layers"],
        "new_boxes_per_pallet": scenario["boxes_per_pallet"],
        "capacity_gain_boxes": capacity_gain,
        "capacity_gain_pct": round(capacity_gain_pct, 1),
        "extra_layer": scenario["layers"] > current["layers"],
        "annual_pallets": scenario["annual_pallets"],
        "pallets_saved_per_year": pallets_saved,
        "annual_savings_eur": round(annual_savings, 2),
    }


def evaluate_proposed_reduction(
    data: CalculationInput, current: dict[str, Any]
) -> dict[str, Any] | None:
    reduction = min(
        data.proposed_height_reduction_mm,
        max(data.box_height_mm - 1, 0),
    )
    if reduction <= 0:
        return None
    scenario_input = replace(
        data,
        box_height_mm=data.box_height_mm - reduction,
        proposed_height_reduction_mm=0,
        max_height_reduction_mm=0,
    )
    scenario = calculate_capacity(scenario_input)
    return _scenario_summary(current, scenario, data, reduction)


def find_minimum_height_reduction(
    data: CalculationInput, current: dict[str, Any]
) -> dict[str, Any] | None:
    if current["boxes_per_pallet"] <= 0 or data.max_height_reduction_mm <= 0:
        return None

    max_reduction = min(data.max_height_reduction_mm, data.box_height_mm - 1)
    for reduction in range(1, max_reduction + 1):
        scenario_input = replace(
            data,
            box_height_mm=data.box_height_mm - reduction,
            proposed_height_reduction_mm=0,
            max_height_reduction_mm=0,
        )
        scenario = calculate_capacity(scenario_input)
        if scenario["boxes_per_pallet"] > current["boxes_per_pallet"]:
            return _scenario_summary(current, scenario, data, reduction)
    return None


def calculate_with_advice(data: CalculationInput) -> dict[str, Any]:
    current = calculate_capacity(data)
    proposed = evaluate_proposed_reduction(data, current)
    threshold = find_minimum_height_reduction(data, current)
    return {
        **current,
        "advice": {
            "proposed_reduction": proposed,
            "minimum_reduction_for_gain": threshold,
        },
        "height_advice": threshold,
        "input": asdict(data),
    }
