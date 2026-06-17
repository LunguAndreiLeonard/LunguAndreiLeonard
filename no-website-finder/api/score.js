// POST /api/score
// Body: { leads: [{ name, address, rating, type }] }
// Returnează: { rankings: [{ index, score, reason }] }  (index = poziția în array-ul trimis)
import { getClient, MODEL, readJson, firstText, fail } from "./_lib.js";

const SYSTEM = `You score sales leads for a web-design agency. Each lead is a local business that has NO website (found via Google Maps).

For each lead, output:
- score: 0–100, how promising it is as a client for a new website (higher = better). Weigh signals like rating, business type's typical reliance on a web presence, and how much a site would help that type of business.
- reason: one short sentence (max ~15 words), in Romanian, explaining the score.

Return one entry per input lead, keyed by its array index. Do not invent leads.`;

const SCHEMA = {
  type: "object",
  properties: {
    rankings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          score: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["index", "score", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["rankings"],
  additionalProperties: false,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { leads } = await readJson(req);
  if (!Array.isArray(leads) || leads.length === 0) return res.status(400).json({ error: "Lipsește 'leads'." });

  // Trimitem doar câmpurile relevante, cu index, ca să bordăm consumul de tokens.
  const compact = leads.slice(0, 60).map((l, i) => ({
    index: i,
    name: l.name,
    type: l.type || "",
    rating: l.rating ?? null,
    address: l.address || "",
  }));

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: JSON.stringify(compact) }],
    });
    res.status(200).json(JSON.parse(firstText(response) || "{}"));
  } catch (err) {
    fail(res, err);
  }
}
