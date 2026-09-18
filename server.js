import express from "express";
import OpenAI from "openai";
import Stripe from "stripe";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
});

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const LAUNCH_PACK_PRICE_CENTS = 499;
const LAUNCH_PACK_PRODUCT = "launch_pack_v1";

function stripeMode() {
  const key = String(process.env.STRIPE_SECRET_KEY || "");
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  return "off";
}

const CATEGORY_PAGES = {
  "pressure-washing": { title: "Pressure Washing", description: "Generate memorable pressure washing business names and domain ideas for residential, commercial, and mobile exterior-cleaning brands." },
  landscaping: { title: "Landscaping", description: "Generate landscaping business names and domain ideas for lawn, garden, hardscape, and property-care companies." },
  "lawn-care": { title: "Lawn Care", description: "Generate lawn care business names and domain ideas for mowing, maintenance, fertilization, and yard-service companies." },
  cleaning: { title: "Cleaning", description: "Generate cleaning business names and domain ideas for residential, commercial, janitorial, and specialty cleaning services." },
  trucking: { title: "Trucking", description: "Generate trucking company names and domain ideas for owner-operators, freight carriers, hotshot, and logistics businesses." },
  "mobile-detailing": { title: "Mobile Detailing", description: "Generate mobile detailing business names and domain ideas for car-care, ceramic-coating, and on-site detailing brands." },
  roofing: { title: "Roofing", description: "Generate roofing company names and domain ideas for residential, commercial, repair, and storm-restoration businesses." },
  plumbing: { title: "Plumbing", description: "Generate plumbing business names and domain ideas for repair, drain, installation, and emergency-service companies." },
  hvac: { title: "HVAC", description: "Generate HVAC company names and domain ideas for heating, cooling, ventilation, maintenance, and installation brands." },
  electrical: { title: "Electrical", description: "Generate electrical business names and domain ideas for residential, commercial, service, and installation companies." },
  construction: { title: "Construction", description: "Generate construction company names and domain ideas for builders, remodelers, contractors, and specialty trades." },
  "junk-removal": { title: "Junk Removal", description: "Generate junk removal business names and domain ideas for hauling, cleanout, disposal, and property-clearance companies." },
  towing: { title: "Towing", description: "Generate towing company names and domain ideas for roadside, recovery, transport, and emergency-service businesses." },
  photography: { title: "Photography", description: "Generate photography business names and domain ideas for wedding, portrait, commercial, and event photographers." },
  barber: { title: "Barber", description: "Generate barber shop names and domain ideas for local barbers, grooming studios, and men's-care brands." },
  salon: { title: "Salon", description: "Generate salon business names and domain ideas for hair, beauty, nail, and personal-care brands." },
  bakery: { title: "Bakery", description: "Generate bakery business names and domain ideas for bread, dessert, cake, pastry, and home-baking brands." },
  "food-truck": { title: "Food Truck", description: "Generate food truck names and domain ideas for mobile kitchens, pop-ups, catering concepts, and street-food brands." },
  "coffee-shop": { title: "Coffee Shop", description: "Generate coffee shop names and domain ideas for cafes, roasters, mobile coffee, and specialty beverage brands." },
  "dog-grooming": { title: "Dog Grooming", description: "Generate dog grooming business names and domain ideas for salons, mobile groomers, pet spas, and pet-care brands." },
  "real-estate": { title: "Real Estate", description: "Generate real estate brand names and domain ideas for agents, teams, brokerages, investors, and property businesses." },
  ecommerce: { title: "Ecommerce", description: "Generate ecommerce brand names and domain ideas for online stores, direct-to-consumer products, and niche retail brands." },
  consulting: { title: "Consulting", description: "Generate consulting business names and domain ideas for independent consultants, advisory firms, and expert-led businesses." },
  "home-services": { title: "Home Services", description: "Generate home-service business names and domain ideas for repair, maintenance, installation, and local service companies." }
};

const cache = new Map();
const launchPackCache = new Map();
const launchPackJobs = new Map();
const rateBuckets = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PACK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = Number(process.env.GENERATE_RATE_LIMIT || 20);

