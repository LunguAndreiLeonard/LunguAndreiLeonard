// GET /api/credit?session_id=cs_...
// Verifică la Stripe că sesiunea e plătită și emite un credit semnat (HMAC) pentru orașul cumpărat.
// Returnează: { credit, city, country, exp }
//
// Acesta e calea simplă pentru schelet: schimbă un session_id plătit pe un credit, fără DB.
// În producție, perechează-l cu webhook-ul + un store de jti consumate (vezi webhook.js).
import Stripe from "stripe";
import { signCredit, fail } from "./_lib.js";

const CREDIT_TTL_MS = 24 * 60 * 60 * 1000; // creditul e valabil 24h

export default async function handler(req, res) {
  const sessionId = req.query?.session_id;
  if (!sessionId) return res.status(400).json({ error: "Lipsește session_id." });
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY nu este setat pe server." }); // TODO
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Plata nu este confirmată." });
    }
    const { city, country } = session.metadata || {};
    if (!city || !country) return res.status(400).json({ error: "Sesiune fără oraș." });

    const exp = Date.now() + CREDIT_TTL_MS;
    const credit = signCredit({ city, country, exp, sid: sessionId });
    res.status(200).json({ credit, city, country, exp });
  } catch (err) {
    fail(res, err);
  }
}
