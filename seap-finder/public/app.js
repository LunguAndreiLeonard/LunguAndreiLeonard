const $ = (sel) => document.querySelector(sel);

let activeTab = "tenders"; // tenders | direct | favs
let lastResults = [];

const FAV_KEY = "seap-finder-favs";
const favs = () => JSON.parse(localStorage.getItem(FAV_KEY) || "{}");
const saveFavs = (f) => localStorage.setItem(FAV_KEY, JSON.stringify(f));

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
  $(`#tab-${tab}`).classList.add("active");
  $("#ongoingWrap").classList.toggle("hidden", tab !== "direct");
  if (tab === "favs") renderResults(Object.values(favs()), { favsView: true });
  else search();
}

function fmtMoney(v) {
  if (v == null || isNaN(Number(v))) return null;
  return Number(v).toLocaleString("ro-RO", { maximumFractionDigits: 0 }) + " RON";
}

function fmtDate(d) {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date) ? String(d) : date.toLocaleDateString("ro-RO");
}

function scoreClass(s) {
  return s >= 50 ? "high" : s >= 25 ? "mid" : "low";
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

function renderResults(items, { favsView = false } = {}) {
  lastResults = items;
  const root = $("#results");
  if (!items.length) {
    root.innerHTML = `<p class="empty">${favsView ? "Nu ai anunțuri salvate încă." : "Niciun rezultat. Încearcă o perioadă mai mare sau un scor minim mai mic."}</p>`;
    return;
  }
  const f = favs();
  root.innerHTML = items
    .map((it) => {
      const soon =
        it.deadline && new Date(it.deadline) - Date.now() < 7 * 24 * 3600 * 1000 && new Date(it.deadline) > Date.now();
      const badges = (it.matched || [])
        .map((m) => `<span class="badge ${m.startsWith("−") ? "neg" : ""}">${esc(m)}</span>`)
        .join("");
      return `
      <article class="card">
        <div class="top">
          <h3><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a></h3>
          <span class="score ${scoreClass(it.score)}" title="Scor de potrivire">${it.score}%</span>
          <button class="fav ${f[it.url] ? "on" : ""}" data-url="${esc(it.url)}" title="Salvează">⭐</button>
        </div>
        <div class="meta">
          ${it.authority ? `<span>🏛 <b>${esc(it.authority)}</b></span>` : ""}
          ${it.supplier ? `<span>🏢 ${esc(it.supplier)}</span>` : ""}
          ${fmtMoney(it.value) ? `<span>💰 <b>${fmtMoney(it.value)}</b></span>` : ""}
          ${it.cpv ? `<span>🏷 ${esc(it.cpv)}</span>` : ""}
        </div>
        <div class="meta">
          ${it.noticeNo ? `<span>Nr. ${esc(it.noticeNo)}</span>` : ""}
          ${fmtDate(it.publishedAt) ? `<span>📅 publicat ${fmtDate(it.publishedAt)}</span>` : ""}
          ${fmtDate(it.deadline) ? `<span class="${soon ? "deadline-soon" : ""}">⏳ termen ${fmtDate(it.deadline)}</span>` : ""}
          ${it.procedureType ? `<span>${esc(it.procedureType)}</span>` : ""}
          ${it.state ? `<span>${esc(it.state)}</span>` : ""}
        </div>
        <div class="badges">${badges}</div>
      </article>`;
    })
    .join("");

  root.querySelectorAll(".fav").forEach((btn) =>
    btn.addEventListener("click", () => {
      const f2 = favs();
      const item = lastResults.find((i) => i.url === btn.dataset.url);
      if (f2[btn.dataset.url]) delete f2[btn.dataset.url];
      else if (item) f2[btn.dataset.url] = item;
      saveFavs(f2);
      btn.classList.toggle("on");
      if (activeTab === "favs") renderResults(Object.values(f2), { favsView: true });
    })
  );
}

async function search() {
  if (activeTab === "favs") return;
  const btn = $("#search");
  const status = $("#status");
  btn.disabled = true;
  status.className = "";
  status.textContent = "Interoghez e-licitatie.ro… (poate dura 10-30s)";
  $("#results").innerHTML = "";

  const params = new URLSearchParams({
    days: $("#days").value,
    minScore: $("#minScore").value,
    q: $("#q").value.trim(),
  });
  if (activeTab === "direct" && $("#ongoing").checked) params.set("ongoing", "1");

  try {
    const res = await fetch(`/api/${activeTab === "direct" ? "direct" : "tenders"}?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
    status.textContent = `${data.results.length} rezultate potrivite din ${data.totalFetched} anunțuri analizate.`;
    renderResults(data.results);
  } catch (err) {
    status.className = "error";
    status.textContent = `Eroare: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

$("#tab-tenders").addEventListener("click", () => setTab("tenders"));
$("#tab-direct").addEventListener("click", () => setTab("direct"));
$("#tab-favs").addEventListener("click", () => setTab("favs"));
$("#search").addEventListener("click", search);
$("#q").addEventListener("keydown", (e) => e.key === "Enter" && search());

search();