setInterval(() => {
  const now = Date.now();

  for (const [key, value] of cache) {
    if (now - value.createdAt > CACHE_TTL_MS) cache.delete(key);
  }

  for (const [key, value] of launchPackCache) {
    if (now - value.createdAt > PACK_CACHE_TTL_MS) launchPackCache.delete(key);
  }

  for (const [key, value] of rateBuckets) {
    if (now - value.startedAt > RATE_WINDOW_MS) rateBuckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

app.get("/api/health", (_, res) => {
  res.json({
    ok: true,
    service: "LaunchFinder",
    aiConfigured: Boolean(client),
    paymentsConfigured: Boolean(stripe),
    paymentMode: stripeMode(),
    affiliateDomainConfigured: Boolean(process.env.DOMAIN_AFFILIATE_URL_TEMPLATE)
  });
});

app.get("/api/config", (_, res) => {
  res.json({
    aiEnabled: Boolean(client),
    hostingOffer: Boolean(process.env.HOSTING_AFFILIATE_URL),
    affiliateDisclosure: Boolean(process.env.DOMAIN_AFFILIATE_URL_TEMPLATE || process.env.HOSTING_AFFILIATE_URL),
    launchPackEnabled: Boolean(client && stripe),
    launchPackPrice: "$4.99",
    paymentMode: stripeMode()
  });
});

app.post("/api/generate", async (req, res) => {
  const ip = requestIp(req);
  if (!consumeRateLimit("generate:" + ip, RATE_MAX)) {
    return res.status(429).json({ error: "Too many requests. Try again in a few minutes." });
  }

  const idea = cleanIdea(req.body?.idea);
  if (idea.length < 3) {
    return res.status(400).json({ error: "Tell us a little more about the business you are starting." });
  }

  const cacheKey = idea.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return res.json({ names: cached.names, cached: true });
  }

  try {
    let names;

    if (client) {
      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input:
          "Generate exactly 12 short, brandable business names for this business idea: " +
          idea +
          ". Return ONLY a valid JSON array of 12 strings. Prefer easy spelling, strong word-of-mouth recall, and names that can plausibly work as a .com. Avoid obvious trademarked brand names, geographic claims not supplied by the user, and domain-availability claims."
      });
      names = parseNames(response.output_text);
    } else {
      names = fallbackNames(idea);
    }

    const result = names
      .map(cleanName)
      .filter(Boolean)
      .filter((name, index, all) => all.findIndex((x) => x.toLowerCase() === name.toLowerCase()) === index)
      .slice(0, 12)
      .map((name) => ({ name, domain: toDomain(name) }));

    if (result.length < 6) throw new Error("Not enough usable names returned.");

    cache.set(cacheKey, { createdAt: Date.now(), names: result });
    if (cache.size > 500) cache.delete(cache.keys().next().value);

    res.json({ names: result, cached: false });
  } catch (error) {
    console.error(JSON.stringify({ event: "generation_error", message: error?.message || "unknown" }));
    const result = fallbackNames(idea).map((name) => ({ name, domain: toDomain(name) }));
    res.json({ names: result, fallback: true });
  }
});

app.post("/api/checkout", async (req, res) => {
  if (!stripe || !client) {
    return res.status(503).json({ error: "Launch Pack checkout is not available yet." });
  }

  const ip = requestIp(req);
  if (!consumeRateLimit("checkout:" + ip, 10)) {
    return res.status(429).json({ error: "Too many checkout attempts. Try again in a few minutes." });
  }

  const idea = cleanIdea(req.body?.idea);
  const brandName = cleanName(req.body?.brandName);

  if (idea.length < 3 || !brandName) {
    return res.status(400).json({ error: "Choose a generated name before continuing." });
  }

  try {
    const origin = getOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: LAUNCH_PACK_PRICE_CENTS,
            product_data: {
              name: "LaunchFinder Launch Pack",
              description: "50 extra names, taglines, positioning, brand direction, domain ideas, and a launch checklist."
            }
          }
        }
      ],
      metadata: {
        product: LAUNCH_PACK_PRODUCT,
        idea,
        brand_name: brandName
      },
      success_url: origin + "/launch-pack.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: origin + "/?checkout=cancelled",
      submit_type: "pay"
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");

    console.log(JSON.stringify({
      event: "launch_pack_checkout_created",
      sessionId: session.id,
      at: new Date().toISOString()
    }));

    res.json({ url: session.url });
  } catch (error) {
    console.error(JSON.stringify({
      event: "checkout_error",
      message: error?.message || "unknown"
    }));
    res.status(500).json({ error: "Could not start checkout. Please try again." });
  }
});

