// Token Radar dashboard: board, live tokens, model and a sandbox. No network:
// the page reads window.RADAR from data.js and nothing else.
(function () {
  'use strict';

  var R = window.RADAR;
  var main = document.getElementById('main');
  var drawer = document.getElementById('drawer');
  var statsEl = document.getElementById('stats');
  var tabsEl = document.getElementById('tabs');

  if (!R || !Array.isArray(R.rows)) {
    main.innerHTML = '<p class="empty">No radar data. Run main.ts to write data.js.</p>';
    return;
  }

  var WATCH = R.floor_usd;

  /* ---------- small helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n) {
    if (n == null || !isFinite(n)) return '<span class="mut">—</span>';
    var v = n.toFixed(1) + '%';
    if (n > 0) return '<span class="up">+' + v + '</span>';
    if (n < 0) return '<span class="down">' + v + '</span>';
    return '<span class="mut">' + v + '</span>';
  }

  function ageText(days) {
    if (days == null) return '<span class="mut">unknown</span>';
    if (days >= 365) return (days / 365).toFixed(1) + ' y';
    return days + ' d';
  }

  function catName(c) {
    return c == null ? 'Uncategorised' : c;
  }

  /* ---------- state + hash ---------- */

  var state = {
    view: 'board',
    q: '',
    cat: 'all',
    chain: 'all',
    minTvl: 0,
    watchOnly: false,
    sort: 'rank',
    dir: 1,
    detail: null,
    sandbox: null, // {weight, floor, unknownAge} or null
  };

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    var p = new URLSearchParams(h);
    state.view = p.get('view') || 'board';
    state.q = p.get('q') || '';
    state.cat = p.get('cat') || 'all';
    state.chain = p.get('chain') || 'all';
    state.minTvl = Number(p.get('min') || 0) || 0;
    state.watchOnly = p.get('watch') === '1';
    state.detail = p.get('detail') || null;
    if (!['board', 'live', 'model'].includes(state.view)) state.view = 'board';
  }

  function writeHash() {
    var p = new URLSearchParams();
    if (state.view !== 'board') p.set('view', state.view);
    if (state.q) p.set('q', state.q);
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.minTvl) p.set('min', String(state.minTvl));
    if (state.watchOnly) p.set('watch', '1');
    if (state.detail) p.set('detail', state.detail);
    var h = p.toString();
    history.replaceState(null, '', h ? '#' + h : '#');
  }

  /* ---------- model (sandbox recompute) ---------- */

  function clampGrowth(g) {
    return Math.min(R.model.growth_cap, Math.max(R.model.growth_floor, g == null ? 0 : g));
  }

  function sandboxImplied(row, s) {
    var growth = clampGrowth(row.change_7d);
    var growthMult = 1 + (growth / 100) * s.weight;
    var age = row.age_days == null ? s.unknownAge : row.age_days;
    var maturity = s.floor + (Math.min(Math.max(age, 0), R.model.maturity_days) / R.model.maturity_days) * (1 - s.floor);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity));
  }

  function effectiveRows() {
    var rows = R.rows.map(function (r) {
      var eff = state.sandbox ? sandboxImplied(r, state.sandbox) : r.implied_value_usd;
      return { row: r, implied: eff };
    });
    if (state.sandbox) {
      rows.sort(function (a, b) {
        return b.implied - a.implied || (a.row.slug < b.row.slug ? -1 : 1);
      });
      rows.forEach(function (e, i) { e.rank = i + 1; });
    } else {
      rows.forEach(function (e) { e.rank = e.row.rank; });
    }
    return rows;
  }

  /* ---------- filtering + sorting ---------- */

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = effectiveRows().filter(function (e) {
      var r = e.row;
      if (state.watchOnly && r.tvl_usd < WATCH) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.cat !== 'all' && catName(r.category) !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var k = state.sort;
    var d = state.dir;
    rows.sort(function (a, b) {
      var x, y;
      if (k === 'rank') { x = a.rank; y = b.rank; }
      else if (k === 'name') { x = a.row.name.toLowerCase(); y = b.row.name.toLowerCase(); }
      else if (k === 'category') { x = catName(a.row.category); y = catName(b.row.category); }
      else if (k === 'tvl_usd') { x = a.row.tvl_usd; y = b.row.tvl_usd; }
      else if (k === 'change_7d') { x = a.row.change_7d == null ? -Infinity : a.row.change_7d; y = b.row.change_7d == null ? -Infinity : b.row.change_7d; }
      else if (k === 'age_days') { x = a.row.age_days == null ? -1 : a.row.age_days; y = b.row.age_days == null ? -1 : b.row.age_days; }
      else { x = a.implied; y = b.implied; }
      if (x < y) return -d;
      if (x > y) return d;
      return a.row.slug < b.row.slug ? -1 : 1;
    });
    return rows;
  }

  function uniqueLists() {
    var cats = {}, chains = {};
    R.rows.forEach(function (r) {
      cats[catName(r.category)] = true;
      r.chains.forEach(function (c) { chains[c] = true; });
    });
    return {
      cats: Object.keys(cats).sort(),
      chains: Object.keys(chains).sort(),
    };
  }

  /* ---------- rendering ---------- */

  function renderStats() {
    var b = R.backtest;
    statsEl.innerHTML =
      '<div class="stat"><b>' + R.board_size + '</b><span>protocols ranked</span></div>' +
      '<div class="stat"><b>' + R.watchlist_size + '</b><span>on the watchlist</span></div>' +
      '<div class="stat"><b>' + R.early_size + '</b><span>early finds</span></div>' +
      '<div class="stat"><b>' + b.within_2x_pct + '%</b><span>backtest within 2x</span></div>';
  }

  function sortHead(label, key, cls) {
    var arrow = state.sort === key ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    return '<th class="sortable ' + (cls || '') + '" data-sort="' + key + '">' + label + arrow + '</th>';
  }

  function rowHtml(e) {
    var r = e.row;
    var was = state.sandbox && e.rank !== r.rank ? ' <span class="mut">(was #' + r.rank + ')</span>' : '';
    return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="sel"' : '') + '>' +
      '<td class="rank">' + e.rank + was + '</td>' +
      '<td class="name"><b>' + esc(r.name) + '</b><small>' + esc(r.slug) + '</small></td>' +
      '<td>' + esc(catName(r.category)) + '</td>' +
      '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + ageText(r.age_days) + '</td>' +
      '<td class="num impl">' + money(e.implied) + '</td>' +
      '</tr>';
  }

  function renderBoard() {
    var lists = uniqueLists();
    var rows = filtered();
    var opts = function (list, cur, allLabel) {
      return '<option value="all"' + (cur === 'all' ? ' selected' : '') + '>' + allLabel + '</option>' +
        list.map(function (v) {
          return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(v) + '</option>';
        }).join('');
    };
    var mins = [[0, 'Any TVL'], [1e7, 'TVL ≥ $10M'], [5e7, 'TVL ≥ $50M'], [1e8, 'TVL ≥ $100M'], [5e8, 'TVL ≥ $500M'], [1e9, 'TVL ≥ $1B']];
    var minOpts = mins.map(function (m) {
      return '<option value="' + m[0] + '"' + (state.minTvl === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
    }).join('');
    main.innerHTML =
      '<p class="note">Every protocol below <b>records no token</b> in the DefiLlama snapshot of ' + esc(R.as_of) +
      ' and is not a wrapped, staked or bridged product of one that trades. Implied value is the model\u2019s claim, ' +
      'not a prediction of whether or when a token is issued. Click a row for its breakdown and farm plan.</p>' +
      (state.sandbox ? '<p class="note"><span class="pill hot">Sandbox active</span> Values below are recomputed with your constants, not the submitted board. <button type="button" class="btn" id="sb-reset">Reset</button></p>' : '') +
      '<div class="toolbar">' +
      '<input type="search" id="f-q" placeholder="Search name or slug" value="' + esc(state.q) + '" aria-label="Search">' +
      '<select id="f-cat" aria-label="Category">' + opts(lists.cats, state.cat, 'All categories') + '</select>' +
      '<select id="f-chain" aria-label="Chain">' + opts(lists.chains, state.chain, 'All chains') + '</select>' +
      '<select id="f-min" aria-label="Minimum TVL">' + minOpts + '</select>' +
      '<label class="check"><input type="checkbox" id="f-watch"' + (state.watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count">Showing ' + rows.length + ' of ' + R.board_size + '</span>' +
      '</div>' +
      '<div class="tablewrap"><table><thead><tr>' +
      sortHead('Rank', 'rank') + sortHead('Protocol', 'name') + sortHead('Category', 'category') +
      '<th>Chains</th>' + sortHead('TVL', 'tvl_usd', 'num') + sortHead('7d', 'change_7d', 'num') +
      sortHead('Age', 'age_days', 'num') + sortHead('Implied value', 'implied_value_usd', 'num') +
      '</tr></thead><tbody>' +
      (rows.length ? rows.map(rowHtml).join('') : '<tr><td colspan="8" class="empty">Nothing matches these filters.</td></tr>') +
      '</tbody></table></div>';

    document.getElementById('f-q').addEventListener('input', function (ev) {
      state.q = ev.target.value; state.detail = state.detail; writeHash(); renderBoardSoft();
    });
    document.getElementById('f-cat').addEventListener('change', function (ev) {
      state.cat = ev.target.value; writeHash(); render();
    });
    document.getElementById('f-chain').addEventListener('change', function (ev) {
      state.chain = ev.target.value; writeHash(); render();
    });
    document.getElementById('f-min').addEventListener('change', function (ev) {
      state.minTvl = Number(ev.target.value) || 0; writeHash(); render();
    });
    document.getElementById('f-watch').addEventListener('change', function (ev) {
      state.watchOnly = ev.target.checked; writeHash(); render();
    });
    var rb = document.getElementById('sb-reset');
    if (rb) rb.addEventListener('click', function () { state.sandbox = null; writeHash(); render(); });
  }

  // Re-render only the table body + count while typing, so the search box keeps focus.
  function renderBoardSoft() {
    var rows = filtered();
    var tb = main.querySelector('tbody');
    var count = main.querySelector('.count');
    if (tb) tb.innerHTML = rows.length ? rows.map(rowHtml).join('') : '<tr><td colspan="8" class="empty">Nothing matches these filters.</td></tr>';
    if (count) count.textContent = 'Showing ' + rows.length + ' of ' + R.board_size;
  }

  function renderLive() {
    main.innerHTML =
      '<p class="note">These protocols <b>already have a token that trades</b>. The board shows the market\u2019s own ' +
      'value for them — their market cap — never a model\u2019s claim. They are also the comps the model is fitted on.</p>' +
      '<div class="tablewrap"><table><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>' +
      R.live.map(function (p) {
        return '<tr data-slug="' + esc(p.slug) + '">' +
          '<td class="name"><b>' + esc(p.name) + '</b><small>' + esc(p.slug) + '</small></td>' +
          '<td>' + esc(catName(p.category)) + '</td>' +
          '<td>' + esc(p.chains.slice(0, 2).join(', ')) + (p.chains.length > 2 ? ' +' + (p.chains.length - 2) : '') + '</td>' +
          '<td class="num">' + money(p.tvl_usd) + '</td>' +
          '<td class="num impl">' + money(p.mcap_usd) + '</td>' +
          '<td class="num">' + pct(p.change_7d) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderModel() {
    var m = R.model;
    var b = R.backtest;
    var multRows = R.multiples.map(function (x) {
      return '<tr><td>' + esc(x.category) + '</td><td class="num">' + x.comps + '</td><td class="num">' + x.multiple.toFixed(3) + 'x</td></tr>';
    }).join('');
    var sb = state.sandbox || { weight: m.growth_weight, floor: m.maturity_floor, unknownAge: m.unknown_age_days };
    main.innerHTML =
      '<div class="grid2"><div>' +
      '<div class="card"><h3>How the value is worked out</h3>' +
      '<div class="formula">implied = TVL x category multiple\n        x (1 + clamp(7d change, -60, 120)% x growth weight)\n        x (0.4 + min(age, 1460d) / 1460 x 0.6)</div>' +
      '<p>The <b>category multiple</b> is the median market-cap-to-TVL ratio of the live-token protocols in the ' +
      'same category (at least ' + m.min_category_comps + ' comps), shrunk toward the global median of <b>' + R.global_multiple.toFixed(3) + 'x</b> ' +
      'as (n x category + ' + m.shrink_k + ' x global) / (n + ' + m.shrink_k + '); with too few comps the global median is used alone. ' +
      'Nothing is fitted to a name: the same function scores every row.</p>' +
      '<p>Growth is the protocol\u2019s own 7-day TVL change, clamped so one hot week cannot dominate, counted at full weight. ' +
      'Maturity rises with how long the protocol has run with no token, from 0.4 to 1.0 over four years; ' +
      'a protocol with no listing date is treated as ' + m.unknown_age_days + ' days old.</p></div>' +
      '<div class="card"><h3>Validation, computed from the snapshot</h3>' +
      '<p>Leave-one-out over the <b>' + b.live_count + '</b> live-token protocols: each one\u2019s market cap predicted ' +
      'from its peers\u2019 multiple with the same formula. Median absolute error <b>' + b.median_abs_error_pct + '%</b>; ' +
      '<b>' + b.within_2x_pct + '%</b> predicted within 2x. A comps multiple is a rough guide, not a price — ' +
      'the board says so on every row.</p></div>' +
      '</div><div>' +
      '<div class="card"><h3>Try the model yourself</h3>' +
      '<p>Move a slider and the board re-ranks with your constants. This changes only this page, never the submitted board.</p>' +
      '<div class="slider-row"><label for="sb-weight">Growth weight</label><input type="range" id="sb-weight" min="0" max="1" step="0.05" value="' + sb.weight + '"><output id="sb-weight-v">' + sb.weight.toFixed(2) + '</output></div>' +
      '<div class="slider-row"><label for="sb-floor">Maturity floor</label><input type="range" id="sb-floor" min="0.4" max="0.8" step="0.05" value="' + sb.floor + '"><output id="sb-floor-v">' + sb.floor.toFixed(2) + '</output></div>' +
      '<div class="slider-row"><label for="sb-age">Unknown age (days)</label><input type="range" id="sb-age" min="0" max="1095" step="15" value="' + sb.unknownAge + '"><output id="sb-age-v">' + sb.unknownAge + '</output></div>' +
      '<p><button type="button" class="btn primary" id="sb-apply">Re-rank the board</button> ' +
      '<button type="button" class="btn" id="sb-clear">Reset</button></p>' +
      (state.sandbox ? '<p class="mini">Sandbox active: growth weight ' + state.sandbox.weight.toFixed(2) +
        ', maturity floor ' + state.sandbox.floor.toFixed(2) + ', unknown age ' + state.sandbox.unknownAge + ' days.</p>' : '') +
      '</div>' +
      '<div class="card"><h3>Category multiples</h3>' +
      '<div class="tablewrap"><table><thead><tr><th>Category</th><th class="num">Comps</th><th class="num">Multiple</th></tr></thead>' +
      '<tbody>' + multRows + '</tbody></table></div>' +
      '<p class="mini">Raw median market-cap-to-TVL among live-token protocols, per category — the fitted multiple starts here and is then shrunk toward the global median. Categories with fewer than ' +
      m.min_category_comps + ' comps use the global median alone.</p></div>' +
      '</div></div>';

    var apply = document.getElementById('sb-apply');
    apply.addEventListener('click', function () {
      state.sandbox = {
        weight: Number(document.getElementById('sb-weight').value),
        floor: Number(document.getElementById('sb-floor').value),
        unknownAge: Number(document.getElementById('sb-age').value),
      };
      state.view = 'board'; state.sort = 'rank'; state.dir = 1; writeHash(); render();
    });
    document.getElementById('sb-clear').addEventListener('click', function () {
      state.sandbox = null; render();
    });
    [['sb-weight', 'sb-weight-v', function (v) { return Number(v).toFixed(2); }],
     ['sb-floor', 'sb-floor-v', function (v) { return Number(v).toFixed(2); }],
     ['sb-age', 'sb-age-v', function (v) { return String(v); }]].forEach(function (t) {
      document.getElementById(t[0]).addEventListener('input', function (ev) {
        document.getElementById(t[1]).textContent = t[2](ev.target.value);
      });
    });
  }

  /* ---------- detail drawer ---------- */

  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) { r = R.rows[i]; break; }
    if (!r) { closeDetail(); return; }
    state.detail = slug;
    var eff = state.sandbox ? sandboxImplied(r, state.sandbox) : r.implied_value_usd;
    var base = Math.round(r.tvl_usd * r.category_multiple);
    var growthPct = clampGrowth(r.change_7d);
    var age = r.age_days == null ? R.model.unknown_age_days : r.age_days;
    var maturity = R.model.maturity_floor + (Math.min(Math.max(age, 0), R.model.maturity_days) / R.model.maturity_days) * R.model.maturity_range;
    var multipleLabel = 'Category multiple (' + esc(catName(r.category)) + ', ' + r.category_comps + (r.category_comps === 1 ? ' comp' : ' comps') + ', shrunk toward global)';
    if (r.category_comps < R.model.min_category_comps) {
      multipleLabel = 'Multiple: global median (' + esc(catName(r.category)) + ' has only ' + r.category_comps + (r.category_comps === 1 ? ' live comp' : ' live comps') + ')';
    }
    drawer.innerHTML =
      '<button type="button" class="close" id="d-close">Close</button>' +
      '<p class="pill">Rank #' + r.rank + (state.sandbox ? ' (submitted board)' : '') + ' · ' + (r.tvl_usd >= WATCH ? 'Watchlist' : 'Early find') + '</p>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="sub">' + esc(r.slug) + ' · ' + esc(catName(r.category)) + ' · ' + esc(r.chains.join(', ')) + '</p>' +
      '<div class="kv">' +
      '<div><b>' + money(eff) + '</b><span>implied value</span></div>' +
      '<div><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b>' + pct(r.change_7d) + '</b><span>TVL change, 7 days</span></div>' +
      '<div><b>' + ageText(r.age_days) + '</b><span>running with no token</span></div>' +
      '</div>' +
      '<h3>How the value is built</h3>' +
      '<table class="breakdown"><tbody>' +
      '<tr><td>TVL</td><td>' + money(r.tvl_usd) + '</td></tr>' +
      '<tr><td>' + multipleLabel + '</td><td>' + r.category_multiple.toFixed(3) + 'x</td></tr>' +
      '<tr><td>Base value (TVL x multiple)</td><td>' + money(base) + '</td></tr>' +
      '<tr><td>Growth multiplier (' + growthPct.toFixed(1) + '% over 7 days)</td><td>' + r.growth_multiplier.toFixed(3) + 'x</td></tr>' +
      '<tr><td>Maturity multiplier (' + age + ' days)</td><td>' + maturity.toFixed(3) + 'x</td></tr>' +
      '<tr><td><b>Implied value</b></td><td><b>' + money(eff) + '</b></td></tr>' +
      '</tbody></table>' +
      '<p class="mini">Implied value is the model\u2019s claim from the snapshot of ' + esc(R.as_of) +
      '. It does not predict whether or when ' + esc(r.name) + ' issues a token.</p>' +
      '<h3>Farm plan</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    drawer.hidden = false;
    document.getElementById('d-close').addEventListener('click', function () {
      state.detail = null; writeHash(); render();
    });
  }

  function closeDetail() {
    state.detail = null;
    drawer.hidden = true;
    drawer.innerHTML = '';
  }

  /* ---------- render root ---------- */

  function render() {
    tabsEl.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === state.view);
    });
    renderStats();
    if (state.view === 'live') renderLive();
    else if (state.view === 'model') renderModel();
    else renderBoard();
    if (state.detail) openDetail(state.detail);
    else closeDetail();
  }

  tabsEl.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-view]');
    if (!b) return;
    state.view = b.getAttribute('data-view');
    state.sort = 'rank'; state.dir = 1;
    writeHash(); render();
  });

  main.addEventListener('click', function (ev) {
    var th = ev.target.closest('th.sortable');
    if (th) {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === 'name' || k === 'category' ? 1 : -1; }
      render();
      return;
    }
    var tr = ev.target.closest('tr[data-slug]');
    if (tr) {
      var slug = tr.getAttribute('data-slug');
      if (state.detail === slug) { state.detail = null; writeHash(); render(); }
      else { state.detail = slug; writeHash(); render(); }
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && state.detail) { state.detail = null; writeHash(); render(); }
  });

  window.addEventListener('hashchange', function () {
    readHash(); render();
  });

  readHash();
  render();
})();
