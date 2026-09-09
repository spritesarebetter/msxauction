(() => {
  const scanAllButton = document.getElementById("scanAllButton");
  const scanWatchButton = document.getElementById("scanWatchButton");
  const scanStatus = document.getElementById("scanStatus");

  const config = window.MSXAUCTION_CONFIG || {};
  const endpoint = String(config.scanEndpoint || "").trim();

  function selectedWatch() {
    return state.watches.find((watch) => watch.id === selectedWatchId) || null;
  }

  function searchUrl(source, query) {
    const q = encodeURIComponent(query);
    switch (source) {
      case "Yahoo Auctions":
        return `https://auctions.yahoo.co.jp/search/search?p=${q}`;
      case "Buyee":
        return `https://buyee.jp/item/search/query/${q}?lang=en`;
      case "Amazon Japan":
        return `https://www.amazon.co.jp/s?k=${q}`;
      case "eBay":
        return `https://www.ebay.com/sch/i.html?_nkw=${q}`;
      case "Mercari":
        return `https://jp.mercari.com/search?keyword=${q}`;
      default:
        return null;
    }
  }

  function updateScanStatus() {
    if (!scanStatus) return;
    const watch = selectedWatch();
    if (!watch) {
      scanStatus.textContent = "";
      return;
    }
    if (!watch.lastScanAt) {
      scanStatus.textContent = endpoint
        ? "Not scanned yet. Press Scan now to fetch marketplace results."
        : "Not scanned yet. Press Scan now to open searches; automatic importing needs a collector backend.";
      return;
    }
    const when = new Date(watch.lastScanAt).toLocaleString();
    const labels = {
      success: "Scan completed",
      running: "Scanning…",
      error: "Scan failed",
      "manual-search": "Marketplace searches opened"
    };
    scanStatus.textContent = `${labels[watch.lastScanStatus] || "Last scan"}: ${when}${watch.lastScanMessage ? ` · ${watch.lastScanMessage}` : ""}`;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = label || "Scanning…";
      button.disabled = true;
      button.classList.add("is-busy");
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
      button.disabled = false;
      button.classList.remove("is-busy");
    }
  }

  function normalizeListing(raw, watch) {
    const marketplace = raw.marketplace || raw.source || "Unknown";
    const currentPrice = Number(raw.currentPrice ?? raw.price);
    if (!Number.isFinite(currentPrice)) return null;
    return {
      id: raw.id || uid("listing"),
      watchId: watch.id,
      marketplace,
      sourceId: raw.sourceId || raw.marketplaceListingId || null,
      title: raw.title || watch.name,
      url: raw.url || "",
      currentPrice,
      currency: raw.currency || "JPY",
      endsAt: raw.endsAt || raw.endTime || null,
      status: raw.status === "sold" || raw.status === "ended" ? "sold" : "active",
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      demo: false
    };
  }

  function sameListing(existing, incoming) {
    if (incoming.sourceId && existing.sourceId) {
      return existing.marketplace === incoming.marketplace && existing.sourceId === incoming.sourceId;
    }
    return Boolean(incoming.url && existing.url && incoming.url === existing.url);
  }

  function ingestListings(watch, rows = []) {
    let added = 0;
    let updated = 0;
    let completed = 0;

    rows.forEach((raw) => {
      const incoming = normalizeListing(raw, watch);
      if (!incoming) return;
      const existing = state.listings.find((item) => sameListing(item, incoming));

      if (incoming.status === "sold") {
        const alreadyRecorded = state.history.some((item) =>
          (incoming.sourceId && item.sourceId === incoming.sourceId && item.marketplace === incoming.marketplace) ||
          (incoming.url && item.url === incoming.url)
        );
        if (!alreadyRecorded) {
          state.history.push({
            id: uid("sale"),
            watchId: watch.id,
            listingId: existing?.id || incoming.id,
            sourceId: incoming.sourceId,
            marketplace: incoming.marketplace,
            title: incoming.title,
            finalPrice: incoming.currentPrice,
            currency: incoming.currency,
            endedAt: incoming.endsAt || new Date().toISOString(),
            url: incoming.url,
            demo: false
          });
          completed += 1;
        }
        if (existing) existing.status = "sold";
        return;
      }

      if (existing) {
        Object.assign(existing, incoming, { id: existing.id, watchId: watch.id });
        updated += 1;
      } else {
        state.listings.push(incoming);
        added += 1;
      }
    });

    return { added, updated, completed };
  }

  function openMarketplaceSearches(watch) {
    const query = watch.keywords?.[0] || watch.name;
    const sources = watch.sources?.length ? watch.sources : ["Yahoo Auctions", "Buyee", "Amazon Japan", "eBay"];
    let opened = 0;
    sources.forEach((source) => {
      const url = searchUrl(source, query);
      if (!url) return;
      const tab = window.open(url, "_blank", "noopener,noreferrer");
      if (tab) opened += 1;
    });
    return { opened, total: sources.length };
  }

  async function scanOne(watch, { allowManualFallback = true } = {}) {
    watch.lastScanAt = new Date().toISOString();
    watch.lastScanStatus = "running";
    watch.lastScanMessage = "";
    saveState();
    updateScanStatus();

    if (!endpoint) {
      if (allowManualFallback) {
        const result = openMarketplaceSearches(watch);
        watch.lastScanStatus = "manual-search";
        watch.lastScanMessage = result.opened === result.total
          ? `${result.opened} marketplace search${result.opened === 1 ? "" : "es"} opened`
          : `${result.opened}/${result.total} search tabs opened (the browser may have blocked pop-ups)`;
      } else {
        watch.lastScanStatus = "manual-search";
        watch.lastScanMessage = "Collector backend not connected";
      }
      saveState();
      updateScanStatus();
      return { manual: true };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "watch",
          watch: {
            id: watch.id,
            name: watch.name,
            keywords: watch.keywords || [],
            sources: watch.sources || []
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const summary = ingestListings(watch, payload.listings || payload.results || []);
      watch.lastScanStatus = "success";
      watch.lastScanMessage = `${summary.added} new · ${summary.updated} updated · ${summary.completed} completed`;
      saveState();
      render();
      updateScanStatus();
      return summary;
    } catch (error) {
      watch.lastScanStatus = "error";
      watch.lastScanMessage = error?.message || "Unknown collector error";
      saveState();
      updateScanStatus();
      throw error;
    }
  }

  async function handleScanSelected() {
    const watch = selectedWatch();
    if (!watch) {
      toast("Select an item type first.");
      return;
    }
    setBusy(scanWatchButton, true, "Scanning…");
    try {
      const result = await scanOne(watch, { allowManualFallback: true });
      if (result?.manual) {
        toast("Searches opened. Automatic importing needs a collector backend.");
      } else {
        toast(`Scan complete: ${watch.lastScanMessage}`);
      }
    } catch (_) {
      toast(`Scan failed: ${watch.lastScanMessage}`);
    } finally {
      setBusy(scanWatchButton, false);
    }
  }

  async function handleScanAll() {
    if (!state.watches.length) {
      toast("Add at least one item type first.");
      return;
    }
    setBusy(scanAllButton, true, "Scanning all…");
    let failures = 0;
    try {
      for (const watch of state.watches) {
        try {
          await scanOne(watch, { allowManualFallback: false });
        } catch (_) {
          failures += 1;
        }
      }
      render();
      updateScanStatus();
      if (!endpoint) toast("Scan requests recorded. Connect a collector backend for automatic imports.");
      else if (failures) toast(`Scan finished with ${failures} failure${failures === 1 ? "" : "s"}.`);
      else toast("All item types scanned.");
    } finally {
      setBusy(scanAllButton, false);
    }
  }

  scanWatchButton?.addEventListener("click", handleScanSelected);
  scanAllButton?.addEventListener("click", handleScanAll);

  const originalRender = render;
  render = function patchedRender(...args) {
    const result = originalRender(...args);
    updateScanStatus();
    return result;
  };

  updateScanStatus();
})();
