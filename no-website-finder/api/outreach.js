// POST /api/outreach
// Body: { lead: { name, type, address, rating }, channel: "email"|"dm", lang?: "ro"|"en" }
// Returnează: { message: "..." }
import { client, MODEL, readJson, firstText, fail } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { lead, channel = "email", lang = "ro" } = await readJson(req);
  if (!lead || !lead.name) return res.status(400).json({ error: "Lipsește 'lead'." });

  const channelDesc = channel === "dm" ? "a short, casual Instagram/Facebook DM" : "a short, professional cold email (with a subject line)";
  const language = lang === "en" ? "English" : "Romanian";

  const system = `You are a sales copywriter for a web-design agency. Write ${channelDesc} to a local business that currently has NO website.

Rules:
- Write in ${language}.
- Personalize using the business name and type.
- Lead with the observation that they don't have a website and the concrete benefit of getting one (more customers finding them, bookings, credibility).
- Keep it under 90 words, warm and non-pushy. One clear call to action.
- Do not invent facts (prices, stats, awards). No placeholders like [Name] for the recipient — address the business by its name.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: JSON.stringify(lead) }],
    });
    res.status(200).json({ message: firstText(response).trim() });
  } catch (err) {
    fail(res, err);
  }
}
