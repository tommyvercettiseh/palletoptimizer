from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from app.services.exact_packing_solver import solve_exact_layer

from app.domain.models import BoxPlacement, Pallet


@dataclass(frozen=True)
class LayerLayout:
    placements: tuple[BoxPlacement, ...]
    strategy: str
    optimality_status: str = "heuristic"
    theoretical_upper_bound: int = 0
    candidate_count: int = 0
    solve_time_ms: int = 0

    @property
    def count(self) -> int:
        return len(self.placements)


def _offset(
    placements: tuple[BoxPlacement, ...], x_offset: int = 0, y_offset: int = 0
) -> tuple[BoxPlacement, ...]:
    return tuple(
        BoxPlacement(
            x_mm=item.x_mm + x_offset,
            y_mm=item.y_mm + y_offset,
            length_mm=item.length_mm,
            width_mm=item.width_mm,
            rotated=item.rotated,
        )
        for item in placements
    )


def _uniform_grid(
    area_length_mm: int,
    area_width_mm: int,
    box_length_mm: int,
    box_width_mm: int,
    rotated: bool,
) -> LayerLayout:
    if box_length_mm > area_length_mm or box_width_mm > area_width_mm:
        return LayerLayout((), "uniform")

    columns = area_length_mm // box_length_mm
    rows = area_width_mm // box_width_mm
    placements = tuple(
        BoxPlacement(
            x_mm=column * box_length_mm,
            y_mm=row * box_width_mm,
            length_mm=box_length_mm,
            width_mm=box_width_mm,
            rotated=rotated,
        )
        for row in range(rows)
        for column in range(columns)
    )
    return LayerLayout(placements, "uniform-rotated" if rotated else "uniform")


def _best_strip_layout(
    area_length_mm: int,
    area_width_mm: int,
    box_length_mm: int,
    box_width_mm: int,
) -> LayerLayout:
    row_options: list[tuple[int, int, int, int, bool]] = []

    normal_count = area_length_mm // box_length_mm
    if normal_count > 0 and box_width_mm <= area_width_mm:
        row_options.append(
            (box_width_mm, normal_count, box_length_mm, box_width_mm, False)
        )

    rotated_count = area_length_mm // box_width_mm
    if rotated_count > 0 and box_length_mm <= area_width_mm:
        row_options.append(
            (box_length_mm, rotated_count, box_width_mm, box_length_mm, True)
        )

    if not row_options:
        return LayerLayout((), "mixed-rows")

    unreachable = -10**9
    best = [unreachable] * (area_width_mm + 1)
    previous: list[tuple[int, int] | None] = [None] * (area_width_mm + 1)
    best[0] = 0

    for used_width in range(area_width_mm + 1):
        if best[used_width] == unreachable:
            continue
        for option_index, option in enumerate(row_options):
            depth, count, *_ = option
            next_width = used_width + depth
            if next_width > area_width_mm:
                continue
            candidate = best[used_width] + count
            if candidate > best[next_width]:
                best[next_width] = candidate
                previous[next_width] = (used_width, option_index)

    best_used_width = max(
        range(area_width_mm + 1), key=lambda width: (best[width], width)
    )
    if best[best_used_width] <= 0:
        return LayerLayout((), "mixed-rows")

    choices: list[int] = []
    cursor = best_used_width
    while cursor > 0:
        step = previous[cursor]
        if step is None:
            break
        cursor, option_index = step
        choices.append(option_index)
    choices.reverse()

    placements: list[BoxPlacement] = []
    y_mm = 0
    for option_index in choices:
        depth, count, box_x, box_y, rotated = row_options[option_index]
        for column in range(count):
            placements.append(
                BoxPlacement(
                    x_mm=column * box_x,
                    y_mm=y_mm,
                    length_mm=box_x,
                    width_mm=box_y,
                    rotated=rotated,
                )
            )
        y_mm += depth

    return LayerLayout(tuple(placements), "mixed-rows")


def _transpose(layout: LayerLayout) -> LayerLayout:
    return LayerLayout(
        tuple(
            BoxPlacement(
                x_mm=item.y_mm,
                y_mm=item.x_mm,
                length_mm=item.width_mm,
                width_mm=item.length_mm,
                rotated=not item.rotated,
            )
            for item in layout.placements
        ),
        "mixed-columns",
    )


