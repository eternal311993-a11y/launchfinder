# LaunchFinder AI

LaunchFinder is an AI-powered business-name and domain idea generator with two monetization paths:

- affiliate-ready registrar / hosting outbound links
- a one-time $4.99 Stripe-powered Launch Pack

## Free experience

Visitors describe a business and receive 12 brandable names with matching .com ideas. The app includes caching, rate limiting, SEO category pages, sitemap/robots support, and outbound click logging.

## Paid Launch Pack

When Stripe and OpenAI are configured, the UI automatically exposes a one-time $4.99 Launch Pack. Stripe Checkout handles payment. After Stripe confirms the Checkout Session is paid, LaunchFinder generates and delivers:

- 50 additional name directions
- 12 taglines
- positioning and ideal-customer statements
- brand voice
- 15 domain ideas
- one-line, About, and social-bio copy
- a practical launch checklist

The Stripe secret is server-side only. The browser never receives it.

## Environment variables

```
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
STRIPE_SECRET_KEY=sk_...
SITE_URL=https://launchfinder-ai.onrender.com
DOMAIN_AFFILIATE_URL_TEMPLATE=https://affiliate.example/search?q={domain}
HOSTING_AFFILIATE_URL=https://affiliate.example/hosting
GENERATE_RATE_LIMIT=20
```

The paid offer stays hidden unless both `OPENAI_API_KEY` and `STRIPE_SECRET_KEY` are configured.

## Run

```bash
npm install
npm start
```

## Verify syntax

```bash
npm run check
```

> Generated names and domains are ideas only. Users should verify trademarks, business-name requirements, domain availability, pricing, and provider terms before use.
