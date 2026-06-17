// POST /api/plan
// Body: { query: "găsește frizerii și restaurante fără site în Toronto și Vancouver" }
// Returnează: { searches: [{ category, city, country }] }
import { client, MODEL, COUNTRIES, readJson, firstText, fail } from "./_lib.js";

const SYSTEM = `You turn a natural-language lead-generation request into a concrete list of Google Places text searches.

Rules:
- Only target these countries: Canada, USA, United Kingdom, Germany, Spain. Ignore anything outside them.
- Expand vague requests into specific (category, city, country) combinations.
- Use English category names (e.g. "barber shop", "restaurant", "dentist") and English city names.
- If the request names a country but no city, pick 2–3 major cities in that country.
- If the request names no location at all, spread across the 5 supported countries' biggest cities.
- Produce at most 12 searches. Deduplicate.`;

const SCHEMA = {
  type: "object",
  properties: {
    searches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          city: { type: "string" },
          country: { type: "string", enum: COUNTRIES },
        },
        required: ["category", "city", "country"],
        additionalProperties: false,
      },
    },
  },
  required: ["searches"],
  additionalProperties: false,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { query } = await readJson(req);
  if (!query || typeof query !== "string") return res.status(400).json({ error: "Lipsește 'query'." });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: query }],
    });
    res.status(200).json(JSON.parse(firstText(response) || "{}"));
  } catch (err) {
    fail(res, err);
  }
}
