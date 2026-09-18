const loading = document.querySelector("#packLoading");
const errorBox = document.querySelector("#packError");
const errorText = document.querySelector("#packErrorText");
const result = document.querySelector("#packResult");
const retry = document.querySelector("#retryPack");
const copyButton = document.querySelector("#copyPack");
const printButton = document.querySelector("#printPack");

let currentPack = null;

deliver();

retry?.addEventListener("click", deliver);
printButton?.addEventListener("click", () => window.print());

copyButton?.addEventListener("click", async () => {
  if (!currentPack) return;

  try {
    await navigator.clipboard.writeText(packAsText(currentPack));
    copyButton.textContent = "Copied";
    setTimeout(() => (copyButton.textContent = "Copy full pack"), 1400);
  } catch {
    copyButton.textContent = "Copy failed";
  }
});

async function deliver() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id");

  if (!sessionId) {
    showError("This delivery link is missing its checkout session.");
    return;
  }

  loading.classList.remove("hidden");
  errorBox.classList.add("hidden");
  result.classList.add("hidden");

  try {
    const response = await fetch("/api/launch-pack?session_id=" + encodeURIComponent(sessionId), {
      headers: { "Accept": "application/json" }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not deliver the pack.");
    }

    currentPack = data.pack;
    renderPack(currentPack);
    loading.classList.add("hidden");
    result.classList.remove("hidden");
  } catch (error) {
    showError(error.message || "Could not deliver the pack. Please retry.");
  }
}

function renderPack(pack) {
  setText("selectedName", pack.selectedName);
  setText("positioning", pack.positioning);
  setText("idealCustomer", pack.idealCustomer);
  setText("shortDescription", pack.shortDescription);
  setText("aboutDescription", pack.aboutDescription);
  setText("socialBio", pack.socialBio);

  renderList("brandVoice", pack.brandVoice);
  renderList("taglines", pack.taglines);
  renderList("alternateNames", pack.alternateNames);
  renderList("domainIdeas", pack.domainIdeas);
  renderList("launchChecklist", pack.launchChecklist);
}

function renderList(id, items) {
  const root = document.getElementById(id);
  if (!root) return;

  root.innerHTML = "";
  for (const item of Array.isArray(items) ? items : []) {
    const li = document.createElement("li");
    li.textContent = item;
    root.appendChild(li);
  }
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text || "";
}

function showError(message) {
  loading.classList.add("hidden");
  result.classList.add("hidden");
  errorText.textContent = message;
  errorBox.classList.remove("hidden");
}

function packAsText(pack) {
  const block = (title, value) => {
    const body = Array.isArray(value)
      ? value.map((item, index) => (index + 1) + ". " + item).join("\n")
      : String(value || "");
    return title.toUpperCase() + "\n" + body;
  };

  return [
    "LAUNCHFINDER LAUNCH PACK",
    pack.selectedName,
    "",
    block("Positioning", pack.positioning),
    "",
    block("Ideal customer", pack.idealCustomer),
    "",
    block("Brand voice", pack.brandVoice),
    "",
    block("Taglines", pack.taglines),
    "",
    block("Additional names", pack.alternateNames),
    "",
    block("Domain ideas", pack.domainIdeas),
    "",
    block("One-line description", pack.shortDescription),
    "",
    block("About description", pack.aboutDescription),
    "",
    block("Social bio", pack.socialBio),
    "",
    block("Launch checklist", pack.launchChecklist)
  ].join("\n");
}