app.get("/api/launch-pack", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!stripe || !client) {
    return res.status(503).json({ error: "Launch Pack delivery is not configured." });
  }

  const sessionId = String(req.query.session_id || "").trim();
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId) || sessionId.length > 255) {
    return res.status(400).json({ error: "Invalid checkout session." });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (
      session.payment_status !== "paid" ||
      session.amount_total !== LAUNCH_PACK_PRICE_CENTS ||
      session.currency !== "usd" ||
      session.metadata?.product !== LAUNCH_PACK_PRODUCT
    ) {
      return res.status(402).json({ error: "Payment has not been confirmed." });
    }

    const cached = launchPackCache.get(sessionId);
    if (cached && Date.now() - cached.createdAt < PACK_CACHE_TTL_MS) {
      return res.json({ pack: cached.pack, cached: true });
    }

    let job = launchPackJobs.get(sessionId);
    if (!job) {
      job = generateLaunchPack(
        cleanIdea(session.metadata?.idea),
        cleanName(session.metadata?.brand_name)
      );
      launchPackJobs.set(sessionId, job);
    }

    const pack = await job;
    launchPackJobs.delete(sessionId);
    launchPackCache.set(sessionId, { createdAt: Date.now(), pack });

    console.log(JSON.stringify({
      event: "launch_pack_delivered",
      sessionId,
      at: new Date().toISOString()
    }));

    res.json({ pack, cached: false });
  } catch (error) {
    launchPackJobs.delete(sessionId);
    console.error(JSON.stringify({
      event: "launch_pack_error",
      sessionId,
      message: error?.message || "unknown"
    }));
    res.status(500).json({ error: "Your payment is safe, but the pack could not be generated right now. Please retry this page." });
  }
});

app.get("/go/domain", (req, res) => {
  const domain = String(req.query.domain || "").toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?\.[a-z]{2,24}$/.test(domain)) {
    return res.redirect(302, "/");
  }

  const source = String(req.query.source || "result").slice(0, 40);
  console.log(JSON.stringify({
    event: "outbound_domain_click",
    domain,
    source,
    at: new Date().toISOString()
  }));

  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, buildDomainTarget(domain));
});

app.get("/go/hosting", (_, res) => {
  const target = safeExternalUrl(process.env.HOSTING_AFFILIATE_URL);
  if (!target) return res.redirect(302, "/");

  console.log(JSON.stringify({
    event: "outbound_hosting_click",
    at: new Date().toISOString()
  }));

  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, target);
});

app.get("/business-name-ideas/:slug", (req, res, next) => {
  const page = CATEGORY_PAGES[req.params.slug];
  if (!page) return next();
  res.type("html").send(renderCategoryPage(req, req.params.slug, page));
});

app.get("/robots.txt", (req, res) => {
  const origin = getOrigin(req);
  res.type("text/plain").send("User-agent: *\nAllow: /\nSitemap: " + origin + "/sitemap.xml\n");
});

app.get("/sitemap.xml", (req, res) => {
  const origin = getOrigin(req);
  const urls = [
    origin + "/",
    ...Object.keys(CATEGORY_PAGES).map((slug) => origin + "/business-name-ideas/" + slug),
    origin + "/affiliate-disclosure.html",
    origin + "/privacy.html",
    origin + "/terms.html"
  ];

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((url) => "  <url><loc>" + escapeXml(url) + "</loc></url>").join("\n") +
    "\n</urlset>";

  res.type("application/xml").send(body);
});

