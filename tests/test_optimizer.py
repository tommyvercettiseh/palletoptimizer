from app.services.optimizer import CalculationInput, calculate_with_advice, get_pallet


def sample_input(**overrides):
    base = {
        "pallet_id": "euro",
        "box_length_mm": 400,
        "box_width_mm": 300,
        "box_height_mm": 250,
        "box_weight_kg": 8,
        "max_total_height_mm": 1800,
        "max_load_kg": 1000,
        "annual_box_volume": 100_000,
        "cost_per_pallet_eur": 85,
        "max_height_reduction_mm": 20,
    }
    base.update(overrides)
    return CalculationInput(**base)


def test_euro_pallet_has_requested_height():
    pallet = get_pallet("euro")
    assert pallet.length_mm == 1200
    assert pallet.width_mm == 800
    assert pallet.height_mm == 144


def test_standard_sample_capacity():
    result = calculate_with_advice(sample_input())
    assert result["boxes_per_layer"] == 8
    assert result["layers"] == 6
    assert result["boxes_per_pallet"] == 48
    assert result["load_height_mm"] == 1644


def test_height_advice_finds_extra_layer():
    result = calculate_with_advice(sample_input())
    advice = result["height_advice"]
    assert advice is not None
    assert advice["reduction_mm"] == 14
    assert advice["new_box_height_mm"] == 236
    assert advice["new_layers"] == 7
    assert advice["new_boxes_per_pallet"] == 56
    assert advice["annual_savings_eur"] > 0


def test_weight_can_limit_number_of_layers():
    result = calculate_with_advice(sample_input(max_load_kg=200))
    assert result["layers"] == 3
    assert result["boxes_per_pallet"] == 24
    assert result["limiting_factor"] == "gewicht"


def test_optimizer_supports_mixed_regions_and_rotations():
    result = calculate_with_advice(
        sample_input(box_length_mm=250, box_width_mm=180)
    )
    assert result["layout_strategy"] == "exact-tetris"
    assert result["orientation_counts"]["lengthwise"] > 0
    assert result["orientation_counts"]["crosswise"] > 0
    assert result["boxes_per_layer"] == 20

    pallet = result["pallet"]
    placements = result["layout"]
    for placement in placements:
        assert placement["x_mm"] >= 0
        assert placement["y_mm"] >= 0
        assert placement["x_mm"] + placement["length_mm"] <= pallet["length_mm"]
        assert placement["y_mm"] + placement["width_mm"] <= pallet["width_mm"]

    for index, first in enumerate(placements):
        for second in placements[index + 1 :]:
            separated = (
                first["x_mm"] + first["length_mm"] <= second["x_mm"]
                or second["x_mm"] + second["length_mm"] <= first["x_mm"]
                or first["y_mm"] + first["width_mm"] <= second["y_mm"]
                or second["y_mm"] + second["width_mm"] <= first["y_mm"]
            )
            assert separated


def test_proposed_reduction_is_compared_separately_from_best_advice():
    result = calculate_with_advice(sample_input(proposed_height_reduction_mm=10))
    proposed = result["advice"]["proposed_reduction"]
    threshold = result["advice"]["minimum_reduction_for_gain"]
    assert proposed["reduction_mm"] == 10
    assert proposed["capacity_gain_boxes"] == 0
    assert threshold["reduction_mm"] == 14


def test_exact_tetris_solver_beats_guillotine_layout():
    result = calculate_with_advice(
        sample_input(box_length_mm=280, box_width_mm=210)
    )
    assert result["boxes_per_layer"] == 15
    assert result["optimality_proven"] is True
    assert result["layout_strategy"] == "exact-tetris"
    assert result["orientation_counts"]["lengthwise"] > 0
    assert result["orientation_counts"]["crosswise"] > 0


def test_exact_layout_never_overlaps_and_may_leave_internal_space():
    result = calculate_with_advice(
        sample_input(box_length_mm=280, box_width_mm=210)
    )
    placements = result["layout"]
    assert len(placements) == 15
    for index, first in enumerate(placements):
        for second in placements[index + 1 :]:
            separated = (
                first["x_mm"] + first["length_mm"] <= second["x_mm"]
                or second["x_mm"] + second["length_mm"] <= first["x_mm"]
                or first["y_mm"] + first["width_mm"] <= second["y_mm"]
                or second["y_mm"] + second["width_mm"] <= first["y_mm"]
            )
            assert separated
