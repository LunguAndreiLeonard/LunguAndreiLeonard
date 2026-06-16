/* =========================================================================
 * No-Website Finder
 * Caută afaceri pe Google Maps (Places API New) și păstrează doar pe cele
 * FĂRĂ website. Le afișează pe hartă + listă, cu export CSV.
 * ========================================================================= */

const COUNTRY_CENTER = {
  "Canada":         { lat: 56.130, lng: -106.347, zoom: 4 },
  "USA":            { lat: 39.828, lng:  -98.579, zoom: 4 },
  "United Kingdom": { lat: 54.000, lng:   -2.000, zoom: 5 },
  "Germany":        { lat: 51.165, lng:   10.452, zoom: 6 },
  "Spain":          { lat: 40.000, lng:   -3.700, zoom: 6 },
};

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.rating",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
].join(",");

// ---- State ---------------------------------------------------------------
let map;
let markerLayer;
let currentResults = [];

// ---- DOM -----------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  form: $("search-form"),
  country: $("country"),
  city: $("city"),
  category: $("category"),
  apiKey: $("api-key"),
  deepPages: $("deep-pages"),
  searchBtn: $("search-btn"),
  demoBtn: $("demo-btn"),
  exportBtn: $("export-btn"),
  status: $("status"),
  results: $("results"),
  count: $("count"),
};

// ---- Init ----------------------------------------------------------------
function initMap() {
  const c = COUNTRY_CENTER[els.country.value];
  map = L.map("map", { zoomControl: true }).setView([c.lat, c.lng], c.zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function restoreApiKey() {
  const saved = localStorage.getItem("nwf_api_key");
  if (saved) els.apiKey.value = saved;
}

// ---- Status helpers ------------------------------------------------------
function setStatus(msg, kind = "") {
  els.status.textContent = msg;
  els.status.className = "status" + (kind ? " " + kind : "");
}

function setLoading(on) {
  els.searchBtn.disabled = on;
  els.demoBtn.disabled = on;
  els.searchBtn.textContent = on ? "⏳ Caut..." : "🔎 Caută afaceri fără site";
}

// ---- Google Places API ---------------------------------------------------
async function searchPlaces({ apiKey, textQuery, deep }) {
  const collected = [];
  let pageToken = null;
  const maxPages = deep ? 3 : 1; // fiecare pagină = până la 20 rezultate

  for (let page = 0; page < maxPages; page++) {
    const body = { textQuery, pageSize: 20, languageCode: "en" };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK + ",nextPageToken",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json())?.error?.message || ""; } catch (_) {}
      throw new Error(`Google API ${res.status}: ${detail || res.statusText}`);
    }

    const data = await res.json();
    (data.places || []).forEach((p) => collected.push(normalizePlace(p)));

    pageToken = data.nextPageToken;
    if (!pageToken) break;
    // pageToken necesită o scurtă pauză înainte de a fi valid
    await new Promise((r) => setTimeout(r, 1600));
  }

  return collected;
}

function normalizePlace(p) {
  return {
    name: p.displayName?.text || "(fără nume)",
    address: p.formattedAddress || "",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
    rating: p.rating ?? null,
    website: p.websiteUri || null,
    type: p.primaryTypeDisplayName?.text || "",
    mapsUri: p.googleMapsUri || "",
  };
}

// ---- Rendering -----------------------------------------------------------
function render(places) {
  currentResults = places;
  markerLayer.clearLayers();
  els.results.innerHTML = "";
  els.count.textContent = places.length;
  els.exportBtn.disabled = places.length === 0;

  if (places.length === 0) {
    els.results.innerHTML = `<li class="result"><div class="addr">Niciun rezultat fără website pentru această căutare.</div></li>`;
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
      <div class="name">${esc(p.name)} <span class="badge-nosite">fără site</span></div>
      <div class="addr">${esc(p.address)}</div>
      <div class="meta">
        ${p.rating ? `⭐ ${p.rating}` : ""}
        ${p.phone ? `<a href="tel:${esc(p.phone)}">📞 ${esc(p.phone)}</a>` : ""}
        ${p.mapsUri ? `<a href="${esc(p.mapsUri)}" target="_blank" rel="noopener">Maps ↗</a>` : ""}
      </div>`;
    li.addEventListener("click", () => {
      if (p._marker) {
        map.setView([p.lat, p.lng], 16);
        p._marker.openPopup();
      }
    });
    els.results.appendChild(li);
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}

function popupHtml(p) {
  return `
    <b>${esc(p.name)}</b>
    ${esc(p.address)}<br>
    ${p.phone ? `📞 ${esc(p.phone)}<br>` : ""}
    ${p.rating ? `⭐ ${p.rating}<br>` : ""}
    <span style="color:#d33">Fără website</span>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- CSV export ----------------------------------------------------------
function exportCsv() {
  const headers = ["Name", "Address", "Phone", "Rating", "Type", "Latitude", "Longitude", "GoogleMaps"];
  const rows = currentResults.map((p) => [
    p.name, p.address, p.phone, p.rating ?? "", p.type, p.lat ?? "", p.lng ?? "", p.mapsUri,
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-fara-site-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Demo ----------------------------------------------------------------
function runDemo() {
  const country = els.country.value;
  let data = (window.DEMO_PLACES || []).filter((p) => p.country === country);
  if (data.length === 0) data = window.DEMO_PLACES || [];
  render(data);
  setStatus(`Mod demo: ${data.length} afaceri exemplu (fără site) în ${country}.`, "ok");
}

// ---- Live search ---------------------------------------------------------
async function runSearch() {
  const apiKey = els.apiKey.value.trim();
  const city = els.city.value.trim();
  const category = els.category.value.trim();
  const country = els.country.value;

  if (!apiKey) {
    setStatus("Fără cheie API → rulez modul demo. (Adaugă o cheie pentru date reale.)");
    runDemo();
    return;
  }
  if (!category) {
    setStatus("Scrie un tip de afacere (ex: restaurant, frizerie).", "error");
    return;
  }

  localStorage.setItem("nwf_api_key", apiKey);
  const place = [city, country].filter(Boolean).join(", ");
  const textQuery = `${category} in ${place}`;

  setLoading(true);
  setStatus(`Caut „${textQuery}” pe Google Places...`);

  try {
    const all = await searchPlaces({ apiKey, textQuery, deep: els.deepPages.checked });
    const noSite = all.filter((p) => !p.website);
    render(noSite);
    setStatus(`Găsite ${all.length} afaceri, din care ${noSite.length} fără website.`, "ok");
  } catch (err) {
    console.error(err);
    setStatus("Eroare: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

// ---- Events --------------------------------------------------------------
els.form.addEventListener("submit", (e) => { e.preventDefault(); runSearch(); });
els.demoBtn.addEventListener("click", runDemo);
els.exportBtn.addEventListener("click", exportCsv);
els.country.addEventListener("change", () => {
  const c = COUNTRY_CENTER[els.country.value];
  if (map) map.setView([c.lat, c.lng], c.zoom);
});

// ---- Boot ----------------------------------------------------------------
initMap();
restoreApiKey();
setStatus("Alege țara + tipul de afacere și apasă Caută. Fără cheie → Demo.");
