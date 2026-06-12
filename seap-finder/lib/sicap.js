// Client minimal pentru API-ul public e-licitatie.ro (SEAP/SICAP).
// Endpoint-urile sunt cele folosite de interfața publică https://e-licitatie.ro/pub
// (vezi și proiecte open-source precum sicap-parser / pisicap).

const BASE = "https://e-licitatie.ro/api-pub";

const HEADERS = {
  "Content-Type": "application/json;charset=UTF-8",
  Referer: "https://e-licitatie.ro/pub",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

const PAGE_SIZE = 2000;
const MAX_PAGES = 5;
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map();

async function post(path, body) {
  const key = path + JSON.stringify(body);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`SEAP a răspuns cu HTTP ${res.status} pentru ${path}`);
      const data = await res.json();
      cache.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Caută o valoare după mai multe nume posibile de câmp (API-ul SEAP și-a mai
// schimbat schema de-a lungul timpului, deci normalizăm defensiv).
function pick(obj, candidates) {
  for (const c of candidates) {
    const val = c.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return null;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

// Anunțuri de participare / simplificate (licitații deschise) publicate în ultimele `days` zile.
export async function fetchTenders(days = 30) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const items = [];
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const data = await post("/NoticeCommon/GetCANoticeList/", {
      sysNoticeTypeIds: [],
      sortProperties: [],
      pageSize: PAGE_SIZE,
      sysNoticeStateId: null,
      contractingAuthorityId: null,
      winnerId: null,
      cPVCategoryId: null,
      sysContractAssigmentTypeId: null,
      cPVId: null,
      assignedUserId: null,
      sysAcquisitionContractTypeId: null,
      pageIndex,
      startPublicationDate: fmtDate(start),
      endPublicationDate: fmtDate(end),
    });
    const page = data.items || [];
    items.push(...page);
    const total = data.total ?? data.searchTooLong ?? 0;
    if (page.length < PAGE_SIZE || items.length >= total) break;
  }

  return items.map((it) => {
    const id = pick(it, ["caNoticeId", "noticeId", "id"]);
    const typeId = pick(it, ["sysNoticeTypeId", "sysNoticeType.id"]);
    return {
      source: "licitatie",
      id,
      noticeNo: pick(it, ["noticeNo", "noticeNumber"]),
      title: pick(it, ["contractTitle", "noticeContractTitle", "title", "shortDescription"]) || "(fără titlu)",
      authority: pick(it, ["contractingAuthorityNameAndFN", "contractingAuthorityName", "entityName"]),
      cpv: pick(it, ["cpvCodeAndName", "cpvCode", "mainCPVCode"]),
      value: pick(it, ["ronContractValue", "estimatedValueRon", "estimatedValue", "contractValue"]),
      currency: "RON",
      publishedAt: pick(it, ["noticePublicationDate", "publicationDate"]),
      deadline: pick(it, ["tenderReceiptDeadline", "limitDate"]),
      procedureType: pick(it, ["sysProcedureType.text", "procedureType"]),
      contractType: pick(it, ["sysAcquisitionContractType.text", "contractType"]),
      state: pick(it, ["sysNoticeState.text", "sysProcedureState.text", "state"]),
      // Tipul 17/7 = anunț simplificat în SEAP-ul nou; restul merg pe c-notice.
      url:
        typeId === 17 || typeId === 7
          ? `https://e-licitatie.ro/pub/notices/simplified-notice/v2/view/${id}`
          : `https://e-licitatie.ro/pub/notices/c-notice/v2/view/${id}`,
    };
  });
}

// Cumpărări directe din catalogul SEAP. `ongoing: true` = în desfășurare,
// altfel cele finalizate în ultimele `days` zile (utile ca să vezi cine cumpără servicii web/software).
export async function fetchDirectAcquisitions(days = 2, ongoing = false) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const dateFilter = ongoing
    ? {
        showOngoingDa: true,
        publicationDateStart: fmtDate(start),
        publicationDateEnd: fmtDate(end),
        finalizationDateStart: null,
        finalizationDateEnd: null,
      }
    : {
        showOngoingDa: false,
        publicationDateStart: null,
        publicationDateEnd: null,
        finalizationDateStart: fmtDate(start),
        finalizationDateEnd: fmtDate(end),
      };

  const items = [];
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const data = await post("/DirectAcquisitionCommon/GetDirectAcquisitionList/", {
      pageSize: PAGE_SIZE,
      cookieContext: null,
      pageIndex,
      sysDirectAcquisitionStateId: null,
      ...dateFilter,
    });
    const page = data.items || [];
    items.push(...page);
    const total = data.total ?? 0;
    if (page.length < PAGE_SIZE || items.length >= total) break;
  }

  return items.map((it) => {
    const id = pick(it, ["directAcquisitionId", "id"]);
    return {
      source: "cumparare-directa",
      id,
      noticeNo: pick(it, ["uniqueIdentificationCode", "directAcquisitionNo"]),
      title: pick(it, ["directAcquisitionName", "title"]) || "(fără titlu)",
      authority: pick(it, ["contractingAuthority", "contractingAuthorityName", "entityName"]),
      supplier: pick(it, ["supplier", "supplierName"]),
      cpv: pick(it, ["cpvCode", "cpvCodeAndName"]),
      value: pick(it, ["closingValue", "estimatedValueRon", "value"]),
      currency: "RON",
      publishedAt: pick(it, ["publicationDate"]),
      deadline: pick(it, ["finalizationDate", "limitDate"]),
      state: pick(it, ["sysDirectAcquisitionState.text", "state"]),
      url: `https://e-licitatie.ro/pub/direct-acquisition/view/${id}`,
    };
  });
}
