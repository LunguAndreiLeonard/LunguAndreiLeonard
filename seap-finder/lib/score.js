// Punctează un anunț față de profilul tău (config/profile.json): 0-100.

// Comparație fără diacritice și case-insensitive ("aplicație" ≈ "aplicatie").
function normalize(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function scoreItem(item, profile) {
  const haystack = normalize(
    [item.title, item.cpv, item.contractType, item.authority].filter(Boolean).join(" ")
  );
  const cpvDigits = (normalize(item.cpv).match(/\d{8}/) || [""])[0];

  let score = 0;
  const matched = [];

  for (const { term, weight } of profile.keywords) {
    if (haystack.includes(normalize(term))) {
      score += weight;
      matched.push(term);
    }
  }

  for (const { prefix, weight, label } of profile.cpvPrefixes) {
    if (cpvDigits.startsWith(prefix)) {
      score += weight;
      matched.push(`CPV ${prefix}* (${label})`);
      break;
    }
  }

  for (const neg of profile.negativeKeywords) {
    if (haystack.includes(normalize(neg))) {
      score -= 30;
      matched.push(`−${neg}`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), matched };
}

export function filterAndRank(items, profile, { minScore, query } = {}) {
  const min = minScore ?? profile.minScore ?? 0;
  const q = normalize(query);

  return items
    .map((item) => ({ ...item, ...scoreItem(item, profile) }))
    .filter((item) => item.score >= min)
    .filter((item) => !q || normalize(`${item.title} ${item.authority} ${item.cpv}`).includes(q))
    .sort((a, b) => b.score - a.score || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}
