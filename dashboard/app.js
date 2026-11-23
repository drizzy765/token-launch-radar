// Fathom page. Reads globalThis.FATHOM from ../data.js. No network.

const data = globalThis.FATHOM;
const main = document.getElementById("main");

const state = { q: "", cat: "", chain: "", watch: false, sort: "rank", dir: "asc", p: "", view: "board" };

function productUsd(tvl, multiplePpm, growthPpm, agePpm, chainPpm) {
  const scale = 1000000n;
  let value = BigInt(Math.round(tvl));
  value = (value * BigInt(multiplePpm) * BigInt(growthPpm) * BigInt(agePpm) * BigInt(chainPpm)) / (scale * scale * scale * scale);
  if (value < 1n) return 1;
  if (value > 100000000000000n) return 100000000000000;
  return Number(value);
}

function ppmShort(ppm) {
  return (ppm / 1000000).toFixed(3);
}

function ppmToDecimal(ppm) {
  const neg = ppm < 0;
  const v = Math.abs(Math.trunc(ppm));
  const whole = Math.floor(v / 1000000);
  let frac = String(v % 1000000).padStart(6, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

function group(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function compactUsd(n) {
  const v = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (v >= 1e12) return `${sign}$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(1)}K`;
  return `${sign}$${group(v)}`;
}

function changeText(v) {
  if (v == null) return "—";
  const r = Math.round(v * 10) / 10;
  const body = Math.abs(r).toFixed(1);
  if (r > 0) return `+${body}%`;
  if (r < 0) return `−${body}%`;
  return "0.0%";
}

function changeClass(v) {
  if (v == null || v === 0) return "";
  return v > 0 ? "up" : "down";
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function catName(row) {
  return row.category || "Uncategorized";
}

function chainText(chains) {
  if (!chains.length) return "—";
  if (chains.length <= 2) return chains.join(", ");
  return `${chains[0]}, ${chains[1]} +${chains.length - 2}`;
}

function confidenceText(row) {
  const n = row.comparable_count;
  const noun = n === 1 ? "comparable" : "comparables";
  if (row.confidence === "Unanchored") return "Unanchored · no category comparable, so the global median is used";
  if (row.confidence === "Thin") return `Thin · ${n} ${noun} in this category, under 6, so the global median is used`;
  return `${row.confidence} · ${n} category ${noun} set this multiple`;
}

function partials(row) {
  const scale = 1000000n;
  const ppms = [row.multiple_ppm, row.growth_ppm, row.age_ppm, row.chain_ppm];
  const out = [Number(BigInt(Math.round(row.tvl_usd)))];
  for (let i = 0; i < ppms.length; i += 1) {
    let acc = BigInt(Math.round(row.tvl_usd));
    for (let j = 0; j <= i; j += 1) acc *= BigInt(ppms[j]);
    acc /= scale ** BigInt(i + 1);
    out.push(Number(acc));
  }
  return out;
}

function kindText(row) {
  if (row.multiple_kind === "category") {
    return `${row.comparable_count} trading tokens in ${catName(row)} set this median`;
  }
  if (row.comparable_count > 0) {
    return `${row.comparable_count} trading token${row.comparable_count === 1 ? "" : "s"} in ${catName(row)} (raw median ${ppmToDecimal(row.raw_multiple_ppm)}), under 6, so the global median is used`;
  }
  return `No trading token in ${catName(row)}, so the global median of ${data.n_comps} tokens is used`;
}

function readHash() {
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

function writeHash() {
  const params = new URLSearchParams();
  if (state.p) params.set("p", state.p);
  else {
    if (state.view === "trades") params.set("view", "trades");
    if (state.q) params.set("q", state.q);
    if (state.cat) params.set("cat", state.cat);
    if (state.chain) params.set("chain", state.chain);
    if (state.watch) params.set("watch", "1");
    if (state.sort !== "rank") params.set("sort", state.sort);
    if (state.dir !== "asc") params.set("dir", state.dir);
  }
  const next = params.toString();
  const cur = location.hash.replace(/^#/, "");
  if (next !== cur) history.replaceState(null, "", next ? `#${next}` : location.pathname + location.search);
}

function visibleRows() {
  const q = state.q.trim().toLowerCase();
  const list = data.rows.filter((row) => {
    if (state.watch && !row.watchlist) return false;
    if (state.cat && catName(row) !== state.cat) return false;
    if (state.chain && !row.chains.includes(state.chain)) return false;
    if (q && !`${row.name} ${row.slug} ${row.category || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const dir = state.dir === "desc" ? -1 : 1;
  list.sort((a, b) => dir * compare(a, b, state.sort) || a.rank - b.rank);
  return list;
}

function compare(a, b, key) {
  if (key === "name") return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  if (key === "category") return catName(a) < catName(b) ? -1 : catName(a) > catName(b) ? 1 : 0;
  if (key === "tvl") return a.tvl_usd - b.tvl_usd;
  if (key === "change") return (a.change_7d ?? -1e12) - (b.change_7d ?? -1e12);
  if (key === "age") return (a.age_days ?? -1) - (b.age_days ?? -1);
  if (key === "chains") return a.chains.length - b.chains.length;
  if (key === "implied") return a.implied_value_usd - b.implied_value_usd;
  if (key === "confidence") return a.comparable_count - b.comparable_count;
  return a.rank - b.rank;
}

function options(values) {
  return values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
}

function aria(key) {
  if (state.sort !== key) return "none";
  return state.dir === "asc" ? "ascending" : "descending";
}

function headBtn(key, label, cls) {
  return `<th class="${cls || ""}"><button type="button" data-sort="${key}" aria-sort="${aria(key)}">${label}</button></th>`;
}

function rowHtml(row) {
  const mark = row.watchlist ? '<i class="watch" title="Watchlist"></i>' : "";
  return `<tr>
    <td class="rank">${row.rank}</td>
    <td><button type="button" class="name-btn" data-open="${esc(row.slug)}">${mark}${esc(row.name)}<span class="slug">${esc(row.slug)}</span></button></td>
    <td>${esc(catName(row))}</td>
    <td class="num">${compactUsd(row.tvl_usd)}</td>
    <td class="num ${changeClass(row.change_7d)}">${changeText(row.change_7d)}</td>
    <td class="num">${row.age_days == null ? "—" : `${row.age_days}d`}</td>
    <td>${esc(chainText(row.chains))}</td>
    <td class="sample ${esc(String(row.confidence || "").toLowerCase())}">${esc(row.confidence || "—")}</td>
    <td class="implied">${compactUsd(row.implied_value_usd)}</td>
  </tr>`;
}

function viewSwitch() {
  const trades = state.view === "trades";
  return `<div class="views" role="tablist">
    <button type="button" data-view="board" aria-pressed="${trades ? "false" : "true"}">Pre-token board</button>
    <button type="button" data-view="trades" aria-pressed="${trades ? "true" : "false"}">Trading comparables</button>
  </div>`;
}

function stepBody(step) {
  const cut = step.indexOf(": ");
  if (cut < 0) return esc(step);
  return `<em>${esc(step.slice(0, cut))}</em>${esc(step.slice(cut + 2))}`;
}

function paintBoard() {
  const cats = [...new Set(data.rows.map(catName))].sort();
  const chains = [...new Set(data.rows.flatMap((row) => row.chains))].sort();
  const rows = visibleRows();
  main.innerHTML = `${viewSwitch()}<div class="filters">
      <label class="field">Search<input id="q" type="search" value="${esc(state.q)}" placeholder="Name or slug"></label>
      <label class="field">Category<select id="cat"><option value="">All</option>${options(cats)}</select></label>
      <label class="field">Chain<select id="chain"><option value="">All</option>${options(chains)}</select></label>
      <label class="check"><input id="watch" type="checkbox" ${state.watch ? "checked" : ""}> Watchlist only</label>
    </div>
    <p class="count" id="count">${rows.length} of ${data.rows.length} protocols with no token recorded. Rank 1 is the highest implied value. ${data.n_comps} trading tokens are comparables only.</p>
    <table>
      <thead><tr>
        ${headBtn("rank", "Rank", "right")}
        ${headBtn("name", "Protocol")}
        ${headBtn("category", "Category")}
        ${headBtn("tvl", "TVL", "right")}
        ${headBtn("change", "7d", "right")}
        ${headBtn("age", "Age", "right")}
        ${headBtn("chains", "Chains")}
        ${headBtn("confidence", "Confidence")}
        ${headBtn("implied", "Implied", "right")}
      </tr></thead>
      <tbody id="rows">${rows.map(rowHtml).join("") || `<tr><td colspan="9" class="empty">No protocol matches this filter.</td></tr>`}</tbody>
    </table>`;
  const cat = document.getElementById("cat");
  const chain = document.getElementById("chain");
  if (cat) cat.value = state.cat;
  if (chain) chain.value = state.chain;
}

function paintDetail(row) {
  const check = productUsd(row.tvl_usd, row.multiple_ppm, row.growth_ppm, row.age_ppm, row.chain_ppm);
  const dollars = partials(row);
  const extra = Math.max(0, row.chains.length - 1);
  const notes = [
    "starting TVL",
    row.multiple_kind === "category" ? `${catName(row)} median` : "global median",
    row.change_7d == null ? "7-day change unreported" : `${changeText(row.change_7d)} over 7 days`,
    row.age_days == null ? "listing date unreported" : `${row.age_days} days listed`,
    extra === 0 ? `${row.chains.length || 0} chain` : `${row.chains.length} chains, ${Math.min(12, extra)} extra counted`,
  ];
  const figures = [
    compactUsd(row.tvl_usd),
    ppmToDecimal(row.multiple_ppm),
    ppmToDecimal(row.growth_ppm),
    ppmToDecimal(row.age_ppm),
    ppmToDecimal(row.chain_ppm),
  ];
  const labels = ["TVL", "Category multiple", "Growth", "Age", "Chains"];
  const breakdown = labels.map((label, i) => `<tr>
      <td>${label}</td>
      <td class="num">${esc(figures[i])}</td>
      <td class="why">${esc(notes[i])}</td>
      <td class="num">${compactUsd(dollars[i])}</td>
    </tr>`).join("");
  const steps = row.farm_steps.map((step, i) => `<li><b>${i + 1}</b><span>${stepBody(step)}</span></li>`).join("");
  const watch = row.watchlist ? " · Watchlist" : "";
  const tone = esc(String(row.confidence || "").toLowerCase());
  main.innerHTML = `<article class="detail">
    <button type="button" class="back" data-back="1">Back to board</button>
    <p class="kicker">${esc(catName(row))}${watch} · rank ${row.rank}</p>
    <h2>${esc(row.name)}</h2>
    <p class="status">No token recorded</p><p class="badge ${tone}">${esc(confidenceText(row))}</p>
    <p class="big">${compactUsd(row.implied_value_usd)}<span>Implied value · productUsd $${group(check)}</span></p>
    <h3>Value breakdown</h3>
    <table class="break">
      <thead><tr><th>Factor</th><th class="right">Figure</th><th>Why</th><th class="right">Running</th></tr></thead>
      <tbody>${breakdown}</tbody>
    </table>
    <p class="note">${esc(kindText(row))}. productUsd multiplies TVL, the category multiple, growth, age and chains in integers. The last running value is the implied value.</p>
    <div class="meta">
      <div><span>TVL</span><strong>$${group(row.tvl_usd)}</strong></div>
      <div><span>7-day</span><strong class="${changeClass(row.change_7d)}">${changeText(row.change_7d)}</strong></div>
      <div><span>Listed</span><strong>${row.age_days == null ? "Unreported" : `${row.age_days} days`}</strong></div>
      <div><span>Chains</span><strong>${esc(row.chains.join(", ") || "—")}</strong></div>
      <div><span>Slug</span><strong>${esc(row.slug)}</strong></div>
    </div>
    <h3>Farm plan</h3>
    <ol class="steps">${steps}</ol>
    <p class="note">Costs are estimates from the chain and the ticket size. The plan does not predict that a token is issued. Implied value is this board's claim, not a market price.</p>
  </article>`;
}

function paintMultiples() {
  const host = document.getElementById("multiples");
  const line = document.getElementById("global-line");
  if (line) {
    line.textContent = `Global median ${ppmShort(data.global_ppm)} from ${data.n_comps} trading tokens. Ratios clamped from ${ppmShort(data.p10_ppm)} to ${ppmShort(data.p90_ppm)}. ${data.n_screened_out} no-token protocols were screened out as wrapped, bridged, staked, or exchange products.`;
  }
  const top = data.categories.filter((cat) => cat.n_rows > 0).sort((a, b) => b.n_rows - a.n_rows || (a.name < b.name ? -1 : 1)).slice(0, 8);
  if (host) {
    host.innerHTML = `<div class="mult">${top.map((cat) => `<span>${esc(cat.name)}</span><span>${ppmShort(cat.multiple_ppm)}</span><span class="muted">${cat.kind === "category" ? `${cat.n_comps} used` : `${cat.n_comps} thin`}</span>`).join("")}</div>`;
  }
}

function paintTrades() {
  const q = state.q.trim().toLowerCase();
  const rows = data.comps.filter((row) => {
    if (state.cat && (row.category || "Uncategorized") !== state.cat) return false;
    if (q && !`${row.name} ${row.slug} ${row.category || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const cats = [...new Set(data.comps.map((row) => row.category || "Uncategorized"))].sort();
  main.innerHTML = `${viewSwitch()}<div class="filters">
      <label class="field">Search<input id="q" type="search" value="${esc(state.q)}" placeholder="Name or slug"></label>
      <label class="field">Category<select id="cat"><option value="">All</option>${options(cats)}</select></label>
    </div>
    <p class="banner">These protocols already record a token. Their market cap ÷ TVL sets the multiples. They are not ranked.</p>
    <p class="count">${rows.length} of ${data.comps.length} trading comparables.</p>
    <table>
      <thead><tr><th>Protocol</th><th>Category</th><th class="right">TVL</th><th class="right">Market cap</th><th class="right">Mcap / TVL</th></tr></thead>
      <tbody>${rows.map((row) => `<tr>
        <td>${esc(row.name)}<span class="slug">${esc(row.slug)}</span></td>
        <td>${esc(row.category || "Uncategorized")}</td>
        <td class="num">${compactUsd(row.tvl_usd)}</td>
        <td class="num">${compactUsd(row.mcap_usd)}</td>
        <td class="num">${ppmShort(row.ratio_ppm)}</td>
      </tr>`).join("")}</tbody>
    </table>`;
  const cat = document.getElementById("cat");
  if (cat) cat.value = state.cat;
}

function paint() {
  if (!data) {
    main.innerHTML = `<p class="empty">Board data did not load beside this page.</p>`;
    return;
  }
  document.getElementById("asof").textContent = data.as_of;
  const covered = data.rows.filter((row) => row.watchlist).length;
  document.getElementById("cover").textContent = `${covered} of ${data.n_watchlist} watchlist slugs`;
  paintMultiples();
  if (state.view === "trades" && !state.p) {
    paintTrades();
    return;
  }
  if (state.p) {
    const row = data.rows.find((item) => item.slug === state.p);
    if (row) {
      paintDetail(row);
      return;
    }
  }
  paintBoard();
}

function onClick(event) {
  const view = event.target.closest("[data-view]");
  if (view) {
    state.view = view.getAttribute("data-view") === "trades" ? "trades" : "board";
    state.p = "";
    writeHash();
    paint();
    return;
  }
  const open = event.target.closest("[data-open]");
  if (open) {
    state.p = open.getAttribute("data-open") || "";
    writeHash();
    paint();
    return;
  }
  if (event.target.closest("[data-back]")) {
    state.p = "";
    writeHash();
    paint();
    return;
  }
  const sort = event.target.closest("[data-sort]");
  if (!sort) return;
  const key = sort.getAttribute("data-sort");
  if (state.sort === key) state.dir = state.dir === "asc" ? "desc" : "asc";
  else {
    state.sort = key;
    state.dir = key === "name" || key === "category" || key === "rank" ? "asc" : "desc";
  }
  writeHash();
  paint();
}

function onFilter(event) {
  const typing = event.target && event.target.id === "q";
  const caret = typing ? event.target.selectionStart : null;
  const q = document.getElementById("q");
  const cat = document.getElementById("cat");
  const chain = document.getElementById("chain");
  const watch = document.getElementById("watch");
  if (q) state.q = q.value;
  if (cat) state.cat = cat.value;
  if (chain) state.chain = chain.value;
  if (watch) state.watch = watch.checked;
  writeHash();
  if (state.view === "trades") paintTrades();
  else paintBoard();
  if (!typing) return;
  const again = document.getElementById("q");
  if (!again) return;
  again.focus();
  const pos = caret == null ? again.value.length : caret;
  again.setSelectionRange(pos, pos);
}

if (main) {
  main.addEventListener("click", onClick);
  main.addEventListener("input", onFilter);
  main.addEventListener("change", onFilter);
}
readHash();
paint();
