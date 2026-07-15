from __future__ import annotations

from dataclasses import asdict
from typing import Any

from app.domain.models import Pallet


PALLETS: dict[str, Pallet] = {
    "euro": Pallet(
        id="euro",
        name="Europallet",
        length_mm=1200,
        width_mm=800,
        height_mm=144,
        default_max_load_kg=1000,
    )
}


class UnknownPalletError(ValueError):
    pass


def get_pallet(pallet_id: str) -> Pallet:
    try:
        return PALLETS[pallet_id]
    except KeyError as exc:
        raise UnknownPalletError(f"Onbekend pallet: {pallet_id}") from exc


def list_pallets() -> list[dict[str, Any]]:
    return [asdict(pallet) for pallet in PALLETS.values()]
