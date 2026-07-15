from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_homepage_loads():
    response = client.get("/")
    assert response.status_code == 200
    assert "Pallet Insight" in response.text
    assert "palletCanvas" in response.text


def test_homepage_uses_responsive_workspace():
    response = client.get("/")
    stylesheet = client.get("/static/style.css")

    assert response.status_code == 200
    assert stylesheet.status_code == 200
    assert 'class="page-shell workspace-shell"' in response.text
    assert 'id="resultCard"' in response.text
    assert "grid-template-columns: minmax(320px, 380px) minmax(0, 1fr)" in stylesheet.text
    assert "@media (max-width: 999px)" in stylesheet.text


def test_calculation_api_returns_advice():
    response = client.post(
        "/api/calculate",
        json={
            "pallet_id": "euro",
            "box_length_mm": 400,
            "box_width_mm": 300,
            "box_height_mm": 250,
            "box_weight_kg": 8,
            "max_total_height_mm": 1800,
            "max_load_kg": 1000,
            "annual_box_volume": 100000,
            "cost_per_pallet_eur": 85,
            "max_height_reduction_mm": 20,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["boxes_per_pallet"] == 48
    assert data["height_advice"]["new_boxes_per_pallet"] == 56


def test_simple_api_request_uses_future_ready_defaults():
    response = client.post(
        "/api/calculate",
        json={
            "pallet_id": "euro",
            "box_length_mm": 250,
            "box_width_mm": 180,
            "box_height_mm": 220,
            "max_total_height_mm": 1800,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["layout_strategy"] == "exact-tetris"
    assert data["orientation_counts"]["lengthwise"] > 0
    assert data["orientation_counts"]["crosswise"] > 0
