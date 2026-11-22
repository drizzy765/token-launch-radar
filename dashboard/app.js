(function () {
  'use strict';
  var radar = window.RADAR;
  if (!radar || !Array.isArray(radar.rows)) {
    document.getElementById('headline').textContent = 'No radar data. Run main.ts so data.js is written beside dashboard/.';
    return;
  }

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + String(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var s = (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
    return s;
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.getElementById('headline').textContent =
    radar.model_blurb ||
    'Pre-token protocols ranked by implied launch FDV from sealed DefiLlama figures.';
  document.getElementById('meta').innerHTML =
    'as of <strong style="color:#e8eef7">' +
    esc(radar.as_of) +
    '</strong><br/>' +
    esc(String(radar.board_size)) +
    ' ranked · ' +
    esc(String(radar.watchlist_size)) +
    ' watchlist · ' +
    esc(String(radar.early_size)) +
    ' early<br/>model ' +
    esc(radar.model_version);

  var comps = (radar.category_comps || [])
    .slice(0, 6)
    .map(function (c) {
      return esc(c.category) + ' ×' + c.median_fdv_tvl + ' (n=' + c.sample + ')';
    })
    .join(' · ');
  document.getElementById('modelBar').innerHTML =
    '<strong>Value model ' +
    esc(radar.model_version) +
    ':</strong> soft-log TVL × category median FDV/TVL × growth × longevity × chain breadth. Live comps: ' +
    (comps || 'default multiple') +
    '.';

  var cats = {};
  var chains = {};
  radar.rows.forEach(function (r) {
    if (r.category) cats[r.category] = (cats[r.category] || 0) + 1;
    (r.chains || []).forEach(function (c) {
      chains[c] = (chains[c] || 0) + 1;
    });
  });
  var catSel = document.getElementById('cat');
  Object.keys(cats)
    .sort()
    .forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = c + ' (' + cats[c] + ')';
      catSel.appendChild(o);
    });
  var chainSel = document.getElementById('chain');
  Object.keys(chains)
    .sort(function (a, b) {
      return chains[b] - chains[a] || (a < b ? -1 : 1);
    })
    .forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = c + ' (' + chains[c] + ')';
      chainSel.appendChild(o);
    });

  var state = { q: '', cat: '', chain: '', watchOnly: false, minTvl: 0, sort: 'rank', active: null };
  var tbody = document.getElementById('tbody');
  var detail = document.getElementById('detail');

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = radar.rows.filter(function (r) {
      if (state.watchOnly && !r.on_watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) {
      if (state.sort === 'tvl') return b.tvl_usd - a.tvl_usd || a.rank - b.rank;
      if (state.sort === 'growth') return (b.change_7d || -999) - (a.change_7d || -999) || a.rank - b.rank;
      if (state.sort === 'multiple') return b.category_multiple - a.category_multiple || a.rank - b.rank;
      if (state.sort === 'age') return (b.age_days || 0) - (a.age_days || 0) || a.rank - b.rank;
      return a.rank - b.rank;
    });
    return rows;
  }

  function why(r) {
    return (
      '×' +
      r.category_multiple.toFixed(2) +
      ' cat · g ' +
      r.growth_multiplier.toFixed(2) +
      ' · age ' +
      r.longevity_multiplier.toFixed(2) +
      ' · ch ' +
      r.chain_multiplier.toFixed(2)
    );
  }

  function renderDetail(r) {
    if (!r) {
      detail.innerHTML = '<p class="empty">Select a protocol to see the model breakdown and farm plan.</p>';
      return;
    }
    var chips = (r.chains || [])
      .map(function (c) {
        return '<span class="chainchip">' + esc(c) + '</span>';
      })
      .join('');
    var steps = (r.farm_steps || [])
      .map(function (s) {
        return '<li>' + esc(s) + '</li>';
      })
      .join('');
    detail.innerHTML =
      '<h2>Detail</h2>' +
      '<p class="title">' +
      esc(r.name) +
      (r.on_watchlist ? ' <span class="pill watch">watchlist</span>' : '') +
      '</p>' +
      '<p class="slugline">' +
      esc(r.slug) +
      ' · rank #' +
      r.rank +
      '</p>' +
      '<div class="chains">' +
      chips +
      '</div>' +
      '<div class="statgrid">' +
      '<div class="stat"><span class="k">Implied FDV</span><span class="v">' +
      money(r.implied_value_usd) +
      '</span></div>' +
      '<div class="stat"><span class="k">TVL</span><span class="v">' +
      money(r.tvl_usd) +
      '</span></div>' +
      '<div class="stat"><span class="k">7d change</span><span class="v">' +
      pct(r.change_7d) +
      '</span></div>' +
      '<div class="stat"><span class="k">Age (days)</span><span class="v">' +
      (r.age_days === null || r.age_days === undefined ? '—' : r.age_days) +
      '</span></div>' +
      '</div>' +
      '<h2>Why this rank</h2>' +
      '<ul class="breakdown">' +
      '<li><span class="k">Size score (soft-log TVL)</span><span class="v">' +
      money(r.size_score) +
      '</span></li>' +
      '<li><span class="k">Category FDV/TVL multiple</span><span class="v">×' +
      r.category_multiple.toFixed(3) +
      '</span></li>' +
      '<li><span class="k">Growth multiplier</span><span class="v">×' +
      r.growth_multiplier.toFixed(3) +
      '</span></li>' +
      '<li><span class="k">Longevity multiplier</span><span class="v">×' +
      r.longevity_multiplier.toFixed(3) +
      '</span></li>' +
      '<li><span class="k">Chain breadth</span><span class="v">×' +
      r.chain_multiplier.toFixed(3) +
      '</span></li>' +
      '<li><span class="k">Category</span><span class="v">' +
      esc(r.category || '—') +
      '</span></li>' +
      '</ul>' +
      '<h2>Farm plan</h2>' +
      '<ol class="farm">' +
      steps +
      '</ol>';
  }

  function render() {
    var rows = filtered();
    document.getElementById('count').textContent = rows.length + ' of ' + radar.rows.length + ' protocols shown';
    tbody.innerHTML = rows
      .map(function (r) {
        var g = r.change_7d;
        var gClass = g === null || g === undefined ? '' : g >= 0 ? 'up' : 'down';
        return (
          '<tr data-slug="' +
          esc(r.slug) +
          '"' +
          (state.active === r.slug ? ' class="active"' : '') +
          '>' +
          '<td class="num">' +
          r.rank +
          '</td>' +
          '<td><span class="name">' +
          esc(r.name) +
          '</span>' +
          (r.on_watchlist ? ' <span class="pill watch">WL</span>' : '') +
          '<span class="slug">' +
          esc(r.slug) +
          '</span></td>' +
          '<td><span class="pill">' +
          esc(r.category || '—') +
          '</span></td>' +
          '<td class="num">' +
          money(r.tvl_usd) +
          '</td>' +
          '<td class="num ' +
          gClass +
          '">' +
          pct(g) +
          '</td>' +
          '<td class="num">' +
          money(r.implied_value_usd) +
          '</td>' +
          '<td class="why">' +
          esc(why(r)) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    if (state.active) {
      var hit = radar.rows.find(function (r) {
        return r.slug === state.active;
      });
      renderDetail(hit);
    }
  }

  tbody.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    state.active = tr.getAttribute('data-slug');
    render();
  });

  document.getElementById('q').addEventListener('input', function (e) {
    state.q = e.target.value;
    render();
  });
  document.getElementById('cat').addEventListener('change', function (e) {
    state.cat = e.target.value;
    render();
  });
  document.getElementById('chain').addEventListener('change', function (e) {
    state.chain = e.target.value;
    render();
  });
  document.getElementById('watchOnly').addEventListener('change', function (e) {
    state.watchOnly = !!e.target.checked;
    render();
  });
  document.getElementById('minTvl').addEventListener('input', function (e) {
    state.minTvl = Number(e.target.value) || 0;
    render();
  });
  document.getElementById('sort').addEventListener('change', function (e) {
    state.sort = e.target.value;
    render();
  });
  document.getElementById('reset').addEventListener('click', function () {
    state = { q: '', cat: '', chain: '', watchOnly: false, minTvl: 0, sort: 'rank', active: state.active };
    document.getElementById('q').value = '';
    document.getElementById('cat').value = '';
    document.getElementById('chain').value = '';
    document.getElementById('watchOnly').checked = false;
    document.getElementById('minTvl').value = '0';
    document.getElementById('sort').value = 'rank';
    render();
  });

  // Default selection: top row for the detail screenshot.
  state.active = radar.rows[0] ? radar.rows[0].slug : null;
  render();
})();
