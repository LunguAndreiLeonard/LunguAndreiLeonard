// POST /api/search   (PLĂTIT — necesită un credit valid pentru orașul cerut)
// Body: { credit, query? }   (orașul/țara vin din creditul semnat)
// Returnează: { city, country, total, leads: [{ name, address, ... website:null }] }
//
// Google Places rulează AICI, pe server (cheia ta), cu adâncime limitată (MAX_CATEGORIES)
// ca să ții costul mult sub €5. Datele NU sunt stocate — generate la cerere (ToS Google).
import {
  client, MODEL, COUNTRIES, MAX_CATEGORIES, DEFAULT_CATEGORIES,
  readJson, firstText, fail, googleTextSearch, verifyCredit,
} from "./_lib.js";

const CAT_SCHEMA = {
  type: "object",
  properties: { categories: { type: "array", items: { type: "string" } } },
  required: ["categories"],
  additionalProperties: false,
};

async function categoriesFor(query) {
  if (!query) return DEFAULT_CATEGORIES;
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    thinking: { type: "adaptive" },
    system: `Extract up to ${MAX_CATEGORIES} concrete Google Places business categories (English, e.g. "barber shop") from the user's request. Categories only — no cities.`,
    output_config: { format: { type: "json_schema", schema: CAT_SCHEMA } },
    messages: [{ role: "user", content: query }],
  });
  const parsed = JSON.parse(firstText(response) || "{}");
  const cats = Array.isArray(parsed.categories) ? parsed.categories : [];
  return cats.length ? cats.slice(0, MAX_CATEGORIES) : DEFAULT_CATEGORIES;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { credit, query } = await readJson(req);

  const grant = verifyCredit(credit);
  if (!grant) return res.status(402).json({ error: "Credit lipsă sau invalid. Cumpără o scanare." });
  if (!COUNTRIES.includes(grant.country)) return res.status(400).json({ error: "Țară nesuportată." });

  try {
    const categories = (await categoriesFor(query)).slice(0, MAX_CATEGORIES);
    const place = [grant.city, grant.country].filter(Boolean).join(", ");

    // O cerere Google per categorie (1 pagină = max 20). Rulăm secvențial, simplu.
    const seen = new Map();
    for (const cat of categories) {
      const results = await googleTextSearch(`${cat} in ${place}`);
      for (const p of results) {
        if (p.website) continue; // păstrăm doar afacerile FĂRĂ site
        const key = `${p.name}|${p.address}`;
        if (!seen.has(key)) seen.set(key, p);
      }
    }

    const leads = [...seen.values()];
    res.status(200).json({ city: grant.city, country: grant.country, total: leads.length, leads });
  } catch (err) {
    fail(res, err);
  }
}
