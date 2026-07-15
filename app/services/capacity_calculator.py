from __future__ import annotations

from dataclasses import asdict
from math import ceil, floor, inf
from typing import Any

from app.config.pallets import get_pallet
from app.domain.models import CalculationInput
from app.services.layout_optimizer import optimize_layer


class CalculationError(ValueError):
    pass


def validate_input(data: CalculationInput) -> None:
    pallet = get_pallet(data.pallet_id)
    dimensions = {
        "Dooslengte": data.box_length_mm,
        "Doosbreedte": data.box_width_mm,
        "Dooshoogte": data.box_height_mm,
        "Maximale totale hoogte": data.max_total_height_mm,
    }
    for label, value in dimensions.items():
        if value <= 0:
            raise CalculationError(f"{label} moet groter zijn dan 0.")

    if data.max_total_height_mm <= pallet.height_mm:
        raise CalculationError(
            "De maximale hoogte moet hoger zijn dan de pallethoogte van "
            f"{pallet.height_mm} mm."
        )
    if data.box_weight_kg < 0:
        raise CalculationError("Doosgewicht mag niet negatief zijn.")
    if data.max_load_kg <= 0:
        raise CalculationError("Maximale palletbelasting moet groter zijn dan 0.")
    if data.proposed_height_reduction_mm < 0:
        raise CalculationError("De voorgestelde reductie mag niet negatief zijn.")
    if data.max_height_reduction_mm < 0:
        raise CalculationError("De maximale reductie mag niet negatief zijn.")


def calculate_capacity(data: CalculationInput) -> dict[str, Any]:
    validate_input(data)
    pallet = get_pallet(data.pallet_id)
    layer = optimize_layer(pallet, data.box_length_mm, data.box_width_mm)

    boxes_per_layer = layer.count
    usable_height_mm = data.max_total_height_mm - pallet.height_mm
    layers_by_height = usable_height_mm // data.box_height_mm

    if boxes_per_layer == 0:
        layers_by_weight = 0
        layers = 0
    elif data.box_weight_kg > 0:
        layer_weight_kg = boxes_per_layer * data.box_weight_kg
        layers_by_weight = floor(data.max_load_kg / layer_weight_kg)
        layers = min(layers_by_height, layers_by_weight)
    else:
        layers_by_weight = inf
        layers = layers_by_height

    layers = max(layers, 0)
    boxes_per_pallet = boxes_per_layer * layers
    load_height_mm = pallet.height_mm + layers * data.box_height_mm
    remaining_height_mm = max(data.max_total_height_mm - load_height_mm, 0)
    payload_weight_kg = boxes_per_pallet * data.box_weight_kg

    used_area_mm2 = sum(
        item.length_mm * item.width_mm for item in layer.placements
    )
    pallet_area_mm2 = pallet.length_mm * pallet.width_mm
    footprint_utilization_pct = (
        used_area_mm2 / pallet_area_mm2 * 100 if boxes_per_layer else 0
    )

    annual_pallets = (
        ceil(data.annual_box_volume / boxes_per_pallet)
        if data.annual_box_volume > 0 and boxes_per_pallet > 0
        else 0
    )
    annual_transport_cost_eur = annual_pallets * data.cost_per_pallet_eur
    cost_per_1000_boxes_eur = (
        annual_transport_cost_eur / data.annual_box_volume * 1000
        if data.annual_box_volume > 0
        else 0
    )

    if boxes_per_layer == 0:
        limiting_factor = "doos past niet"
    elif layers_by_weight != inf and layers_by_weight < layers_by_height:
        limiting_factor = "gewicht"
    else:
        limiting_factor = "hoogte"

    orientation_counts = {
        "lengthwise": sum(not item.rotated for item in layer.placements),
        "crosswise": sum(item.rotated for item in layer.placements),
    }

    return {
        "pallet": asdict(pallet),
        "input": asdict(data),
        "boxes_per_layer": boxes_per_layer,
        "layers": layers,
        "layers_by_height": layers_by_height,
        "layers_by_weight": None if layers_by_weight == inf else layers_by_weight,
        "boxes_per_pallet": boxes_per_pallet,
        "load_height_mm": load_height_mm,
        "remaining_height_mm": remaining_height_mm,
        "usable_height_mm": usable_height_mm,
        "payload_weight_kg": round(payload_weight_kg, 2),
        "footprint_utilization_pct": round(footprint_utilization_pct, 1),
        "annual_pallets": annual_pallets,
        "annual_transport_cost_eur": round(annual_transport_cost_eur, 2),
        "transport_cost_per_1000_boxes_eur": round(cost_per_1000_boxes_eur, 2),
        "limiting_factor": limiting_factor,
        "layout_strategy": layer.strategy,
        "optimality_status": layer.optimality_status,
        "optimality_proven": layer.optimality_status == "optimal",
        "theoretical_upper_bound": layer.theoretical_upper_bound,
        "solver_candidate_count": layer.candidate_count,
        "solver_time_ms": layer.solve_time_ms,
        "orientation_counts": orientation_counts,
        "layout": [asdict(item) for item in layer.placements],
    }
