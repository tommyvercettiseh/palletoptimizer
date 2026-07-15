from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from app.services.optimizer import (
    CalculationInput,
    OptimizationError,
    calculate_with_advice,
    list_pallets,
)

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="Pallet Insight",
    description="Lokale pallet- en verpakkingsoptimalisatie met 3D-preview.",
    version="0.4.0",
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


class CalculationRequest(BaseModel):
    pallet_id: str = "euro"
    box_length_mm: int = Field(gt=0, le=5000)
    box_width_mm: int = Field(gt=0, le=5000)
    box_height_mm: int = Field(gt=0, le=5000)
    max_total_height_mm: int = Field(gt=0, le=10000)
    box_weight_kg: float = Field(default=0, ge=0, le=5000)
    max_load_kg: float = Field(default=1000, gt=0, le=100000)
    annual_box_volume: int = Field(default=0, ge=0, le=1_000_000_000)
    cost_per_pallet_eur: float = Field(default=0, ge=0, le=1_000_000)
    proposed_height_reduction_mm: int = Field(default=10, ge=0, le=500)
    max_height_reduction_mm: int = Field(default=30, ge=0, le=500)


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"pallets": list_pallets()},
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.4.0"}


@app.get("/api/pallets")
def pallets() -> list[dict]:
    return list_pallets()


@app.post("/api/calculate")
def calculate(payload: CalculationRequest) -> dict:
    try:
        return calculate_with_advice(CalculationInput(**payload.model_dump()))
    except OptimizationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
