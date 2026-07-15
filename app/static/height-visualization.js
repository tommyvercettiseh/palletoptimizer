(() => {
    const palletSelect = document.getElementById("pallet_id");
    const maxHeightInput = document.getElementById("max_total_height_mm");
    const inputForm = document.getElementById("calculatorForm");
    const dimensionGrid = document.querySelector(".dimension-grid");
    let heightMode = "inclusive";
    let showVoidSpace = false;

    function selectedPalletHeight() {
        const match = palletSelect.selectedOptions[0]?.textContent.match(/×\s*(\d+)\s*mm\)/);
        return match ? Number(match[1]) : 144;
    }

    function createControls() {
        const wrapper = document.createElement("section");
        wrapper.className = "height-options";
        wrapper.innerHTML = `
            <div class="option-title"><span>Hoogteweergave</span><small>Hoe wil je de hoogte invoeren?</small></div>
            <div class="segmented-control" role="group" aria-label="Pallethoogte inclusief of exclusief pallet">
                <button type="button" class="active" data-height-mode="inclusive">Inclusief pallet</button>
                <button type="button" data-height-mode="exclusive">Exclusief pallet</button>
            </div>
            <div class="void-toggle-row">
                <div class="void-toggle-copy">
                    <strong>Toon vrije ruimte</strong>
                    <small>Toont maximale hoogte, void space en een transparante mogelijke extra laag.</small>
                </div>
                <label class="switch-control">
                    <input id="showVoidSpace" type="checkbox">
                    <span class="switch-track"></span>
                </label>
            </div>`;
        dimensionGrid.parentNode.insertBefore(wrapper, dimensionGrid);

        wrapper.querySelectorAll("[data-height-mode]").forEach((button) => {
            button.addEventListener("click", () => setHeightMode(button.dataset.heightMode));
        });
        wrapper.querySelector("#showVoidSpace").addEventListener("change", (event) => {
            showVoidSpace = event.target.checked;
            refreshVoidCard();
            if (latestResult) drawPallet(latestResult);
        });
    }

    function setHeightMode(mode) {
        if (mode === heightMode) return;
        const palletHeight = selectedPalletHeight();
        const current = Number(maxHeightInput.value) || 0;
        if (mode === "exclusive") maxHeightInput.value = Math.max(current - palletHeight, 1);
        else maxHeightInput.value = current + palletHeight;
        heightMode = mode;
        document.querySelectorAll("[data-height-mode]").forEach((button) => button.classList.toggle("active", button.dataset.heightMode === mode));
        const label = maxHeightInput.closest("label").querySelector(":scope > span");
        label.innerHTML = mode === "inclusive"
            ? "Maximale pallethoogte <b>(inclusief pallet)</b>"
            : "Maximale laadhoogte <b>(exclusief pallet)</b>";
        if (latestResult) {
            refreshHeightTexts(latestResult);
            drawPallet(latestResult);
        }
    }

    const originalPayloadFromForm = payloadFromForm;
    payloadFromForm = function enhancedPayload(context) {
        const payload = originalPayloadFromForm(context);
        if (heightMode === "exclusive") payload.max_total_height_mm += selectedPalletHeight();
        return payload;
    };

    const originalUpdateResult = updateResult;
    updateResult = function enhancedUpdateResult(data, context) {
        originalUpdateResult(data, context);
        refreshHeightTexts(data);
        refreshVoidCard();
    };

    function refreshHeightTexts(data) {
        const loadingHeight = Math.max(data.load_height_mm - data.pallet.height_mm, 0);
        const metricValue = heightMode === "inclusive" ? data.load_height_mm : loadingHeight;
        setText("loadHeight", `${numberFormat.format(metricValue)} mm`);
        const metric = document.getElementById("loadHeight")?.closest("article");
        if (metric) metric.querySelector("small").textContent = heightMode === "inclusive" ? "incl. pallet" : "excl. pallet";
    }

    function insertMetricVectors() {
        const icons = [
            `<svg viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="22"/><path d="M12.3 5v22M19.7 5v22M5 12.3h22M5 19.7h22"/></svg>`,
            `<svg viewBox="0 0 32 32"><path d="m6 11 10-6 10 6-10 6-10-6Z"/><path d="m6 16 10 6 10-6M6 21l10 6 10-6"/></svg>`,
            `<svg viewBox="0 0 32 32"><rect x="12" y="4" width="8" height="8"/><rect x="5" y="13" width="8" height="8"/><rect x="14" y="13" width="8" height="8"/><rect x="23" y="13" width="5" height="8"/><path d="M3 27h26"/></svg>`,
            `<svg viewBox="0 0 32 32"><path d="M5 25h22M8 21h16M11 17h10M14 13h4M16 5v8"/></svg>`,
            `<svg viewBox="0 0 32 32"><path d="M8 5h16M8 27h16M16 6v20M12 10l4-4 4 4M12 22l4 4 4-4"/></svg>`
        ];
        document.querySelectorAll(".core-metrics article").forEach((article, index) => {
            if (article.querySelector(".metric-vector")) return;
            const icon = document.createElement("div");
            icon.className = "metric-vector";
            icon.innerHTML = icons[index] || icons[4];
            article.insertBefore(icon, article.firstChild);
        });
    }

    function createVoidCard() {
        const dashboard = document.querySelector(".advanced-dashboard");
        if (!dashboard || document.getElementById("voidAnalysisCard")) return;
        const card = document.createElement("section");
        card.id = "voidAnalysisCard";
        card.className = "void-analysis-card";
        card.hidden = true;
        card.innerHTML = `
            <div class="void-analysis-header"><strong>Void space analyse</strong><span>Transparante extra laag</span></div>
            <div class="void-stats">
                <article><span>Maximale hoogte</span><strong id="voidMaxHeight">–</strong></article>
                <article><span>Huidige totale hoogte</span><strong id="voidCurrentHeight">–</strong></article>
                <article><span>Vrije ruimte</span><strong id="voidRemaining">–</strong></article>
                <article><span>Reductie per doos</span><strong id="voidReduction">–</strong></article>
            </div>
            <p id="voidExplanation" class="void-explanation"></p>`;
        const efficiency = dashboard.querySelector(".efficiency-grid");
        efficiency.parentNode.insertBefore(card, efficiency.nextSibling);
    }

    function refreshVoidCard() {
        const card = document.getElementById("voidAnalysisCard");
        if (!card) return;
        card.hidden = !showVoidSpace || !latestResult;
        if (card.hidden) return;
        const data = latestResult;
        const advice = data.advice.minimum_reduction_for_gain;
        setText("voidMaxHeight", `${numberFormat.format(data.input.max_total_height_mm)} mm`);
        setText("voidCurrentHeight", `${numberFormat.format(data.load_height_mm)} mm`);
        setText("voidRemaining", `${numberFormat.format(data.remaining_height_mm)} mm`);
        setText("voidReduction", advice ? `${numberFormat.format(advice.reduction_mm)} mm` : "Niet haalbaar");
        setText("voidExplanation", advice
            ? `De transparante laag laat zien hoe een extra laag eruitziet. Verlaag iedere doos met ${numberFormat.format(advice.reduction_mm)} mm naar ${numberFormat.format(advice.new_box_height_mm)} mm om binnen de maximale hoogte te blijven.`
            : "Binnen de ingestelde grens van 50 mm dooshoogtereductie is geen extra laag mogelijk.");
    }

    function normalizedLabelAngle(start, end) {
        let angle = Math.atan2(end.y - start.y, end.x - start.x);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        return angle;
    }

    drawFaceLabel = function uprightFaceLabel(ctx, face, edgeStart, edgeEnd, label) {
        if (!label) return;
        const faceWidth = pointDistance(edgeStart, edgeEnd);
        const faceHeight = pointDistance(face[0], face[3]);
        let fontSize = Math.min(10, faceHeight * .27, faceWidth / Math.max(label.length * .58, 1));
        if (fontSize < 4.8 || faceWidth < 24 || faceHeight < 13) return;
        const center = face.reduce((acc, point) => ({ x: acc.x + point.x / face.length, y: acc.y + point.y / face.length }), { x: 0, y: 0 });
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(normalizedLabelAngle(edgeStart, edgeEnd));
        ctx.font = `800 ${Math.max(fontSize, 4.8)}px Inter, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(75,45,20,.86)";
        ctx.fillText(label, 0, 0, faceWidth * .78);
        ctx.restore();
    };

    const originalDrawPallet = drawPallet;
    drawPallet = function enhancedDrawPallet(data) {
        originalDrawPallet(data);
        const canvas = document.getElementById("palletCanvas");
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const ctx = canvas.getContext("2d");
        ctx.save();
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const width = rect.width;
        const height = Math.max(rect.height, widthIsMobile() ? 410 : 490);
        const palletHeight = data.pallet.height_mm;
        const loadingHeight = Math.max(data.load_height_mm - palletHeight, 0);
        const maxHeight = data.input.max_total_height_mm;
        const scaleY = Math.max((height - 90) / maxHeight, .12);
        const bottom = height - 28;
        const totalTop = bottom - data.load_height_mm * scaleY;
        const palletTop = bottom - palletHeight * scaleY;
        const maxTop = bottom - maxHeight * scaleY;
        const markerX = width - (widthIsMobile() ? 18 : 24);

        function marker(x, y1, y2, color, lines, align = "right") {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x-5,y1); ctx.lineTo(x+5,y1); ctx.moveTo(x-5,y2); ctx.lineTo(x+5,y2); ctx.stroke();
            ctx.fillStyle = color;
            ctx.font = "700 10px Inter, Arial, sans-serif";
            ctx.textAlign = align;
            const tx = align === "right" ? x-8 : x+8;
            lines.forEach((line, index) => ctx.fillText(line, tx, (y1+y2)/2 + index*13));
        }

        marker(markerX-70, totalTop, bottom, "#0f172a", ["Totaal", `${numberFormat.format(data.load_height_mm)} mm`]);
        marker(markerX-42, totalTop, palletTop, "#64748b", ["Lading", `${numberFormat.format(loadingHeight)} mm`]);
        marker(markerX-42, palletTop, bottom, "#64748b", ["Pallet", `${numberFormat.format(palletHeight)} mm`]);

        if (showVoidSpace) {
            marker(markerX, maxTop, bottom, "#2563eb", ["Max.", `${numberFormat.format(maxHeight)} mm`]);
            marker(markerX-18, maxTop, totalTop, "#d97706", ["Vrij", `${numberFormat.format(data.remaining_height_mm)} mm`]);
            const advice = data.advice.minimum_reduction_for_gain;
            if (advice && data.layout.length) {
                ctx.globalAlpha = .22;
                ctx.fillStyle = "#f59e0b";
                const ghostHeight = Math.max(22, advice.new_box_height_mm * scaleY);
                const ghostWidth = Math.min(width * .48, 430);
                const gx = width * .17;
                const gy = Math.max(maxTop + 4, totalTop - ghostHeight);
                ctx.fillRect(gx, gy, ghostWidth, ghostHeight);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = "#d97706";
                ctx.setLineDash([6,4]);
                ctx.strokeRect(gx, gy, ghostWidth, ghostHeight);
                ctx.setLineDash([]);
                ctx.fillStyle = "#9a3412";
                ctx.font = "800 11px Inter, Arial, sans-serif";
                ctx.textAlign = "left";
                ctx.fillText(`Mogelijke extra laag bij ${advice.new_box_height_mm} mm dooshoogte`, gx+8, gy+16);
            }
        }
        ctx.restore();
    };

    createControls();
    insertMetricVectors();
    createVoidCard();

    palletSelect.addEventListener("change", () => {
        if (heightMode === "exclusive") setTimeout(() => calculate({ scrollToResult: false }), 0);
    });
})();
