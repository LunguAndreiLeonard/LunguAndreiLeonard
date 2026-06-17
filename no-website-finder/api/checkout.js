// POST /api/checkout
// Body: { city, country }
// Returnează: { url }  (Stripe Checkout — redirect aici)
//
// TODO chei: setează STRIPE_SECRET_KEY în environment-ul de pe server.
import Stripe from "stripe";
import { COUNTRIES, PRICE_EUR_CENTS, readJson, fail } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { city, country } = await readJson(req);
  if (!city || !COUNTRIES.includes(country)) {
    return res.status(400).json({ error: "Oraș/țară lipsă sau țară nesuportată." });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY nu este setat pe server." }); // TODO
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin = req.headers.origin || `https://${req.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: PRICE_EUR_CENTS,
            product_data: {
              name: `Scanare afaceri fără site — ${city}, ${country}`,
              description: "Listă lead-uri (afaceri Google Maps fără website) pentru un oraș.",
            },
          },
        },
      ],
      // Orașul/țara călătoresc în metadata → le citim la confirmarea plății.
      metadata: { city, country },
      success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=1`,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    fail(res, err);
  }
}
