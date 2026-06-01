/* ===== Bellamare Development Tracker — Core App Logic ===== */

/* ---------- Data Constants ---------- */

const primaryConstraints = [
  "Site Control", "Zoning / Entitlements", "Financial Feasibility",
  "Construction Cost Certainty", "Capital Stack / Financing",
  "Partner / Sponsor Alignment", "Market Demand / Absorption",
  "Government / Incentives", "Execution Capacity", "None \u2013 Execution Only"
];

const gateLibrary = {
  "Site Control": [
    "Executed PSA or ground lease",
    "Seller price accepted in writing",
    "LOI executed with DD + extensions"
  ],
  "Zoning / Entitlements": [
    "Zoning opinion letter issued",
    "Rezoning application accepted",
    "Rezoning approved (final vote)"
  ],
  "Financial Feasibility": [
    "Pro forma hits target IRR",
    "Density increased to X units",
    "Construction cost \u2264 $/SF target"
  ],
  "Construction Cost Certainty": [
    "ROM budget within \u00b110%",
    "Site/civil costs confirmed"
  ],
  "Capital Stack / Financing": [
    "Lender term sheet issued",
    "Equity soft-circ \u2265 70%"
  ],
  "Partner / Sponsor Alignment": [
    "JV term sheet executed"
  ],
  "Market Demand / Absorption": [
    "Anchor tenant LOI executed"
  ],
  "Government / Incentives": [
    "TIF approval letter issued",
    "Land approval",
    "Bonds and Grants approved"
  ],
  "Execution Capacity": [
    "PM assigned + schedule approved"
  ],
  "None \u2013 Execution Only": [
    "Certificate of Occupancy"
  ]
};

const stages = [
  "0 \u2014 Triage / Intake",
  "1 \u2014 Concept & Feasibility",
  "2 \u2014 Pre-Development",
  "3 \u2014 Capitalization & Entitlements",
  "4 \u2014 Ready to Build / Construction"
];

const statuses = [
  "Due Diligence", "Design \u2013 Schematic", "Pre-Development",
  "Under Construction", "Negotiations", "Fee-based / 3rd Party", "Completed", "Blank / Unclear"
];

const decisions = ["Not set", "Advance", "Hold", "Kill"];

/* ---------- Global State ---------- */

window._projects = [];
window.__suspendSort = false;
let _locked = false;
const LOCK_CODE = "BELLAMARE";
const DELETE_PIN = "1103";
let nextIdCounter = 1;

/* ---------- Utility Functions ---------- */

function escText(s) {
  var d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function avgScore(s) {
  var v = Object.values(s || {}).map(function (x) {
    var n = Number(x);
    return Number.isFinite(n) ? n : 0;
  });
  if (!v.length) return "0.00";
  return (v.reduce(function (a, b) { return a + b; }, 0) / v.length).toFixed(2);
}

function scoreClass(v) {
  var n = Number(v);
  if (n >= 3.2) return "score-green";
  if (n >= 2.4) return "score-blue";
  if (n >= 1.6) return "score-yellow";
  return "score-red";
}

// Parse a free-text cash amount ("200K", "$5M", "$24,000,000", "2-3M") into a number.
// For a range (e.g. "2-3M") the higher end is used. Returns 0 if unparseable.
function parseAmount(raw) {
  if (!raw) return 0;
  var s = String(raw).toLowerCase().replace(/[$,\s]/g, "").replace(/[–—]/g, "-").replace(/to/g, "-");
  if (!s) return 0;

  function one(t) {
    var m = t.match(/(\d*\.?\d+)\s*(k|thousand|mm|mil|million|m|billion|b)?/);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return 0;
    var unit = m[2] || "";
    if (unit === "k" || unit === "thousand") n *= 1e3;
    else if (unit === "b" || unit === "billion") n *= 1e9;
    else if (unit) n *= 1e6; // m, mm, mil, million
    return n;
  }

  var parts = s.split("-").filter(Boolean);
  if (parts.length >= 2) {
    // Range: if only the last part carries the unit (e.g. "2-3m"), borrow it for the first
    var unitMatch = parts[parts.length - 1].match(/(k|thousand|mm|mil|million|m|billion|b)$/);
    var vals = parts.map(function (pt) {
      if (unitMatch && !/[a-z]$/.test(pt)) pt += unitMatch[1];
      return one(pt);
    });
    return Math.max.apply(null, vals); // use the higher end of a range
  }
  return one(s);
}

// Format a number as compact currency: $25.5M, $800K, $100
function fmtMoney(n) {
  if (!n || n <= 0) return "$0";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + "M";
  if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
  return "$" + Math.round(n);
}

function todayISO() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  var t = new Date(todayISO() + "T00:00:00");
  var d = new Date(dateStr + "T00:00:00");
  return Math.round((d - t) / (1000 * 60 * 60 * 24));
}

function normalize(str) { return (str || "").toLowerCase(); }

// Update just the score pill on a card without full re-render
function updateScorePill(pid, ri) {
  var p = window._projects[ri];
  if (!p) return;
  var avg = avgScore(p.scores);
  var card = document.querySelector('.card[data-pid="' + pid + '"]');
  if (!card) return;
  var pill = card.querySelector(".scorePill");
  if (pill) {
    pill.textContent = avg;
    pill.className = "scorePill " + scoreClass(avg);
  }
}

/* ---------- Capital / Financials ---------- */

function _emptyFin() {
  return { tpc: "", softCost: "", softCostCash: "", sources: [] };
}

