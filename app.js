const STORAGE_KEY = "msxauction.v1";

const state = loadState();
let selectedWatchId = state.watches[0]?.id || null;
let selectedRange = 90;

const $ = (id) => document.getElementById(id);
const watchForm = $("watchForm");
const listingForm = $("listingForm");
const watchList = $("watchList");
const watchCount = $("watchCount");
const watchNames = $("watchNames");
const globalMetrics = $("globalMetrics");
const emptyWatch = $("emptyWatch");
const watchDetail = $("watchDetail");
const detailName = $("detailName");
const detailKeywords = $("detailKeywords");
const currentListings = $("currentListings");
const historyRows = $("historyRows");
const historyStats = $("historyStats");
const historyChart = $("historyChart");
const listingTemplate = $("listingTemplate");

function blankState() {
  return { watches: [], listings: [], history: [] };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.watches && saved?.listings && saved?.history) return saved;
  } catch (_) {}
  return blankState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  })[char]);
}

function money(value, currency = "JPY") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "JPY" ? 0 : 2
    }).format(amount);
  } catch (_) {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function marketplaceFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("buyee")) return "Buyee";
    if (host.includes("amazon")) return "Amazon Japan";
    if (host.includes("yahoo")) return "Yahoo Auctions";
    if (host.includes("mercari")) return "Mercari";
    if (host.includes("ebay")) return "eBay";
    return host.replace(/^www\./, "");
  } catch (_) {
    return "Manual";
  }
}

