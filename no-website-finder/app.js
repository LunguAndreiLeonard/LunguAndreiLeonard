/* =========================================================================
 * No-Website Finder — produs €5/oraș
 * Frontend: hartă + UI. Apeluri AI + Google + Stripe trec prin /api/* (server).
 * Cheile (Claude, Google, Stripe) NU sunt niciodată în browser.
 * ========================================================================= */

const COUNTRY_CENTER = {
  "Canada":         { lat: 56.130, lng: -106.347, zoom: 4 },
  "USA":            { lat: 39.828, lng:  -98.579, zoom: 4 },
  "United Kingdom": { lat: 54.000, lng:   -2.000, zoom: 5 },
  "Germany":        { lat: 51.165, lng:   10.452, zoom: 6 },
  "Spain":          { lat: 40.000, lng:   -3.700, zoom: 6 },
};

let map, markerLayer, currentResults = [];

const $ = (id) => document.getElementById(id);
const els = {
  form: $("search-form"), country: $("country"), city: $("city"), query: $("query"),
  searchBtn: $("search-btn"), demoBtn: $("demo-btn"), scoreBtn: $("score-btn"), exportBtn: $("export-btn"),
  status: $("status"), results: $("results"), count: $("count"),
  modal: $("modal"), modalTitle: $("modal-title"), modalText: $("modal-text"),
  modalClose: $("modal-close"), modalCopy: $("modal-copy"),
};

// ---- Credit (per oraș) stocat local -------------------------------------
function creditKey(city, country) { return `nwf_credit_${country}_${city}`.toLowerCase(); }
function getCredit(city, country) {
  try {
    const raw = JSON.parse(localStorage.getItem(creditKey(city, country)) || "null");
    if (raw && raw.exp && Date.now() < raw.exp) return raw.credit;
  } catch {}
  return null;
}
function saveCredit(city, country, credit, exp) {
  localStorage.setItem(creditKey(city, country), JSON.stringify({ credit, exp }));
}

// ---- Init ----------------------------------------------------------------
function initMap() {
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
function setLoading(on, label) {
  els.searchBtn.disabled = on;
  els.demoBtn.disabled = on;
  els.searchBtn.textContent = on ? (label || "⏳ Lucrez...") : "🔒 Caută afaceri fără site — €5";
}

// ---- API helper ----------------------------------------------------------
async function api(path, body, method = "POST") {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Eroare ${res.status}`);
  return data;
}

// ---- Flux plătit ---------------------------------------------------------
async function startSearch() {
  const city = els.city.value.trim();
  const country = els.country.value;
  if (!city) { setStatus("Scrie un oraș.", "error"); return; }

  const credit = getCredit(city, country);
  if (credit) return runSearch(credit, city, country);

  // Fără credit → Stripe Checkout.
  setLoading(true, "⏳ Deschid plata...");
  setStatus("Te trimit la plată (€5)...");
  try {
    const { url } = await api("/api/checkout", { city, country });
    window.location.href = url;
  } catch (err) {
    setStatus("Eroare la plată: " + err.message, "error");
    setLoading(false);
  }
}

async function runSearch(credit, city, country) {
  setLoading(true, "⏳ Caut pe Google...");
  setStatus(`Scanez „${city}, ${country}"...`);
  try {
    const data = await api("/api/search", { credit, query: els.query.value.trim() });
    render(data.leads || []);
    setStatus(`${data.total} afaceri fără website în ${data.city}.`, "ok");
  } catch (err) {
    if (/credit/i.test(err.message)) localStorage.removeItem(creditKey(city, country));
    setStatus("Eroare: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

// La revenirea din Stripe: ?session_id=... → schimbă pe credit și caută.
async function handleReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get("canceled")) { setStatus("Plată anulată.", "error"); cleanUrl(); return; }
  const sid = params.get("session_id");
  if (!sid) return;
  setStatus("Confirm plata...");
  try {
    const { credit, city, country, exp } = await api(`/api/credit?session_id=${encodeURIComponent(sid)}`, null, "GET");
    saveCredit(city, country, credit, exp);
    els.city.value = city;
    if (COUNTRY_CENTER[country]) els.country.value = country;
    cleanUrl();
    await runSearch(credit, city, country);
  } catch (err) {
    setStatus("Nu am putut confirma plata: " + err.message, "error");
    cleanUrl();
  }
}
function cleanUrl() { history.replaceState({}, "", location.pathname); }

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
    render(currentResults, { keepScores: true });
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
function render(places, { keepScores = false } = {}) {
  currentResults = places;
  markerLayer.clearLayers();
  els.results.innerHTML = "";
  els.count.textContent = places.length;
  els.exportBtn.disabled = !places.length;
  els.scoreBtn.disabled = !places.length;

  if (!places.length) {
    els.results.innerHTML = `<li class="result"><div class="addr">Niciun rezultat fără website.</div></li>`;
    return;
  }

  const bounds = [];
  places.forEach((p, i) => {
    if (typeof p.lat === "number" && typeof p.lng === "number") {
      const marker = L.marker([p.lat, p.lng]).addTo(markerLayer);
      marker.bindPopup(popupHtml(p));
      p._marker = marker;
      bounds.push([p.lat, p.lng]);
    }

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
      </div>`;

    li.querySelector(".act-msg").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); outreach(p); });
    li.addEventListener("click", () => {
      if (p._marker) { map.setView([p.lat, p.lng], 16); p._marker.openPopup(); }
    });
    els.results.appendChild(li);
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
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
  const headers = ["Name", "Address", "Phone", "Rating", "Score", "Reason", "Type", "Lat", "Lng", "GoogleMaps"];
  const rows = currentResults.map((p) => [
    p.name, p.address, p.phone, p.rating ?? "", p.score ?? "", p.reason ?? "", p.type ?? "", p.lat ?? "", p.lng ?? "", p.mapsUri ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `leads-fara-site-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ---- Demo (gratis, fără plată) ------------------------------------------
function runDemo() {
  const country = els.country.value;
  let data = (window.DEMO_PLACES || []).filter((p) => p.country === country);
  if (!data.length) data = window.DEMO_PLACES || [];
  render(data);
  setStatus(`Exemplu (gratis): ${data.length} afaceri în ${country}. Plătește €5 pentru date reale.`, "ok");
}

// ---- Events --------------------------------------------------------------
els.form.addEventListener("submit", (e) => { e.preventDefault(); startSearch(); });
els.demoBtn.addEventListener("click", runDemo);
els.scoreBtn.addEventListener("click", scoreLeads);
els.exportBtn.addEventListener("click", exportCsv);
els.modalClose.addEventListener("click", closeModal);
els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
els.modalCopy.addEventListener("click", () => { navigator.clipboard?.writeText(els.modalText.value); });
els.country.addEventListener("change", () => {
  const c = COUNTRY_CENTER[els.country.value];
  if (map) map.setView([c.lat, c.lng], c.zoom);
});

// ---- Boot ----------------------------------------------------------------
initMap();
setStatus("Alege oraș + țară. €5/oraș, sau vezi un exemplu gratis.");
handleReturn();
