from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_homepage_loads_modern_custom_pallet_interface():
    response = client.get("/")
    stylesheet = client.get("/static/style.css")
    javascript = client.get("/static/app.js")
    assert response.status_code == 200
    assert stylesheet.status_code == 200
    assert javascript.status_code == 200
    assert "Pallet Optimizer" in response.text
    assert 'lang="en"' in response.text
    assert 'id="palletCanvas"' in response.text
    assert 'data-pallet-mode="preset"' in response.text
    assert 'data-pallet-mode="custom"' in response.text
    assert 'id="custom_pallet_length_mm"' in response.text
    assert 'id="downloadResult"' in response.text
    assert 'id="heightAdvice"' in response.text
    assert 'id="heightAdviceText"' in response.text
    assert 'id="boxesPerLayer"' in response.text
    assert "downloadFilename" in javascript.text
    assert "box_${length}x${width}x${height}mm_maxheight_${maximumHeight}mm.png" in javascript.text
    assert "Lower box height by" in javascript.text
    assert "numberFormat.format(data.load_height_mm)" not in javascript.text
    assert "custom_pallet_length_mm" in javascript.text
    assert ".metric-icon svg" in stylesheet.text
    assert ".advice-card" in stylesheet.text


def test_calculation_api_returns_expected_capacity():
    response = client.post("/api/calculate", json={
        "pallet_id": "euro", "box_length_mm": 400, "box_width_mm": 300,
        "box_height_mm": 250, "max_total_height_mm": 1800,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["boxes_per_layer"] == 8
    assert data["layers"] == 6
    assert data["boxes_per_pallet"] == 48
    assert data["load_height_mm"] == 1644
    assert data["advice"]["minimum_reduction_for_gain"]["reduction_mm"] == 14


def test_custom_pallet_dimensions_are_used():
    response = client.post("/api/calculate", json={
        "pallet_id": "custom", "custom_pallet_length_mm": 1000,
        "custom_pallet_width_mm": 1000, "custom_pallet_height_mm": 150,
        "box_length_mm": 500, "box_width_mm": 500, "box_height_mm": 250,
        "max_total_height_mm": 1650,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["pallet"]["name"] == "Custom pallet"
    assert data["pallet"]["length_mm"] == 1000
    assert data["pallet"]["width_mm"] == 1000
    assert data["pallet"]["height_mm"] == 150
    assert data["boxes_per_layer"] == 4
    assert data["layers"] == 6


def test_simple_api_request_uses_exact_tetris():
    response = client.post("/api/calculate", json={
        "pallet_id": "euro", "box_length_mm": 250, "box_width_mm": 180,
        "box_height_mm": 220, "max_total_height_mm": 1800,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["layout_strategy"] == "exact-tetris"
    assert data["orientation_counts"]["lengthwise"] > 0
    assert data["orientation_counts"]["crosswise"] > 0


def test_health_uses_repository_version():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.9.1"}
