from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_homepage_loads():
    response = client.get("/")
    assert response.status_code == 200
    assert "Pallet Insight" in response.text
    assert "palletCanvas" in response.text


def test_homepage_has_basic_advanced_branding_and_download():
    response = client.get("/")
    stylesheet = client.get("/static/style.css")
    javascript = client.get("/static/app.js")

    assert response.status_code == 200
    assert stylesheet.status_code == 200
    assert javascript.status_code == 200
    assert 'id="modeBasic"' in response.text
    assert 'id="modeAdvanced"' in response.text
    assert 'id="company_name"' in response.text
    assert 'id="downloadSnapshot"' in response.text
    assert 'id="surfaceUsed"' in response.text
    assert 'id="volumeUsed"' in response.text
    assert "body.mode-basic .advanced-only" in stylesheet.text
    assert "drawFaceLabel" in javascript.text
    assert "Datasheet snapshot" in javascript.text


def test_calculation_api_returns_advice_and_utilization():
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
    assert data["used_area_mm2"] == 960000
    assert data["pallet_area_mm2"] == 960000
    assert data["volume_utilization_pct"] == 90.6
    assert data["used_volume_mm3"] == 1_440_000_000
    assert data["available_volume_mm3"] == 1_589_760_000


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
    assert 0 <= data["volume_utilization_pct"] <= 100


def test_health_uses_repository_version():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.6.0"}
