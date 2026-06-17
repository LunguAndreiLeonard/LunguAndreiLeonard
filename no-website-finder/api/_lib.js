// Shared helpers for the serverless functions (paid product).
//
// Toate cheile stau DOAR pe server (environment variables), niciodată în browser:
//   ANTHROPIC_API_KEY      - Claude
//   GOOGLE_PLACES_KEY      - Google Places API (New)
//   STRIPE_SECRET_KEY      - Stripe (plăți)
//   STRIPE_WEBHOOK_SECRET  - Stripe webhook (whsec_...)
//   CREDIT_SECRET          - secret random pentru semnarea creditelor (HMAC)
//   PRICE_EUR_CENTS        - prețul per oraș, în cenți (default 500 = €5)
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

// Cel mai capabil model Claude.
export const MODEL = "claude-opus-4-8";

export const COUNTRIES = ["Canada", "USA", "United Kingdom", "Germany", "Spain"];

// Limită de adâncime per scanare plătită — ține costul Google mult sub €5 (marjă sănătoasă).
export const MAX_CATEGORIES = 6;
export const DEFAULT_CATEGORIES = [
  "restaurant",
  "hair salon",
  "dentist",
  "plumber",
  "beauty salon",
  "auto repair",
];

export const PRICE_EUR_CENTS = parseInt(process.env.PRICE_EUR_CENTS || "500", 10);

// Clientul Claude citește ANTHROPIC_API_KEY din environment.
export const client = new Anthropic();

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
].join(",");

/** Citește body-ul JSON indiferent dacă platforma l-a parsat deja sau nu. */
export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
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

// ---- Google Places (server-side) ----------------------------------------
export async function googleTextSearch(textQuery) {
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_KEY nu este setat pe server."); // TODO: setează cheia
  const res = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, pageSize: 20, languageCode: "en" }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch {}
    throw new Error(`Google API ${res.status}: ${detail || res.statusText}`);
  }
  const data = await res.json();
  return (data.places || []).map((p) => ({
    name: p.displayName?.text || "(fără nume)",
    address: p.formattedAddress || "",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    phone: p.nationalPhoneNumber || "",
    rating: p.rating ?? null,
    website: p.websiteUri || null,
    type: p.primaryTypeDisplayName?.text || "",
    mapsUri: p.googleMapsUri || "",
  }));
}

// ---- Credit semnat (HMAC) -----------------------------------------------
// Un credit = dreptul de a scana UN oraș. Emis după plată, verificat la /api/search.
// NOTĂ producție: pentru a împiedica reutilizarea, ține un store (KV/DB) cu jti-urile
// consumate. Aici tokenul are doar expirare + scop (oraș), suficient pentru schelet.
function creditSecret() {
  const s = process.env.CREDIT_SECRET;
  if (!s) throw new Error("CREDIT_SECRET nu este setat pe server."); // TODO: setează un secret random
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function signCredit(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", creditSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyCredit(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", creditSecret()).update(body).digest("base64url");
  // Comparație în timp constant.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}