function findOrCreateWatch(name) {
  const cleanName = name.trim();
  let watch = state.watches.find((item) => item.name.toLowerCase() === cleanName.toLowerCase());
  if (!watch) {
    watch = {
      id: uid("watch"),
      name: cleanName,
      keywords: [cleanName],
      sources: [],
      enabled: true,
      createdAt: new Date().toISOString()
    };
    state.watches.push(watch);
  }
  return watch;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function timeLeft(endTime) {
  if (!endTime) return { text: "End time unknown", className: "" };
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return { text: "Auction ended", className: "ended" };
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return { text: `${days}d ${hours}h remaining`, className: "" };
  if (hours > 0) return { text: `${hours}h ${mins}m remaining`, className: hours < 6 ? "urgent" : "" };
  return { text: `${Math.max(0, mins)}m remaining`, className: "urgent" };
}

function filteredHistory(watchId) {
  const rows = state.history
    .filter((item) => item.watchId === watchId)
    .sort((a, b) => new Date(a.endedAt) - new Date(b.endedAt));
  if (selectedRange === "all") return rows;
  const cutoff = Date.now() - Number(selectedRange) * 86400000;
  return rows.filter((item) => new Date(item.endedAt).getTime() >= cutoff);
}

function primaryCurrency(rows) {
  const counts = new Map();
  rows.forEach((row) => counts.set(row.currency, (counts.get(row.currency) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "JPY";
}

function statsFor(rows) {
  if (!rows.length) return { currency: "JPY", low: null, high: null, median: null, count: 0, mixed: false };
  const currency = primaryCurrency(rows);
  const sameCurrency = rows.filter((row) => row.currency === currency);
  const values = sameCurrency.map((row) => Number(row.finalPrice)).filter(Number.isFinite);
  return {
    currency,
    low: values.length ? Math.min(...values) : null,
    high: values.length ? Math.max(...values) : null,
    median: median(values),
    count: rows.length,
    mixed: sameCurrency.length !== rows.length
  };
}

function renderMetric(label, value, note = "") {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<span>${escapeHtml(note)}</span>` : ""}</div>`;
}

function renderGlobalMetrics() {
  const active = state.listings.filter((item) => item.status === "active");
  const endingSoon = active.filter((item) => {
    if (!item.endsAt) return false;
    const diff = new Date(item.endsAt).getTime() - Date.now();
    return diff > 0 && diff < 86400000;
  });
  const allHistory = state.history;
  globalMetrics.innerHTML = [
    renderMetric("Item types", String(state.watches.length)),
    renderMetric("Active listings", String(active.length)),
    renderMetric("Ending < 24h", String(endingSoon.length)),
    renderMetric("Tracked sales", String(allHistory.length))
  ].join("");
}

function renderWatchList() {
  watchCount.textContent = state.watches.length;
  watchList.innerHTML = "";
  watchNames.innerHTML = state.watches
    .map((watch) => `<option value="${escapeHtml(watch.name)}"></option>`)
    .join("");

  if (!state.watches.length) {
    watchList.innerHTML = `<p>No item types yet.</p>`;
    return;
  }

  state.watches.forEach((watch) => {
    const listingCount = state.listings.filter((item) => item.watchId === watch.id && item.status === "active").length;
    const button = document.createElement("button");
    button.className = `watch-item${watch.id === selectedWatchId ? " active" : ""}`;
    button.innerHTML = `<strong>${escapeHtml(watch.name)}</strong><span>${listingCount} active · ${watch.keywords.length} search term${watch.keywords.length === 1 ? "" : "s"}</span>`;
    button.addEventListener("click", () => {
      selectedWatchId = watch.id;
      render();
    });
    watchList.appendChild(button);
  });
}

function renderListings(watch) {
  const listings = state.listings
    .filter((item) => item.watchId === watch.id && item.status === "active")
    .sort((a, b) => {
      const aa = a.endsAt ? new Date(a.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bb = b.endsAt ? new Date(b.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aa - bb;
    });

  currentListings.innerHTML = "";
  if (!listings.length) {
    currentListings.innerHTML = `<div class="empty-state"><p>No active listings yet. Add a URL above or connect a marketplace collector.</p></div>`;
    return;
  }

  listings.forEach((listing) => {
    const node = listingTemplate.content.cloneNode(true);
    node.querySelector(".source").textContent = listing.marketplace;
    node.querySelector(".status-pill").textContent = listing.demo ? "Demo" : "Tracking";
    node.querySelector(".listing-title").textContent = listing.title || watch.name;
    node.querySelector(".price").textContent = money(listing.currentPrice, listing.currency);
    const ends = node.querySelector(".ends");
    const countdown = timeLeft(listing.endsAt);
    ends.textContent = countdown.text;
    ends.classList.toggle("urgent", countdown.className === "urgent");
    ends.classList.toggle("ended", countdown.className === "ended");

    const openLink = node.querySelector(".open-link");
    if (listing.url) openLink.href = listing.url;
    else openLink.remove();

    node.querySelector(".mark-sold").addEventListener("click", () => markListingSold(listing.id));
    node.querySelector(".remove-listing").addEventListener("click", () => removeListing(listing.id));
    currentListings.appendChild(node);
  });
}

function renderHistory(watch) {
  const rows = filteredHistory(watch.id);
  const stats = statsFor(rows);
  const suffix = stats.mixed ? ` · using ${stats.currency} records` : "";
  historyStats.innerHTML = [
    renderMetric("Completed auctions", String(stats.count), stats.mixed ? "mixed currencies" : ""),
    renderMetric("Lowest", stats.low == null ? "—" : money(stats.low, stats.currency), suffix),
    renderMetric("Highest", stats.high == null ? "—" : money(stats.high, stats.currency), suffix),
    renderMetric("Median", stats.median == null ? "—" : money(stats.median, stats.currency), suffix)
  ].join("");

  historyRows.innerHTML = rows.length
    ? [...rows].reverse().map((row) => `
      <tr>
        <td>${new Date(row.endedAt).toLocaleDateString()}</td>
        <td>${escapeHtml(row.marketplace)}</td>
        <td>${escapeHtml(row.title || watch.name)}</td>
        <td class="numeric">${escapeHtml(money(row.finalPrice, row.currency))}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4">No completed auctions in this timeframe.</td></tr>`;

  renderChart(rows, stats.currency);
}

function renderChart(rows, currency) {
  const chartRows = rows.filter((row) => row.currency === currency && Number.isFinite(Number(row.finalPrice)));
  if (!chartRows.length) {
    historyChart.innerHTML = `<div class="chart-empty">No price history to chart for this timeframe.</div>`;
    return;
  }

  const width = 900;
  const height = 250;
  const pad = { left: 72, right: 20, top: 18, bottom: 38 };
  const values = chartRows.map((row) => Number(row.finalPrice));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min *= .9; max *= 1.1; }
  const range = Math.max(1, max - min);
  const x = (index) => chartRows.length === 1
    ? (width + pad.left - pad.right) / 2
    : pad.left + index * ((width - pad.left - pad.right) / (chartRows.length - 1));
  const y = (value) => pad.top + (max - value) / range * (height - pad.top - pad.bottom);
  const points = chartRows.map((row, index) => `${x(index)},${y(Number(row.finalPrice))}`).join(" ");
  const ticks = [0, .25, .5, .75, 1].map((fraction) => {
    const value = max - fraction * range;
    const yy = pad.top + fraction * (height - pad.top - pad.bottom);
    return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}" stroke="#1c3348" />
      <text x="${pad.left - 10}" y="${yy + 4}" text-anchor="end" fill="#8fa6bd" font-size="11">${escapeHtml(money(value, currency))}</text>`;
  }).join("");
  const dots = chartRows.map((row, index) => `<circle cx="${x(index)}" cy="${y(Number(row.finalPrice))}" r="4" fill="#72e0a8"><title>${escapeHtml(`${new Date(row.endedAt).toLocaleDateString()} · ${money(row.finalPrice, row.currency)}`)}</title></circle>`).join("");
  const firstDate = new Date(chartRows[0].endedAt).toLocaleDateString();
  const lastDate = new Date(chartRows[chartRows.length - 1].endedAt).toLocaleDateString();

  historyChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Auction price history">
    ${ticks}
    <polyline points="${points}" fill="none" stroke="#72e0a8" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
    <text x="${pad.left}" y="${height - 8}" fill="#8fa6bd" font-size="11">${escapeHtml(firstDate)}</text>
    <text x="${width - pad.right}" y="${height - 8}" fill="#8fa6bd" font-size="11" text-anchor="end">${escapeHtml(lastDate)}</text>
  </svg>`;
}

function renderSelectedWatch() {
  const watch = state.watches.find((item) => item.id === selectedWatchId);
  if (!watch) {
    selectedWatchId = state.watches[0]?.id || null;
  }
  const selected = state.watches.find((item) => item.id === selectedWatchId);
  if (!selected) {
    emptyWatch.hidden = false;
    watchDetail.hidden = true;
    return;
  }

  emptyWatch.hidden = true;
  watchDetail.hidden = false;
  detailName.textContent = selected.name;
  detailKeywords.textContent = `${selected.keywords.join(" · ")}${selected.sources.length ? `  |  ${selected.sources.join(" · ")}` : ""}`;
  renderListings(selected);
  renderHistory(selected);
}

function render() {
  renderGlobalMetrics();
  renderWatchList();
  renderSelectedWatch();
}

function toast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 2400);
}

function markListingSold(id) {
  const listing = state.listings.find((item) => item.id === id);
  if (!listing) return;
  listing.status = "sold";
  listing.updatedAt = new Date().toISOString();
  state.history.push({
    id: uid("sale"),
    watchId: listing.watchId,
    listingId: listing.id,
    marketplace: listing.marketplace,
    title: listing.title,
    finalPrice: Number(listing.currentPrice),
    currency: listing.currency,
    endedAt: listing.endsAt && new Date(listing.endsAt) < new Date() ? listing.endsAt : new Date().toISOString(),
    url: listing.url,
    demo: listing.demo || false
  });
  saveState();
  render();
  toast("Listing added to auction history");
}

function removeListing(id) {
  const index = state.listings.findIndex((item) => item.id === id);
  if (index < 0) return;
  state.listings.splice(index, 1);
  saveState();
  render();
}

watchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("watchName").value.trim();
  const keywords = $("watchKeywords").value.split(",").map((value) => value.trim()).filter(Boolean);
  const sources = Array.from($("watchSources").selectedOptions).map((option) => option.value);
  const existing = state.watches.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.keywords = [...new Set([...existing.keywords, ...keywords])];
    existing.sources = [...new Set([...existing.sources, ...sources])];
    selectedWatchId = existing.id;
    toast("Existing item type updated");
  } else {
    const watch = { id: uid("watch"), name, keywords, sources, enabled: true, createdAt: new Date().toISOString() };
    state.watches.push(watch);
    selectedWatchId = watch.id;
    toast("Keyword watch added");
  }
  saveState();
  watchForm.reset();
  Array.from($("watchSources").options).forEach((option, index) => option.selected = index === 0);
  render();
});

listingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const url = $("listingUrl").value.trim();
  const watch = findOrCreateWatch($("listingType").value);
  const marketplace = marketplaceFromUrl(url);
  state.listings.push({
    id: uid("listing"),
    watchId: watch.id,
    url,
    marketplace,
    title: `${watch.name} · ${marketplace}`,
    currentPrice: Number($("listingPrice").value),
    currency: $("listingCurrency").value,
    endsAt: $("listingEnds").value ? new Date($("listingEnds").value).toISOString() : null,
    status: "active",
    firstSeenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "manual"
  });
  selectedWatchId = watch.id;
  saveState();
  listingForm.reset();
  render();
  toast("Listing is now being tracked locally");
});

