// POST /api/webhook   (Stripe webhook — opțional pentru schelet, recomandat în producție)
//
// /api/credit acoperă deja fluxul fericit (redirect → schimbă session_id pe credit).
// Webhook-ul e plasa de siguranță: confirmă plata chiar dacă userul închide tab-ul,
// și e locul unde, în producție, ai marca creditul ca emis într-un store (KV/DB).
//
// TODO chei: STRIPE_WEBHOOK_SECRET (whsec_...) din dashboard-ul Stripe.
//
// IMPORTANT: pe Vercel dezactivează parsarea automată a body-ului pentru această rută:
export const config = { api: { bodyParser: false } };

import Stripe from "stripe";
import { fail } from "./_lib.js";

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Chei Stripe lipsă pe server." }); // TODO
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    const buf = await rawBody(req);
    const event = stripe.webhooks.constructEvent(buf, req.headers["stripe-signature"], secret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { city, country } = session.metadata || {};
      // TODO producție: salvează (session.id, city, country) într-un store ca emis/consumabil o singură dată.
      console.log(`Plată confirmată: ${session.id} → ${city}, ${country}`);
    }
    res.status(200).json({ received: true });
  } catch (err) {
    fail(res, err);
  }
}
