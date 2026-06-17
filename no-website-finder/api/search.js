// POST /api/search   (unealtă personală — fără plată)
// Body: { city, country, query?, deep? }
// Returnează: { city, country, total, leads: [{ ...website:null }] }
//
// Google Places rulează AICI, pe server (cheia ta). Datele NU sunt stocate (ToS Google):
// le folosești live pentru prospectarea ta.
import {
  client, MODEL, COUNTRIES, MAX_CATEGORIES, DEFAULT_CATEGORIES,
  readJson, firstText, fail, googleTextSearch,
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
  const { city, country, query, deep } = await readJson(req);
  if (!city) return res.status(400).json({ error: "Lipsește orașul." });
  if (!COUNTRIES.includes(country)) return res.status(400).json({ error: "Țară nesuportată." });

  try {
    const categories = (await categoriesFor(query)).slice(0, MAX_CATEGORIES);
    const place = [city, country].filter(Boolean).join(", ");
    const pages = deep ? 3 : 1; // deep = până la 60 rezultate/categorie

    const seen = new Map();
    for (const cat of categories) {
      const results = await googleTextSearch(`${cat} in ${place}`, pages);
      for (const p of results) {
        if (p.website) continue; // doar afaceri FĂRĂ site
        const key = `${p.name}|${p.address}`;
        if (!seen.has(key)) seen.set(key, p);
      }
    }

    const leads = [...seen.values()];
    res.status(200).json({ city, country, categories, total: leads.length, leads });
  } catch (err) {
    fail(res, err);
  }
}
