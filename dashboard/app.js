// Fathom v3: Client application for pre-token launch radar.
// Pure offline execution: reads globalThis.FATHOM from data.js.

const data = globalThis.FATHOM;
const mainContainer = document.getElementById("main");

const state = {
  q: "",
  cat: "",
  chain: "",
  watch: false,
  sort: "rank",
  dir: "asc",
  p: "",
  view: "board",
};

/** Re-compute integer PPM product for identity verification */
function productUsd(tvl, multiplePpm, growthPpm, agePpm, chainPpm) {
  const scale = 1000000n;
  let value = BigInt(Math.round(tvl));
  value = (value * BigInt(multiplePpm) * BigInt(growthPpm) * BigInt(agePpm) * BigInt(chainPpm)) / (scale * scale * scale * scale);
  if (value < 1n) return 1;
  if (value > 100000000000000n) return 100000000000000;
  return Number(value);
}

/** Format PPM as decimal string with 3 decimal places */
function ppmShort(ppm) {
  return (ppm / 1000000).toFixed(3);
}

/** Format PPM as clean fixed decimal */
function ppmToDecimal(ppm) {
  const isNegative = ppm < 0;
  const absVal = Math.abs(Math.trunc(ppm));
  const whole = Math.floor(absVal / 1000000);
  let frac = String(absVal % 1000000).padStart(6, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${isNegative ? "-" : ""}${whole}.${frac}`;
}

/** Standard thousands grouping */
function formatNumber(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Compact currency formatter ($1.20B, $45.1M, $250K) */
function compactUsd(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${formatNumber(abs)}`;
}

/** Format percentage changes */
function formatChange(v) {
  if (v == null) return "—";
  const rounded = Math.round(v * 10) / 10;
  const absText = Math.abs(rounded).toFixed(1);
  if (rounded > 0) return `+${absText}%`;
  if (rounded < 0) return `−${absText}%`;
  return "0.0%";
}

function getChangeClass(v) {
  if (v == null || v === 0) return "";
  return v > 0 ? "up" : "down";
}

/** Escape HTML characters */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}

function getCategoryName(row) {
  return row.category || "Uncategorized";
}

function formatChains(chains) {
  if (!chains || !chains.length) return "—";
  if (chains.length <= 2) return chains.join(", ");
  return `${chains[0]}, ${chains[1]} +${chains.length - 2}`;
}

function getConfidenceDescription(row) {
  const n = row.comparable_count;
  const noun = n === 1 ? "comparable" : "comparables";
  if (row.confidence === "Unanchored") return "Unanchored · no category peers; global median applied";
  if (row.confidence === "Thin") return `Thin · ${n} ${noun} in category (<6 threshold); global median applied`;
  return `${row.confidence} · ${n} category ${noun} anchored this multiple`;
}

/** Calculate step-by-step running implied valuation */
function calculatePartialValuations(row) {
  const scale = 1000000n;
  const factors = [row.multiple_ppm, row.growth_ppm, row.age_ppm, row.chain_ppm];
  const results = [Number(BigInt(Math.round(row.tvl_usd)))];

  for (let i = 0; i < factors.length; i += 1) {
    let running = BigInt(Math.round(row.tvl_usd));
    for (let j = 0; j <= i; j += 1) {
      running *= BigInt(factors[j]);
    }
    running /= scale ** BigInt(i + 1);
    results.push(Number(running));
  }
  return results;
}

function getMultipleExplanation(row) {
  if (row.multiple_kind === "category") {
    return `${row.comparable_count} live trading peers in ${getCategoryName(row)} anchor this multiple`;
  }
  if (row.comparable_count > 0) {
    return `${row.comparable_count} trading peer${row.comparable_count === 1 ? "" : "s"} in ${getCategoryName(row)} (raw median ${ppmToDecimal(row.raw_multiple_ppm)}), below 6 threshold; global market median used`;
  }
  return `No trading peer in ${getCategoryName(row)}; global market median of ${data.n_comps} comps used`;
}

/** Read URL hash into state */
function readHashState() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  state.q = params.get("q") || "";
  state.cat = params.get("cat") || "";
  state.chain = params.get("chain") || "";
  state.watch = params.get("watch") === "1";
  state.sort = params.get("sort") || "rank";
  state.dir = params.get("dir") || "asc";
  state.p = params.get("p") || "";
  state.view = params.get("view") === "trades" ? "trades" : "board";
}