// Per-project capital rollup (parsed numbers)
function projCapital(p) {
  var f = (p && p.fin) || {};
  var debt = 0, equity = 0;
  (f.sources || []).forEach(function (s) {
    var a = parseAmount(s && s.amount);
    if ((s && s.type ? String(s.type) : "").toLowerCase() === "equity") equity += a;
    else debt += a;
  });
  var tpc = parseAmount(f.tpc);
  return {
    tpc: tpc,
    soft: parseAmount(f.softCost),
    softCash: parseAmount(f.softCostCash),
    debt: debt,
    equity: equity,
    stack: debt + equity,
    gap: tpc - (debt + equity)
  };
}

// Projects counted in the top-of-page totals: everything live (exclude Archive + Kill)
function capitalScope() {
  return (window._projects || []).filter(function (p) {
    return (p.bucket || "pipeline") !== "archived" && p.decision !== "Kill";
  });
}

function computeCapitalTotals(list) {
  var t = { tpc: 0, soft: 0, softCash: 0, debt: 0, equity: 0, count: 0 };
  (list || []).forEach(function (p) {
    var c = projCapital(p);
    t.tpc += c.tpc; t.soft += c.soft; t.softCash += c.softCash;
    t.debt += c.debt; t.equity += c.equity;
    if (c.tpc || c.stack || c.soft || c.softCash) t.count += 1;
  });
  return t;
}

function renderCapStrip(list) {
  var el = document.getElementById("capStrip");
  if (!el) return;
  var t = computeCapitalTotals(list);
  var stack = t.debt + t.equity;
  var gap = t.tpc - stack;
  var gapTxt, gapCls;
  if (!t.tpc) { gapTxt = "Add Total Project Cost on each deal to track funding coverage"; gapCls = ""; }
  else if (Math.abs(gap) < 1) { gapTxt = "Capital sources fully cover total project cost"; gapCls = "finOk"; }
  else if (gap > 0) { gapTxt = fmtMoney(gap) + " still to be sourced (sources " + fmtMoney(stack) + " of " + fmtMoney(t.tpc) + ")"; gapCls = "finGap"; }
  else { gapTxt = fmtMoney(-gap) + " over-capitalized (sources " + fmtMoney(stack) + " vs " + fmtMoney(t.tpc) + ")"; gapCls = "finOver"; }

  var sub = "Across " + t.count + " project" + (t.count === 1 ? "" : "s");

  el.innerHTML =
    '<div class="kpis">' +
      '<div class="kpi kpi-tpc">' +
        '<div class="kpiLabel">Total Project Cost</div>' +
        '<div class="kpiValue">' + fmtMoney(t.tpc) + '</div>' +
        '<div class="kpiSub">' + sub + '</div>' +
      '</div>' +
      '<div class="kpi">' +
        '<div class="kpiLabel">Soft Cost Budget</div>' +
        '<div class="kpiValue">' + fmtMoney(t.soft) + '</div>' +
        '<div class="kpiSub">Total soft costs</div>' +
      '</div>' +
      '<div class="kpi kpi-cash">' +
        '<div class="kpiLabel">Cash Needed \u2014 Soft Costs</div>' +
        '<div class="kpiValue">' + fmtMoney(t.softCash) + '</div>' +
        '<div class="kpiSub">Near-term cash</div>' +
      '</div>' +
      '<div class="kpi">' +
        '<div class="kpiLabel">Total Debt</div>' +
        '<div class="kpiValue">' + fmtMoney(t.debt) + '</div>' +
        '<div class="kpiSub">Loans / TIF / other</div>' +
      '</div>' +
      '<div class="kpi kpi-capital">' +
        '<div class="kpiLabel">Equity to Raise</div>' +
        '<div class="kpiValue">' + fmtMoney(t.equity) + '</div>' +
        '<div class="kpiSub">LP / QOZ / GP</div>' +
      '</div>' +
    '</div>' +
    '<div class="capNote">' + (gapCls ? '<span class="' + gapCls + '">' + gapTxt + '</span>' : gapTxt) + '</div>';
}

function updateCapStrip() {
  renderCapStrip(capitalScope());
}

// Compact capital line shown on every card (collapsed + expanded)
function renderCapLine(p) {
  var c = projCapital(p);
  if (!(c.tpc || c.debt || c.equity || c.soft || c.softCash)) return "";
  var parts = [];
  if (c.tpc) parts.push('<span><b>TPC</b> ' + fmtMoney(c.tpc) + '</span>');
  if (c.debt) parts.push('<span><b>Debt</b> ' + fmtMoney(c.debt) + '</span>');
  if (c.equity) parts.push('<span><b>Equity</b> ' + fmtMoney(c.equity) + '</span>');
  if (c.softCash) parts.push('<span><b>Soft-cost cash</b> ' + fmtMoney(c.softCash) + '</span>');
  return '<div class="capLine">' + parts.join("") + '</div>';
}

function _finReconText(p) {
  var c = projCapital(p);
  if (!c.tpc && !c.stack) return "Enter Total Project Cost and capital sources to see the funding check.";
  var gap = c.gap;
  var cls = Math.abs(gap) < 1 ? "finOk" : (gap > 0 ? "finGap" : "finOver");
  var label = Math.abs(gap) < 1
    ? "Fully capitalized"
    : (gap > 0 ? fmtMoney(gap) + " left to source" : fmtMoney(-gap) + " over-capitalized");
  return "Sources " + fmtMoney(c.stack) + " vs TPC " + fmtMoney(c.tpc) +
    ' \u2014 <span class="' + cls + '">' + label + "</span>";
}

