// Shared helpers — unealtă personală de prospectare.
//
// Cheile stau DOAR pe server (environment variables), niciodată în browser:
//   ANTHROPIC_API_KEY  - Claude (search NL, scoring, outreach)
//   GOOGLE_PLACES_KEY  - Google Places API (New) — cheia ta
import Anthropic from "@anthropic-ai/sdk";

// Cel mai capabil model Claude.
export const MODEL = "claude-opus-4-8";

export const COUNTRIES = ["Canada", "USA", "United Kingdom", "Germany", "Spain"];

// Uz propriu → poți scana mai adânc. Ridică la nevoie (atenție la costul Google).
export const MAX_CATEGORIES = 12;
export const DEFAULT_CATEGORIES = [
  "restaurant", "cafe", "hair salon", "barber shop", "dentist", "plumber",
  "electrician", "beauty salon", "auto repair", "bakery",
];

// Clientul Claude se inițializează „lazy" — abia când e nevoie de el — ca să nu
// crape importul când ANTHROPIC_API_KEY nu e setat (ex: rulezi doar UI-ul).
let _client;
export function getClient() {
  if (!_client) _client = new Anthropic();
  return _client;
}

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.location",
  "places.websiteUri", "places.nationalPhoneNumber", "places.rating",
  "places.googleMapsUri", "places.primaryTypeDisplayName",
].join(",");

/** Citește body-ul JSON indiferent dacă platforma l-a parsat deja sau nu. */
export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

/** Extrage primul bloc de text din răspunsul Claude. */
export function firstText(response) {
  const block = (response.content || []).find((b) => b.type === "text");
  return block ? block.text : "";
}

/** Răspuns standard de eroare + log. */
export function fail(res, err) {
  console.error(err);
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ error: err?.message || "Eroare internă" });
}

function normalize(p) {
  return {
    name: p.displayName?.text || "(fără nume)",
    address: p.formattedAddress || "",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    phone: p.nationalPhoneNumber || "",
    rating: p.rating ?? null,
    website: p.websiteUri || null,
    type: p.primaryTypeDisplayName?.text || "",
    mapsUri: p.googleMapsUri || "",
  };
}

// ---- Google Places (server-side), cu paginare opțională ------------------
export async function googleTextSearch(textQuery, maxPages = 1) {
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_KEY nu este setat pe server."); // TODO: pune cheia în .env

  const out = [];
  let pageToken = null;
  for (let page = 0; page < maxPages; page++) {
    const body = { textQuery, pageSize: 20, languageCode: "en" };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK + ",nextPageToken",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json())?.error?.message || ""; } catch {}
      throw new Error(`Google API ${res.status}: ${detail || res.statusText}`);
    }
    const data = await res.json();
    (data.places || []).forEach((p) => out.push(normalize(p)));

    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await new Promise((r) => setTimeout(r, 1600)); // tokenul are nevoie de o scurtă pauză
  }
  return out;
}
