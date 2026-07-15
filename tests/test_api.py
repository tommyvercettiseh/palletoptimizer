from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_homepage_loads_compact_english_interface():
    response = client.get("/")
    stylesheet = client.get("/static/style.css")
    javascript = client.get("/static/app.js")

    assert response.status_code == 200
    assert stylesheet.status_code == 200
    assert javascript.status_code == 200
    assert "Pallet Optimizer" in response.text
    assert 'lang="en"' in response.text
    assert 'id="palletCanvas"' in response.text
    assert 'data-height-mode="inclusive"' in response.text
    assert 'data-height-mode="exclusive"' in response.text
    assert 'id="case_quantity"' in response.text
    assert 'id="boxesPerLayer"' in response.text
    assert 'id="layers"' in response.text
    assert 'id="boxesPerPallet"' in response.text
    assert 'id="caseQuantityResult"' in response.text
    assert 'id="palletQuantity"' in response.text
    assert 'id="totalHeight"' in response.text
    assert "grid-template-columns: repeat(3,minmax(0,1fr))" in stylesheet.text
    assert "height: calc(100vh - 88px)" in stylesheet.text
    assert "payload.max_total_height_mm" not in javascript.text
    assert "heightMode === \"inclusive\"" in javascript.text


def test_removed_dashboard_features_are_not_loaded():
    response = client.get("/")
    assert 'id="modeAdvanced"' not in response.text
    assert 'id="company_name"' not in response.text
    assert 'id="downloadSnapshot"' not in response.text
    assert "height-visualization.js" not in response.text
    assert "height-visualization.css" not in response.text


def test_calculation_api_returns_expected_capacity():
    response = client.post(
        "/api/calculate",
        json={
            "pallet_id": "euro",
            "box_length_mm": 400,
            "box_width_mm": 300,
            "box_height_mm": 250,
            "max_total_height_mm": 1800,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["boxes_per_layer"] == 8
    assert data["layers"] == 6
    assert data["boxes_per_pallet"] == 48
    assert data["load_height_mm"] == 1644


def test_simple_api_request_uses_exact_tetris():
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


def test_health_uses_repository_version():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.8.0"}
