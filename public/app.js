const form = document.querySelector("#form");
const idea = document.querySelector("#idea");
const results = document.querySelector("#results");
const cards = document.querySelector("#cards");
const btn = form?.querySelector("button");
const message = document.querySelector("#formMessage");
const affiliateNote = document.querySelector("#affiliateNote");
const hostingOffer = document.querySelector("#hostingOffer");
const launchPackUpsell = document.querySelector("#launchPackUpsell");
const packName = document.querySelector("#packName");
const buyPack = document.querySelector("#buyPack");
const packStatus = document.querySelector("#packStatus");

let launchPackEnabled = false;
let latestNames = [];

loadConfig();
showCheckoutMessage();

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  cards.innerHTML = "";
  latestNames = [];
  setMessage("");
  launchPackUpsell?.classList.add("hidden");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: idea.value })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Generation failed.");

    latestNames = Array.isArray(data.names) ? data.names : [];

    for (const item of latestNames) {
      const card = document.createElement("article");
      card.className = "card";

      const heading = document.createElement("h3");
      heading.textContent = item.name;

      const domain = document.createElement("div");
      domain.className = "domain";
      domain.textContent = item.domain;

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const check = document.createElement("a");
      check.className = "buy";
      check.target = "_blank";
      check.rel = "noopener sponsored";
      check.href = "/go/domain?domain=" + encodeURIComponent(item.domain) + "&source=result";
      check.textContent = "Check domain →";

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "copy";
      copy.textContent = "Copy";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(item.name);
          copy.textContent = "Copied";
          setTimeout(() => (copy.textContent = "Copy"), 1200);
        } catch {
          copy.textContent = item.name;
        }
      });

      actions.append(check, copy);
      card.append(heading, domain, actions);
      cards.appendChild(card);
    }

    renderLaunchPackOffer();
    results.classList.remove("hidden");
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setMessage(error.message || "Something went wrong. Please try again.", true);
  } finally {
    setBusy(false);
  }
});

buyPack?.addEventListener("click", async () => {
  if (!launchPackEnabled || !packName?.value || !idea?.value) return;

  const original = buyPack.textContent;
  buyPack.disabled = true;
  buyPack.textContent = "Opening secure checkout…";
  setPackStatus("");

  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: idea.value,
        brandName: packName.value
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not start checkout.");
    if (!data.url) throw new Error("Checkout URL was not returned.");

    window.location.assign(data.url);
  } catch (error) {
    setPackStatus(error.message || "Could not start checkout. Please try again.", true);
    buyPack.disabled = false;
    buyPack.textContent = original;
  }
});

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();

    launchPackEnabled = Boolean(config.launchPackEnabled);

    if (config.hostingOffer) hostingOffer?.classList.remove("hidden");
    if (config.affiliateDisclosure) affiliateNote?.classList.remove("hidden");

    renderLaunchPackOffer();
  } catch {}
}

function renderLaunchPackOffer() {
  if (!launchPackUpsell || !packName) return;

  if (!launchPackEnabled || latestNames.length === 0) {
    launchPackUpsell.classList.add("hidden");
    return;
  }

  const current = packName.value;
  packName.innerHTML = "";

  for (const item of latestNames) {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = item.name;
    packName.appendChild(option);
  }

  if (latestNames.some((item) => item.name === current)) {
    packName.value = current;
  }

  launchPackUpsell.classList.remove("hidden");
}

function showCheckoutMessage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("checkout") === "cancelled") {
    setMessage("Checkout canceled — no charge was made.");
    history.replaceState({}, "", window.location.pathname + window.location.hash);
  }
}

function setBusy(busy) {
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? "Creating ideas…" : "Generate 12 names →";
}

function setMessage(text, isError = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function setPackStatus(text, isError = false) {
  if (!packStatus) return;
  packStatus.textContent = text;
  packStatus.classList.toggle("error", isError);
}