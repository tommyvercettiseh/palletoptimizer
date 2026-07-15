const form = document.getElementById("calculatorForm");
const submitButton = form.querySelector("button[type='submit']");
const resultCard = document.getElementById("resultCard");
const numberFormat = new Intl.NumberFormat("en-US");
let latestResult = null;
let heightMode = "inclusive";

function requiredNumber(id) {
    const value = Number(document.getElementById(id).value);
    if (!Number.isFinite(value) || value <= 0) throw new Error("Enter valid values greater than 0.");
    return value;
}

function palletHeightFromSelect() {
    const text = document.getElementById("pallet_id").selectedOptions[0]?.textContent || "";
    const match = text.match(/×\s*(\d+)\s*mm\)/);
    return match ? Number(match[1]) : 144;
}

function payloadFromForm() {
    const palletHeight = palletHeightFromSelect();
    const enteredHeight = requiredNumber("max_total_height_mm");
    return {
        pallet_id: document.getElementById("pallet_id").value,
        box_length_mm: requiredNumber("box_length_mm"),
        box_width_mm: requiredNumber("box_width_mm"),
        box_height_mm: requiredNumber("box_height_mm"),
        max_total_height_mm: heightMode === "inclusive" ? enteredHeight : enteredHeight + palletHeight,
        proposed_height_reduction_mm: 10,
        max_height_reduction_mm: 50,
    };
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function setHeightMode(mode) {
    if (mode === heightMode) return;
    const input = document.getElementById("max_total_height_mm");
    const palletHeight = palletHeightFromSelect();
    const value = Number(input.value) || 0;
    input.value = mode === "exclusive" ? Math.max(value - palletHeight, 1) : value + palletHeight;
    heightMode = mode;
    document.querySelectorAll("[data-height-mode]").forEach((button) => {
        button.classList.toggle("active", button.dataset.heightMode === mode);
    });
    document.getElementById("heightLabel").innerHTML = mode === "inclusive"
        ? "Maximum pallet height <b>(including pallet)</b>"
        : "Maximum load height <b>(excluding pallet)</b>";
}

async function calculate({ scrollToResult = true } = {}) {
    const error = document.getElementById("formError");
    error.hidden = true;
    submitButton.disabled = true;
    submitButton.lastChild.textContent = " Calculating…";
    try {
        const response = await fetch("/api/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadFromForm()),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Calculation failed.");
        latestResult = data;
        updateResult(data);
        if (scrollToResult && window.matchMedia("(max-width: 979px)").matches) {
            resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    } catch (errorValue) {
        error.textContent = errorValue.message || "Something went wrong.";
        error.hidden = false;
    } finally {
        submitButton.disabled = false;
        submitButton.lastChild.textContent = " Calculate pallet";
    }
}

function updateResult(data) {
    const caseQuantity = requiredNumber("case_quantity");
    const palletQuantity = data.boxes_per_pallet * caseQuantity;
    const loadHeight = Math.max(data.load_height_mm - data.pallet.height_mm, 0);

    setText("boxesPerLayer", numberFormat.format(data.boxes_per_layer));
    setText("layers", numberFormat.format(data.layers));
    setText("boxesPerPallet", numberFormat.format(data.boxes_per_pallet));
    setText("caseQuantityResult", numberFormat.format(caseQuantity));
    setText("palletQuantity", numberFormat.format(palletQuantity));
    setText("totalHeight", `${numberFormat.format(data.load_height_mm)} mm`);
    setText("palletHeight", `${numberFormat.format(data.pallet.height_mm)} mm`);
    setText("loadHeight", `${numberFormat.format(loadHeight)} mm`);
    setText("heightSummaryTotal", `${numberFormat.format(data.load_height_mm)} mm`);
    setText("resultSubtitle", `${data.pallet.name} · ${data.pallet.length_mm} × ${data.pallet.width_mm} × ${data.pallet.height_mm} mm`);
    drawPallet(data);
}

function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 300);
    const height = Math.max(rect.height, 260);
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
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function drawPallet(data) {
    const canvas = document.getElementById("palletCanvas");
    const { ctx, width, height } = prepareCanvas(canvas);
    const pallet = data.pallet;
    const totalHeight = Math.max(data.load_height_mm, pallet.height_mm + data.input.box_height_mm);
    const paddingX = width < 700 ? 24 : 44;
    const paddingY = 18;

    function rawProject(x, y, z) {
        return { x: x - y, y: -(x + y) * .34 - z * .62 };
    }

    const bounds = [];
    [0, pallet.length_mm].forEach((x) => {
        [0, pallet.width_mm].forEach((y) => {
            [0, totalHeight].forEach((z) => bounds.push(rawProject(x, y, z)));
        });
    });
    const minX = Math.min(...bounds.map((point) => point.x));
    const maxX = Math.max(...bounds.map((point) => point.x));
    const minY = Math.min(...bounds.map((point) => point.y));
    const maxY = Math.max(...bounds.map((point) => point.y));
    const rawWidth = Math.max(maxX - minX, 1);
    const rawHeight = Math.max(maxY - minY, 1);
    const scale = Math.min((width - paddingX * 2) / rawWidth, (height - paddingY * 2) / rawHeight);
    const origin = {
        x: paddingX + (width - paddingX * 2 - rawWidth * scale) / 2 - minX * scale,
        y: paddingY + (height - paddingY * 2 - rawHeight * scale) / 2 - minY * scale,
    };

    function project(x, y, z) {
        const raw = rawProject(x, y, z);
        return { x: origin.x + raw.x * scale, y: origin.y + raw.y * scale };
    }

    function cuboid(x, y, z, length, depth, boxHeight, colors, carton = false) {
        const a = project(x, y, z);
        const b = project(x + length, y, z);
        const d = project(x, y + depth, z);
        const at = project(x, y, z + boxHeight);
        const bt = project(x + length, y, z + boxHeight);
        const ct = project(x + length, y + depth, z + boxHeight);
        const dt = project(x, y + depth, z + boxHeight);
        polygon(ctx, [a, d, dt, at], colors.left);
        polygon(ctx, [a, b, bt, at], colors.right);
        polygon(ctx, [at, bt, ct, dt], colors.top);
        if (carton) {
            const tapeA = project(x + length * .47, y, z + boxHeight + .2);
            const tapeB = project(x + length * .53, y, z + boxHeight + .2);
            const tapeC = project(x + length * .53, y + depth, z + boxHeight + .2);
            const tapeD = project(x + length * .47, y + depth, z + boxHeight + .2);
            polygon(ctx, [tapeA, tapeB, tapeC, tapeD], "rgba(194,142,78,.42)", "rgba(150,97,43,.18)", .3);
        }
    }

    ctx.strokeStyle = "rgba(148,163,184,.12)";
    ctx.lineWidth = 1;
    for (let index = -4; index <= 4; index += 1) {
        const first = project(index * 230, -450, 0);
        const second = project(index * 230, 1300, 0);
        ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(second.x, second.y); ctx.stroke();
        const third = project(-450, index * 230, 0);
        const fourth = project(1650, index * 230, 0);
        ctx.beginPath(); ctx.moveTo(third.x, third.y); ctx.lineTo(fourth.x, fourth.y); ctx.stroke();
    }

    cuboid(0, 0, 0, pallet.length_mm, pallet.width_mm, 42, { top: "#d5a468", left: "#9b6536", right: "#b97d45" });
    [0, pallet.length_mm * .42, pallet.length_mm - 170].forEach((x) => {
        cuboid(x, 20, 42, 170, 125, 82, { top: "#c18a50", left: "#87532b", right: "#a86d38" });
        cuboid(x, pallet.width_mm - 145, 42, 170, 125, 82, { top: "#c18a50", left: "#87532b", right: "#a86d38" });
    });
    cuboid(0, 0, 124, pallet.length_mm, pallet.width_mm, 20, { top: "#dfb277", left: "#a7703e", right: "#bd8650" });

    const sorted = [...data.layout].sort((first, second) => (second.x_mm + second.y_mm) - (first.x_mm + first.y_mm));
    for (let layer = 0; layer < data.layers; layer += 1) {
        const z = pallet.height_mm + layer * data.input.box_height_mm;
        sorted.forEach((box) => cuboid(box.x_mm, box.y_mm, z, box.length_mm, box.width_mm, data.input.box_height_mm, {
            top: box.rotated ? "#d8a15c" : "#e0ad68",
            left: box.rotated ? "#a76831" : "#b47236",
            right: box.rotated ? "#bd7b3e" : "#c88748",
        }, true));
    }
}

document.querySelectorAll("[data-height-mode]").forEach((button) => {
    button.addEventListener("click", () => setHeightMode(button.dataset.heightMode));
});
form.addEventListener("submit", (event) => {
    event.preventDefault();
    calculate({ scrollToResult: true });
});
window.addEventListener("resize", () => { if (latestResult) drawPallet(latestResult); });
calculate({ scrollToResult: false });