from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Pallet:
    id: str
    name: str
    length_mm: int
    width_mm: int
    height_mm: int
    default_max_load_kg: float


@dataclass(frozen=True)
class BoxPlacement:
    x_mm: int
    y_mm: int
    length_mm: int
    width_mm: int
    rotated: bool


@dataclass(frozen=True)
class CalculationInput:
    pallet_id: str
    box_length_mm: int
    box_width_mm: int
    box_height_mm: int
    max_total_height_mm: int
    custom_pallet_length_mm: int = 0
    custom_pallet_width_mm: int = 0
    custom_pallet_height_mm: int = 0
    box_weight_kg: float = 0
    max_load_kg: float = 1000
    annual_box_volume: int = 0
    cost_per_pallet_eur: float = 0
    proposed_height_reduction_mm: int = 10
    max_height_reduction_mm: int = 30