$("deleteWatchButton").addEventListener("click", () => {
  const watch = state.watches.find((item) => item.id === selectedWatchId);
  if (!watch) return;
  if (!confirm(`Delete ${watch.name} and all of its local listing/history data?`)) return;
  state.watches = state.watches.filter((item) => item.id !== watch.id);
  state.listings = state.listings.filter((item) => item.watchId !== watch.id);
  state.history = state.history.filter((item) => item.watchId !== watch.id);
  selectedWatchId = state.watches[0]?.id || null;
  saveState();
  render();
});

$("rangeButtons").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-days]");
  if (!button) return;
  selectedRange = button.dataset.days === "all" ? "all" : Number(button.dataset.days);
  document.querySelectorAll("#rangeButtons button").forEach((item) => item.classList.toggle("active", item === button));
  renderSelectedWatch();
});

$("clearButton").addEventListener("click", () => {
  if (!confirm("Clear all locally stored tracker data in this browser?")) return;
  state.watches = [];
  state.listings = [];
  state.history = [];
  selectedWatchId = null;
  saveState();
  render();
});

$("seedDemoButton").addEventListener("click", () => {
  const now = Date.now();
  const day = 86400000;
  const gt = findOrCreateWatch("Panasonic FS-A1GT");
  gt.keywords = ["FS-A1GT", "FS A1GT", "Panasonic A1GT"];
  gt.sources = ["Yahoo Auctions", "Buyee", "Amazon Japan", "eBay"];
  const st = findOrCreateWatch("Panasonic FS-A1ST");
  st.keywords = ["FS-A1ST", "FS A1ST", "Panasonic A1ST"];
  st.sources = ["Yahoo Auctions", "Buyee", "eBay"];

  const makeHistory = (watch, values) => values.forEach(([daysAgo, price, market]) => {
    state.history.push({
      id: uid("demo_sale"), watchId: watch.id, marketplace: market, title: `${watch.name} demo auction`,
      finalPrice: price, currency: "JPY", endedAt: new Date(now - daysAgo * day).toISOString(), demo: true
    });
  });
  makeHistory(gt, [[80, 121000, "Yahoo Auctions"], [62, 138500, "Yahoo Auctions"], [47, 109800, "Buyee"], [35, 126000, "Yahoo Auctions"], [19, 118500, "eBay"], [8, 132000, "Yahoo Auctions"]]);
  makeHistory(st, [[76, 66500, "Yahoo Auctions"], [54, 72100, "Buyee"], [39, 59800, "Yahoo Auctions"], [21, 68000, "eBay"], [5, 63500, "Yahoo Auctions"]]);
  state.listings.push(
    { id: uid("demo_listing"), watchId: gt.id, marketplace: "Yahoo Auctions", title: "Panasonic FS-A1GT MSX turbo R (demo)", currentPrice: 98000, currency: "JPY", endsAt: new Date(now + 17 * 3600000).toISOString(), status: "active", demo: true, url: "", firstSeenAt: new Date().toISOString() },
    { id: uid("demo_listing"), watchId: st.id, marketplace: "Buyee", title: "Panasonic FS-A1ST turbo R (demo)", currentPrice: 54800, currency: "JPY", endsAt: new Date(now + 2.5 * day).toISOString(), status: "active", demo: true, url: "", firstSeenAt: new Date().toISOString() }
  );
  selectedWatchId = gt.id;
  saveState();
  render();
  toast("Demo data loaded — values are examples only");
});

setInterval(() => renderSelectedWatch(), 30000);
render();