app.use(express.static("public", {
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.use((_, res) => {
  res.status(404).type("html").send(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found — LaunchFinder</title><link rel="stylesheet" href="/style.css"></head><body><main class="legal"><a class="logo" href="/">LaunchFinder<span>AI</span></a><h1>Page not found</h1><p>That page does not exist.</p><a class="text-link" href="/">Back to LaunchFinder →</a></main></body></html>'
  );
});

async function generateLaunchPack(idea, brandName) {
  if (!idea || !brandName) throw new Error("Missing paid pack metadata.");

  const prompt =
    "Create a practical launch pack for this business idea: " + idea + "\n" +
    "The customer selected this brand name: " + brandName + "\n\n" +
    "Return ONLY valid JSON matching this exact structure:\n" +
    "{\n" +
    '  "selectedName": "string",\n' +
    '  "positioning": "2-3 sentence positioning statement",\n' +
    '  "idealCustomer": "2-3 sentence target customer description",\n' +
    '  "brandVoice": ["4 short traits"],\n' +
    '  "taglines": ["12 distinct taglines"],\n' +
    '  "alternateNames": ["50 additional short brandable names"],\n' +
    '  "domainIdeas": ["15 plausible .com domain ideas; do not claim availability"],\n' +
    '  "shortDescription": "one-sentence business description",\n' +
    '  "aboutDescription": "80-120 word business/about description",\n' +
    '  "socialBio": "social profile bio under 160 characters",\n' +
    '  "launchChecklist": ["10 concrete launch steps in sensible order"]\n' +
    "}\n\n" +
    "Make the result specific to the business. Avoid legal, trademark, or domain-availability claims. " +
    "Do not repeat the selected brand name inside alternateNames. Keep alternate names easy to spell and useful by word of mouth.";

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    input: prompt
  });

  const parsed = parseJsonObject(response.output_text);
  return normalizeLaunchPack(parsed, brandName);
}

function normalizeLaunchPack(value, brandName) {
  const pack = value && typeof value === "object" ? value : {};
  const list = (input, max) =>
    Array.isArray(input)
      ? input.map((item) => String(item || "").trim()).filter(Boolean).slice(0, max)
      : [];

  const normalized = {
    selectedName: cleanName(pack.selectedName) || brandName,
    positioning: cleanText(pack.positioning, 800),
    idealCustomer: cleanText(pack.idealCustomer, 800),
    brandVoice: list(pack.brandVoice, 6),
    taglines: list(pack.taglines, 12),
    alternateNames: list(pack.alternateNames, 50).map(cleanName).filter(Boolean),
    domainIdeas: list(pack.domainIdeas, 15).map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean),
    shortDescription: cleanText(pack.shortDescription, 400),
    aboutDescription: cleanText(pack.aboutDescription, 1800),
    socialBio: cleanText(pack.socialBio, 220),
    launchChecklist: list(pack.launchChecklist, 12)
  };

  if (
    !normalized.positioning ||
    normalized.taglines.length < 6 ||
    normalized.alternateNames.length < 25 ||
    normalized.launchChecklist.length < 6
  ) {
    throw new Error("AI returned an incomplete launch pack.");
  }

  return normalized;
}

function parseJsonObject(text) {
  const raw = String(text || "")
    .trim()
    .replace(/^\x60{3}(?:json)?/i, "")
    .replace(/\x60{3}$/i, "")
    .trim();

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

function consumeRateLimit(key, max) {
  const now = Date.now();
  const current = rateBuckets.get(key);

  if (!current || now - current.startedAt > RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }

  if (current.count >= max) return false;
  current.count += 1;
  return true;
}

function requestIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function cleanIdea(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function cleanText(value, max) {
  return String(value || "").replace(/[\r\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseNames(text) {
  const raw = String(text || "")
    .trim()
    .replace(/^\x60{3}(?:json)?/i, "")
    .replace(/\x60{3}$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.names)) return parsed.names;
  } catch {}

  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").replace(/^["']|["'],?$/g, "").trim())
    .filter(Boolean);
}

function fallbackNames(idea) {
  const stop = new Set(["a", "an", "and", "for", "the", "to", "of", "in", "with", "my", "business", "company"]);
  const words = idea
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !stop.has(word))
    .slice(0, 4);

  const primary = titleCase(words[0] || "Launch");
  const second = titleCase(words[1] || "Works");
  const compact = (primary + second).slice(0, 24);

  return [
    compact,
    primary + "Forge",
    primary + "Pilot",
    primary + "Works",
    primary + "Flow",
    primary + "Peak",
    second + "Base",
    second + "Nest",
    second + "Crew",
    primary + second + "Co",
    primary + "Bright",
    primary + "Core"
  ].map(cleanName).filter(Boolean).slice(0, 12);
}