function updateFinRecon(ri) {
  var p = window._projects[ri];
  if (!p) return;
  var el = document.querySelector('.finRecon[data-pid="' + escAttr(p.id) + '"]');
  if (el) el.innerHTML = _finReconText(p);
}

function setFin(ri, key, val) {
  var p = window._projects[ri];
  if (!p) return;
  if (!p.fin) p.fin = _emptyFin();
  p.fin[key] = val;
  updateCapStrip();
  updateFinRecon(ri);
  debouncedSave(p);
}

function addFinSource(ri) {
  var p = window._projects[ri];
  if (!p) return;
  if (!p.fin) p.fin = _emptyFin();
  if (!p.fin.sources) p.fin.sources = [];
  p.fin.sources.push({ label: "", type: "Debt", amount: "" });
  debouncedSave(p);
  render();
}

function removeFinSource(ri, idx) {
  var p = window._projects[ri];
  if (!p || !p.fin || !p.fin.sources) return;
  p.fin.sources.splice(idx, 1);
  debouncedSave(p);
  render();
}

function updateFinSource(ri, idx, key, val) {
  var p = window._projects[ri];
  if (!p || !p.fin || !p.fin.sources || !p.fin.sources[idx]) return;
  p.fin.sources[idx][key] = val;
  updateCapStrip();
  updateFinRecon(ri);
  debouncedSave(p);
}

function _finField(label, val, ri, key, ph) {
  return '<div class="field"><div class="label">' + label + '</div>' +
    '<input type="text" value="' + escAttr(val || "") + '" placeholder="' + ph + '" ' +
    'oninput="setFin(' + ri + ',\'' + key + '\',this.value)"/></div>';
}

function renderCapitalSection(p, ri) {
  var f = p.fin || {};
  var sources = f.sources || [];
  var sourcesHtml = "";
  if (sources.length === 0) {
    sourcesHtml = '<div style="font-size:12px;color:var(--muted);padding:4px 0 8px">No capital sources yet. Add the loan, TIF, LP/QOZ equity, etc.</div>';
  } else {
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      var isEq = (s.type ? String(s.type) : "").toLowerCase() === "equity";
      sourcesHtml +=
        '<div class="finSourceRow">' +
          '<input type="text" class="finSrcLabel" value="' + escAttr(s.label || "") + '" placeholder="Source (e.g. Senior Loan, TIF, LP Equity, QOZ Equity)" ' +
            'oninput="updateFinSource(' + ri + ',' + i + ',\'label\',this.value)"/>' +
          '<select class="finSrcType" onchange="updateFinSource(' + ri + ',' + i + ',\'type\',this.value)">' +
            '<option' + (!isEq ? ' selected' : '') + '>Debt</option>' +
            '<option' + (isEq ? ' selected' : '') + '>Equity</option>' +
          '</select>' +
          '<input type="text" class="finSrcAmt" value="' + escAttr(s.amount || "") + '" placeholder="$ amount" ' +
            'oninput="updateFinSource(' + ri + ',' + i + ',\'amount\',this.value)"/>' +
          '<button class="deleteBtn" title="Remove source" onclick="removeFinSource(' + ri + ',' + i + ')">\u00d7</button>' +
        '</div>';
    }
  }

  return (
    '<div class="capSection">' +
      '<div class="capSectionHead">Capital Structure</div>' +
      '<div class="threeCol">' +
        _finField("Total Project Cost", f.tpc, ri, "tpc", "$6.1M") +
        _finField("Soft Cost Budget", f.softCost, ri, "softCost", "$150K") +
        _finField("Cash Needed (Soft Costs)", f.softCostCash, ri, "softCostCash", "$50K") +
      '</div>' +
      '<div class="finSources">' +
        '<div class="finSourcesHead">' +
          '<span class="label" style="margin:0">Capital Sources</span>' +
          '<button class="btn-small btn-primary" onclick="addFinSource(' + ri + ')">+ Add Source</button>' +
        '</div>' +
        sourcesHtml +
      '</div>' +
      '<div class="finRecon" data-pid="' + escAttr(p.id) + '">' + _finReconText(p) + '</div>' +
    '</div>'
  );
}

// Visible (filtered) project set — shared by render() and live updates
function getVisibleProjects() {
  var projects = window._projects;
  var searchQuery = (document.getElementById("searchBox") || {}).value || "";
  var base = filterProjects(projects);
  var filtered = applyReviewFilter(base);
  return searchQuery.trim() ? filtered : applyBucketFilter(filtered);
}

/* ---------- ID Generation ---------- */

function _newId() {
  var id = "BM-" + String(nextIdCounter).padStart(4, "0");
  nextIdCounter += 1;
  return id;
}

