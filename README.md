# Pallet Insight

![Desktoppreview](docs/preview-desktop.png)

Lokale Python-webapp die de maximale laagindeling voor gelijke dozen op een pallet zoekt. Iedere doos mag afzonderlijk 90 graden draaien. Daardoor ondersteunt de optimizer ook vrije Tetris-patronen met kleine ongebruikte ruimtes midden in de laag.

## Starten op Windows

1. Pak de ZIP uit.
2. Dubbelklik op **Start Pallet Insight.bat**.
3. De launcher maakt automatisch een afgeschermde Python-omgeving en installeert de pakketten.
4. De browser opent vanzelf op `http://127.0.0.1:8000`.

In de launcher staat ook het wifi-adres waarmee je de app op je telefoon kunt openen. Pc en telefoon moeten op dezelfde wifi zitten.

## Huidige invoer

* Pallettype
* Dooslengte, doosbreedte en dooshoogte
* Maximale totale pallethoogte inclusief pallet

De huidige catalogus bevat een Europallet van **1200 × 800 × 144 mm**.

## Tetris-optimalisatie

De berekening bestaat uit twee stappen:

1. Een snelle optimizer maakt direct een sterke rechte, gedraaide of gemengde indeling.
2. Google OR-Tools CP-SAT test daarna vrije plaatsingen en bewijst waar mogelijk het mathematische maximum.

De solver is niet beperkt tot volledige rijen of rechthoekige deelvlakken. Een patroon met bijvoorbeeld vijf dozen normaal, tien dozen overdwars en enkele kleine uitsparingen is toegestaan.

De API retourneert onder andere:

* `optimality_proven`: of het maximum mathematisch is bewezen
* `optimality_status`: `optimal` of `best_found`
* `theoretical_upper_bound`: bovengrens op basis van oppervlak
* `solver_time_ms`: rekentijd van de exacte solver

Een vaste regressietest gebruikt dozen van **280 × 210 mm**. De oude regio-oplossing vond 14 dozen per laag; de exacte Tetris-solver vindt en bewijst **15 dozen per laag**.

## Resultaat

* Dozen per laag
* Aantal lagen
* Totaal dozen per pallet
* Werkelijke pallethoogte
* Dichte 3D-kartonnen dozen
* Bovenaanzicht van de Tetris-laag
* Verdeling normaal en overdwars
* Hoogteadvies voor een extra laag

## Techniek

* Python 3.10+
* FastAPI
* Google OR-Tools CP-SAT
* Vanilla JavaScript en Canvas 2D
* Tkinter-launcher zonder extra desktopdependencies
* Pytest en GitHub Actions

## Ontwikkelaarsstart

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Op Linux/macOS gebruik je `.venv/bin/python`.

## API

Swagger-documentatie:

```text
http://127.0.0.1:8000/docs
```

Voorbeeldrequest:

```json
{
  "pallet_id": "euro",
  "box_length_mm": 280,
  "box_width_mm": 210,
  "box_height_mm": 250,
  "max_total_height_mm": 1800
}
```

## Klaar voor latere uitbreiding

De code is opgesplitst in een palletcatalogus, snelle layoutoptimizer, exacte packing solver, capaciteitsberekening en adviesmotor. Daardoor kunnen later onder andere deze onderdelen worden toegevoegd:

* jaarvolume en kosten per pallet
* besparing per millimeter kleinere doos
* optimalisatie van lengte en breedte
* CO2-besparing
* gewichtslimieten
* Excel-upload met meerdere artikelen
* extra pallettypen
* PDF-rapporten
* accounts en opgeslagen berekeningen
