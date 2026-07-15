from __future__ import annotations

from dataclasses import dataclass
from math import floor
from os import cpu_count
from time import perf_counter

from ortools.sat.python import cp_model

from app.domain.models import BoxPlacement, Pallet


@dataclass(frozen=True)
class ExactPackingResult:
    placements: tuple[BoxPlacement, ...]
    status: str
    upper_bound: int
    candidate_count: int
    solve_time_ms: int

    @property
    def is_optimal(self) -> bool:
        return self.status == "optimal"


MAX_EXACT_CANDIDATES = 12_000
MAX_SOLVE_SECONDS = 30.0


def _reachable_positions(limit_mm: int, first_mm: int, second_mm: int) -> tuple[int, ...]:
    values: set[int] = set()
    for first_count in range(limit_mm // first_mm + 1):
        base = first_count * first_mm
        remaining = limit_mm - base
        for second_count in range(remaining // second_mm + 1):
            values.add(base + second_count * second_mm)
    return tuple(sorted(values))


def _candidate_placements(
    pallet: Pallet,
    box_length_mm: int,
    box_width_mm: int,
) -> tuple[BoxPlacement, ...]:
    x_positions = _reachable_positions(
        pallet.length_mm, box_length_mm, box_width_mm
    )
    y_positions = _reachable_positions(
        pallet.width_mm, box_length_mm, box_width_mm
    )

    candidates: list[BoxPlacement] = []
    orientations = [(box_length_mm, box_width_mm, False)]
    if box_length_mm != box_width_mm:
        orientations.append((box_width_mm, box_length_mm, True))

    for length_mm, width_mm, rotated in orientations:
        for x_mm in x_positions:
            if x_mm + length_mm > pallet.length_mm:
                continue
            for y_mm in y_positions:
                if y_mm + width_mm <= pallet.width_mm:
                    candidates.append(
                        BoxPlacement(
                            x_mm=x_mm,
                            y_mm=y_mm,
                            length_mm=length_mm,
                            width_mm=width_mm,
                            rotated=rotated,
                        )
                    )
    return tuple(candidates)


def _area_upper_bound(
    pallet: Pallet, box_length_mm: int, box_width_mm: int
) -> int:
    return floor(
        pallet.length_mm
        * pallet.width_mm
        / max(box_length_mm * box_width_mm, 1)
    )


def solve_exact_layer(
    pallet: Pallet,
    box_length_mm: int,
    box_width_mm: int,
    seed_placements: tuple[BoxPlacement, ...],
) -> ExactPackingResult:
    started = perf_counter()
    upper_bound = _area_upper_bound(pallet, box_length_mm, box_width_mm)
    if len(seed_placements) >= upper_bound:
        return ExactPackingResult(
            placements=seed_placements,
            status="optimal",
            upper_bound=upper_bound,
            candidate_count=0,
            solve_time_ms=round((perf_counter() - started) * 1000),
        )

    candidates = _candidate_placements(
        pallet, box_length_mm, box_width_mm
    )
    if len(candidates) > MAX_EXACT_CANDIDATES:
        return ExactPackingResult(
            placements=seed_placements,
            status="best_found",
            upper_bound=upper_bound,
            candidate_count=len(candidates),
            solve_time_ms=round((perf_counter() - started) * 1000),
        )

    model = cp_model.CpModel()
    selected: list[cp_model.IntVar] = []
    x_intervals: list[cp_model.IntervalVar] = []
    y_intervals: list[cp_model.IntervalVar] = []

    for index, candidate in enumerate(candidates):
        present = model.new_bool_var(f"box_{index}")
        selected.append(present)
        x_intervals.append(
            model.new_optional_fixed_size_interval_var(
                candidate.x_mm,
                candidate.length_mm,
                present,
                f"x_{index}",
            )
        )
        y_intervals.append(
            model.new_optional_fixed_size_interval_var(
                candidate.y_mm,
                candidate.width_mm,
                present,
                f"y_{index}",
            )
        )

    model.add_no_overlap_2d(x_intervals, y_intervals)
    model.add(sum(selected) >= len(seed_placements))
    model.maximize(sum(selected))

    candidate_index = {
        (
            item.x_mm,
            item.y_mm,
            item.length_mm,
            item.width_mm,
            item.rotated,
        ): index
        for index, item in enumerate(candidates)
    }
    seeded = {
        candidate_index[key]
        for item in seed_placements
        if (
            key := (
                item.x_mm,
                item.y_mm,
                item.length_mm,
                item.width_mm,
                item.rotated,
            )
        )
        in candidate_index
    }
    for index, variable in enumerate(selected):
        model.add_hint(variable, 1 if index in seeded else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = MAX_SOLVE_SECONDS
    solver.parameters.num_search_workers = max(1, min(cpu_count() or 1, 8))
    solver.parameters.random_seed = 42
    solver.parameters.log_search_progress = False

    solver_status = solver.solve(model)
    status_name = solver.status_name(solver_status)
    if status_name not in {"OPTIMAL", "FEASIBLE"}:
        return ExactPackingResult(
            placements=seed_placements,
            status="best_found",
            upper_bound=upper_bound,
            candidate_count=len(candidates),
            solve_time_ms=round((perf_counter() - started) * 1000),
        )

    placements = tuple(
        candidates[index]
        for index, variable in enumerate(selected)
        if solver.boolean_value(variable)
    )
    if len(placements) < len(seed_placements):
        placements = seed_placements

    return ExactPackingResult(
        placements=placements,
        status="optimal" if status_name == "OPTIMAL" else "best_found",
        upper_bound=upper_bound,
        candidate_count=len(candidates),
        solve_time_ms=round((perf_counter() - started) * 1000),
    )
