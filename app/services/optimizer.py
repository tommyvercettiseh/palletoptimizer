"""Backward-compatible facade for the public optimizer API."""

from app.config.pallets import get_pallet, list_pallets
from app.domain.models import BoxPlacement, CalculationInput, Pallet
from app.services.advice_engine import calculate_with_advice
from app.services.capacity_calculator import CalculationError, calculate_capacity

OptimizationError = CalculationError

__all__ = [
    "BoxPlacement",
    "CalculationInput",
    "OptimizationError",
    "Pallet",
    "calculate_capacity",
    "calculate_with_advice",
    "get_pallet",
    "list_pallets",
]
