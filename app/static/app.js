const form = document.getElementById("calculatorForm");
const submitButton = form.querySelector("button[type='submit']");
const resultCard = document.getElementById("resultCard");
const basicButton = document.getElementById("modeBasic");
const advancedButton = document.getElementById("modeAdvanced");
const downloadButton = document.getElementById("downloadSnapshot");
const numberFormat = new Intl.NumberFormat("nl-NL");
const decimalFormat = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
const moneyFormat = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
let latestResult = null;
let latestContext = null;

function requiredNumber(id) {
    const value = Number(document.getElementById(id).value);
    if (!Number.isFinite(value) || value <= 0) throw new Error("Vul geldige waarden groter dan 0 in.");
    return value;
}

function optionalNumber(id, fallback = 0) {
    const value = Number(document.getElementById(id).value);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function companyName() {
    return document.getElementById("company_name").value.trim().slice(0, 32);
}

function formContext() {
    const caseQuantity = requiredNumber("case_quantity");
    const contractUnits = Math.floor(optionalNumber("contract_volume_units", 0));
    return {
        caseQuantity,
        contractUnits,
        contractBoxes: contractUnits > 0 ? Math.ceil(contractUnits / caseQuantity) : 0,
        company: companyName(),
    };
}

function payloadFromForm(context) {
    return {
        pallet_id: document.getElementById("pallet_id").value,
        box_length_mm: requiredNumber("box_length_mm"),
        box_width_mm: requiredNumber("box_width_mm"),
        box_height_mm: requiredNumber("box_height_mm"),
        max_total_height_mm: requiredNumber("max_total_height_mm"),
        box_weight_kg: optionalNumber("box_weight_kg", 0),
        max_load_kg: Math.max(optionalNumber("max_load_kg", 1000), 1),
        annual_box_volume: context.contractBoxes,
        cost_per_pallet_eur: optionalNumber("cost_per_pallet_eur", 0),
        proposed_height_reduction_mm: 10,
        max_height_reduction_mm: 50,
    };
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function layoutText(data) {
    const normal = data.orientation_counts.lengthwise;
    const rotated = data.orientation_counts.crosswise;
    if (normal && rotated) return `${normal} normaal en ${rotated} overdwars · vrije Tetris-indeling`;
    if (rotated) return `${rotated} dozen overdwars per laag`;
    return `${normal} dozen in lengterichting per laag`;
}

function setMode(mode) {
    const advanced = mode === "advanced";
    document.body.classList.toggle("mode-basic", !advanced);
    document.body.classList.toggle("mode-advanced", advanced);
    basicButton.classList.toggle("active", !advanced);
    advancedButton.classList.toggle("active", advanced);
    basicButton.setAttribute("aria-selected", String(!advanced));
    advancedButton.setAttribute("aria-selected", String(advanced));
    window.requestAnimationFrame(() => {
        if (latestResult) {
            drawPallet(latestResult);
            drawLayer(latestResult);
        }
    });
}

async function calculate({ scrollToResult = true } = {}) {
    const error = document.getElementById("formError");
    error.hidden = true;
    submitButton.disabled = true;
    submitButton.lastChild.textContent = " Layout zoeken…";
    try {
        const context = formContext();
        const response = await fetch("/api/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadFromForm(context)),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Berekening mislukt.");
        latestResult = data;
        latestContext = context;
        updateResult(data, context);
        if (scrollToResult && widthIsMobile()) resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (exc) {
        error.textContent = exc.message || "Er ging iets mis.";
        error.hidden = false;
    } finally {
        submitButton.disabled = false;
        submitButton.lastChild.textContent = " Bereken pallet";
    }
}

function updateResult(data, context) {
    const palletQuantity = data.boxes_per_pallet * context.caseQuantity;
    const usedArea = data.used_area_mm2 ?? Math.round(data.pallet.length_mm * data.pallet.width_mm * data.footprint_utilization_pct / 100);
    const palletArea = data.pallet_area_mm2 ?? data.pallet.length_mm * data.pallet.width_mm;
    const usedVolume = data.used_volume_mm3 ?? data.boxes_per_pallet * data.input.box_length_mm * data.input.box_width_mm * data.input.box_height_mm;
    const availableVolume = data.available_volume_mm3 ?? palletArea * Math.max(data.input.max_total_height_mm - data.pallet.height_mm, 0);
    const volumePct = data.volume_utilization_pct ?? (availableVolume > 0 ? usedVolume / availableVolume * 100 : 0);

    setText("boxesPerLayer", numberFormat.format(data.boxes_per_layer));
    setText("layers", numberFormat.format(data.layers));
    setText("boxesPerPallet", numberFormat.format(data.boxes_per_pallet));
    setText("palletQuantity", numberFormat.format(palletQuantity));
    setText("loadHeight", `${numberFormat.format(data.load_height_mm)} mm`);
    setText("resultSubtitle", `${data.pallet.name} · ${data.pallet.length_mm} × ${data.pallet.width_mm} × ${data.pallet.height_mm} mm`);
    setText("layoutDescription", layoutText(data));
    setText("layerBadge", `${numberFormat.format(data.layers)} ${data.layers === 1 ? "laag" : "lagen"}`);
    setText("utilizationBadge", `${decimalFormat.format(data.footprint_utilization_pct)}% oppervlak benut`);
    setText("companyCaption", context.company ? `Bedrukking: ${context.company}` : "Geen bedrijfsnaam op de dozen");
    setText("lengthwiseCount", numberFormat.format(data.orientation_counts.lengthwise));
    setText("crosswiseCount", numberFormat.format(data.orientation_counts.crosswise));

    setText("surfaceUsed", `${decimalFormat.format(data.footprint_utilization_pct)}%`);
    setText("surfaceUsedDetail", `${numberFormat.format(usedArea)} / ${numberFormat.format(palletArea)} mm²`);
    setText("volumeUsed", `${decimalFormat.format(volumePct)}%`);
    setText("volumeUsedDetail", `${decimalFormat.format(usedVolume / 1_000_000_000)} / ${decimalFormat.format(availableVolume / 1_000_000_000)} m³`);
    setText("payloadWeight", `${decimalFormat.format(data.payload_weight_kg)} kg`);
    setText("payloadWeightDetail", `van ${numberFormat.format(data.input.max_load_kg)} kg maximaal`);
    setText("remainingHeight", `${numberFormat.format(data.remaining_height_mm)} mm`);

    updateAdviceAndSavings(data, context);
    drawPallet(data);
    drawLayer(data);
}

function updateAdviceAndSavings(data, context) {
    const advice = data.advice.minimum_reduction_for_gain;
    const currentUnitsPerPallet = data.boxes_per_pallet * context.caseQuantity;
    setText("contractSummary", context.contractUnits > 0
        ? `Contractvolume: ${numberFormat.format(context.contractUnits)} artikelen · ${numberFormat.format(context.contractBoxes)} dozen`
        : "Vul een contractvolume in om de logistieke besparing te berekenen.");
    setText("currentCapacity", `${numberFormat.format(currentUnitsPerPallet)} artikelen/pallet`);
    setText("currentPallets", context.contractUnits > 0 ? numberFormat.format(data.annual_pallets) : "–");

    if (!advice) {
        setText("adviceTitle", "Met maximaal 50 mm verlaging is geen extra laag mogelijk.");
        setText("adviceText", "De huidige dooshoogte benut de beschikbare pallethoogte al zo efficiënt mogelijk binnen deze grens.");
        setText("adviceLayers", numberFormat.format(data.layers));
        setText("advicePalletQuantity", numberFormat.format(currentUnitsPerPallet));
        setText("adviceGain", "0,0%");
        setText("optimizedCapacity", `${numberFormat.format(currentUnitsPerPallet)} artikelen/pallet`);
        setText("optimizedPallets", context.contractUnits > 0 ? numberFormat.format(data.annual_pallets) : "–");
        setText("palletsSaved", "0");
        setText("savingPct", "0,0%");
        setText("savingCost", "Geen logistieke besparing uit een extra laag gevonden.");
        return;
    }

    const extraLayers = advice.new_layers - data.layers;
    const extraLayerText = extraLayers === 1 ? "één extra laag" : `${extraLayers} extra lagen`;
    const optimizedUnitsPerPallet = advice.new_boxes_per_pallet * context.caseQuantity;
    const palletsSaved = context.contractUnits > 0 ? advice.pallets_saved_per_year : 0;
    const savingPct = data.annual_pallets > 0 ? palletsSaved / data.annual_pallets * 100 : 0;

    setText("adviceTitle", `Verlaag elke doos met ${numberFormat.format(advice.reduction_mm)} mm om ${extraLayerText} toe te voegen.`);
    setText("adviceText", `Nieuwe dooshoogte: ${numberFormat.format(advice.new_box_height_mm)} mm. De palletcapaciteit stijgt van ${numberFormat.format(data.boxes_per_pallet)} naar ${numberFormat.format(advice.new_boxes_per_pallet)} dozen.`);
    setText("adviceLayers", numberFormat.format(advice.new_layers));
    setText("advicePalletQuantity", numberFormat.format(optimizedUnitsPerPallet));
    setText("adviceGain", `+${decimalFormat.format(advice.capacity_gain_pct)}%`);
    setText("optimizedCapacity", `${numberFormat.format(optimizedUnitsPerPallet)} artikelen/pallet`);
    setText("optimizedPallets", context.contractUnits > 0 ? numberFormat.format(advice.annual_pallets) : "–");
    setText("palletsSaved", context.contractUnits > 0 ? numberFormat.format(palletsSaved) : "–");
    setText("savingPct", context.contractUnits > 0 ? `${decimalFormat.format(savingPct)}%` : "–");
    setText("savingCost", context.contractUnits > 0 && data.input.cost_per_pallet_eur > 0
        ? `Indicatieve logistieke besparing: ${moneyFormat.format(advice.annual_savings_eur)}`
        : "Vul logistieke kosten per pallet in voor een kostenindicatie.");
}

function prepareCanvas(canvas, minHeight) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 300);
    const height = Math.max(rect.height, minHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
}

function polygon(ctx, points, fill, stroke = "rgba(84,55,29,.48)", lineWidth = .75) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function pointDistance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function drawFaceLabel(ctx, face, edgeStart, edgeEnd, label) {
    if (!label) return;
    const faceWidth = pointDistance(edgeStart, edgeEnd);
    const faceHeight = pointDistance(face[0], face[3]);
    let fontSize = Math.min(10, faceHeight * .27, faceWidth / Math.max(label.length * .58, 1));
    if (fontSize < 4.8 || faceWidth < 24 || faceHeight < 13) return;
    fontSize = Math.max(fontSize, 4.8);
    const center = face.reduce((acc, point) => ({ x: acc.x + point.x / face.length, y: acc.y + point.y / face.length }), { x: 0, y: 0 });
    const angle = Math.atan2(edgeEnd.y - edgeStart.y, edgeEnd.x - edgeStart.x);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(75,45,20,.86)";
    ctx.fillText(label, 0, 0, faceWidth * .78);
    ctx.restore();
}

function drawPallet(data) {
    const canvas = document.getElementById("palletCanvas");
    const { ctx, width, height } = prepareCanvas(canvas, widthIsMobile() ? 410 : 490);
    const pallet = data.pallet;
    const loadHeight = Math.max(data.load_height_mm, pallet.height_mm + data.input.box_height_mm);
    const company = latestContext?.company || "";
    const markerReserve = widthIsMobile() ? 24 : 72;
    const paddingX = widthIsMobile() ? 20 : 36;
    const paddingY = widthIsMobile() ? 24 : 34;

    function rawProject(x, y, z) {
        return { x: x - y, y: -(x + y) * .34 - z * .62 };
    }

    const boundsPoints = [];
    [0, pallet.length_mm].forEach((x) => {
        [0, pallet.width_mm].forEach((y) => {
            [0, loadHeight].forEach((z) => boundsPoints.push(rawProject(x, y, z)));
        });
    });
    const minX = Math.min(...boundsPoints.map((point) => point.x));
    const maxX = Math.max(...boundsPoints.map((point) => point.x));
    const minY = Math.min(...boundsPoints.map((point) => point.y));
    const maxY = Math.max(...boundsPoints.map((point) => point.y));
    const rawWidth = Math.max(maxX - minX, 1);
    const rawHeight = Math.max(maxY - minY, 1);
    const availableWidth = Math.max(width - paddingX * 2 - markerReserve, 220);
    const availableHeight = Math.max(height - paddingY * 2, 260);
    const scale = Math.min(availableWidth / rawWidth, availableHeight / rawHeight);
    const origin = {
        x: paddingX + (availableWidth - rawWidth * scale) / 2 - minX * scale,
        y: paddingY + (availableHeight - rawHeight * scale) / 2 - minY * scale,
    };

    function project(x, y, z) {
        const raw = rawProject(x, y, z);
        return { x: origin.x + raw.x * scale, y: origin.y + raw.y * scale };
    }

    function cuboid(x, y, z, length, depth, boxHeight, colors, carton = false) {
        const a = project(x, y, z);
        const b = project(x + length, y, z);
        const c = project(x + length, y + depth, z);
        const d = project(x, y + depth, z);
        const at = project(x, y, z + boxHeight);
        const bt = project(x + length, y, z + boxHeight);
        const ct = project(x + length, y + depth, z + boxHeight);
        const dt = project(x, y + depth, z + boxHeight);
        const leftFace = [a, d, dt, at];
        const rightFace = [a, b, bt, at];
        polygon(ctx, leftFace, colors.left);
        polygon(ctx, rightFace, colors.right);
        polygon(ctx, [at, bt, ct, dt], colors.top);

        if (carton) {
            const topMidA = project(x + length * .5, y, z + boxHeight + .1);
            const topMidB = project(x + length * .5, y + depth, z + boxHeight + .1);
            ctx.strokeStyle = "rgba(104,66,30,.55)";
            ctx.lineWidth = Math.max(.6, Math.min(1.25, pointDistance(at, bt) / 80));
            ctx.beginPath();
            ctx.moveTo(topMidA.x, topMidA.y);
            ctx.lineTo(topMidB.x, topMidB.y);
            ctx.stroke();

            const tapeA = project(x + length * .46, y, z + boxHeight + .2);
            const tapeB = project(x + length * .54, y, z + boxHeight + .2);
            const tapeC = project(x + length * .54, y + depth, z + boxHeight + .2);
            const tapeD = project(x + length * .46, y + depth, z + boxHeight + .2);
            polygon(ctx, [tapeA, tapeB, tapeC, tapeD], "rgba(194,142,78,.46)", "rgba(150,97,43,.2)", .3);

            if (length >= depth) drawFaceLabel(ctx, rightFace, a, b, company);
            else drawFaceLabel(ctx, leftFace, a, d, company);
        }
    }

    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,.14)";
    ctx.lineWidth = 1;
    for (let i = -5; i <= 5; i += 1) {
        const a = project(i * 210, -500, 0), b = project(i * 210, 1350, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const c = project(-500, i * 210, 0), d = project(1700, i * 210, 0);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.restore();

    cuboid(0, 0, 0, pallet.length_mm, pallet.width_mm, 42, { top: "#d5a468", left: "#9b6536", right: "#b97d45" });
    const feet = [0, pallet.length_mm * .42, pallet.length_mm - 170];
    feet.forEach((x) => {
        cuboid(x, 20, 42, 170, 125, 82, { top: "#c18a50", left: "#87532b", right: "#a86d38" });
        cuboid(x, pallet.width_mm - 145, 42, 170, 125, 82, { top: "#c18a50", left: "#87532b", right: "#a86d38" });
    });
    cuboid(0, 0, 124, pallet.length_mm, pallet.width_mm, 20, { top: "#dfb277", left: "#a7703e", right: "#bd8650" });

    const sorted = [...data.layout].sort((a, b) => (b.x_mm + b.y_mm) - (a.x_mm + a.y_mm));
    const totalToDraw = data.layers * sorted.length;
    const maxBoxes = 850;
    const layerStep = totalToDraw > maxBoxes ? Math.ceil(totalToDraw / maxBoxes) : 1;

    for (let layer = 0; layer < data.layers; layer += 1) {
        if (layer % layerStep !== 0 && layer !== data.layers - 1) continue;
        const z = pallet.height_mm + layer * data.input.box_height_mm;
        sorted.forEach((box) => {
            cuboid(box.x_mm, box.y_mm, z, box.length_mm, box.width_mm, data.input.box_height_mm, {
                top: box.rotated ? "#d8a15c" : "#e0ad68",
                left: box.rotated ? "#a76831" : "#b47236",
                right: box.rotated ? "#bd7b3e" : "#c88748",
            }, true);
        });
    }

    const markerX = width - (widthIsMobile() ? 15 : 35);
    const topPoint = project(pallet.length_mm, 0, data.load_height_mm);
    const bottomPoint = project(pallet.length_mm, 0, 0);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(markerX, topPoint.y); ctx.lineTo(markerX, bottomPoint.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(markerX - 5, topPoint.y); ctx.lineTo(markerX + 5, topPoint.y);
    ctx.moveTo(markerX - 5, bottomPoint.y); ctx.lineTo(markerX + 5, bottomPoint.y);
    ctx.stroke();
    ctx.fillStyle = "#334155";
    ctx.font = "700 11px Inter, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${numberFormat.format(data.load_height_mm)} mm`, markerX - 7, Math.max(topPoint.y - 8, 15));
}

function drawLayer(data) {
    const canvas = document.getElementById("layerCanvas");
    const { ctx, width, height } = prepareCanvas(canvas, widthIsMobile() ? 250 : 330);
    const pallet = data.pallet;
    const margin = 34;
    const scale = Math.min((width - margin * 2) / pallet.length_mm, (height - margin * 2) / pallet.width_mm);
    const drawWidth = pallet.length_mm * scale;
    const drawHeight = pallet.width_mm * scale;
    const x0 = (width - drawWidth) / 2;
    const y0 = (height - drawHeight) / 2;

    ctx.fillStyle = "#ead0a7";
    ctx.fillRect(x0, y0, drawWidth, drawHeight);
    ctx.strokeStyle = "#8b5e34";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x0, y0, drawWidth, drawHeight);

    data.layout.forEach((box) => {
        const x = x0 + box.x_mm * scale;
        const y = y0 + box.y_mm * scale;
        const w = box.length_mm * scale;
        const h = box.width_mm * scale;
        ctx.fillStyle = box.rotated ? "#d69b54" : "#e1ad68";
        ctx.fillRect(x + .6, y + .6, Math.max(w - 1.2, .5), Math.max(h - 1.2, .5));
        ctx.strokeStyle = "rgba(98,62,28,.65)";
        ctx.lineWidth = .7;
        ctx.strokeRect(x + .6, y + .6, Math.max(w - 1.2, .5), Math.max(h - 1.2, .5));
        if (w > 16 && h > 10) {
            ctx.strokeStyle = "rgba(118,75,33,.42)";
            ctx.beginPath(); ctx.moveTo(x + w / 2, y + 1); ctx.lineTo(x + w / 2, y + h - 1); ctx.stroke();
        }
    });

    ctx.fillStyle = "#475569";
    ctx.font = "700 11px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${pallet.length_mm} mm`, width / 2, y0 - 10);
    ctx.save();
    ctx.translate(x0 - 13, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${pallet.width_mm} mm`, 0, 0);
    ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius, fill, stroke = null) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

function snapshotMetric(ctx, x, y, width, label, value, unit = "") {
    roundedRect(ctx, x, y, width, 105, 15, "#ffffff", "#dbe3ef");
    ctx.fillStyle = "#64748b";
    ctx.font = "700 16px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + width / 2, y + 28);
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 31px Inter, Arial, sans-serif";
    ctx.fillText(value, x + width / 2, y + 68);
    if (unit) {
        ctx.fillStyle = "#64748b";
        ctx.font = "600 13px Inter, Arial, sans-serif";
        ctx.fillText(unit, x + width / 2, y + 91);
    }
}

function downloadSnapshot() {
    if (!latestResult || !latestContext) return;
    const data = latestResult;
    const context = latestContext;
    const advice = data.advice.minimum_reduction_for_gain;
    const canvas = document.createElement("canvas");
    canvas.width = 1800;
    canvas.height = 1100;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f6f8fc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#2563eb";
    ctx.fillRect(0, 0, canvas.width, 92);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 34px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Pallet Insight · Datasheet snapshot", 55, 57);
    ctx.font = "650 16px Inter, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(context.company || "Zonder bedrijfsnaam", 1745, 56);

    const caseQuantity = context.caseQuantity;
    const layerQuantity = data.boxes_per_layer * caseQuantity;
    const palletQuantity = data.boxes_per_pallet * caseQuantity;
    const metricWidth = 270;
    const metricGap = 16;
    const metricLabels = [
        ["Case quantity", numberFormat.format(caseQuantity), "artikelen per doos"],
        ["Layer quantity", numberFormat.format(layerQuantity), "artikelen per laag"],
        ["Pallet quantity", numberFormat.format(palletQuantity), "artikelen per pallet"],
        ["Dozen per pallet", numberFormat.format(data.boxes_per_pallet), "dozen"],
        ["Aantal lagen", numberFormat.format(data.layers), "lagen"],
        ["Pallethoogte", numberFormat.format(data.load_height_mm), "mm inclusief pallet"],
    ];
    metricLabels.forEach((item, index) => snapshotMetric(ctx, 55 + index * (metricWidth + metricGap), 118, metricWidth, item[0], item[1], item[2]));

    roundedRect(ctx, 55, 245, 1050, 785, 20, "#ffffff", "#dbe3ef");
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 22px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Volledige palletweergave", 82, 282);
    ctx.fillStyle = "#64748b";
    ctx.font = "600 14px Inter, Arial, sans-serif";
    ctx.fillText(`${data.pallet.name} · ${data.pallet.length_mm} × ${data.pallet.width_mm} mm · doos ${data.input.box_length_mm} × ${data.input.box_width_mm} × ${data.input.box_height_mm} mm`, 82, 307);
    const source = document.getElementById("palletCanvas");
    ctx.drawImage(source, 0, 0, source.width, source.height, 80, 325, 1000, 655);
    ctx.fillStyle = "#475569";
    ctx.font = "700 14px Inter, Arial, sans-serif";
    ctx.fillText(context.company ? `Bedrukking op iedere doos: ${context.company}` : "Geen bedrukking op de dozen", 82, 1003);

    roundedRect(ctx, 1130, 245, 615, 785, 20, "#ffffff", "#dbe3ef");
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 22px Inter, Arial, sans-serif";
    ctx.fillText("Advanced analyse", 1160, 282);

    const usedArea = data.used_area_mm2 ?? data.pallet.length_mm * data.pallet.width_mm * data.footprint_utilization_pct / 100;
    const palletArea = data.pallet_area_mm2 ?? data.pallet.length_mm * data.pallet.width_mm;
    const usedVolume = data.used_volume_mm3 ?? data.boxes_per_pallet * data.input.box_length_mm * data.input.box_width_mm * data.input.box_height_mm;
    const availableVolume = data.available_volume_mm3 ?? palletArea * (data.input.max_total_height_mm - data.pallet.height_mm);
    const volumePct = data.volume_utilization_pct ?? usedVolume / availableVolume * 100;

    snapshotMetric(ctx, 1160, 310, 265, "Surface used", `${decimalFormat.format(data.footprint_utilization_pct)}%`, `${numberFormat.format(usedArea)} / ${numberFormat.format(palletArea)} mm²`);
    snapshotMetric(ctx, 1445, 310, 265, "Volume used", `${decimalFormat.format(volumePct)}%`, `${decimalFormat.format(usedVolume / 1e9)} / ${decimalFormat.format(availableVolume / 1e9)} m³`);

    roundedRect(ctx, 1160, 435, 550, 205, 15, "#f8fafc", "#dbe3ef");
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 18px Inter, Arial, sans-serif";
    ctx.fillText("Contractscenario", 1185, 470);
    ctx.fillStyle = "#64748b";
    ctx.font = "600 14px Inter, Arial, sans-serif";
    ctx.fillText(`${numberFormat.format(context.contractUnits)} artikelen · ${numberFormat.format(context.contractBoxes)} dozen`, 1185, 498);
    ctx.fillStyle = "#1d4ed8";
    ctx.font = "800 32px Inter, Arial, sans-serif";
    ctx.fillText(context.contractUnits > 0 ? numberFormat.format(data.annual_pallets) : "–", 1185, 548);
    ctx.fillStyle = "#64748b";
    ctx.font = "700 13px Inter, Arial, sans-serif";
    ctx.fillText("huidige pallets", 1185, 572);
    ctx.fillStyle = "#15803d";
    ctx.font = "800 32px Inter, Arial, sans-serif";
    ctx.fillText(advice && context.contractUnits > 0 ? numberFormat.format(advice.annual_pallets) : "–", 1455, 548);
    ctx.fillStyle = "#64748b";
    ctx.font = "700 13px Inter, Arial, sans-serif";
    ctx.fillText("pallets na optimalisatie", 1455, 572);
    if (advice && context.contractUnits > 0) {
        const pct = data.annual_pallets > 0 ? advice.pallets_saved_per_year / data.annual_pallets * 100 : 0;
        ctx.fillStyle = "#166534";
        ctx.font = "800 17px Inter, Arial, sans-serif";
        ctx.fillText(`${numberFormat.format(advice.pallets_saved_per_year)} pallets minder · ${decimalFormat.format(pct)}% besparing`, 1185, 614);
    }

    roundedRect(ctx, 1160, 665, 550, 270, 15, "#eff6ff", "#bfdbfe");
    ctx.fillStyle = "#1d4ed8";
    ctx.font = "800 18px Inter, Arial, sans-serif";
    ctx.fillText("Optimalisatieadvies", 1185, 702);
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 20px Inter, Arial, sans-serif";
    if (advice) {
        const extraLayers = advice.new_layers - data.layers;
        const phrase = extraLayers === 1 ? "één extra laag" : `${extraLayers} extra lagen`;
        ctx.fillText(`Verlaag elke doos met ${advice.reduction_mm} mm`, 1185, 744);
        ctx.fillText(`om ${phrase} toe te voegen.`, 1185, 773);
        ctx.fillStyle = "#475569";
        ctx.font = "700 15px Inter, Arial, sans-serif";
        ctx.fillText(`Nieuwe dooshoogte: ${advice.new_box_height_mm} mm`, 1185, 817);
        ctx.fillText(`Dozen per pallet: ${data.boxes_per_pallet} → ${advice.new_boxes_per_pallet}`, 1185, 847);
        ctx.fillText(`Pallet quantity: ${numberFormat.format(palletQuantity)} → ${numberFormat.format(advice.new_boxes_per_pallet * caseQuantity)}`, 1185, 877);
        ctx.fillStyle = "#15803d";
        ctx.font = "800 22px Inter, Arial, sans-serif";
        ctx.fillText(`+${decimalFormat.format(advice.capacity_gain_pct)}% capaciteit`, 1185, 913);
    } else {
        ctx.fillText("Geen extra laag gevonden binnen 50 mm verlaging.", 1185, 750);
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "600 12px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Gegenereerd met Pallet Insight · controleer praktische stabiliteit en transportspecificaties", 900, 1070);

    const filenameBase = (context.company || "pallet").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pallet";
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${filenameBase}-pallet-datasheet.png`;
        link.click();
        URL.revokeObjectURL(url);
    }, "image/png");
}

function widthIsMobile() {
    return window.matchMedia("(max-width: 760px)").matches;
}

basicButton.addEventListener("click", () => setMode("basic"));
advancedButton.addEventListener("click", () => setMode("advanced"));
form.addEventListener("submit", (event) => {
    event.preventDefault();
    calculate({ scrollToResult: true });
});
downloadButton.addEventListener("click", downloadSnapshot);
document.getElementById("company_name").addEventListener("input", () => {
    if (!latestResult || !latestContext) return;
    latestContext.company = companyName();
    setText("companyCaption", latestContext.company ? `Bedrukking: ${latestContext.company}` : "Geen bedrijfsnaam op de dozen");
    drawPallet(latestResult);
});
window.addEventListener("resize", () => {
    if (latestResult) {
        drawPallet(latestResult);
        drawLayer(latestResult);
    }
});
document.querySelector(".layer-details").addEventListener("toggle", () => {
    if (latestResult) drawLayer(latestResult);
});

calculate({ scrollToResult: false });
