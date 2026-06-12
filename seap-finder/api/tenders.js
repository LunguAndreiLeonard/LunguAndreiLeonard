import { fetchTenders } from "../lib/sicap.js";
import { filterAndRank } from "../lib/score.js";
import { loadProfile } from "../lib/profile.js";

export default async function handler(req, res) {
  try {
    const days = Math.min(parseInt(req.query.days || "30", 10), 90);
    const profile = await loadProfile();
    const items = await fetchTenders(days);
    const results = filterAndRank(items, profile, {
      minScore: req.query.minScore !== undefined ? parseInt(req.query.minScore, 10) : undefined,
      query: req.query.q || "",
    });
    res.status(200).json({ totalFetched: items.length, results });
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error: "Nu am putut interoga e-licitatie.ro. Încearcă din nou în câteva secunde.",
      detail: String(err.message || err),
    });
  }
}
