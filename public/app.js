const form = document.querySelector("#form");
const idea = document.querySelector("#idea");
const results = document.querySelector("#results");
const cards = document.querySelector("#cards");
const btn = form?.querySelector("button");
const message = document.querySelector("#formMessage");
const affiliateNote = document.querySelector("#affiliateNote");
const hostingOffer = document.querySelector("#hostingOffer");

loadConfig();

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  cards.innerHTML = "";
  setMessage("");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: idea.value })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Generation failed.");

    for (const item of data.names) {
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

    results.classList.remove("hidden");
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setMessage(error.message || "Something went wrong. Please try again.", true);
  } finally {
    setBusy(false);
  }
});

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();
    if (config.hostingOffer) hostingOffer?.classList.remove("hidden");
    if (config.affiliateDisclosure) affiliateNote?.classList.remove("hidden");
  } catch {}
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