function cleanName(value) {
  const name = String(value || "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

  return /^[A-Za-z0-9 &'.,\-]+$/.test(name) ? name : "";
}

function toDomain(name) {
  const label = String(name).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 55) || "launch";
  return label + ".com";
}

function buildDomainTarget(domain) {
  const template = String(process.env.DOMAIN_AFFILIATE_URL_TEMPLATE || "").trim();

  if (template && template.includes("{domain}")) {
    const candidate = template.split("{domain}").join(encodeURIComponent(domain));
    const valid = safeExternalUrl(candidate);
    if (valid) return valid;
  }

  return "https://www.name.com/domain/search/" + encodeURIComponent(domain) +
    "?utm_source=launchfinder&utm_medium=referral&utm_campaign=domain_search";
}

function safeExternalUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function renderCategoryPage(req, slug, page) {
  const origin = getOrigin(req);
  const canonical = origin + "/business-name-ideas/" + slug;
  const prompt = "A " + page.title.toLowerCase() + " business";

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + escapeHtml(page.title) + ' Business Name Ideas & Domains — LaunchFinder</title>',
    '<meta name="description" content="' + escapeHtml(page.description) + '">',
    '<link rel="canonical" href="' + escapeHtml(canonical) + '">',
    '<meta property="og:title" content="' + escapeHtml(page.title) + ' Business Name Ideas — LaunchFinder">',
    '<meta property="og:description" content="' + escapeHtml(page.description) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:url" content="' + escapeHtml(canonical) + '">',
    '<link rel="stylesheet" href="/style.css">',
    '</head>',
    '<body>',
    '<header><a class="logo" href="/">LaunchFinder<span>AI</span></a><nav><a href="/#how">How it works</a><a href="/#faq">FAQ</a></nav></header>',
    '<main>',
    '<section class="hero category-hero">',
    '<div class="pill">' + escapeHtml(page.title) + ' name generator</div>',
    '<h1>Find a strong <em>' + escapeHtml(page.title.toLowerCase()) + '</em> business name.</h1>',
    '<p class="sub">' + escapeHtml(page.description) + ' Describe your angle, customer, or specialty for more specific ideas.</p>',
    '<form id="form"><textarea id="idea" maxlength="500" required>' + escapeHtml(prompt) + '</textarea><button>Generate 12 names →</button></form>',
    '<div id="formMessage" class="form-message" aria-live="polite"></div>',
    '<p class="fine">Free to try • No account required • Domain availability is verified by the registrar</p>',
    '</section>',
    '<section id="results" class="results hidden"><div class="section-kicker">Generated for you</div><h2>Your launch ideas</h2><p>Choose a direction, then check the matching .com with the registrar.</p><div id="cards"></div><div id="launchPackUpsell" class="launch-pack hidden"><div><div class="pack-badge">Launch Pack · $4.99 one time</div><h3>Turn one name into a launch-ready brand.</h3><p>Get 50 more names, 12 taglines, positioning, customer profile, domain ideas, descriptions, social bio, and a launch checklist.</p><label for="packName">Build the pack around</label><select id="packName"></select><div id="packStatus" class="pack-status" aria-live="polite"></div></div><button id="buyPack" type="button">Get my Launch Pack — $4.99</button></div><div id="affiliateNote" class="affiliate-note hidden">Some outbound links may be affiliate links. If you buy through one, LaunchFinder may earn a commission at no extra cost to you.</div></section>',
    '<section class="content-panel"><h2>What makes a useful ' + escapeHtml(page.title.toLowerCase()) + ' business name?</h2><p>Favor names people can spell after hearing once, that still make sense if your services expand, and that are distinct enough to search for online. Before committing, check the domain and search for possible trademark conflicts.</p><a class="text-link" href="/">Explore all business name ideas →</a></section>',
    '</main>',
    footerHtml(),
    '<script src="/app.js"></script>',
    '</body></html>'
  ].join("");
}

function footerHtml() {
  return '<footer><div>LaunchFinder AI · Domain suggestions are ideas, not availability claims.</div><div class="footer-links"><a href="/affiliate-disclosure.html">Affiliate disclosure</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div></footer>';
}

function getOrigin(req) {
  const configured = safeExternalUrl(process.env.SITE_URL);
  return (configured || (req.protocol + "://" + req.get("host"))).replace(/\/$/, "");
}

function titleCase(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("LaunchFinder running on " + port);
  console.log(JSON.stringify({
    event: "startup_config",
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    paymentsConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    paymentMode: stripeMode()
  }));
});