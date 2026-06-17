/* =========================================================================
 * No-Website Finder — unealtă personală de prospectare
 * Frontend: hartă + mini-CRM. Google + Claude trec prin /api/* (server).
 * Cheile nu sunt niciodată în browser. Statusul lead-urilor e salvat local.
 * ========================================================================= */

const COUNTRY_CENTER = {
  "Canada":         { lat: 56.130, lng: -106.347, zoom: 4 },
  "USA":            { lat: 39.828, lng:  -98.579, zoom: 4 },
  "United Kingdom": { lat: 54.000, lng:   -2.000, zoom: 5 },
  "Germany":        { lat: 51.165, lng:   10.452, zoom: 6 },
  "Spain":          { lat: 40.000, lng:   -3.700, zoom: 6 },
};

const STATUSES = ["Nou", "Contactat", "Interesat", "Client", "Nu"];
const STATUS_ICON = { Nou: "🆕", Contactat: "📨", Interesat: "🔥", Client: "✅", Nu: "🚫" };

let map, markerLayer, currentResults = [];

const $ = (id) => document.getElementById(id);
const els = {
  form: $("search-form"), country: $("country"), city: $("city"), query: $("query"), deep: $("deep"),
  searchBtn: $("search-btn"), demoBtn: $("demo-btn"), scoreBtn: $("score-btn"), exportBtn: $("export-btn"),
  status: $("status"), results: $("results"), count: $("count"), statusFilter: $("status-filter"),
  modal: $("modal"), modalTitle: $("modal-title"), modalText: $("modal-text"),
  modalClose: $("modal-close"), modalCopy: $("modal-copy"),
};

// ---- Mini-CRM: status per lead (localStorage) ---------------------------
const leadKey = (p) => `${p.name}|${p.address}`;
function loadStatuses() {
  try { return JSON.parse(localStorage.getItem("nwf_status") || "{}"); } catch { return {}; }
}
let statuses = loadStatuses();
function getStatus(p) { return statuses[leadKey(p)] || "Nou"; }
function setStatusFor(p, s) {
  statuses[leadKey(p)] = s;
  localStorage.setItem("nwf_status", JSON.stringify(statuses));
}

