const form = document.getElementById("calculatorForm");
const submitButton = form.querySelector("button[type='submit']");
const resultCard = document.getElementById("resultCard");
const downloadButton = document.getElementById("downloadResult");
const numberFormat = new Intl.NumberFormat("en-US");
let latestResult = null;
let heightMode = "inclusive";
let palletMode = "preset";

function requiredNumber(id) {
    const value = Number(document.getElementById(id).value);
    if (!Number.isFinite(value) || value <= 0) throw new Error("Enter valid values greater than 0.");
    return value;
}

function selectedPalletHeight() {
    if (palletMode === "custom") return requiredNumber("custom_pallet_height_mm");
    const text = document.getElementById("pallet_id").selectedOptions[0]?.textContent || "";
    const match = text.match(/×\s*(\d+)\s*mm\)/);
    return match ? Number(match[1]) : 144;
}

function payloadFromForm() {
    const palletHeight = selectedPalletHeight();
    const enteredHeight = requiredNumber("max_total_height_mm");
    return {
        pallet_id: palletMode === "custom" ? "custom" : document.getElementById("pallet_id").value,
        custom_pallet_length_mm: palletMode === "custom" ? requiredNumber("custom_pallet_length_mm") : 0,
        custom_pallet_width_mm: palletMode === "custom" ? requiredNumber("custom_pallet_width_mm") : 0,
        custom_pallet_height_mm: palletMode === "custom" ? palletHeight : 0,
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

function setPalletMode(mode) {
    palletMode = mode;
    document.querySelectorAll("[data-pallet-mode]").forEach((button) => button.classList.toggle("active", button.dataset.palletMode === mode));
    document.getElementById("presetPalletField").hidden = mode === "custom";
    document.getElementById("customPalletFields").hidden = mode !== "custom";
}

function setHeightMode(mode) {
    if (mode === heightMode) return;
    const input = document.getElementById("max_total_height_mm");
    const palletHeight = selectedPalletHeight();
    const value = Number(input.value) || 0;
    input.value = mode === "exclusive" ? Math.max(value - palletHeight, 1) : value + palletHeight;
    heightMode = mode;
    document.querySelectorAll("[data-height-mode]").forEach((button) => button.classList.toggle("active", button.dataset.heightMode === mode));
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
        downloadButton.disabled = false;
        if (scrollToResult && window.matchMedia("(max-width: 979px)").matches) resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
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
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke();
}

function drawPallet(data) {
    const canvas = document.getElementById("palletCanvas");
    const { ctx, width, height } = prepareCanvas(canvas);
    const pallet = data.pallet;
    const totalHeight = Math.max(data.load_height_mm, pallet.height_mm + data.input.box_height_mm);
    const paddingX = width < 700 ? 24 : 44;
    const paddingY = 18;
    const rawProject = (x, y, z) => ({ x: x - y, y: -(x + y) * .34 - z * .62 });
    const bounds = [];
    [0, pallet.length_mm].forEach((x) => [0, pallet.width_mm].forEach((y) => [0, totalHeight].forEach((z) => bounds.push(rawProject(x, y, z)))));
    const minX = Math.min(...bounds.map((p) => p.x)), maxX = Math.max(...bounds.map((p) => p.x));
    const minY = Math.min(...bounds.map((p) => p.y)), maxY = Math.max(...bounds.map((p) => p.y));
    const rawWidth = Math.max(maxX - minX, 1), rawHeight = Math.max(maxY - minY, 1);
    const scale = Math.min((width - paddingX * 2) / rawWidth, (height - paddingY * 2) / rawHeight);
    const origin = { x: paddingX + (width - paddingX * 2 - rawWidth * scale) / 2 - minX * scale, y: paddingY + (height - paddingY * 2 - rawHeight * scale) / 2 - minY * scale };
    const project = (x, y, z) => { const raw = rawProject(x, y, z); return { x: origin.x + raw.x * scale, y: origin.y + raw.y * scale }; };
    function cuboid(x, y, z, length, depth, boxHeight, colors, carton = false) {
        const a = project(x,y,z), b = project(x+length,y,z), d = project(x,y+depth,z), at = project(x,y,z+boxHeight), bt = project(x+length,y,z+boxHeight), ct = project(x+length,y+depth,z+boxHeight), dt = project(x,y+depth,z+boxHeight);
        polygon(ctx,[a,d,dt,at],colors.left); polygon(ctx,[a,b,bt,at],colors.right); polygon(ctx,[at,bt,ct,dt],colors.top);
        if (carton) { const ta=project(x+length*.47,y,z+boxHeight+.2),tb=project(x+length*.53,y,z+boxHeight+.2),tc=project(x+length*.53,y+depth,z+boxHeight+.2),td=project(x+length*.47,y+depth,z+boxHeight+.2); polygon(ctx,[ta,tb,tc,td],"rgba(194,142,78,.42)","rgba(150,97,43,.18)",.3); }
    }
    ctx.strokeStyle="rgba(148,163,184,.12)"; ctx.lineWidth=1;
    for(let i=-4;i<=4;i+=1){const a=project(i*230,-450,0),b=project(i*230,1300,0),c=project(-450,i*230,0),d=project(1650,i*230,0);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.stroke();}
    cuboid(0,0,0,pallet.length_mm,pallet.width_mm,42,{top:"#d5a468",left:"#9b6536",right:"#b97d45"});
    [0,pallet.length_mm*.42,Math.max(pallet.length_mm-170,0)].forEach((x)=>{cuboid(x,20,42,Math.min(170,pallet.length_mm),Math.min(125,pallet.width_mm),82,{top:"#c18a50",left:"#87532b",right:"#a86d38"});cuboid(x,Math.max(pallet.width_mm-145,0),42,Math.min(170,pallet.length_mm),Math.min(125,pallet.width_mm),82,{top:"#c18a50",left:"#87532b",right:"#a86d38"});});
    cuboid(0,0,124,pallet.length_mm,pallet.width_mm,Math.max(pallet.height_mm-124,20),{top:"#dfb277",left:"#a7703e",right:"#bd8650"});
    const sorted=[...data.layout].sort((a,b)=>(b.x_mm+b.y_mm)-(a.x_mm+a.y_mm));
    for(let layer=0;layer<data.layers;layer+=1){const z=pallet.height_mm+layer*data.input.box_height_mm;sorted.forEach((box)=>cuboid(box.x_mm,box.y_mm,z,box.length_mm,box.width_mm,data.input.box_height_mm,{top:box.rotated?"#d8a15c":"#e0ad68",left:box.rotated?"#a76831":"#b47236",right:box.rotated?"#bd7b3e":"#c88748"},true));}
}

function downloadResult() {
    if (!latestResult) return;
    const source = document.getElementById("palletCanvas");
    const data = latestResult;
    const caseQuantity = requiredNumber("case_quantity");
    const values = [
        ["Boxes per layer", data.boxes_per_layer], ["Number of layers", data.layers],
        ["Boxes per pallet", data.boxes_per_pallet], ["Case quantity", caseQuantity],
        ["Pallet quantity", data.boxes_per_pallet * caseQuantity], ["Total height", `${numberFormat.format(data.load_height_mm)} mm`],
    ];
    const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 1000;
    const ctx = canvas.getContext("2d"); ctx.fillStyle="#f6f8fc"; ctx.fillRect(0,0,1600,1000);
    ctx.fillStyle="#2563eb"; ctx.fillRect(0,0,1600,90); ctx.fillStyle="#fff"; ctx.font="800 34px Arial"; ctx.fillText("Pallet Optimizer · Result",55,57);
    ctx.fillStyle="#0f172a"; ctx.font="700 18px Arial"; ctx.fillText(`${data.pallet.name} · ${data.pallet.length_mm} × ${data.pallet.width_mm} × ${data.pallet.height_mm} mm`,55,130);
    values.forEach(([label,value],index)=>{const col=index%3,row=Math.floor(index/3),x=55+col*500,y=165+row*125;ctx.fillStyle="#fff";ctx.strokeStyle="#dbe3ef";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,470,100,16);ctx.fill();ctx.stroke();ctx.fillStyle="#64748b";ctx.font="700 16px Arial";ctx.fillText(label,x+24,y+32);ctx.fillStyle="#0f172a";ctx.font="800 30px Arial";ctx.fillText(String(value),x+24,y+73);});
    ctx.fillStyle="#fff";ctx.strokeStyle="#dbe3ef";ctx.beginPath();ctx.roundRect(55,430,1490,500,18);ctx.fill();ctx.stroke();ctx.drawImage(source,0,0,source.width,source.height,180,460,1240,420);
    canvas.toBlob((blob)=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="pallet-result.png";link.click();URL.revokeObjectURL(url);},"image/png");
}

document.querySelectorAll("[data-height-mode]").forEach((button)=>button.addEventListener("click",()=>setHeightMode(button.dataset.heightMode)));
document.querySelectorAll("[data-pallet-mode]").forEach((button)=>button.addEventListener("click",()=>setPalletMode(button.dataset.palletMode)));
form.addEventListener("submit",(event)=>{event.preventDefault();calculate({scrollToResult:true});});
downloadButton.addEventListener("click",downloadResult);
window.addEventListener("resize",()=>{if(latestResult)drawPallet(latestResult);});
calculate({scrollToResult:false});
