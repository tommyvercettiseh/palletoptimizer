# Changelog

## 0.8.0

- Replaced the Basic and Advanced dashboard with one compact English workspace.
- Desktop keeps input on the left and all results on the right without page scrolling on a normal screen.
- Input is limited to pallet type, box dimensions, height mode, maximum height and case quantity.
- Results use six compact cards: boxes per layer, layers, boxes per pallet, case quantity, pallet quantity and total height.
- Pallet visualization is smaller and no longer uses long height bars.
- Pallet height, load height and total height are shown in one compact footer.
- Removed company branding, void-space controls, contract analysis and PNG export from the interface.
- Responsive mobile layout remains stacked and readable.

## 0.7.0

- Optionele hoogteweergave inclusief of exclusief pallet in Basic en Advanced.
- Maximale hoogte, totale hoogte, ladinghoogte en pallethoogte worden apart weergegeven.
- Optionele toggle voor void space en een transparante mogelijke extra laag.
- Advanced bevat een void-spaceanalyse met maximale hoogte, huidige hoogte, vrije ruimte en benodigde reductie per doos.
- Bedrijfsnamen op dooszijden blijven altijd rechtop leesbaar.
- KPI-kaarten uitgebreid met vectorachtige raster-, lagen-, pallet- en hoogte-iconen.
- Mobiele invoervelden voor lengte, breedte en hoogte tonen volledige waarden zoals 400, 300 en 250.
- Automatische tests uitgebreid voor de nieuwe assets en bediening.

## 0.6.0

- Nieuwe Basic- en Advanced-modus met één duidelijke schakelaar.
- Basic toont pallettype, doosmaat, maximale hoogte, case quantity en de vijf kernresultaten.
- Vrij invulbare bedrijfsnaam wordt gecentreerd op de lange zichtbare zijde van iedere 3D-doos.
- Volledige pallet wordt automatisch passend geschaald zodat de pallet en hoogte-indicatie zichtbaar blijven.
- Advanced toont oppervlakbenutting, volumebenutting, palletgewicht, vrije hoogte en contractscenario's.
- Contractvolume in artikelen wordt via case quantity omgerekend naar dozen en benodigde pallets.
- Begrijpelijk hoogteadvies: verlaag elke doos met X mm om een extra laag toe te voegen.
- Downloadbare PNG-datasheet met palletafbeelding, case quantity, layer quantity, pallet quantity en logistieke besparing.
- Backend uitgebreid met gebruikte oppervlakte, gebruikt volume en beschikbare palletvolume.
- Applicatie- en healthcheckversie worden voortaan direct uit het VERSION-bestand gelezen.
- Automatische tests uitgebreid voor de nieuwe interface, volumeformule, exportfunctie en versiecontrole.
- Handmatige controle nodig voor de leesbaarheid van lange bedrijfsnamen op zeer kleine dozen.

## 0.5.0

- Desktopwerkruimte met doosinvoer links en het volledige resultaat rechts.
- Tablet en mobiel blijven overzichtelijk onder elkaar staan.
- Compactere desktopweergave voor lagere beeldschermen.
- Nieuwe realistische responsive preview met herkenbare isometrische kartonnen dozen.
- Turbo Repo Hub-manifest bijgewerkt naar de nieuwe preview en versie.
- Automatische webinterfacetest uitgebreid voor de responsive werkruimte.
- Handmatige controle nodig op een breed desktopscherm en een mobiele browser.

## 0.4.0

- Exacte 2D Tetris-optimalisatie met Google OR-Tools CP-SAT.
- Iedere doos kan afzonderlijk 90 graden draaien.
- Ondersteuning voor gemengde patronen en kleine uitsparingen.
- 3D-weergave met dichte kartonnen dozen.
- Bovenaanzicht van de berekende laagindeling.
- Hoogteadvies voor een mogelijke extra laag.
- Windows-launcher met automatische installatie en browserstart.
- Elf automatische regressie- en API-tests.