def _best_basic_layout(
    area_length_mm: int,
    area_width_mm: int,
    box_length_mm: int,
    box_width_mm: int,
) -> LayerLayout:
    candidates = [
        _uniform_grid(
            area_length_mm,
            area_width_mm,
            box_length_mm,
            box_width_mm,
            False,
        ),
        _uniform_grid(
            area_length_mm,
            area_width_mm,
            box_width_mm,
            box_length_mm,
            True,
        ),
        _best_strip_layout(
            area_length_mm,
            area_width_mm,
            box_length_mm,
            box_width_mm,
        ),
        _transpose(
            _best_strip_layout(
                area_width_mm,
                area_length_mm,
                box_length_mm,
                box_width_mm,
            )
        ),
    ]
    return max(
        candidates,
        key=lambda layout: (
            layout.count,
            sum(item.length_mm * item.width_mm for item in layout.placements),
        ),
    )


def _candidate_cuts(limit_mm: int, first_mm: int, second_mm: int) -> tuple[int, ...]:
    if limit_mm <= 1:
        return ()

    reachable = {0}
    for _ in range(max(limit_mm // min(first_mm, second_mm), 1) + 1):
        additions = {
            value + step
            for value in reachable
            for step in (first_mm, second_mm)
            if 0 < value + step < limit_mm
        }
        new_values = additions - reachable
        if not new_values:
            break
        reachable.update(new_values)

    cuts = sorted(value for value in reachable if 0 < value < limit_mm)
    if len(cuts) <= 28:
        return tuple(cuts)

    indices = {
        round(index * (len(cuts) - 1) / 27)
        for index in range(28)
    }
    return tuple(cuts[index] for index in sorted(indices))


def _optimize_layer_heuristic(
    pallet: Pallet,
    box_length_mm: int,
    box_width_mm: int,
    max_split_depth: int = 2,
) -> LayerLayout:
    theoretical_box_count = (
        pallet.length_mm * pallet.width_mm
    ) // max(box_length_mm * box_width_mm, 1)
    if theoretical_box_count > 80:
        effective_depth = 0
    elif theoretical_box_count > 40:
        effective_depth = min(max_split_depth, 1)
    else:
        effective_depth = max_split_depth

    @lru_cache(maxsize=None)
    def solve(length_mm: int, width_mm: int, depth: int) -> LayerLayout:
        best = _best_basic_layout(
            length_mm, width_mm, box_length_mm, box_width_mm
        )
        if depth <= 0:
            return best

        for cut_x in _candidate_cuts(length_mm, box_length_mm, box_width_mm):
            left = solve(cut_x, width_mm, depth - 1)
            right = solve(length_mm - cut_x, width_mm, depth - 1)
            combined = LayerLayout(
                left.placements + _offset(right.placements, x_offset=cut_x),
                "mixed-regions",
            )
            if combined.count > best.count:
                best = combined

        for cut_y in _candidate_cuts(width_mm, box_length_mm, box_width_mm):
            bottom = solve(length_mm, cut_y, depth - 1)
            top = solve(length_mm, width_mm - cut_y, depth - 1)
            combined = LayerLayout(
                bottom.placements + _offset(top.placements, y_offset=cut_y),
                "mixed-regions",
            )
            if combined.count > best.count:
                best = combined

        return best

    return solve(pallet.length_mm, pallet.width_mm, effective_depth)


@lru_cache(maxsize=512)
def optimize_layer(
    pallet: Pallet,
    box_length_mm: int,
    box_width_mm: int,
    max_split_depth: int = 2,
) -> LayerLayout:
    heuristic = _optimize_layer_heuristic(
        pallet, box_length_mm, box_width_mm, max_split_depth
    )
    exact = solve_exact_layer(
        pallet, box_length_mm, box_width_mm, heuristic.placements
    )
    return LayerLayout(
        placements=exact.placements,
        strategy=(
            "exact-tetris"
            if exact.is_optimal
            else "tetris-best-found"
        ),
        optimality_status=exact.status,
        theoretical_upper_bound=exact.upper_bound,
        candidate_count=exact.candidate_count,
        solve_time_ms=exact.solve_time_ms,
    )