// ---- Init ----------------------------------------------------------------
function initMap() {
  if (typeof L === "undefined") { // Leaflet n-a putut fi încărcat (ex: CDN blocat) — mergem fără hartă
    console.warn("Leaflet indisponibil — aplicația rulează fără hartă.");
    return;
  }
  const c = COUNTRY_CENTER[els.country.value];
  map = L.map("map").setView([c.lat, c.lng], c.zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap",
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function setStatus(msg, kind = "") {
  els.status.textContent = msg;
  els.status.className = "status" + (kind ? " " + kind : "");
}
function setLoading(on) {
  els.searchBtn.disabled = on;
  els.demoBtn.disabled = on;
  els.searchBtn.textContent = on ? "Se caută…" : "Caută afaceri fără site";
}

// ---- API helper ----------------------------------------------------------
async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Eroare ${res.status}`);
  return data;
}

// ---- Search --------------------------------------------------------------
async function runSearch() {
  const city = els.city.value.trim();
  const country = els.country.value;
  if (!city) { setStatus("Scrie un oraș.", "error"); return; }

  setLoading(true);
  setStatus(`Scanez „${city}, ${country}"${els.deep.checked ? " (adânc)" : ""}...`);
  try {
    const data = await api("/api/search", { city, country, query: els.query.value.trim(), deep: els.deep.checked });
    render(data.leads || []);
    setStatus(`${data.total} afaceri fără website în ${data.city}.`, "ok");
  } catch (err) {
    setStatus("Eroare: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

// ---- Scoring AI ----------------------------------------------------------
async function scoreLeads() {
  if (!currentResults.length) return;
  els.scoreBtn.disabled = true;
  setStatus("AI clasează lead-urile...");
  try {
    const { rankings } = await api("/api/score", { leads: currentResults });
    (rankings || []).forEach((r) => {
      if (currentResults[r.index]) {
        currentResults[r.index].score = r.score;
        currentResults[r.index].reason = r.reason;
      }
    });
    currentResults.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    render(currentResults);
    setStatus("Lead-uri clasate de la cel mai promițător.", "ok");
  } catch (err) {
    setStatus("Eroare scoring: " + err.message, "error");
  } finally {
    els.scoreBtn.disabled = false;
  }
}

// ---- Outreach ------------------------------------------------------------
async function outreach(lead) {
  openModal(`Mesaj pentru ${lead.name}`, "⏳ Claude scrie mesajul...");
  try {
    const { message } = await api("/api/outreach", { lead, channel: "email", lang: "ro" });
    els.modalText.value = message;
  } catch (err) {
    els.modalText.value = "Eroare: " + err.message;
  }
}
function openModal(title, text) {
  els.modalTitle.textContent = title;
  els.modalText.value = text;
  els.modal.classList.remove("hidden");
}
function closeModal() { els.modal.classList.add("hidden"); }

// ---- Rendering -----------------------------------------------------------
function render(places) {
  currentResults = places;
  if (markerLayer) markerLayer.clearLayers();
  els.results.innerHTML = "";
  els.exportBtn.disabled = !places.length;
  els.scoreBtn.disabled = !places.length;

  const filter = els.statusFilter.value;
  const visible = places.filter((p) => filter === "all" || getStatus(p) === filter);
  els.count.textContent = visible.length;

  if (!visible.length) {
    els.results.innerHTML = `<li class="result"><div class="addr">Nimic de afișat.</div></li>`;
    return;
  }

  const bounds = [];
  visible.forEach((p) => {
    if (markerLayer && typeof p.lat === "number" && typeof p.lng === "number") {
      const marker = L.marker([p.lat, p.lng]).addTo(markerLayer);
      marker.bindPopup(popupHtml(p));
      p._marker = marker;
      bounds.push([p.lat, p.lng]);
    }

    const st = getStatus(p);
    const li = document.createElement("li");
    li.className = "result";
    li.innerHTML = `
      <div class="name">
        ${esc(p.name)}
        ${typeof p.score === "number" ? `<span class="badge-score">${p.score}</span>` : ""}
        <span class="badge-nosite">fără site</span>
      </div>
      <div class="addr">${esc(p.address)}</div>
      ${p.reason ? `<div class="reason">🧠 ${esc(p.reason)}</div>` : ""}
      <div class="meta">
        ${p.rating ? `⭐ ${p.rating}` : ""}
        ${p.phone ? `<a href="tel:${esc(p.phone)}">📞 ${esc(p.phone)}</a>` : ""}
        ${p.mapsUri ? `<a href="${esc(p.mapsUri)}" target="_blank" rel="noopener">Maps ↗</a>` : ""}
        <a href="#" class="act-msg">✉ Mesaj AI</a>
      </div>
      <div class="status-row">
        <select class="status-sel">
          ${STATUSES.map((s) => `<option value="${s}" ${s === st ? "selected" : ""}>${STATUS_ICON[s]} ${s}</option>`).join("")}
        </select>
      </div>`;

    li.querySelector(".act-msg").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); outreach(p);
    });
    const sel = li.querySelector(".status-sel");
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", (e) => {
      setStatusFor(p, e.target.value);
      if (els.statusFilter.value !== "all") render(currentResults); // re-filtrează
    });
    li.addEventListener("click", () => {
      if (p._marker) { map.setView([p.lat, p.lng], 16); p._marker.openPopup(); }
    });
    els.results.appendChild(li);
  });

  if (map && bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}

function popupHtml(p) {
  return `<b>${esc(p.name)}</b>${esc(p.address)}<br>
    ${p.phone ? `📞 ${esc(p.phone)}<br>` : ""}${p.rating ? `⭐ ${p.rating}<br>` : ""}
    <span style="color:#d33">Fără website</span>`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- CSV -----------------------------------------------------------------
function exportCsv() {
  const headers = ["Name", "Status", "Address", "Phone", "Rating", "Score", "Reason", "Type", "Lat", "Lng", "GoogleMaps"];
  const rows = currentResults.map((p) => [
    p.name, getStatus(p), p.address, p.phone, p.rating ?? "", p.score ?? "", p.reason ?? "",
    p.type ?? "", p.lat ?? "", p.lng ?? "", p.mapsUri ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `leads-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ---- Demo (fără API) -----------------------------------------------------
function runDemo() {
  const country = els.country.value;
  let data = (window.DEMO_PLACES || []).filter((p) => p.country === country);
  if (!data.length) data = window.DEMO_PLACES || [];
  render(data);
  setStatus(`Exemplu: ${data.length} afaceri în ${country}. Configurează cheile pentru date reale.`, "ok");
}

// ---- Events --------------------------------------------------------------
els.form.addEventListener("submit", (e) => { e.preventDefault(); runSearch(); });
els.demoBtn.addEventListener("click", runDemo);
els.scoreBtn.addEventListener("click", scoreLeads);
els.exportBtn.addEventListener("click", exportCsv);
els.statusFilter.addEventListener("change", () => render(currentResults));
els.modalClose.addEventListener("click", closeModal);
els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
els.modalCopy.addEventListener("click", () => navigator.clipboard?.writeText(els.modalText.value));
els.country.addEventListener("change", () => {
  const c = COUNTRY_CENTER[els.country.value];
  if (map) map.setView([c.lat, c.lng], c.zoom);
});

// ---- Boot ----------------------------------------------------------------
initMap();
setStatus("Alege oraș + țară și caută. Marchează lead-urile pe măsură ce le contactezi.");
