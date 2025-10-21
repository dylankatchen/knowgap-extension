const $ = (id) => document.getElementById(id);

// storage helpers
function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["ytApiKey"], (data) => resolve(data.ytApiKey || ""));
  });
}
function setApiKey(key) {
  return new Promise((resolve) => chrome.storage.sync.set({ ytApiKey: key }, resolve));
}

// elements
const apiKeyInput = $("apiKey");
const saveKeyBtn = $("saveKeyBtn");
const queryInput = $("query");
const searchBtn = $("searchBtn");
const statusEl = $("status");
const resultsEl = $("results");

// preload masked key if present
(async () => {
  const key = await getApiKey();
  if (key) apiKeyInput.value = key.replace(/.(?=.{4})/g, "•"); // simple visual mask
})();

saveKeyBtn.addEventListener("click", async () => {
  const raw = apiKeyInput.value.trim();
  if (!raw) return alert("Please paste a valid YouTube API key.");
  await setApiKey(raw);
  alert("API key saved.");
});

searchBtn.addEventListener("click", async () => {
  const q = queryInput.value.trim();
  if (!q) return alert("Enter a query (e.g., quiz question text).");

  const key = await getApiKey();
  if (!key) return alert("Save your YouTube API key first.");

  resultsEl.innerHTML = "";
  statusEl.className = "loading";
  statusEl.textContent = "Searching…";

  try {
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "5",
      q
    });
    const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}&key=${encodeURIComponent(key)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    if (!items.length) {
      statusEl.textContent = "No results.";
      return;
    }

    statusEl.textContent = "";
    resultsEl.innerHTML = items.map((it) => {
      const vid = it?.id?.videoId;
      const title = it?.snippet?.title || "(no title)";
      const thumb = it?.snippet?.thumbnails?.default?.url || "";
      const href = `https://www.youtube.com/watch?v=${vid}`;
      return `
        <li>
          <a href="${href}" target="_blank" rel="noopener noreferrer">
            ${thumb ? `<img src="${thumb}" width="120" height="90" alt="">` : ""}
            ${title}
          </a>
        </li>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    statusEl.className = "error";
    statusEl.textContent = err.message;
  }
});