function _ensureIds() {
  var maxN = 0;
  for (var i = 0; i < window._projects.length; i++) {
    var id = String(window._projects[i].id || "");
    var m = id.match(/^BM-(\d+)$/);
    if (m) {
      var n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  nextIdCounter = maxN + 1;
  for (var j = 0; j < window._projects.length; j++) {
    if (!window._projects[j].id) {
      window._projects[j].id = _newId();
    }
  }
}

/* ---------- Owner Input Handlers ---------- */

function ownerInput(ri, value, el) {
  var v = value || "";
  window._projects[ri].internalOwner = v;
  var email = ownerEmailLookup(v);
  if (email) window._projects[ri].internalOwnerEmail = email;

  try {
    var card = el && el.closest ? el.closest(".card") : null;
    if (card) {
      var emailEl = card.querySelector('input[data-field="internalOwnerEmail"]');
      if (emailEl && email) emailEl.value = email;
    }
  } catch (e) { }
  debouncedSave(window._projects[ri]);
}

function setInternalOwner(ri, name) {
  var v = (name || "").trim();
  window._projects[ri].internalOwner = v;
  var email = ownerEmailLookup(v);
  if (email) window._projects[ri].internalOwnerEmail = email;
  debouncedSave(window._projects[ri]);
  buildOwnerDirectory(); // Update directory so new person is available everywhere
}

/* ---------- Sort & Filter ---------- */

function getSortValue(p, field) {
  if (field === "score") return Number(avgScore(p.scores));
  if (field === "stage") return Number(p.stage || 0);
  if (field === "status") return normalize(p.status);
  if (field === "decision") return normalize(p.decision);
  if (field === "decisionDate") return p.targetDecisionDate || "";
  if (field === "ownershipPct") return Number(p.ownershipPct != null ? p.ownershipPct : -1);
  if (field === "cashNeeded") return p.cashNeeded ? 1 : 0;
  if (field === "name") return normalize(p.name);
  if (field === "owner") return normalize(p.internalOwner);
  return "";
}

function _isEditing() {
  var ae = document.activeElement;
  if (!ae) return false;
  var tag = (ae.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
    return !!(ae.closest && ae.closest(".card"));
  }
  return false;
}

function sortProjects(list) {
  var field = (document.getElementById("sortField") || {}).value || "score";
  var dir = (document.getElementById("sortDir") || {}).value || "desc";
  if (window.__suspendSort || _isEditing()) return list.slice();
  var mult = dir === "asc" ? 1 : -1;
  return list.slice().sort(function (a, b) {
    var av = getSortValue(a, field), bv = getSortValue(b, field);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
    if (av < bv) return -1 * mult;
    if (av > bv) return 1 * mult;
    return 0;
  });
}

function filterProjects(list) {
  var q = normalize((document.getElementById("searchBox") || {}).value);
  if (!q) return list;
  return list.filter(function (p) {
    return normalize(p.name).includes(q) || normalize(p.location).includes(q) || normalize(p.internalOwner).includes(q);
  });
}

function applyReviewFilter(list) {
  var mode = (document.getElementById("reviewFilter") || {}).value || "active";
  var now = todayISO();
  if (mode === "all") return list;
  if (mode === "active") return list.filter(function (p) { return p.decision !== "Hold" && p.decision !== "Kill"; });
  if (mode === "cash") return list.filter(function (p) { return !!p.cashNeeded; });
  if (mode === "holdkill") return list.filter(function (p) { return p.decision === "Hold" || p.decision === "Kill"; });
  if (mode === "overdue") return list.filter(function (p) {
    return p.targetDecisionDate && p.targetDecisionDate < now && p.decision !== "Kill";
  });
  if (mode === "due14") return list.filter(function (p) {
    var du = daysUntil(p.targetDecisionDate);
    return du !== null && du >= 0 && du <= 14;
  });
  return list;
}

function applyBucketFilter(list) {
  var mode = (document.getElementById("bucketView") || {}).value || "pipeline";
  if (mode === "all") return list;
  return list.filter(function (p) { return (p.bucket || "pipeline") === mode; });
}

/* ---------- Render KPIs ---------- */

function renderKPIs(allProjects) {
  var now = todayISO();
  var scores = allProjects.map(function (p) { return Number(avgScore(p.scores)); });
  var avg = scores.length ? (scores.reduce(function (a, b) { return a + b; }, 0) / scores.length).toFixed(2) : "\u2014";
  var cashCount = allProjects.filter(function (p) { return p.cashNeeded; }).length;
  var overdue = allProjects.filter(function (p) {
    return p.targetDecisionDate && p.targetDecisionDate < now && p.decision !== "Kill";
  }).length;
  var due14 = allProjects.filter(function (p) {
    var du = daysUntil(p.targetDecisionDate);
    return du !== null && du >= 0 && du <= 14;
  }).length;

  var decCounts = {
    Advance: allProjects.filter(function (p) { return p.decision === "Advance"; }).length,
    Hold: allProjects.filter(function (p) { return p.decision === "Hold"; }).length,
    Kill: allProjects.filter(function (p) { return p.decision === "Kill"; }).length
  };

  var taskCounts = countOpenTasks();

  var el = document.getElementById("kpis");
  if (!el) return;
  el.innerHTML =
    '<div class="kpi">' +
      '<div class="kpiLabel">Projects</div>' +
      '<div class="kpiValue">' + allProjects.length + '</div>' +
      '<div class="kpiSub">Active portfolio items</div>' +
    '</div>' +
    '<div class="kpi">' +
      '<div class="kpiLabel">Avg Score</div>' +
      '<div class="kpiValue">' + avg + '</div>' +
      '<div class="kpiSub"><span class="kpiDot dot-green"></span>3.2+ <span class="kpiDot dot-blue"></span>2.4+ <span class="kpiDot dot-yellow"></span>1.6+</div>' +
    '</div>' +
    '<div class="kpi">' +
      '<div class="kpiLabel">Cash Needed</div>' +
      '<div class="kpiValue">' + cashCount + '</div>' +
      '<div class="kpiSub">Items requesting cash</div>' +
    '</div>' +
    '<div class="kpi">' +
      '<div class="kpiLabel">Decisions due (14d)</div>' +
      '<div class="kpiValue">' + due14 + '</div>' +
      '<div class="kpiSub">Next 2-week cadence</div>' +
    '</div>' +
    '<div class="kpi">' +
      '<div class="kpiLabel">Overdue decisions</div>' +
      '<div class="kpiValue">' + overdue + '</div>' +
      '<div class="kpiSub">Target date passed</div>' +
    '</div>' +
    '<div class="kpi">' +
      '<div class="kpiLabel">Decision mix</div>' +
      '<div class="kpiValue">' + decCounts.Advance + ' / ' + decCounts.Hold + ' / ' + decCounts.Kill + '</div>' +
      '<div class="kpiSub">Advance / Hold / Kill</div>' +
    '</div>' +
    '<div class="kpi">' +
      '<div class="kpiLabel">Open Tasks</div>' +
      '<div class="kpiValue">' + taskCounts.total + '</div>' +
      '<div class="kpiSub">' + taskCounts.overdue + ' overdue</div>' +
    '</div>';
}

/* ---------- Main Render ---------- */

function render() {
  var cardsEl = document.getElementById("cards");
  if (!cardsEl) return;

  // Save scroll position AND which card is expanded before re-render
  var scrollY = window.scrollY || window.pageYOffset;
  var expandedIds = {};
  window._projects.forEach(function (p) { if (p.expanded) expandedIds[p.id] = true; });

  var projects = window._projects;
  var bucketFiltered = getVisibleProjects();
  var visible = sortProjects(bucketFiltered);

  renderKPIs(bucketFiltered);
  renderCapStrip(capitalScope());

  cardsEl.innerHTML = "";
  visible.forEach(function (p) {
    var ri = projects.findIndex(function (x) { return x.id === p.id; });
    if (ri === -1) ri = projects.indexOf(p);
    var avg = avgScore(p.scores);
    var gates = (gateLibrary[p.constraint] || []).concat("Other (specify)");
    var cashBadge = p.cashNeeded
      ? '<span class="badge badge-cash">Cash Needed</span>'
      : '<span class="badge badge-nocash">No Cash Need</span>';
    var displayedGate = (p.gate === "Other (specify)" && p.otherGate) ? "Other: " + p.otherGate : (p.gate || "\u2014");
    var decisionChip = p.decision && p.decision !== "Not set"
      ? '<span class="badge badge-decision">' + p.decision + '</span>'
      : '<span class="badge">Decision: Not set</span>';
    var decisionDateText = p.targetDecisionDate || "\u2014";
    var isOverdue = p.targetDecisionDate && p.targetDecisionDate < todayISO() && p.decision !== "Kill";

    var emailUrl = buildProjectMailto(p);

    var card = document.createElement("div");
    card.className = "card" + (p.expanded ? " expanded" : "");
    card.setAttribute("data-pid", p.id);
    card.innerHTML =
      '<div class="titleRow">' +
        '<div class="titleBlock">' +
          '<div class="title">' + escText(p.name) + '</div>' +
          '<div class="meta">' + escText(p.location) + '</div>' +
        '</div>' +
        '<button class="emailBtn" onclick="openEmail(buildProjectMailto(window._projects[' + ri + ']))" title="Email owner"' +
          (emailUrl ? '' : ' disabled') + '>\u2709</button>' +
        '<span class="scorePill ' + scoreClass(avg) + '">' + avg + '</span>' +
      '</div>' +

      '<div class="miniBadges">' +
        '<span class="badge badge-gold">' + (stages[p.stage] || "—") + '</span>' +
        decisionChip +
      '</div>' +

      renderCapLine(p) +

      '<div class="badges">' +
        '<span class="badge badge-gold">' + (stages[p.stage] || "\u2014") + '</span>' +
        '<span class="badge badge-wax">' + (p.status || "\u2014") + '</span>' +
        cashBadge +
        decisionChip +
        '<span class="badge">' + ((p.bucket || "pipeline") === "construction" ? "Construction" : ((p.bucket || "pipeline") === "archived" ? "Archive" : "Pipeline")) + '</span>' +
        (isOverdue ? '<span class="badge badge-overdue">Overdue</span>' : "") +
      '</div>' +

      '<div class="minGrid">' +
        '<div class="minItem"><div class="minLabel">Primary Constraint</div><div class="minValue">' + (p.constraint || "\u2014") + '</div></div>' +
        '<div class="minItem"><div class="minLabel">Next Gate</div><div class="minValue">' + escText(displayedGate) + '</div></div>' +
        '<div class="minItem"><div class="minLabel">Ownership %</div><div class="minValue">' + (p.ownershipPct !== "" && p.ownershipPct != null ? p.ownershipPct + "%" : "\u2014") + '</div></div>' +
        '<div class="minItem"><div class="minLabel">Target Decision Date</div><div class="minValue">' + decisionDateText + '</div></div>' +
      '</div>' +

      '<div class="toggleRow">' +
        (((p.bucket || "pipeline") === "pipeline" && ((p.stage || 0) >= 4 || (p.status || "") === "Under Construction"))
          ? '<span class="toggleLink" onclick="moveToConstruction(\'' + p.id + '\')">Move to Construction</span>' : '') +
        '<span class="toggleLink" onclick="toggle(' + ri + ')">' + (p.expanded ? "Collapse" : "Expand") + '</span>' +
      '</div>' +

      '<div class="details">' +
        '<div class="threeCol">' +
          '<div class="field"><div class="label">Project ID</div>' +
            '<input type="text" value="' + escText(p.id || "") + '" readonly style="background:#f8f6f3"/></div>' +
          '<div class="field"><div class="label">Project Name</div>' +
            '<input type="text" value="' + escText(p.name || "") + '" placeholder="Enter project name" ' +
              'oninput="window._projects[' + ri + '].name=this.value;window.__suspendSort=true;" ' +
              'onchange="window._projects[' + ri + '].name=this.value;window.__suspendSort=true;debouncedSave(window._projects[' + ri + '])"/></div>' +
          '<div class="field"><div class="label">Internal Owner</div>' +
            '<input type="text" value="' + escText(p.internalOwner || "") + '" placeholder="Name" ' +
              'oninput="ownerInput(' + ri + ', this.value, this)" ' +
              'onchange="setInternalOwner(' + ri + ', this.value)"/></div>' +
          '<div class="field"><div class="label">Owner Email</div>' +
            '<input data-field="internalOwnerEmail" type="email" value="' + escText(p.internalOwnerEmail || "") + '" placeholder="name@bellamare.com" ' +
              'onchange="window._projects[' + ri + '].internalOwnerEmail=this.value;debouncedSave(window._projects[' + ri + ']);buildOwnerDirectory()"/></div>' +
          '<div class="field"><div class="label">Ownership %</div>' +
            '<input type="number" min="0" max="100" step="1" value="' + (p.ownershipPct != null ? p.ownershipPct : "") + '" ' +
              'onchange="window._projects[' + ri + '].ownershipPct=(this.value===\'\'?\'\':+this.value);debouncedSave(window._projects[' + ri + '])"/></div>' +
        '</div>' +

        '<div class="threeCol">' +
          '<div class="field"><div class="label">Decision</div>' +
            '<select onchange="var v=(this.value||\'\').trim();window._projects[' + ri + '].decision=v;if(v===\'Kill\'){window._projects[' + ri + '].bucket=\'archived\';window._projects[' + ri + '].expanded=false;debouncedSave(window._projects[' + ri + ']);render();}else{debouncedSave(window._projects[' + ri + ']);}">' +
              decisions.map(function (d) { return '<option ' + (d === p.decision ? "selected" : "") + '>' + d + '</option>'; }).join("") +
            '</select></div>' +
          '<div class="field"><div class="label">Target Decision Date</div>' +
            '<input type="date" value="' + (p.targetDecisionDate || "") + '" ' +
              'onchange="window._projects[' + ri + '].targetDecisionDate=this.value;window.__suspendSort=true;debouncedSave(window._projects[' + ri + '])"/></div>' +
          '<div class="field"><div class="label">Cash Needed</div>' +
            '<select onchange="window._projects[' + ri + '].cashNeeded=(this.value===\'Yes\');if(this.value===\'No\'){window._projects[' + ri + '].cashNeededAmount=\'\'}debouncedSave(window._projects[' + ri + '])">' +
              '<option ' + (p.cashNeeded ? "" : "selected") + '>No</option>' +
              '<option ' + (p.cashNeeded ? "selected" : "") + '>Yes</option>' +
            '</select></div>' +
        '</div>' +

        '<div class="field"><div class="label">Tracking Bucket</div>' +
          '<select onchange="window._projects[' + ri + '].bucket=this.value;window.__suspendSort=true;debouncedSave(window._projects[' + ri + '])">' +
            '<option value="pipeline" ' + ((p.bucket || "pipeline") === "pipeline" ? "selected" : "") + '>Pipeline</option>' +
            '<option value="construction" ' + ((p.bucket || "pipeline") === "construction" ? "selected" : "") + '>Construction</option>' +
            '<option value="archived" ' + ((p.bucket || "pipeline") === "archived" ? "selected" : "") + '>Archive</option>' +
          '</select></div>' +

        '<div class="field"><div class="label">Cash Needed Amount</div>' +
          '<input type="text" placeholder="$150k / $500k / etc." value="' + escText(p.cashNeededAmount || "") + '" ' +
            'onchange="window._projects[' + ri + '].cashNeededAmount=this.value;debouncedSave(window._projects[' + ri + '])"/></div>' +

        '<div class="twoCol">' +
          '<div class="field"><div class="label">Stage</div>' +
            '<select onchange="window._projects[' + ri + '].stage=this.selectedIndex;debouncedSave(window._projects[' + ri + '])">' +
              stages.map(function (s, idx) { return '<option ' + (idx === p.stage ? "selected" : "") + '>' + s + '</option>'; }).join("") +
            '</select></div>' +
          '<div class="field"><div class="label">Status</div>' +
            '<select onchange="window._projects[' + ri + '].status=this.value;debouncedSave(window._projects[' + ri + '])">' +
              statuses.map(function (s) { return '<option ' + (s === p.status ? "selected" : "") + '>' + s + '</option>'; }).join("") +
            '</select></div>' +
        '</div>' +

        '<div class="field"><div class="label">Primary Constraint</div>' +
          '<select onchange="window._projects[' + ri + '].constraint=this.value;window._projects[' + ri + '].gate=\'\';window._projects[' + ri + '].otherGate=\'\';debouncedSave(window._projects[' + ri + ']);render()">' +
            primaryConstraints.map(function (c) { return '<option ' + (c === p.constraint ? "selected" : "") + '>' + c + '</option>'; }).join("") +
          '</select></div>' +

        '<div class="field"><div class="label">Next Gate</div>' +
          '<select onchange="window._projects[' + ri + '].gate=this.value;debouncedSave(window._projects[' + ri + '])">' +
            gates.map(function (g) { return '<option ' + (g === p.gate ? "selected" : "") + '>' + g + '</option>'; }).join("") +
          '</select>' +
          (p.gate === "Other (specify)"
            ? '<input type="text" placeholder="Describe other gate..." value="' + escText(p.otherGate || "") + '" ' +
                'onchange="window._projects[' + ri + '].otherGate=this.value;debouncedSave(window._projects[' + ri + '])"/>'
            : "") +
          '<div class="guidance"><strong>' + escText(p.constraint) + ' \u2014 cleared when:</strong>' +
            '<ul>' + (gateLibrary[p.constraint] || []).map(function (g) { return '<li>' + escText(g) + '</li>'; }).join("") + '</ul></div>' +

          '<div class="field" style="grid-column:1/-1"><div class="label">Next Gate \u2013 Comments</div>' +
            '<textarea rows="3" placeholder="Add notes, conditions, or context\u2026" ' +
              'onchange="window._projects[' + ri + '].nextGateComments=this.value;debouncedSave(window._projects[' + ri + '])" ' +
              'style="width:100%;resize:vertical;padding:10px;border:1px solid rgba(0,0,0,.12);border-radius:10px">' + escText(p.nextGateComments || "") + '</textarea></div>' +

          '<div class="field" style="grid-column:1/-1"><div class="label">General Comments</div>' +
            '<textarea rows="4" placeholder="Any additional notes, risks, decisions, or follow-ups\u2026" ' +
              'onchange="window._projects[' + ri + '].generalComments=this.value;debouncedSave(window._projects[' + ri + '])" ' +
              'style="width:100%;resize:vertical;padding:10px;border:1px solid rgba(0,0,0,.12);border-radius:10px">' + escText(p.generalComments || "") + '</textarea></div>' +
        '</div>' +

        renderCapitalSection(p, ri) +

        renderTaskPanel(p, ri) +

        '<div class="scores">' +
          Object.entries(p.scores).map(function (entry) {
            var k = entry[0], v = entry[1];
            return '<div class="scoreRow">' +
              '<span>' + k + '</span>' +
              '<input type="range" min="0" max="4" value="' + v + '" ' +
                'oninput="window._projects[' + ri + '].scores[\'' + k + '\']=+this.value;this.nextElementSibling.textContent=this.value;updateScorePill(\'' + escAttr(p.id) + '\',' + ri + ')" ' +
                'onchange="window._projects[' + ri + '].scores[\'' + k + '\']=+this.value;debouncedSave(window._projects[' + ri + ']);updateScorePill(\'' + escAttr(p.id) + '\',' + ri + ')"/>' +
              '<div class="scoreVal">' + v + '</div></div>';
          }).join("") +
        '</div>' +

        '<div class="smallNote">Weekly cadence: set Decision + Target Decision Date; use "Review filter" to drive meeting agenda.</div>' +

        '<div class="dangerZone">' +
          '<button class="btn-small btn-danger" onclick="removeProject(\'' + p.id + '\')">\u00d7 Delete This Project</button>' +
        '</div>' +
      '</div>';

    cardsEl.appendChild(card);
  });

  // Restore expanded state + scroll position after re-render
  window._projects.forEach(function (p) { p.expanded = !!expandedIds[p.id]; });

  // Re-apply expanded class on cards to match state
  var allCards = cardsEl.querySelectorAll(".card");
  allCards.forEach(function (cardEl) {
    var pid = cardEl.getAttribute("data-pid");
    if (expandedIds[pid]) {
      cardEl.classList.add("expanded");
    }
  });

  requestAnimationFrame(function () {
    window.scrollTo(0, scrollY);
  });
}

/* ---------- Actions ---------- */

function setAll(expand) {
  window._projects = window._projects.map(function (p) {
    return Object.assign({}, p, { expanded: expand });
  });
  render();
}

function toggle(i) {
  var p = window._projects[i];
  p.expanded = !p.expanded;

  // Find this card in the DOM and toggle directly — no full render
  var card = document.querySelector('.card[data-pid="' + p.id + '"]');
  if (card) {
    if (p.expanded) {
      card.classList.add("expanded");
    } else {
      card.classList.remove("expanded");
    }
    // Update the toggle link text
    var link = card.querySelector(".toggleRow .toggleLink:last-child");
    if (link) link.textContent = p.expanded ? "Collapse" : "Expand";
  }

  // Load tasks when expanding for the first time (needs a render to show task panel)
  if (p.expanded && p.id && !window._taskCache[p.id]) {
    loadProjectTasks(p.id).then(function () { render(); });
  }
}

async function addProject() {
  var newProj = {
    id: _newId(),
    name: "",
    location: "",
    projectType: "",
    developer: "",
    stage: 0,
    stageName: "0 \u2014 Triage / Intake",
    status: "Blank / Unclear",
    constraint: "Financial Feasibility",
    gate: "",
    otherGate: "",
    nextGateComments: "",
    generalComments: "",
    ownershipPct: "",
    cashNeeded: false,
    cashNeededAmount: "",
    decision: "Not set",
    targetDecisionDate: "",
    internalOwner: "",
    internalOwnerEmail: "",
    bucket: "pipeline",
    expanded: true,
    fin: { tpc: "", softCost: "", softCostCash: "", sources: [] },
    scores: { Market: 0, Entitlements: 0, Site: 0, Construction: 0, Capital: 0, Sponsor: 0 }
  };

  var saved = await saveProject(newProj);
  if (saved) {
    window._projects.unshift(saved);
  } else {
    window._projects.unshift(newProj);
  }
  render();
}

async function removeProject(id) {
  var pin = prompt("Enter the DELETE PIN to remove this project:");
  if (pin === null) return; // cancelled
  if (pin !== DELETE_PIN) { alert("Incorrect PIN. Project was NOT deleted."); return; }
  if (!confirm("Are you sure? This cannot be undone.")) return;
  var result = await deleteProject(id);
  if (result === true) {
    window._projects = window._projects.filter(function (p) { return p.id !== id; });
    render();
  } else {
    alert("Failed to delete project: " + (result || "Unknown error"));
  }
}

function moveToConstruction(id) {
  var idx = window._projects.findIndex(function (x) { return x.id === id; });
  if (idx < 0) return;
  window._projects[idx].bucket = "construction";
  window._projects[idx].expanded = true;
  debouncedSave(window._projects[idx]);
  render();
}

/* ---------- Lock / Unlock ---------- */

function toggleLock() {
  if (!_locked) {
    var code = prompt("Enter lock code to LOCK editing:");
    if (code !== LOCK_CODE) { alert("Incorrect code."); return; }
    _locked = true;
    document.body.classList.add("locked");
    alert("Tracker locked (view-only).");
  } else {
    var code2 = prompt("Enter lock code to UNLOCK editing:");
    if (code2 !== LOCK_CODE) { alert("Incorrect code."); return; }
    _locked = false;
    document.body.classList.remove("locked");
    alert("Tracker unlocked (editing enabled).");
  }
}

/* ---------- Mobile Filter Toggle ---------- */

function toggleFilters() {
  var header = document.querySelector("header");
  if (header) header.classList.toggle("filtersOpen");
}

/* ---------- Task Reminders ---------- */

function showTaskReminders() {
  var panel = document.getElementById("reminderPanel");
  if (!panel) return;

  var now = todayISO();
  var soon = new Date();
  soon.setDate(soon.getDate() + 3);
  var soonISO = soon.getFullYear() + "-" + String(soon.getMonth() + 1).padStart(2, "0") + "-" + String(soon.getDate()).padStart(2, "0");

  var reminders = [];

  for (var pid in window._taskCache) {
    var tasks = window._taskCache[pid];
    var project = _findProject(pid);
    if (!project) continue;

    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (t.status === "completed") continue;
      if (!t.dueDate) continue;

      var isOverdue = t.dueDate < now;
      var isDueSoon = !isOverdue && t.dueDate <= soonISO;

      if (isOverdue || isDueSoon) {
        reminders.push({
          task: t,
          project: project,
          isOverdue: isOverdue,
          daysUntilDue: daysUntil(t.dueDate)
        });
      }
    }
  }

  if (reminders.length === 0) {
    panel.style.display = "none";
    return;
  }

  // Sort: overdue first, then by due date
  reminders.sort(function (a, b) {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return (a.task.dueDate || "").localeCompare(b.task.dueDate || "");
  });

  var rows = "";
  for (var r = 0; r < reminders.length; r++) {
    var rem = reminders[r];
    var urgency = rem.isOverdue
      ? '<span class="reminderBadge reminderOverdue">Overdue ' + Math.abs(rem.daysUntilDue) + 'd</span>'
      : '<span class="reminderBadge reminderSoon">Due in ' + rem.daysUntilDue + 'd</span>';

    var reminderMailto = buildReminderMailto(rem.project, rem.task);
    var sendBtn = reminderMailto
      ? '<button class="btn-small btn-email" onclick="openEmail(buildReminderMailto(_findProject(\'' + escText(rem.project.id) + '\'), window._taskCache[\'' + escText(rem.project.id) + '\'][' + (function () {
          var tasks = window._taskCache[rem.project.id] || [];
          for (var idx = 0; idx < tasks.length; idx++) { if (tasks[idx].id === rem.task.id) return idx; }
          return 0;
        })() + ']))">Send Reminder</button>'
      : '';

    rows +=
      '<div class="reminderRow">' +
        urgency +
        '<div class="reminderInfo">' +
          '<div class="reminderTask">' + escText(rem.task.title) + '</div>' +
          '<div class="reminderMeta">' + escText(rem.project.name) + ' \u2022 ' + escText(rem.task.assignee || "Unassigned") + ' \u2022 Due: ' + rem.task.dueDate + '</div>' +
        '</div>' +
        sendBtn +
      '</div>';
  }

  panel.innerHTML =
    '<div class="reminderHeader">' +
      '<h3>\u23f0 Task Reminders (' + reminders.length + ')</h3>' +
      '<button class="btn-small" onclick="dismissReminders()">Dismiss</button>' +
    '</div>' +
    rows;

  panel.style.display = "block";
}

function dismissReminders() {
  var panel = document.getElementById("reminderPanel");
  if (panel) panel.style.display = "none";
}

/* ---------- App Initialization ---------- */

document.addEventListener("DOMContentLoaded", async function () {
  setSyncStatus("saving");

  // Load projects from API
  var loaded = await loadProjects();
  if (loaded.length > 0) {
    window._projects = loaded.map(function (p) {
      p.expanded = false;
      return p;
    });
    _ensureIds();
    buildOwnerDirectory(); // Build team directory from all projects
  }

  setSyncStatus("saved");
  render();

  // Pre-load tasks for all projects (for KPI counts)
  var taskPromises = window._projects.map(function (p) {
    return loadProjectTasks(p.id);
  });
  await Promise.all(taskPromises);
  render(); // Re-render with task counts
  showTaskReminders(); // Show overdue / due-soon task reminders

  // Start auto-refresh for multi-user sync (every 30 seconds)
  startAutoRefresh(30000);
});