/** Sync state to URL hash */
function writeHashState() {
  const params = new URLSearchParams();
  if (state.p) {
    params.set("p", state.p);
  } else {
    if (state.view === "trades") params.set("view", "trades");
    if (state.q) params.set("q", state.q);
    if (state.cat) params.set("cat", state.cat);
    if (state.chain) params.set("chain", state.chain);
    if (state.watch) params.set("watch", "1");
    if (state.sort !== "rank") params.set("sort", state.sort);
    if (state.dir !== "asc") params.set("dir", state.dir);
  }
  const nextHash = params.toString();
  const currentHash = location.hash.replace(/^#/, "");
  if (nextHash !== currentHash) {
    history.replaceState(null, "", nextHash ? `#${nextHash}` : location.pathname + location.search);
  }
}

/** Filter and sort board rows */
function getVisibleRows() {
  const query = state.q.trim().toLowerCase();
  const filtered = data.rows.filter((row) => {
    if (state.watch && !row.watchlist) return false;
    if (state.cat && getCategoryName(row) !== state.cat) return false;
    if (state.chain && !row.chains.includes(state.chain)) return false;
    if (query && !`${row.name} ${row.slug} ${row.category || ""}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const direction = state.dir === "desc" ? -1 : 1;
  filtered.sort((a, b) => direction * compareRows(a, b, state.sort) || a.rank - b.rank);
  return filtered;
}

function compareRows(a, b, key) {
  if (key === "name") return a.name.localeCompare(b.name);
  if (key === "category") return getCategoryName(a).localeCompare(getCategoryName(b));
  if (key === "tvl") return a.tvl_usd - b.tvl_usd;
  if (key === "change") return (a.change_7d ?? -1e12) - (b.change_7d ?? -1e12);
  if (key === "age") return (a.age_days ?? -1) - (b.age_days ?? -1);
  if (key === "chains") return a.chains.length - b.chains.length;
  if (key === "implied") return a.implied_value_usd - b.implied_value_usd;
  if (key === "confidence") return a.comparable_count - b.comparable_count;
  return a.rank - b.rank;
}

function renderOptions(items) {
  return items.map((val) => `<option value="${escapeHtml(val)}">${escapeHtml(val)}</option>`).join("");
}

function getSortAria(key) {
  if (state.sort !== key) return "none";
  return state.dir === "asc" ? "ascending" : "descending";
}

function renderSortHeader(key, label, extraClass) {
  return `<th class="${extraClass || ""}"><button type="button" data-sort="${key}" aria-sort="${getSortAria(key)}">${label}</button></th>`;
}

function renderTableRow(row) {
  const watchBadge = row.watchlist ? '<span class="watch-tag" title="Watchlist Protocol"></span>' : "";
  const confLower = escapeHtml(String(row.confidence || "").toLowerCase());

  return `<tr>
    <td class="rank">${row.rank}</td>
    <td><button type="button" class="name-btn" data-open="${escapeHtml(row.slug)}">${watchBadge}${escapeHtml(row.name)}<span class="slug">${escapeHtml(row.slug)}</span></button></td>
    <td>${escapeHtml(getCategoryName(row))}</td>
    <td class="num right">${compactUsd(row.tvl_usd)}</td>
    <td class="num right ${getChangeClass(row.change_7d)}">${formatChange(row.change_7d)}</td>
    <td class="num right">${row.age_days == null ? "—" : `${row.age_days}d`}</td>
    <td>${escapeHtml(formatChains(row.chains))}</td>
    <td><span class="badge ${confLower}">${escapeHtml(row.confidence || "—")}</span></td>
    <td class="implied right">${compactUsd(row.implied_value_usd)}</td>
  </tr>`;
}

function renderViewSwitcher() {
  const isTrades = state.view === "trades";
  return `<div class="views" role="tablist">
    <button type="button" data-view="board" aria-pressed="${isTrades ? "false" : "true"}">Pre-token Board</button>
    <button type="button" data-view="trades" aria-pressed="${isTrades ? "true" : "false"}">Trading Comparables (${data.n_comps})</button>
  </div>`;
}

function formatFarmStep(step) {
  const colonIdx = step.indexOf(": ");
  if (colonIdx < 0) return escapeHtml(step);
  const costTimePrefix = step.slice(0, colonIdx);
  const instructions = step.slice(colonIdx + 2);
  return `<em>${escapeHtml(costTimePrefix)}</em>${escapeHtml(instructions)}`;
}

function paintBoardView() {
  const categories = [...new Set(data.rows.map(getCategoryName))].sort();
  const chains = [...new Set(data.rows.flatMap((r) => r.chains))].sort();
  const visible = getVisibleRows();

  mainContainer.innerHTML = `
    ${renderViewSwitcher()}
    <div class="filters">
      <label class="field">Search<input id="q" type="search" value="${escapeHtml(state.q)}" placeholder="Search name, slug, chain..."></label>
      <label class="field">Category<select id="cat"><option value="">All Categories</option>${renderOptions(categories)}</select></label>
      <label class="field">Chain<select id="chain"><option value="">All Chains</option>${renderOptions(chains)}</select></label>
      <label class="check"><input id="watch" type="checkbox" ${state.watch ? "checked" : ""}> Watchlist Only</label>
    </div>

    <div class="count-bar">
      <span>Showing <strong>${visible.length}</strong> of <strong>${data.rows.length}</strong> pre-token protocols. Ranked by implied launch valuation.</span>
      <span>${data.n_screened_out} screened out</span>
    </div>

    <table>
      <thead>
        <tr>
          ${renderSortHeader("rank", "Rank", "right")}
          ${renderSortHeader("name", "Protocol")}
          ${renderSortHeader("category", "Category")}
          ${renderSortHeader("tvl", "TVL", "right")}
          ${renderSortHeader("change", "7d TVL", "right")}
          ${renderSortHeader("age", "Age", "right")}
          ${renderSortHeader("chains", "Chains")}
          ${renderSortHeader("confidence", "Confidence")}
          ${renderSortHeader("implied", "Implied Valuation", "right")}
        </tr>
      </thead>
      <tbody id="rows">
        ${visible.length > 0 ? visible.map(renderTableRow).join("") : `<tr><td colspan="9" class="empty">No protocol matches the current filter parameters.</td></tr>`}
      </tbody>
    </table>
  `;

  const catSelect = document.getElementById("cat");
  const chainSelect = document.getElementById("chain");
  if (catSelect) catSelect.value = state.cat;
  if (chainSelect) chainSelect.value = state.chain;
}

function paintDetailView(row) {
  const computedIdentity = productUsd(row.tvl_usd, row.multiple_ppm, row.growth_ppm, row.age_ppm, row.chain_ppm);
  const partialVals = calculatePartialValuations(row);
  const extraCount = Math.max(0, row.chains.length - 1);

  const factorRows = [
    { label: "1. Base TVL", figure: compactUsd(row.tvl_usd), why: "Protocol committed capital from DefiLlama snapshot", running: partialVals[0] },
    { label: "2. Category Multiple", figure: ppmToDecimal(row.multiple_ppm), why: row.multiple_kind === "category" ? `${getCategoryName(row)} median (>=6 comps)` : "Global market median fallback", running: partialVals[1] },
    { label: "3. Growth Modifier", figure: ppmToDecimal(row.growth_ppm), why: row.change_7d == null ? "Unreported 7-day change (1.000 baseline)" : `${formatChange(row.change_7d)} change scaled 0.006/pt`, running: partialVals[2] },
    { label: "4. Seasoning / Age", figure: ppmToDecimal(row.age_ppm), why: row.age_days == null ? "Unreported listing date (0.750 baseline)" : `${row.age_days} operational days on maturity curve`, running: partialVals[3] },
    { label: "5. Multichain Breadth", figure: ppmToDecimal(row.chain_ppm), why: extraCount === 0 ? "Single-chain deployment" : `${row.chains.length} chains (${Math.min(12, extraCount)} extra counted at +3%/chain)`, running: partialVals[4] },
  ];

  const breakdownHtml = factorRows.map((f) => `
    <tr>
      <td><strong>${escapeHtml(f.label)}</strong></td>
      <td class="num right">${escapeHtml(f.figure)}</td>
      <td style="color: var(--ink-secondary); font-size: 12px;">${escapeHtml(f.why)}</td>
      <td class="num right implied">${compactUsd(f.running)}</td>
    </tr>
  `).join("");

  const farmStepItems = row.farm_steps.map((step, idx) => `
    <li class="farm-card">
      <div class="farm-num">${idx + 1}</div>
      <div class="farm-content">${formatFarmStep(step)}</div>
    </li>
  `).join("");

  const watchLabel = row.watchlist ? " · Watchlist Floor" : "";
  const confTone = escapeHtml(String(row.confidence || "").toLowerCase());

  mainContainer.innerHTML = `
    <article class="detail">
      <button type="button" class="back-btn" data-back="1">&larr; Back to Launch Radar Board</button>

      <div class="detail-header">
        <p class="kicker">${escapeHtml(getCategoryName(row))}${watchLabel} · Rank #${row.rank}</p>
        <h2>${escapeHtml(row.name)}</h2>
        <div class="detail-tags">
          <span class="status-pill">Pre-token Protocol</span>
          <span class="badge ${confTone}">${escapeHtml(getConfidenceDescription(row))}</span>
        </div>

        <div class="headline-val">
          <div class="val-figure">${compactUsd(row.implied_value_usd)}</div>
          <div class="val-caption">Implied Valuation · Math Identity: $${formatNumber(computedIdentity)}</div>
        </div>
      </div>

      <h3>Valuation Factor Breakdown</h3>
      <table>
        <thead>
          <tr>
            <th>Factor</th>
            <th class="right">Value</th>
            <th>Rationale</th>
            <th class="right">Running Valuation</th>
          </tr>
        </thead>
        <tbody>
          ${breakdownHtml}
        </tbody>
      </table>
      <p class="disclaimer-note">${escapeHtml(getMultipleExplanation(row))}. Implied valuation computes TVL × Multiple × Growth × Age × Chains in exact integer parts-per-million.</p>

      <h3>Protocol Attributes</h3>
      <div class="meta-grid">
        <div class="meta-card">
          <span>Total Value Locked</span>
          <strong>$${formatNumber(row.tvl_usd)}</strong>
        </div>
        <div class="meta-card">
          <span>7-Day TVL Change</span>
          <strong class="${getChangeClass(row.change_7d)}">${formatChange(row.change_7d)}</strong>
        </div>
        <div class="meta-card">
          <span>Tracking Age</span>
          <strong>${row.age_days == null ? "Unreported" : `${row.age_days} days`}</strong>
        </div>
        <div class="meta-card">
          <span>Deployments</span>
          <strong>${escapeHtml(row.chains.join(", ") || "—")}</strong>
        </div>
        <div class="meta-card">
          <span>Protocol Slug</span>
          <strong>${escapeHtml(row.slug)}</strong>
        </div>
      </div>

      <h3>Chain-Native Farm Strategy</h3>
      <ol class="farm-list">
        ${farmStepItems}
      </ol>
      <p class="disclaimer-note">Execution parameters reflect chain rails, estimated gas fees, approval requirements, and capital hold durations. Implied value represents model valuation and is not guaranteed market pricing.</p>
    </article>
  `;
}

function paintMultiplesSidebar() {
  const host = document.getElementById("multiples");
  const line = document.getElementById("global-line");
  const countEl = document.getElementById("global-count");

  if (countEl) countEl.textContent = `${data.n_comps} Comps`;

  if (line) {
    line.textContent = `Global median ${ppmShort(data.global_ppm)} from ${data.n_comps} trading tokens. Clamped to P10 (${ppmShort(data.p10_ppm)}) & P90 (${ppmShort(data.p90_ppm)}). ${data.n_screened_out} wrapped/staked/bridge products excluded.`;
  }

  const activeCategories = data.categories
    .filter((c) => c.n_rows > 0)
    .sort((a, b) => b.n_rows - a.n_rows || a.name.localeCompare(b.name))
    .slice(0, 10);

  if (host) {
    host.innerHTML = `<div class="mult">
      ${activeCategories.map((c) => `
        <span>${escapeHtml(c.name)}</span>
        <span>${ppmShort(c.multiple_ppm)}</span>
        <span class="muted">${c.kind === "category" ? `${c.n_comps} live` : `${c.n_comps} thin`}</span>
      `).join("")}
    </div>`;
  }
}

function paintTradesView() {
  const query = state.q.trim().toLowerCase();
  const rows = data.comps.filter((r) => {
    if (state.cat && (r.category || "Uncategorized") !== state.cat) return false;
    if (query && !`${r.name} ${r.slug} ${r.category || ""}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const categories = [...new Set(data.comps.map((r) => r.category || "Uncategorized"))].sort();

  mainContainer.innerHTML = `
    ${renderViewSwitcher()}
    <div class="banner-notice">
      These protocols already have trading tokens recorded on DefiLlama. Their Mcap &divide; TVL ratios establish the empirical valuation baseline. They are not ranked on the pre-token board.
    </div>

    <div class="filters">
      <label class="field">Search Comps<input id="q" type="search" value="${escapeHtml(state.q)}" placeholder="Search comparable..."></label>
      <label class="field">Category<select id="cat"><option value="">All Categories</option>${renderOptions(categories)}</select></label>
    </div>

    <div class="count-bar">
      <span>Showing <strong>${rows.length}</strong> of <strong>${data.comps.length}</strong> trading peer benchmarks.</span>
    </div>

    <table>
      <thead>
        <tr>
          <th>Protocol</th>
          <th>Category</th>
          <th class="right">TVL</th>
          <th class="right">Market Cap</th>
          <th class="right">Mcap / TVL Ratio</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td><strong>${escapeHtml(r.name)}</strong><span class="slug">${escapeHtml(r.slug)}</span></td>
            <td>${escapeHtml(r.category || "Uncategorized")}</td>
            <td class="num right">${compactUsd(r.tvl_usd)}</td>
            <td class="num right">${compactUsd(r.mcap_usd)}</td>
            <td class="num right implied">${ppmShort(r.ratio_ppm)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  const catSelect = document.getElementById("cat");
  if (catSelect) catSelect.value = state.cat;
}

function render() {
  if (!data) {
    mainContainer.innerHTML = `<div class="empty">Board data failed to load beside this page.</div>`;
    return;
  }

  const asOfEl = document.getElementById("asof");
  if (asOfEl) asOfEl.textContent = data.as_of;

  const coverEl = document.getElementById("cover");
  if (coverEl) {
    const coveredWatch = data.rows.filter((r) => r.watchlist).length;
    coverEl.textContent = `${coveredWatch} of ${data.n_watchlist}`;
  }

  paintMultiplesSidebar();

  if (state.view === "trades" && !state.p) {
    paintTradesView();
    return;
  }

  if (state.p) {
    const matched = data.rows.find((item) => item.slug === state.p);
    if (matched) {
      paintDetailView(matched);
      return;
    }
  }

  paintBoardView();
}

function handleClick(event) {
  const viewTarget = event.target.closest("[data-view]");
  if (viewTarget) {
    state.view = viewTarget.getAttribute("data-view") === "trades" ? "trades" : "board";
    state.p = "";
    writeHashState();
    render();
    return;
  }

  const openTarget = event.target.closest("[data-open]");
  if (openTarget) {
    state.p = openTarget.getAttribute("data-open") || "";
    writeHashState();
    render();
    return;
  }

  if (event.target.closest("[data-back]")) {
    state.p = "";
    writeHashState();
    render();
    return;
  }

  const sortTarget = event.target.closest("[data-sort]");
  if (!sortTarget) return;

  const sortKey = sortTarget.getAttribute("data-sort");
  if (state.sort === sortKey) {
    state.dir = state.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort = sortKey;
    state.dir = sortKey === "name" || sortKey === "category" || sortKey === "rank" ? "asc" : "desc";
  }

  writeHashState();
  render();
}

function handleInput(event) {
  const isSearch = event.target && event.target.id === "q";
  const caretPos = isSearch ? event.target.selectionStart : null;

  const qInput = document.getElementById("q");
  const catSelect = document.getElementById("cat");
  const chainSelect = document.getElementById("chain");
  const watchCheck = document.getElementById("watch");

  if (qInput) state.q = qInput.value;
  if (catSelect) state.cat = catSelect.value;
  if (chainSelect) state.chain = chainSelect.value;
  if (watchCheck) state.watch = watchCheck.checked;

  writeHashState();

  if (state.view === "trades") {
    paintTradesView();
  } else {
    paintBoardView();
  }

  if (isSearch) {
    const refocused = document.getElementById("q");
    if (refocused) {
      refocused.focus();
      const pos = caretPos == null ? refocused.value.length : caretPos;
      refocused.setSelectionRange(pos, pos);
    }
  }
}

if (mainContainer) {
  mainContainer.addEventListener("click", handleClick);
  mainContainer.addEventListener("input", handleInput);
  mainContainer.addEventListener("change", handleInput);
}

readHashState();
render();
