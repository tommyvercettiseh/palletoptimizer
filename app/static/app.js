const form = document.getElementById("calculatorForm");
const submitButton = form.querySelector("button[type='submit']");
const numberFormat = new Intl.NumberFormat("nl-NL");
const decimalFormat = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
let latestResult = null;

function fieldNumber(id) {
    const value = Number(document.getElementById(id).value);
    if (!Number.isFinite(value) || value <= 0) throw new Error("Vul geldige afmetingen groter dan 0 in.");
    return value;
}

function payloadFromForm() {
    return {
        pallet_id: document.getElementById("pallet_id").value,
        box_length_mm: fieldNumber("box_length_mm"),
        box_width_mm: fieldNumber("box_width_mm"),
        box_height_mm: fieldNumber("box_height_mm"),
        max_total_height_mm: fieldNumber("max_total_height_mm"),
        proposed_height_reduction_mm: 10,
        max_height_reduction_mm: 50,
    };
}

function setText(id, value) { document.getElementById(id).textContent = value; }

function layoutText(data) {
    const normal = data.orientation_counts.lengthwise;
    const rotated = data.orientation_counts.crosswise;
    if (normal && rotated) return `${normal} normaal en ${rotated} overdwars · vrije Tetris-indeling`;
    if (rotated) return `${rotated} dozen overdwars per laag`;
    return `${normal} dozen in lengterichting per laag`;
}

async function calculate() {
    const error = document.getElementById("formError");
    error.hidden = true;
    submitButton.disabled = true;
    submitButton.lastChild.textContent = " Tetris-layout zoeken…";
    try {
        const response = await fetch("/api/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadFromForm()),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Berekening mislukt.");
        latestResult = data;
        updateResult(data);
    } catch (exc) {
        error.textContent = exc.message || "Er ging iets mis.";
        error.hidden = false;
    } finally {
        submitButton.disabled = false;
        submitButton.lastChild.textContent = " Bereken optimale layout";
    }
}

function updateResult(data) {
    setText("boxesPerLayer", numberFormat.format(data.boxes_per_layer));
    setText("layers", numberFormat.format(data.layers));
    setText("boxesPerPallet", numberFormat.format(data.boxes_per_pallet));
    setText("loadHeight", `${numberFormat.format(data.load_height_mm)} mm`);
    setText("resultSubtitle", `${data.pallet.name} · ${data.pallet.length_mm} × ${data.pallet.width_mm} × ${data.pallet.height_mm} mm`);
    setText("layoutDescription", layoutText(data));
    setText("utilizationBadge", `${decimalFormat.format(data.footprint_utilization_pct)}% benut · ${data.optimality_proven ? "optimaal" : "beste gevonden"}`);
    setText("lengthwiseCount", numberFormat.format(data.orientation_counts.lengthwise));
    setText("crosswiseCount", numberFormat.format(data.orientation_counts.crosswise));
    updateAdvice(data);
    drawPallet(data);
    drawLayer(data);
}

function updateAdvice(data) {
    const section = document.getElementById("adviceSection");
    const advice = data.advice.minimum_reduction_for_gain;
    if (!advice) {
        section.hidden = true;
        return;
    }
    section.hidden = false;
    const extraLayers = advice.new_layers - data.layers;
    setText("adviceTitle", `${advice.reduction_mm} mm lager geeft ${extraLayers} extra ${extraLayers === 1 ? "laag" : "lagen"}`);
    setText("adviceText", `Verlaag de dooshoogte van ${data.input.box_height_mm} naar ${advice.new_box_height_mm} mm. De palletcapaciteit stijgt van ${data.boxes_per_pallet} naar ${advice.new_boxes_per_pallet} dozen.`);
    setText("adviceGain", `+${advice.capacity_gain_boxes} dozen`);
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

function polygon(ctx, points, fill, stroke = "rgba(84,55,29,.45)", lineWidth = .7) {
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

function drawPallet(data) {
    const canvas = document.getElementById("palletCanvas");
    const { ctx, width, height } = prepareCanvas(canvas, widthIsMobile() ? 390 : 470);
    const pallet = data.pallet;
    const loadHeight = Math.max(data.load_height_mm, pallet.height_mm + data.input.box_height_mm);
    const isoX = Math.min(width / (pallet.length_mm + pallet.width_mm) * .78, .45);
    const isoY = isoX * .46;
    const zScale = Math.min((height * .64) / loadHeight, .34);
    const origin = { x: width * .5, y: height * .84 };

    function project(x, y, z) {
        return { x: origin.x + (x - y) * isoX, y: origin.y - (x + y) * isoY - z * zScale };
    }

    function cuboid(x, y, z, length, depth, boxHeight, colors, carton = false) {
        const a = project(x, y, z), b = project(x + length, y, z), c = project(x + length, y + depth, z), d = project(x, y + depth, z);
        const at = project(x, y, z + boxHeight), bt = project(x + length, y, z + boxHeight), ct = project(x + length, y + depth, z + boxHeight), dt = project(x, y + depth, z + boxHeight);
        polygon(ctx, [a, d, dt, at], colors.left);
        polygon(ctx, [a, b, bt, at], colors.right);
        polygon(ctx, [at, bt, ct, dt], colors.top);

        if (carton && length * isoX > 14 && depth * isoX > 10) {
            const topMidA = project(x + length * .5, y, z + boxHeight + .1);
            const topMidB = project(x + length * .5, y + depth, z + boxHeight + .1);
            ctx.strokeStyle = "rgba(104,66,30,.55)";
            ctx.lineWidth = Math.max(.7, Math.min(1.4, length * isoX / 80));
            ctx.beginPath(); ctx.moveTo(topMidA.x, topMidA.y); ctx.lineTo(topMidB.x, topMidB.y); ctx.stroke();

            const tapeA = project(x + length * .45, y, z + boxHeight + .2);
            const tapeB = project(x + length * .55, y, z + boxHeight + .2);
            const tapeC = project(x + length * .55, y + depth, z + boxHeight + .2);
            const tapeD = project(x + length * .45, y + depth, z + boxHeight + .2);
            polygon(ctx, [tapeA, tapeB, tapeC, tapeD], "rgba(194,142,78,.5)", "rgba(150,97,43,.22)", .35);
        }
    }

    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,.16)";
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

    const markerX = width - (widthIsMobile() ? 34 : 58);
    const topPoint = project(pallet.length_mm, 0, data.load_height_mm);
    const bottomPoint = project(pallet.length_mm, 0, 0);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(markerX, topPoint.y); ctx.lineTo(markerX, bottomPoint.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(markerX - 5, topPoint.y); ctx.lineTo(markerX + 5, topPoint.y); ctx.moveTo(markerX - 5, bottomPoint.y); ctx.lineTo(markerX + 5, bottomPoint.y); ctx.stroke();
    ctx.fillStyle = "#334155";
    ctx.font = "700 11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${numberFormat.format(data.load_height_mm)} mm`, markerX - 8, Math.max(topPoint.y - 8, 16));
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
    ctx.font = "700 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${pallet.length_mm} mm`, width / 2, y0 - 10);
    ctx.save();
    ctx.translate(x0 - 13, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${pallet.width_mm} mm`, 0, 0);
    ctx.restore();
}

function widthIsMobile() { return window.matchMedia("(max-width: 720px)").matches; }

form.addEventListener("submit", (event) => { event.preventDefault(); calculate(); });
window.addEventListener("resize", () => { if (latestResult) { drawPallet(latestResult); drawLayer(latestResult); } });
document.querySelector(".layer-details").addEventListener("toggle", () => { if (latestResult) drawLayer(latestResult); });
calculate();
