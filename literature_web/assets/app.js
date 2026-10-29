/* TUS Tissue Properties — static client. No build step, no dependencies. */
(() => {
  "use strict";

  const CFG = window.SITE_CONFIG || { repo: "#", branch: "main" };
  const PROPS = {
    sound_speed: { name: "Sound speed", unit: "m/s" },
    density: { name: "Density", unit: "kg/m³" },
    attenuation: { name: "Attenuation", unit: "dB/cm @ 0.5 MHz" },
    absorption_coefficient: { name: "Absorption", unit: "dB/cm @ 0.5 MHz" },
    thermal_conductivity: { name: "Thermal conductivity", unit: "W/m/K" },
    specific_heat: { name: "Specific heat", unit: "J/kg/K" },
    perfusion: { name: "Perfusion", unit: "mL/min/kg" },
  };
  const TISSUES = ["skull", "brain", "water"];
  const OV_TISSUES = ["water", "brain", "skull"]; // overview table columns, in the chart order
  const FACETS = ["status", "bound", "species", "division", "preparation", "condition"];
  // optional table columns; Tissue and Value are always shown
  const COLUMNS = [["id", "Row ID"], ["links", "Links (suggest fix, comments)"], ["reported", "Reported value"], ["notes", "Notes"],
    ["test_freq_mhz", "Test frequency"], ["exponent_b", "Exponent b"], ["db_cm_1mhz", "Value @1 MHz"],
    ["species", "Species"], ["preparation", "Preparation"], ["condition", "Condition"], ["status", "Status"], ["bound", "Bound"], ["ref", "Reference"]];
  const COL_DEFAULT_HIDDEN = ["id", "status"];
  const OFF_DEFAULT = { status: ["excluded"] }; // facet values unticked on first load
  const sameSet = (a, b) => a.size === b.length && b.every((x) => a.has(x));

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // facet values of a row; species can list several (`pig;sheep`), each filtered and counted on its own
  const fvals = (r, f) => f === "species" ? r.species.split(";").map((x) => x.trim()).filter(Boolean) : [r[f]];

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = []; let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const head = rows.shift();
    return rows.map((r, i) => Object.fromEntries(head.map((h, j) => [h, r[j] ?? ""]).concat([["_line", i + 2]])));
  }
  const toCSV = (rows, cols) => [cols.join(",")].concat(rows.map((r) => cols.map((c) => {
    const v = String(r[c] ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(","))).join("\n");

  // ---------- state ----------
  const DEFAULT = () => ({ tissue: "skull", props: new Set(), off: Object.fromEntries(FACETS.map((f) => [f, new Set(OFF_DEFAULT[f] || [])])), refsOff: new Set(), deep: false, q: "", hl: "", sort: {}, hide: new Set(COL_DEFAULT_HIDDEN) });
  let S = DEFAULT();
  let DATA = [], REFS = {}, COLS = [], META = {}, BOUNDS = [], BV = "";
  let VERSIONS = [], CURRENT = ""; // data/versions.json (written at deploy); CURRENT = newest data on the site

  // ---------- display units (data and downloads stay in the canonical unit, the first listed) ----------
  const NP_PER_DB = Math.LN10 / 20; // 1 dB = 0.1151 Np
  const ATT_UNITS = { "dB/cm": 1, "dB/m": 100, "Np/cm": NP_PER_DB, "Np/m": 100 * NP_PER_DB };
  const UNITS = { // factor from the canonical unit
    sound_speed: { "m/s": 1, "mm/µs": 1e-3 },
    density: { "kg/m³": 1, "g/cm³": 1e-3 },
    attenuation: ATT_UNITS,
    thermal_conductivity: { "W/m/K": 1, "mW/m/K": 1e3 },
    specific_heat: { "J/kg/K": 1, "J/g/K": 1e-3 },
    perfusion: { "mL/min/kg": 1, "mL/100 g/min": 0.1 },
    absorption_coefficient: ATT_UNITS,
  };
  const FREQ_PROPS = ["attenuation", "absorption_coefficient"]; // unit label carries the frequency
  const UNIT_FIELDS = ["value", "value_max", "db_cm_1mhz"];
  const CANON = Object.fromEntries(Object.entries(UNITS).map(([p, u]) => [p, Object.keys(u)[0]]));
  let UNIT = { ...CANON };
  // frequency of attenuation and absorption: literature values scale with their own power law,
  // value(f) = value(0.5 MHz) * (f / 0.5)^b; bounds and benchmarks are simulation settings and scale
  // with the simulation exponent y (1 skull and brain, 2 water)
  const FREQS = [0.2, 0.25, 0.3, 0.4, 0.5, 0.65, 0.75, 1, 1.5, 2];
  const SIM_Y = { skull: 1, brain: 1, water: 2 };
  // derived rows without an exponent: weighted sums of rows that have one (Lyons & Parker 1988)
  const COMPOSITE = {}; // derived composite rows (id: [[weight, id], ...]); none at present
  let FREQ = 0.5;
  const fscale = (y) => Math.pow(FREQ / 0.5, y);
  const testRange = (s) => { const n = String(s || "").replace(/~/g, "").split(/[–-]/).map(parseFloat).filter(isFinite); return n.length ? [Math.min(...n), Math.max(...n)] : null; };
  // significant digits of a stored value; a converted value keeps at least 4, and never fewer than the source
  const sig = (s) => String(s).replace(/^[-+]?0*\.?0*/, "").replace(".", "").replace(/e.*$/i, "").length;
  // display value of x (canonical unit, possibly rescaled in frequency); src = stored value, for the precision
  const conv = (x, p, src) => {
    const f = UNITS[p]?.[UNIT[p]] ?? 1;
    if (x === "" || x == null || !isFinite(+x)) return x;
    if (f === 1 && x === src) return src;
    return String(+(+x * f).toPrecision(Math.max(4, sig(src))));
  };
  // canonical (dB/cm) value of row field k at the selected frequency
  function atFreq(r, k, byId) {
    const s = r._c[k];
    if (s === "" || s == null || FREQ === 0.5 || !FREQ_PROPS.includes(r.property)) return s;
    const mix = COMPOSITE[r.id];
    if (mix) return k === "value" && mix.every(([, id]) => byId[id]) ? String(mix.reduce((a, [w, id]) => a + w * +atFreq(byId[id], "value", byId), 0)) : "";
    const b = parseFloat(r.exponent_b);
    return isFinite(b) ? String(+s * fscale(b)) : "";
  }
  // rewrite displayed values from the canonical copies (r._c, b._c) kept at load
  function applyUnit() {
    Object.keys(UNITS).forEach((p) => (PROPS[p].unit = UNIT[p] + (FREQ_PROPS.includes(p) ? ` @ ${FREQ} MHz` : "")));
    const byId = Object.fromEntries(DATA.map((r) => [r.id, r]));
    DATA.forEach((r) => {
      UNIT_FIELDS.forEach((k) => (r[k] = conv(k === "db_cm_1mhz" ? r._c[k] : atFreq(r, k, byId), r.property, r._c[k])));
      const rg = FREQ_PROPS.includes(r.property) && testRange(r.test_freq_mhz);
      r.xp = !!rg && (FREQ < rg[0] - 1e-9 || FREQ > rg[1] + 1e-9); // selected frequency outside the measured range
    });
    BOUNDS.forEach((b) => (b.value = conv(FREQ_PROPS.includes(b.property) && FREQ !== 0.5 ? String(+b._c * fscale(SIM_Y[b.tissue] ?? 1)) : b._c, b.property, b._c)));
  }
  const xpTitle = (r) => `extrapolated: measured at ${r.test_freq_mhz} MHz, scaled to ${FREQ} MHz with b = ${r.exponent_b || "of its components"}`;
  // unit picker of one property (overview table); attenuation and absorption also pick the frequency
  const unitPick = (p) => `<select class="unit-pick" data-unit="${p}" aria-label="Unit of ${PROPS[p].name.toLowerCase()}">${Object.keys(UNITS[p]).map((u) =>
    `<option ${u === UNIT[p] ? "selected" : ""}>${esc(u)}</option>`).join("")}</select>${FREQ_PROPS.includes(p) ? ` @ <select class="unit-pick" data-freq="${p}" aria-label="Frequency of ${PROPS[p].name.toLowerCase()} (MHz)">${FREQS.map((f) =>
    `<option value="${f}" ${f === FREQ ? "selected" : ""}>${f}</option>`).join("")}</select> MHz` : ""}`;

  // ---------- LOW/HIGH bounds (versioned, data/bounds.csv) ----------
  const vkey = (v) => { const [core, pre] = v.split("-"); return core.split(".").map(Number).reduce((a, x) => a * 1000 + x, 0) * 2 + (pre ? 0 : 1); }; // a pre-release (X.Y.Z-label) sorts before its release
  const boundVersions = () => [...new Set(BOUNDS.map((b) => b.version))].sort((a, b) => vkey(b) - vkey(a));
  let BMAP = {}; // `${tissue}|${property}` -> {low:{...}, high:{...}, uniform:{...}}
  function applyBounds() {
    const cur = boundVersions();
    if (!cur.includes(BV)) BV = cur[0] || "";
    BMAP = {};
    BOUNDS.filter((b) => b.version === BV).forEach((b) => { (BMAP[`${b.tissue}|${b.property}`] = BMAP[`${b.tissue}|${b.property}`] || {})[b.bound] = b; });
    const byId = {};
    Object.values(BMAP).forEach((o) => Object.values(o).forEach((b) => { if (b.id) byId[b.id] = (byId[b.id] ? byId[b.id] + "+" : "") + b.bound; }));
    DATA.forEach((r) => { r.bound = byId[r.id] || "none"; });
  }
  const BLABEL = { low: "LOW", high: "HIGH", reference: "BENCHMARK", uniform: "ref." };
  const boundPill = (b) => b === "none" ? "" : b.split("+").map((x) => `<span class="bpill b-${x}">${x === "uniform" ? "ref." : x.toUpperCase()}</span>`).join(" ");

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const s = DEFAULT();
    if (p.has("t")) s.tissue = p.get("t");
    if (p.get("p")) s.props = new Set(p.get("p").split(","));
    FACETS.forEach((f) => { if (p.has("x" + f)) s.off[f] = new Set(p.get("x" + f).split("|").filter(Boolean)); });
    if (p.get("xr")) s.refsOff = new Set(p.get("xr").split(","));
    if (p.get("r")) { // positive ref list is shorter for typical shares
      const keep = new Set(p.get("r").split(","));
      s.refsOff = new Set(Object.keys(REFS).filter((k) => !keep.has(k)));
    }
    s.deep = p.get("deep") === "1";
    s.q = p.get("q") || "";
    s.hl = p.get("hl") || "";
    if (p.has("hc")) s.hide = new Set(p.get("hc").split(",").filter(Boolean));
    if (MODES[p.get("cmp")]) CMP.mode = p.get("cmp");
    CMP.values = p.get("cv") !== "0"; CMP.bench = p.get("bm") === "1";
    CMP.hidden = p.has("ch") ? new Set(p.get("ch").split("|").filter(Boolean)) : hiddenDefault();
    UNIT = { ...CANON };
    FREQ = FREQS.includes(+p.get("f")) ? +p.get("f") : 0.5;
    (p.get("u") || "").split(";").forEach((x) => { const [k, u] = x.split(":"); if (UNITS[k]?.[u]) UNIT[k] = u; });
    return s;
  }
  function writeHash() {
    const p = new URLSearchParams();
    if (S.tissue !== "skull") p.set("t", S.tissue);
    if (S.props.size) p.set("p", [...S.props].join(","));
    FACETS.forEach((f) => { if (!sameSet(S.off[f], OFF_DEFAULT[f] || [])) p.set("x" + f, [...S.off[f]].join("|")); }); // empty value = all ticked
    if (S.refsOff.size) {
      const used = usedRefKeys(DATA);
      const on = used.filter((k) => !S.refsOff.has(k));
      if (on.length < S.refsOff.size) p.set("r", on.join(",")); else p.set("xr", [...S.refsOff].join(","));
    }
    if (S.deep) p.set("deep", "1");
    if (S.q) p.set("q", S.q);
    if (S.hl) p.set("hl", S.hl);
    if (META.version && META.version !== CURRENT) p.set("v", META.version);
    if (CMP.mode !== "tissue") p.set("cmp", CMP.mode);
    if (!CMP.values) p.set("cv", "0");
    if (CMP.bench) p.set("bm", "1");
    if ([...S.hide].sort().join(",") !== COL_DEFAULT_HIDDEN.slice().sort().join(",")) p.set("hc", [...S.hide].join(","));
    if (!sameSet(CMP.hidden, [...hiddenDefault()])) p.set("ch", [...CMP.hidden].join("|")); // empty value = all shown
    const uset = Object.keys(UNITS).filter((k) => UNIT[k] !== CANON[k]).map((k) => `${k}:${UNIT[k]}`);
    if (uset.length) p.set("u", uset.join(";"));
    if (FREQ !== 0.5) p.set("f", String(FREQ));
    const h = p.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }

  // ---------- filtering ----------
  const rowKeys = (r) => [r.ref, r.via, ...r.sources.split(";")].filter(Boolean);
  const usedRefKeys = (rows) => [...new Set(rows.flatMap(rowKeys))].sort();

  function passRef(r) {
    if (!S.refsOff.size) return true;
    if (!S.refsOff.has(r.ref)) return true;
    return S.deep && rowKeys(r).some((k) => !S.refsOff.has(k));
  }
  function passQ(r) {
    if (!S.q) return true;
    const hay = [r.label, r.notes, r.reported, r.id, r.division, r.species, REFS[r.ref]?.citation].join(" ").toLowerCase();
    return S.q.toLowerCase().split(/\s+/).every((t) => hay.includes(t));
  }
  function filter(except) {
    return DATA.filter((r) =>
      (S.tissue === "all" || r.tissue === S.tissue) &&
      (except === "props" || !S.props.size || S.props.has(r.property)) &&
      FACETS.every((f) => f === except || fvals(r, f).every((v) => !S.off[f].has(v))) &&
      (except === "refs" || passRef(r)) && passQ(r));
  }

  // ---------- controls ----------
  function renderControls() {
    $("#f-tissue").innerHTML = TISSUES.concat("all").map((t) =>
      `<button type="button" data-t="${t}" aria-pressed="${S.tissue === t}">${cap(t)}</button>`).join("");

    const pc = count(filter("props"), "property");
    $("#f-property").innerHTML = Object.keys(PROPS).filter((k) => pc[k]).map((k) =>
      `<button type="button" data-p="${k}" aria-pressed="${S.props.has(k)}">${PROPS[k].name} <span class="n">${pc[k]}</span></button>`).join("");

    FACETS.forEach((f) => {
      const scope = DATA.filter((r) => S.tissue === "all" || r.tissue === S.tissue);
      const vals = [...new Set(scope.flatMap((r) => fvals(r, f)))].sort();
      const c = count(filter(f), f);
      $("#f-" + f).innerHTML = vals.map((v) =>
        `<label class="${c[v] ? "" : "zero"}"><input type="checkbox" data-f="${f}" value="${esc(v)}" ${S.off[f].has(v) ? "" : "checked"}> ${esc(v)} <span class="n">${c[v] || 0}</span></label>`).join("");
    });

    const scope = DATA.filter((r) => S.tissue === "all" || r.tissue === S.tissue);
    const keys = usedRefKeys(scope);
    const forRefs = filter("refs");
    const rc = {};
    forRefs.forEach((r) => rowKeys(r).forEach((k, i) => { if (i === 0 || S.deep) rc[k] = (rc[k] || 0) + 1; }));
    const rq = $("#ref-search").value.toLowerCase();
    $("#f-ref").innerHTML = keys
      .filter((k) => !rq || (REFS[k]?.citation || k).toLowerCase().includes(rq))
      .sort((a, b) => shortRef(a).localeCompare(shortRef(b)))
      .map((k) => `<label class="${rc[k] ? "" : "zero"}" title="${esc(REFS[k]?.citation || k)}"><input type="checkbox" data-ref="${k}" ${S.refsOff.has(k) ? "" : "checked"}> ${esc(shortRef(k))} <span class="n">${rc[k] || 0}</span></label>`).join("");
    $("#ref-deep").checked = S.deep;
    if ($("#q").value !== S.q) $("#q").value = S.q;
  }
  const count = (rows, f) => rows.reduce((a, r) => (fvals(r, f).forEach((v) => (a[v] = (a[v] || 0) + 1)), a), {});

  function shortRef(k) {
    const c = REFS[k]?.citation;
    if (!c) return k;
    const y = REFS[k].year;
    const authors = c.split(/\(\d{4}\)|\b\d{4}\b/)[0];
    const sur = authors.match(/^([^,]+)/)[1].trim();
    if (/^International Commission/.test(sur)) return `ICRU (${y})`;
    const n = (authors.match(/,\s*[A-Z]\.(?:\s?[A-Z]\.)*(?:-[A-Z]\.)?/g) || []).length;
    const etal = / et al\./.test(authors) || n > 2;
    const two = !etal && /&/.test(authors) ? " & " + authors.split("&")[1].trim().split(",")[0] : "";
    return `${sur}${etal ? " et al." : two} (${y})`;
  }

  // ---------- results ----------
  function fmt(v) {
    if (v === "" || v == null) return "";
    const x = +v;
    if (!isFinite(x)) return esc(v);
    if (x !== 0 && Math.abs(x) < 1) return String(+x.toPrecision(3)); // small values: 3 significant figures
    return x.toLocaleString("en-US", { maximumFractionDigits: 3 });
  }
  const valStr = (r) => r.value === "" ? "—" : fmt(r.value) + (r.value_max ? "–" + fmt(r.value_max) : "");

  function rangeStats(rows) {
    const inc = rows.filter((r) => r.status !== "excluded" && r.value !== "");
    if (!inc.length) return null;
    const lo = Math.min(...inc.map((r) => +r.value));
    const hi = Math.max(...inc.map((r) => +(r.value_max || r.value)));
    const mids = inc.map((r) => (+r.value + +(r.value_max || r.value)) / 2).sort((a, b) => a - b);
    const m = mids.length % 2 ? mids[(mids.length - 1) / 2] : (mids[mids.length / 2 - 1] + mids[mids.length / 2]) / 2;
    return { n: inc.length, lo, hi, m };
  }
  function stats(rows) {
    const st = rangeStats(rows);
    if (!st) return `<span class="stats">all values excluded</span>`;
    return `<span class="stats">n = <b>${st.n}</b> non-excluded · range <b>${fmt(st.lo)}–${fmt(st.hi)}</b> · median <b>${fmt(st.m)}</b></span>`;
  }

  function strip(rows) {
    const pts = rows.filter((r) => r.value !== "");
    if (!pts.length) return "";
    const W = Math.max(280, ($("#results").clientWidth || 1000) - 2), H = 84, L = 16, R = 16, Y = 42;
    let lo = Math.min(...pts.map((r) => +r.value)), hi = Math.max(...pts.map((r) => +(r.value_max || r.value)));
    if (lo === hi) { lo -= Math.abs(lo) * 0.05 || 1; hi += Math.abs(hi) * 0.05 || 1; }
    const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    const x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
    const ticks = niceTicks(lo, hi, 6);
    const jit = {}; // stack identical values
    const st = rangeStats(rows);
    const band = st ? `<rect class="band" x="${x(st.lo)}" y="${Y - 14}" width="${Math.max(2, x(st.hi) - x(st.lo))}" height="28" rx="3"/>
      <line class="median" x1="${x(st.m)}" x2="${x(st.m)}" y1="${Y - 14}" y2="${Y + 14}"><title>median ${fmt(st.m)}</title></line>` : "";
    const bd = BMAP[`${rows[0].tissue}|${rows[0].property}`] || {};
    const blines = ["low", "high", ...(CMP.bench ? ["reference"] : []), "uniform"].filter((k) => bd[k] && +bd[k].value >= lo && +bd[k].value <= hi).map((k) =>
      `<g class="bline b-${k}"><line x1="${x(+bd[k].value)}" x2="${x(+bd[k].value)}" y1="${Y - 22}" y2="${Y + 18}"/><text x="${x(+bd[k].value)}" y="${Y - 24}" text-anchor="${k === "low" ? "start" : k === "high" ? "end" : "middle"}" dx="${k === "low" ? 3 : k === "high" ? -3 : 0}">${BLABEL[k]} ${fmt(bd[k].value)}</text><title>${k === "reference" ? "reference benchmark" : k + " bound"} ${fmt(bd[k].value)} (v${BV})${bd[k].notes ? " — " + esc(bd[k].notes) : ""}</title></g>`).join("");
    const marks = pts.map((r) => {
      const ex = r.status === "excluded" ? " excl" : r.status === "proposed" ? " proposed" : "";
      const on = S.hl && rowKeys(r).includes(S.hl) ? " on" : "";
      const k = Math.round(x(+r.value)); const j = (jit[k] = (jit[k] || 0) + 1) - 1;
      const yy = Y - 8 + (j % 3) * 8;
      const t = `<title>${esc(r.label)} — ${valStr(r)} (${esc(shortRef(r.ref))})${r.xp ? " — " + esc(xpTitle(r)) : ""}</title>`;
      if (r.value_max) return `<line class="rng${ex}${on}" data-id="${r.id}" x1="${x(+r.value)}" x2="${x(+r.value_max)}" y1="${yy}" y2="${yy}">${t}</line>`;
      return `<circle class="dot${ex}${on}${r.xp ? " xp" : ""}" data-id="${r.id}" cx="${x(+r.value)}" cy="${yy}" r="5">${t}</circle>`;
    }).join("");
    return `<svg class="strip" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Distribution of values; shaded band spans non-excluded values, line marks the median">
      ${band}
      <line class="axis" x1="${L}" x2="${W - R}" y1="${Y + 18}" y2="${Y + 18}"/>
      ${ticks.map((t) => `<line class="axis" x1="${x(t)}" x2="${x(t)}" y1="${Y + 18}" y2="${Y + 22}"/><text x="${x(t)}" y="${H - 6}" text-anchor="middle">${fmt(t)}</text>`).join("")}
      ${blines}${marks}</svg>`;
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(+v.toPrecision(12));
    return out;
  }

  // notes collapse to a "Note" toggle and open in a full-width row under the value; open ones stay open across redraws
  const OPEN_NOTES = new Set();
  const noteBox = (r) => { const o = OPEN_NOTES.has(r.id); return `<button type="button" class="note-btn" data-note="${r.id}" aria-expanded="${o}" aria-controls="note-${r.id}">${o ? "▾" : "▸"} Note</button>`; };
  function table(rows, prop) {
    const att = prop === "attenuation" || prop === "absorption_coefficient";
    const cols = [
      ["division", "Tissue"], ["value", "Value", "num"], ["reported", "Reported"],
      ...(att || rows.some((r) => r.test_freq_mhz) ? [["test_freq_mhz", "f (MHz)", "num"]] : []),
      ...(att ? [["exponent_b", "b", "num"], ["db_cm_1mhz", `${UNIT[prop]} @1 MHz`, "num"]] : []),
      ["species", "Species"], ["preparation", "Preparation"], ["condition", "Condition"], ["status", "Status"], ["bound", "Bound"], ["ref", "Reference"],
    ].filter(([k]) => !S.hide.has(k));
    const show = (k) => !S.hide.has(k);
    const key = `${rows[0].tissue}:${prop}`;
    const so = S.sort[key] || { k: "value", d: 1 };
    const sorted = rows.slice().sort((a, b) => {
      const av = a[so.k], bv = b[so.k], an = parseFloat(av), bn = parseFloat(bv);
      const c = isFinite(an) && isFinite(bn) ? an - bn : String(so.k === "ref" ? shortRef(av) : av).localeCompare(String(so.k === "ref" ? shortRef(bv) : bv));
      return c * so.d;
    });
    const th = cols.map(([k, n, c]) => `<th data-sort="${k}" data-key="${key}" tabindex="0" aria-sort="${so.k === k ? (so.d > 0 ? "ascending" : "descending") : "none"}" class="${c || ""} ${so.k === k ? (so.d > 0 ? "asc" : "desc") : ""}">${n}</th>`).join("");
    const tr = sorted.map((r) => {
      const ex = r.status === "excluded";
      const hl = S.hl && rowKeys(r).includes(S.hl);
      const via = r.via ? `<span class="sub">via <button class="refbtn" data-hl="${r.via}">${esc(shortRef(r.via))}</button></span>` : "";
      const src = r.sources ? `<span class="sub">sources: ${r.sources.split(";").map((k) => `<button class="refbtn" data-hl="${k}">${esc(shortRef(k))}</button>`).join(", ")}</span>` : "";
      const edit = CFG.repo && CFG.repo !== "#" ? ` <a class="edit" href="${CFG.repo}/issues/new?template=correction.yml&title=${encodeURIComponent("Correction: " + r.id)}&row_id=${r.id}" target="_blank" rel="noopener">suggest fix</a>` : "";
      const nc = COMMENTS[r.id] || 0;
      const discuss = giscusOn() ? ` · <button type="button" class="edit linklike" data-discuss="${r.id}" aria-expanded="${openThread === r.id}">${openThread === r.id ? "hide comments" : nc ? `comments (${nc})` : "comment"}</button>` : "";
      const cells = cols.map(([k, , c]) => {
        if (k === "division") {
          // links sit under the reference; here only when the Reference column is hidden
          const sub = [show("id") ? `<span class="id">${r.id}</span>` : "", show("links") && !show("ref") ? (show("id") ? edit : edit.replace(/^ /, "")) + discuss : ""].join("");
          const note = r.notes && show("notes") && !show("reported") ? noteBox(r) : "";
          return `<td>${esc(r.label)}${sub ? `<span class="sub">${sub}</span>` : ""}${note}</td>`;
        }
        if (k === "value") return r.xp ? `<td class="num val xp" title="${esc(xpTitle(r))}">${valStr(r)}*</td>` : `<td class="num val">${valStr(r)}</td>`;
        if (k === "reported") return `<td class="reported">${esc(r.reported)}${r.notes && show("notes") ? noteBox(r) : ""}</td>`;
        if (k === "species" || k === "preparation" || k === "condition") return `<td class="cat">${esc(r[k])}</td>`;
        if (k === "bound") return `<td class="cat">${boundPill(r.bound)}</td>`;
        if (k === "status") return `<td class="cat st-${r.status}">${esc(r.status)}</td>`;
        if (k === "ref") {
          const links = show("links") && (edit || discuss) ? `<span class="sub">${(edit + discuss).replace(/^ · /, "").replace(/^ /, "")}</span>` : "";
          return `<td><button class="refbtn" data-hl="${r.ref}">${esc(shortRef(r.ref))}</button>${via}${src}${links}</td>`;
        }
        return `<td class="${c || ""}">${k === "test_freq_mhz" ? esc(r[k]) : fmt(r[k])}</td>`;
      }).join("");
      const thread = openThread === r.id ? `<tr class="thread-row"><td colspan="${cols.length}"><div class="thread" id="thread-host"></div></td></tr>` : "";
      const noteRow = r.notes && show("notes") && OPEN_NOTES.has(r.id) ? `<tr class="note-row ${ex ? "excl" : ""}" id="note-${r.id}"><td colspan="${cols.length}">${esc(r.notes)}</td></tr>` : "";
      return `<tr id="row-${r.id}" class="${ex ? "excl" : ""} ${hl ? "hl" : ""} ${r.bound !== "none" ? "brow b-" + r.bound.split("+")[0] : ""} ${noteRow ? "has-note" : ""}">${cells}</tr>${noteRow}${thread}`;
    }).join("");
    return `<div class="tbl-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  }

  // ---------- overview: all tissues ----------
  function overviewRows() {
    return DATA.filter((r) => FACETS.every((f) => fvals(r, f).every((v) => !S.off[f].has(v))) && passRef(r) && passQ(r));
  }
  function renderOverview() {
    const rows = overviewRows();
    const st = {}; // st[prop][tissue] = rangeStats
    rows.forEach((r) => { ((st[r.property] = st[r.property] || {})[r.tissue] = st[r.property][r.tissue] || []).push(r); });
    const props = Object.keys(PROPS).filter((p) => st[p] && TISSUES.some((t) => st[p][t] && rangeStats(st[p][t])));
    const chartProps = () => props.filter((p) => st[p].skull || st[p].brain);
    props.forEach((p) => TISSUES.forEach((t) => { st[p][t] = st[p][t] ? rangeStats(st[p][t]) : null; }));

    // table
    const unitsReset = FREQ !== 0.5 || Object.keys(UNITS).some((p) => UNIT[p] !== CANON[p]) ? ` <button type="button" id="units-reset" class="link-btn">default units</button>` : "";
    const head = `<thead><tr><th>Property · unit${unitsReset}</th>${OV_TISSUES.map((t) => `<th class="num t-${t}">${cap(t)}</th>`).join("")}</tr></thead>`;
    const body = props.map((p) => `<tr><td class="prop">${PROPS[p].name}<span class="sub">${UNITS[p] ? unitPick(p) : PROPS[p].unit}</span></td>${OV_TISSUES.map((t) => {
      const v = st[p][t];
      const bd = BMAP[`${t}|${p}`];
      const r = v ? (v.lo === v.hi ? fmt(v.lo) : `${fmt(v.lo)}–${fmt(v.hi)}`) : "";
      // bounds (or the water ref. value) only when they differ from the range shown above them
      const bstr = bd ? (bd.uniform ? fmt(bd.uniform.value) : `${bd.low ? fmt(bd.low.value) : "?"}–${bd.high ? fmt(bd.high.value) : "?"}`) : "";
      // brain absorption as a fraction of the attenuation bound at the same level (as in Table 1), from canonical values
      const ad = t === "brain" && p === "absorption_coefficient" ? BMAP["brain|attenuation"] : null;
      const frac = (k) => (ad && bd?.[k] && ad[k] ? Math.round((100 * +bd[k]._c) / +ad[k]._c) : null);
      const fTitle = "absorption bound ÷ attenuation bound at the same level";
      const fLH = frac("low") != null && frac("high") != null ? `<span class="sub bsub" title="${fTitle}">${frac("low")}–${frac("high")} % of attenuation</span>` : "";
      const bref = bd && bd.reference && CMP.bench ? `benchmark ${fmt(bd.reference.value)}${frac("reference") != null ? ` (${frac("reference")} %)` : ""}` : "";
      const btxt = (bstr && bstr !== r ? `<span class="sub bsub">${bd.uniform ? "ref. " : "bounds "}${bstr}</span>` : "") + fLH +
        (bref ? `<span class="sub bsub bref"${frac("reference") != null ? ` title="${fTitle}"` : ""}>${bref}</span>` : "");
      if (!v) return `<td class="none">—${btxt}</td>`;
      return `<td><button type="button" class="cellbtn" data-ov="${t}|${p}" title="Show ${t} ${PROPS[p].name.toLowerCase()} values"><span class="rng-txt">${r}</span><span class="sub">median ${fmt(v.m)} · n ${v.n}</span>${btxt}</button></td>`;
    }).join("")}</tr>`).join("");
    $("#ov-table").innerHTML = props.length ? head + `<tbody>${body}</tbody>` : `<tbody><tr><td class="none">No values match the current filters.</td></tr></tbody>`;

    renderChart(rows);
  }

  // ---------- comparison chart (overview): user-selected grouping ----------
  const CMP = { mode: "tissue", values: true, bench: false, hidden: new Set(["water"]) };
  // legend groups hidden until clicked: water in the tissue view, non-human species in the species view
  const hiddenDefault = () => new Set(CMP.mode === "tissue" ? ["water"]
    : CMP.mode === "species" ? facetColors("species").vals.filter((v) => v !== "human") : []);
  const SKULL_LAYER = { cortical: "cortical", "cortical (outer table)": "cortical", "cortical (inner table)": "cortical", cancellous: "trabecular", "diploë": "trabecular" };
  const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const NEUTRAL = new Set(["unspecified", "n/a"]);
  const T = (t) => (r) => r.tissue === t;
  const G = (key, label, color, test, tissue, anchor) => ({ key, label, color, test, tissue, anchor });
  const MODES = {
    tissue: { label: "Tissue", groups: () => [
      G("water", "water", "--water", T("water"), "water", true),
      G("brain", "brain", "--brain", T("brain"), "brain", true),
      G("skull", "skull", "--skull", T("skull"), "skull", true)] },
    skull_layer: { label: "Skull layer", groups: () => [
      G("brain", "brain", "--brain", T("brain"), "brain", true),
      G("skull", "skull (all)", "--skull", T("skull"), "skull", true),
      G("skull-unclear", "skull (layer unclear)", "--sk-unclear", (r) => r.tissue === "skull" && !SKULL_LAYER[r.division], "skull"),
      G("skull-cortical", "skull cortical", "--sk-cortical", (r) => r.tissue === "skull" && SKULL_LAYER[r.division] === "cortical", "skull"),
      G("skull-trabecular", "skull trabecular", "--sk-trabecular", (r) => r.tissue === "skull" && SKULL_LAYER[r.division] === "trabecular", "skull")] },
    brain_region: { label: "Brain region", groups: () => [
      G("skull", "skull", "--skull", T("skull"), "skull", true),
      G("brain", "brain (all)", "--brain", (r) => r.tissue === "brain" && !r.division.startsWith("proxy"), "brain", true),
      G("brain-gray", "gray matter", "--c1", (r) => r.tissue === "brain" && r.division === "gray matter", "brain"),
      G("brain-white", "white matter", "--c2", (r) => r.tissue === "brain" && r.division === "white matter", "brain"),
      G("brain-unclear", "brain (region unclear)", "--c5", (r) => r.tissue === "brain" && !["gray matter", "white matter"].includes(r.division) && !r.division.startsWith("proxy"), "brain"),
      G("brain-proxy", "non-brain proxy", "--c4", (r) => r.tissue === "brain" && r.division.startsWith("proxy"), "brain")] },
    species: { label: "Species", field: "species" },
    preparation: { label: "Preparation", field: "preparation" },
    condition: { label: "Condition", field: "condition" },
    status: { label: "Status", field: "status" },
  };
  // colour follows the value, assigned once from the full dataset (most frequent first)
  function facetColors(field) {
    const n = {};
    DATA.filter((r) => r.tissue !== "water").forEach((r) => fvals(r, field).forEach((v) => { n[v] = (n[v] || 0) + 1; }));
    const vals = Object.keys(n).filter((v) => !NEUTRAL.has(v)).sort((a, b) => n[b] - n[a] || a.localeCompare(b));
    const col = {};
    vals.forEach((v, i) => { col[v] = i < 8 ? `--c${i + 1}` : "--muted"; });
    Object.keys(n).filter((v) => NEUTRAL.has(v)).forEach((v) => { col[v] = "--muted"; });
    return { vals: vals.concat(Object.keys(n).filter((v) => NEUTRAL.has(v))), col };
  }
  function chartFacets() {
    const m = MODES[CMP.mode] || MODES.tissue;
    if (!m.field) return [{ title: "", groups: m.groups() }];
    const { vals, col } = facetColors(m.field);
    return ["skull", "brain"].map((t) => ({
      title: cap(t), tissue: t,
      groups: vals.filter((v) => DATA.some((r) => r.tissue === t && fvals(r, m.field).includes(v)))
        .map((v) => ({ key: v, label: v, color: col[v], test: (r) => r.tissue === t && fvals(r, m.field).includes(v), tissue: t })),
    }));
  }
  function legendItems(facets) {
    const seen = new Map();
    facets.forEach((f) => f.groups.forEach((g) => { if (!seen.has(g.key)) seen.set(g.key, g); }));
    return [...seen.values()];
  }
  function hash32(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; }

  function renderChart(rowsIn) {
    const box = $("#ov-chart");
    const m = MODES[CMP.mode] || MODES.tissue;
    const useExcl = CMP.mode === "status";
    const rows = rowsIn.filter((r) => r.value !== "" && (useExcl || r.status !== "excluded"));
    const facets = chartFacets();
    const legend = legendItems(facets);
    facets.forEach((f) => { f.vis = f.groups.filter((g) => !CMP.hidden.has(g.key)); });
    const props = Object.keys(PROPS).filter((p) => facets.some((f) => f.vis.some((g) => rows.some((r) => r.property === p && g.test(r)))));
    const col = (v) => tok(v) || v;
    const ink = tok("--text"), muted = tok("--muted"), surface = tok("--bg"), marker = tok("--marker"), bench = tok("--bench");
    const font = getComputedStyle(document.body).fontFamily.replace(/"/g, "'");

    const maxG = Math.max(1, ...facets.map((f) => f.vis.length));
    const bw = 14, gap = 5;
    const need = 56 + maxG * (bw + gap) + 14;
    const W0 = Math.max(box.clientWidth || 800, 320);
    const cw = Math.max(need, props.length ? W0 / props.length : W0);
    const W = Math.max(W0, cw * props.length);

    // legend (inside the SVG so exports carry it)
    let lx = 8, ly = 16; const lrows = [];
    const litems = legend.map((g) => ({ g, w: 22 + g.label.length * 6.6 + 16 }))
      .concat([{ dot: true, w: 22 + 15 * 6.6 }, ...(rows.some((r) => r.xp && props.includes(r.property)) ? [{ xp: true, w: 22 + 26 * 6.6 }] : []), { bnd: true, w: 22 + 16 * 6.6 }, ...(CMP.bench ? [{ ref: true, w: 22 + 19 * 6.6 }] : [])]);
    const lsvg = litems.map((it) => {
      if (lx + it.w > W0 - 8) { lx = 8; ly += 20; }
      const x = lx; lx += it.w;
      if (it.dot) return `<g><circle cx="${x + 6}" cy="${ly - 4}" r="3" fill="${marker}"/><text x="${x + 16}" y="${ly}" fill="${ink}" font-size="12">literature value</text></g>`;
      if (it.xp) return `<g><circle cx="${x + 6}" cy="${ly - 4}" r="3" fill="${surface}" stroke="${marker}" stroke-width="1.2"/><text x="${x + 16}" y="${ly}" fill="${ink}" font-size="12">extrapolated in frequency</text></g>`;
      if (it.ref) return `<g><line x1="${x}" x2="${x + 12}" y1="${ly - 4}" y2="${ly - 4}" stroke="${bench}" stroke-width="3"/><text x="${x + 16}" y="${ly}" fill="${ink}" font-size="12">reference benchmark</text></g>`;
      if (it.bnd) return `<g><line x1="${x}" x2="${x + 12}" y1="${ly - 4}" y2="${ly - 4}" stroke="${marker}" stroke-width="2"/><text x="${x + 16}" y="${ly}" fill="${ink}" font-size="12">LOW / HIGH bound</text></g>`;
      const off = CMP.hidden.has(it.g.key);
      return `<g class="lg" data-grp="${esc(it.g.key)}" tabindex="0" role="button" aria-pressed="${!off}" style="cursor:pointer" opacity="${off ? 0.35 : 1}"><title>${off ? "Show" : "Hide"} ${esc(it.g.label)}</title><rect x="${x}" y="${ly - 11}" width="12" height="12" rx="2" fill="${col(it.g.color)}"/><text x="${x + 16}" y="${ly}" fill="${ink}" font-size="12" font-weight="600">${esc(it.g.label)}</text></g>`;
    }).join("");
    const legendH = ly + 14;

    const facetH = 230, titleH = m.field ? 18 : 0, nameH = 40;
    const H = legendH + facets.length * (facetH + titleH) + nameH;
    let svg = "";
    props.forEach((p, i) => {
      const x0 = i * cw, ax = x0 + 46;
      // scale: shared across groups in one row; per row when faceted (rows differ by tissue).
      // Absorption shares the attenuation axis (absorption cannot exceed attenuation) when both use one unit.
      const ps = FREQ_PROPS.includes(p) && UNIT.attenuation === UNIT.absorption_coefficient ? FREQ_PROPS : [p];
      const scaleFor = (fs) => {
        const vals = [];
        fs.forEach((f) => f.vis.forEach((g) => rows.filter((r) => ps.includes(r.property) && g.test(r)).forEach((r) => { vals.push(+r.value); if (r.value_max) vals.push(+r.value_max); })));
        new Set(fs.flatMap((f) => f.vis.map((g) => g.tissue))).forEach((t) => ps.forEach((q) => ["low", "high", "reference"].forEach((k) => { const bd = BMAP[`${t}|${q}`]?.[k]; if (bd && t !== "water") vals.push(+bd.value); })));
        if (!vals.length) return null;
        let lo = Math.min(...vals), hi = Math.max(...vals);
        if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
        const tk = niceTicks(lo, hi, 5), step = tk.length > 1 ? tk[1] - tk[0] : hi - lo;
        let a = Math.floor(lo / step + 1e-9) * step; const b = Math.ceil(hi / step - 1e-9) * step;
        if (lo >= 0 && a < 0) a = 0;
        return { a, b, step };
      };
      const shared = scaleFor(facets);
      if (!shared) return;
      const unit = PROPS[p].unit.replace(/ @ (\S+) MHz$/, " @$1MHz");
      let colSvg = `<rect x="${x0}" y="${legendH}" width="${cw}" height="${H - legendH}" fill="transparent"/>`;
      facets.forEach((f, fi) => {
        const { a, b, step } = (m.field && scaleFor([f])) || shared;
        const top0 = legendH + fi * (facetH + titleH) + titleH;
        const top = top0 + 34, bot = top0 + facetH - 22;
        const y = (v) => bot - ((v - a) / (b - a)) * (bot - top);
        if (titleH && i === 0) colSvg += `<text x="${x0 + 4}" y="${top0 - 4}" fill="${ink}" font-size="13" font-weight="700">${esc(f.title)}</text>`;
        colSvg += `<text x="${ax + 4}" y="${top0 + 12}" fill="${muted}" font-size="11" font-style="italic">${esc(unit)}</text>
          <text x="${ax - 4}" y="${top + 4}" fill="${muted}" font-size="11" text-anchor="end">${fmt(b)}</text>
          <text x="${ax - 4}" y="${bot + 4}" fill="${muted}" font-size="11" text-anchor="end">${fmt(a)}</text>
          <line x1="${ax}" x2="${ax}" y1="${top}" y2="${bot}" stroke="${ink}" stroke-width="1"/>`;
        for (let v = a; v <= b + step / 2; v += step) colSvg += `<line x1="${ax}" x2="${ax + 4}" y1="${y(v)}" y2="${y(v)}" stroke="${muted}"/>`;
        f.vis.forEach((g, gi) => {
          const bx = ax + 10 + gi * (bw + gap);
          const rs = rows.filter((r) => r.property === p && g.test(r));
          if (!rs.length) { colSvg += `<text transform="translate(${bx + bw / 2 + 4},${bot - 4}) rotate(-90)" fill="${muted}" font-size="11">n/a</text>`; return; }
          const st = rangeStats(useExcl ? rs.map((r) => ({ ...r, status: "included" })) : rs);
          const y1 = y(st.hi), y2 = y(st.lo), h = Math.max(3, y2 - y1);
          colSvg += `<rect x="${bx}" y="${y2 - h}" width="${bw}" height="${h}" fill="${col(g.color)}"><title>${esc(g.label)} · ${PROPS[p].name.toLowerCase()}: ${fmt(st.lo)}–${fmt(st.hi)} ${PROPS[p].unit} (median ${fmt(st.m)}, n ${st.n})</title></rect>`;
          if (g.anchor) ["low", "high"].forEach((k) => {
            const bd = BMAP[`${g.tissue}|${p}`]?.[k]; if (!bd) return;
            colSvg += `<line x1="${bx - 4}" x2="${bx + bw + 4}" y1="${y(+bd.value)}" y2="${y(+bd.value)}" stroke="${marker}" stroke-width="2"><title>${cap(g.tissue)} ${k.toUpperCase()} bound ${fmt(bd.value)} (v${BV})</title></line>`;
          });
          const rb = CMP.bench && g.anchor && BMAP[`${g.tissue}|${p}`]?.reference;
          if (rb) colSvg += `<line x1="${bx - 6}" x2="${bx + bw + 6}" y1="${y(+rb.value)}" y2="${y(+rb.value)}" stroke="${bench}" stroke-width="3" pointer-events="none"><title>${cap(g.tissue)} reference benchmark ${fmt(rb.value)} (v${BV})</title></line>`;
          if (CMP.values) {
            rs.forEach((r) => {
              const jx = bx + bw / 2 + (hash32(r.id) - 0.5) * bw * 0.6;
              const t = `<title>${esc(r.label)} — ${valStr(r)} (${esc(shortRef(r.ref))})${r.xp ? " — " + esc(xpTitle(r)) : ""} · click to open</title>`;
              if (r.value_max) colSvg += `<g data-goto="${r.id}" tabindex="0" role="button" aria-label="Open ${r.id}" style="cursor:pointer"><line x1="${jx}" x2="${jx}" y1="${y(+r.value)}" y2="${y(+r.value_max)}" stroke="${marker}" stroke-width="1.5"/><circle cx="${jx}" cy="${y(+r.value)}" r="2.4" fill="${marker}"/><circle cx="${jx}" cy="${y(+r.value_max)}" r="2.4" fill="${marker}"/>${t}</g>`;
              else colSvg += `<circle data-goto="${r.id}" tabindex="0" role="button" aria-label="Open ${r.id}" style="cursor:pointer" cx="${jx}" cy="${y(+r.value)}" r="3" fill="${r.status === "excluded" ? "none" : r.xp ? surface : marker}" stroke="${marker}" stroke-width="${r.status === "excluded" || r.xp ? 1.2 : 0}">${t}</circle>`;
            });
          } else {
            colSvg += `<ellipse cx="${bx + bw / 2}" cy="${y(st.m)}" rx="2.6" ry="5" fill="${marker}"><title>median ${fmt(st.m)}</title></ellipse>`;
          }
        });
        if (!g0anchor(f) && f.tissue && f.vis.length) ["low", "high", ...(CMP.bench ? ["reference"] : [])].forEach((k) => {
          const bd = BMAP[`${f.tissue}|${p}`]?.[k]; if (!bd) return;
          const xe = ax + 10 + f.vis.length * (bw + gap), rf = k === "reference";
          colSvg += `<line x1="${ax + 6}" x2="${xe}" y1="${y(+bd.value)}" y2="${y(+bd.value)}" stroke="${rf ? bench : marker}" stroke-width="${rf ? 2 : 1.5}" stroke-dasharray="${rf ? "none" : "4 3"}" pointer-events="none"><title>${cap(f.tissue)} ${rf ? "reference benchmark" : k.toUpperCase() + " bound"} ${fmt(bd.value)} (v${BV})</title></line>`;
        });
      });
      const name = PROPS[p].name.split(" ");
      const ny = H - nameH + 16;
      colSvg += `<text x="${ax}" y="${ny}" fill="${S.props.has(p) ? tok("--accent") : ink}" font-size="13" font-weight="${S.props.has(p) ? 700 : 400}">${esc(name[0])}${name.length > 1 ? `<tspan x="${ax}" dy="15">${esc(name.slice(1).join(" "))}</tspan>` : ""}</text>`;
      svg += `<g data-ovp="${p}" tabindex="0" role="button" aria-pressed="${S.props.has(p)}" aria-label="${PROPS[p].name}: filter the tables" style="cursor:pointer"><title>${PROPS[p].name} — click to filter the tables</title>${colSvg}</g>`;
    });
    box.innerHTML = props.length
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${font}" role="group" aria-label="Literature values per property, grouped by ${esc(m.label.toLowerCase())}"><rect class="bg" width="${W}" height="${H}" fill="${surface}"/>${lsvg}${svg}</svg>`
      // all groups hidden: keep the legend, so they can be shown again
      : CMP.hidden.size && legend.length
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W0} ${ly + 10}" width="${W0}" height="${ly + 10}" font-family="${font}" role="group" aria-label="Chart legend"><rect class="bg" width="${W0}" height="${ly + 10}" fill="${surface}"/>${lsvg}</svg>
           <p class="none">All groups are hidden. Click a legend entry to show it, or <button type="button" id="cmp-showall" class="link-btn">show all</button>.</p>`
        : `<p class="none">No values to plot under the current filters.</p>`;
  }
  const g0anchor = (f) => f.vis.some((g) => g.anchor);

  // attach the link before clicking and revoke the URL later (Firefox needs both)
  function saveBlob(blob, filename) {
    const u = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: u, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function exportChart(kind) {
    const svgEl = $("#ov-chart svg"); if (!svgEl) return;
    const src = new XMLSerializer().serializeToString(svgEl);
    const name = `tus_overview_${CMP.mode}_v${META.version || ""}`;
    if (kind === "svg") { saveBlob(new Blob([src], { type: "image/svg+xml" }), `${name}.svg`); return; }
    const img = new Image(), w = +svgEl.getAttribute("width"), h = +svgEl.getAttribute("height");
    img.onload = () => {
      const c = Object.assign(document.createElement("canvas"), { width: w * 2, height: h * 2 });
      const ctx = c.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
      c.toBlob((bl) => saveBlob(bl, `${name}.png`));
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
  }

  let current = [], lastRow = "", openThread = "", COMMENTS = {};

  // ---------- per-value comment threads (giscus / GitHub Discussions) ----------
  const giscusOn = () => !!(CFG.giscus && CFG.giscus.repoId && CFG.giscus.categoryId);
  function giscusTheme() {
    const t = currentTheme();
    return t === "system" ? "preferred_color_scheme" : t;
  }
  function mountThread() {
    const host = document.getElementById("thread-host");
    if (!host || host.dataset.mounted === openThread) return;
    host.dataset.mounted = openThread;
    host.innerHTML = `<p class="thread-note">Comments on <b>${esc(openThread)}</b> are public and stored in GitHub Discussions (sign in with GitHub). For a concrete correction, use “suggest fix”.</p><div class="giscus"></div>`;
    const g = CFG.giscus, s = document.createElement("script");
    Object.entries({
      src: "https://giscus.app/client.js", "data-repo": g.repo, "data-repo-id": g.repoId,
      "data-category": g.category, "data-category-id": g.categoryId,
      "data-mapping": "specific", "data-term": openThread, "data-strict": "1",
      "data-reactions-enabled": "0", "data-emit-metadata": "0", "data-input-position": "top",
      "data-theme": giscusTheme(), "data-lang": "en", "data-loading": "lazy", crossorigin: "anonymous",
    }).forEach(([k, v]) => s.setAttribute(k, v));
    s.async = true;
    host.appendChild(s);
  }
  function syncGiscusTheme() {
    const f = document.querySelector("iframe.giscus-frame");
    f?.contentWindow?.postMessage({ giscus: { setConfig: { theme: giscusTheme() } } }, "https://giscus.app");
  }
  const smooth = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
  function renderResults() {
    current = filter();
    $("#count").textContent = `${current.length} of ${DATA.length} values`;
    const groups = new Map();
    current.forEach((r) => {
      const k = `${r.tissue}|${r.property}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    const order = (k) => { const [t, p] = k.split("|"); return TISSUES.indexOf(t) * 100 + Object.keys(PROPS).indexOf(p); };
    const html = [...groups.keys()].sort((a, b) => order(a) - order(b)).map((k) => {
      const [t, p] = k.split("|"), rows = groups.get(k);
      return `<section class="card"><div class="card-head"><h2>${cap(t)} · ${PROPS[p]?.name || p} <span class="unit">(${PROPS[p]?.unit || rows[0].unit})</span></h2>${stats(rows)}</div>${strip(rows)}${table(rows, p)}</section>`;
    }).join("");
    $("#results").innerHTML = html || `<div class="empty">No values match the current filters.</div>`;
    if (openThread) mountThread();

    const cited = usedRefKeys(current);
    $("#cited").innerHTML = cited.sort((a, b) => shortRef(a).localeCompare(shortRef(b))).map((k) => {
      const r = REFS[k];
      if (!r) return `<li><span class="key">${k}</span> — missing from references.csv</li>`;
      const n = current.filter((x) => rowKeys(x).includes(k)).length;
      return `<li id="ref-${k}" class="${S.hl === k ? "hl" : ""}">${esc(r.citation)}${r.doi ? ` <a href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">doi:${esc(r.doi)}</a>` : ""}
        <span class="ref-actions"><button type="button" class="link-btn" data-back="${k}">↑ ${n} value${n === 1 ? "" : "s"} in table</button></span></li>`;
    }).join("");
  }

  function renderColumnControls() {
    $("#colpick-list").innerHTML = COLUMNS.map(([k, n]) => `<label><input type="checkbox" data-col="${k}" ${S.hide.has(k) ? "" : "checked"}> ${n}</label>`).join("");
  }
  function renderCompareControls() {
    $("#cmp").innerHTML = Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === CMP.mode ? "selected" : ""}>${m.label}</option>`).join("");
    $("#cmp-values").checked = CMP.values; $("#cmp-bench").checked = CMP.bench;
  }
  function gotoRow(id) {
    const r = DATA.find((x) => x.id === id); if (!r) return;
    S.tissue = r.tissue; S.props = new Set([r.property]);
    FACETS.forEach((f) => fvals(r, f).forEach((v) => S.off[f].delete(v)));
    render();
    const tr = document.getElementById("row-" + id);
    if (tr) { tr.scrollIntoView({ behavior: smooth(), block: "center" }); tr.classList.add("flash"); setTimeout(() => tr.classList.remove("flash"), 1400); }
  }
  function renderVersion() {
    const vs = VERSIONS.length ? VERSIONS : [{ version: META.version, date: META.date }];
    $("#bv").innerHTML = vs.map((x) => `<option value="${x.version}" ${x.version === META.version ? "selected" : ""}>v${x.version}${x.version === CURRENT ? " (current)" : ""}</option>`).join("");
    const old = META.version !== CURRENT, ban = $("#vbanner");
    ban.hidden = !old;
    if (old) ban.innerHTML = `You are viewing database <b>v${esc(META.version)}</b> (${esc(META.date || "")}). The current version is v${esc(CURRENT)}. <button type="button" id="to-current" class="link-btn">Show current version</button>`;
  }
  function render() { applyUnit(); applyBounds(); renderVersion(); renderCompareControls(); renderColumnControls(); renderControls(); renderOverview(); renderResults(); writeHash(); }

  // ---------- events ----------
  function bind() {
    document.addEventListener("click", (e) => { // close the column menu on an outside click
      const cp = $(".colpick"); if (cp?.open && !cp.contains(e.target)) cp.open = false;
    });
    document.addEventListener("click", (e) => {
      const t = e.target.closest("button, th[data-sort], [data-grp], [data-goto], [data-ovp]");
      if (!t) return;
      if (t.dataset.ov) {
        const [tt, pp] = t.dataset.ov.split("|");
        S.tissue = tt; S.props = new Set([pp]); S.off.division.clear();
        render(); $(".toolbar").scrollIntoView({ behavior: smooth(), block: "start" }); return;
      }
      if (t.dataset.goto) { gotoRow(t.dataset.goto); return; }
      if (t.dataset.grp !== undefined) { CMP.hidden.has(t.dataset.grp) ? CMP.hidden.delete(t.dataset.grp) : CMP.hidden.add(t.dataset.grp); renderOverview(); writeHash(); return; }
      if (t.id === "dl-svg" || t.id === "dl-png") { exportChart(t.id.slice(3)); return; }
      if (t.dataset.ovp) { S.props.has(t.dataset.ovp) ? S.props.delete(t.dataset.ovp) : S.props.add(t.dataset.ovp); }
      else if (t.id === "theme") { cycleTheme(); syncGiscusTheme(); return; }
      else if (t.id === "to-current") { switchVersion(CURRENT); return; }
      else if (t.id === "filters-toggle") {
        const open = $(".filters").classList.toggle("open");
        t.setAttribute("aria-expanded", open); t.textContent = open ? "Hide filters" : "Show filters";
        return;
      }
      else if (t.dataset.discuss) {
        openThread = openThread === t.dataset.discuss ? "" : t.dataset.discuss;
        renderResults();
        return;
      }
      else if (t.dataset.t) { S.tissue = t.dataset.t; S.off.division.clear(); }
      else if (t.dataset.p) { S.props.has(t.dataset.p) ? S.props.delete(t.dataset.p) : S.props.add(t.dataset.p); }
      else if (t.dataset.refs === "all") S.refsOff.clear();
      else if (t.dataset.refs === "none") S.refsOff = new Set(usedRefKeys(DATA));
      else if (t.dataset.hl !== undefined) {
        // jump to the full reference; highlight its rows; remember where we came from
        S.hl = t.dataset.hl; lastRow = t.closest("tr")?.id || "";
        render();
        const li = document.getElementById("ref-" + S.hl);
        if (li) { li.scrollIntoView({ behavior: smooth(), block: "center" }); li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1200); }
        return;
      }
      else if (t.dataset.back) {
        const target = (lastRow && document.getElementById(lastRow)) || document.querySelector("tr.hl");
        target?.scrollIntoView({ behavior: smooth(), block: "center" });
        return;
      }
      else if (t.dataset.sort) {
        const k = t.dataset.key, cur = S.sort[k] || { k: "value", d: 1 };
        S.sort[k] = { k: t.dataset.sort, d: cur.k === t.dataset.sort ? -cur.d : 1 };
      }
      else if (t.dataset.note) { const id = t.dataset.note; OPEN_NOTES.has(id) ? OPEN_NOTES.delete(id) : OPEN_NOTES.add(id); renderResults(); $(`.note-btn[data-note="${CSS.escape(id)}"]`)?.focus(); return; }
      else if (t.id === "cmp-showall") CMP.hidden.clear();
      else if (t.id === "reset") { S = { ...DEFAULT(), hide: S.hide }; CMP.hidden = hiddenDefault(); $("#ref-search").value = ""; } // filters only; keep the column choice
      else if (t.id === "units-reset") { UNIT = { ...CANON }; FREQ = 0.5; }
      else if (t.id === "dl") return download(false);
      else if (t.id === "dl-all") return download(true);
      else if (t.id === "share") { navigator.clipboard?.writeText(location.href); t.textContent = "Copied"; setTimeout(() => (t.textContent = "Copy link"), 1200); return; }
      else return;
      render();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const t = e.target.closest?.("th[data-sort], [data-grp], [data-goto], [data-ovp]");
      if (!t || t !== e.target) return;
      e.preventDefault();
      const focus = t.dataset.ovp || t.dataset.grp; // keep focus on the redrawn element
      t.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      if (t.dataset.ovp) $(`#ov-chart [data-ovp="${focus}"]`)?.focus();
      else if (t.dataset.grp !== undefined) $(`#ov-chart [data-grp="${CSS.escape(focus)}"]`)?.focus();
      else if (t.dataset.sort) $(`th[data-sort="${t.dataset.sort}"][data-key="${t.dataset.key}"]`)?.focus();
    });
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.f) { t.checked ? S.off[t.dataset.f].delete(t.value) : S.off[t.dataset.f].add(t.value); }
      else if (t.dataset.ref) { t.checked ? S.refsOff.delete(t.dataset.ref) : S.refsOff.add(t.dataset.ref); }
      else if (t.id === "ref-deep") S.deep = t.checked;
      else if (t.id === "bv") { switchVersion(t.value); return; }
      else if (t.dataset.freq) { FREQ = +t.value; render(); $(`select[data-freq="${t.dataset.freq}"]`)?.focus(); return; }
      else if (t.dataset.unit) { UNIT[t.dataset.unit] = t.value; render(); $(`select[data-unit="${t.dataset.unit}"]`)?.focus(); return; } // keep focus on the redrawn picker
      else if (t.id === "cmp") { CMP.mode = t.value; CMP.hidden = hiddenDefault(); }
      else if (t.id === "cmp-values") CMP.values = t.checked;
      else if (t.id === "cmp-bench") CMP.bench = t.checked;
      else if (t.dataset.col) { t.checked ? S.hide.delete(t.dataset.col) : S.hide.add(t.dataset.col); }
      else return;
      render();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => renderOverview());
    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { renderOverview(); renderResults(); }, 150); });
    let qt;
    $("#q").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { S.q = e.target.value.trim(); render(); }, 150); });
    $("#ref-search").addEventListener("input", renderControls);
    $("#results").addEventListener("mouseover", (e) => {
      const id = e.target.dataset?.id;
      document.querySelectorAll("tr.peek").forEach((r) => r.classList.remove("peek", "hl"));
      if (id) { const tr = document.getElementById("row-" + id); if (tr && !tr.classList.contains("hl")) tr.classList.add("peek", "hl"); }
    });
    $("#results").addEventListener("click", (e) => {
      const id = e.target.dataset?.id;
      if (id) document.getElementById("row-" + id)?.scrollIntoView({ block: "center", behavior: smooth() });
    });
  }

  // ---------- export: CSV + metadata.json in one zip ----------
  const COL_INFO = {
    id: "permanent row identifier", tissue: "target tissue in the simulation", division: "measured sub-tissue", label: "tissue description",
    property: "property key", value: "value in the canonical unit (attenuation: dB/cm at 0.5 MHz)", value_max: "upper end if the source reports a range",
    unit: "canonical unit", reported: "value as printed in the source", test_freq_mhz: "test frequency or range (MHz)",
    exponent_b: "power-law exponent of attenuation", db_cm_1mhz: "attenuation at 1 MHz (dB/cm)", species: "species (;-separated)",
    preparation: "source of the value: in vivo, ex vivo, model-derived, compilation or reference standard", condition: "tissue state at measurement for ex vivo rows: fresh, frozen, fixed, embalmed, dried, mixed or unspecified", status: "included / excluded / proposed", ref: "key of the primary source", via: "secondary source the value was taken from",
    sources: "sources cited by a compilation (;-separated)", notes: "exclusion reason, caveats, conversions",
    bound: "LOW/HIGH bound this row defines in bound_version", bound_version: "version of the LOW/HIGH bounds", db_version: "database version",
    citation: "citation of the primary source", doi: "DOI of the primary source",
  };
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  // minimal zip (stored, UTF-8 names): enough for a few text files, no dependency
  function zip(files) {
    const enc = new TextEncoder(), d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = []; let off = 0;
    files.forEach(([name, text]) => {
      const nb = enc.encode(name), db = enc.encode(text), crc = crc32(db);
      const head = (sig, extra) => { const h = new DataView(new ArrayBuffer(extra)); h.setUint32(0, sig, true); return h; };
      const lh = head(0x04034b50, 30);
      [[4, 20], [6, 0x0800], [8, 0], [10, time], [12, date]].forEach(([o, v]) => lh.setUint16(o, v, true));
      lh.setUint32(14, crc, true); lh.setUint32(18, db.length, true); lh.setUint32(22, db.length, true); lh.setUint16(26, nb.length, true);
      const ch = head(0x02014b50, 46);
      [[4, 20], [6, 20], [8, 0x0800], [10, 0], [12, time], [14, date]].forEach(([o, v]) => ch.setUint16(o, v, true));
      ch.setUint32(16, crc, true); ch.setUint32(20, db.length, true); ch.setUint32(24, db.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      parts.push(lh, nb, db); central.push(ch, nb);
      off += 30 + nb.length + db.length;
    });
    const size = central.reduce((a, x) => a + (x.byteLength ?? x.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }
  function download(all) {
    const src = all ? DATA : current;
    const v = META.version || "unknown", scope = all ? "all" : S.tissue;
    const cols = COLS.concat(["bound", "bound_version", "db_version", "citation", "doi"]);
    const rows = src.map((r) => ({ ...r, ...r._c, db_version: v, bound_version: BV, citation: REFS[r.ref]?.citation || "", doi: REFS[r.ref]?.doi || "" }));
    const name = `tus-properties_v${v}_${scope}`;
    const off = Object.fromEntries(FACETS.filter((f) => S.off[f].size).map((f) => [f, [...S.off[f]]]));
    const meta = {
      title: META.title || "TUS Tissue Properties", database_version: v, database_date: META.date || "", bounds_version: BV,
      exported: new Date().toISOString(), source: location.href, rows: rows.length, of_total: DATA.length,
      selection: all ? "all values" : {
        tissue: S.tissue, properties: [...S.props], unticked: off, references_excluded: [...S.refsOff],
        match_indirect_references: S.deep, search: S.q,
      },
      bounds: BOUNDS.filter((b) => b.version === BV).map(({ tissue, property, bound, _c, id, notes }) => ({ tissue, property, bound, value: +_c, id, notes })),
      columns: Object.fromEntries(cols.map((c) => [c, COL_INFO[c] || ""])),
      notes: "Values in the canonical unit of each property (column unit), whatever unit the site displayed; attenuation and absorption: dB/cm at 0.5 MHz, value = db_cm_1mhz * 0.5^exponent_b. Ranges, medians and n on the site use non-excluded values.",
      licence: "Data CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); cite the original sources and this compilation.",
      citation: ($(".site-footer .cite")?.textContent || "").replace(/\s+/g, " ").trim(),
    };
    saveBlob(zip([[`${name}/${name}.csv`, toCSV(rows, cols) + "\n"], [`${name}/${name}_metadata.json`, JSON.stringify(meta, null, 2) + "\n"]]), `${name}.zip`);
  }

  // ---------- theme: system -> light -> dark ----------
  const THEMES = ["system", "light", "dark"];
  function currentTheme() { return document.documentElement.dataset.theme || "system"; }
  function showTheme() { $("#theme").textContent = `Theme: ${cap(currentTheme())}`; }
  function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    if (next === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
    try { next === "system" ? localStorage.removeItem("theme") : localStorage.setItem("theme", next); } catch (e) { /* storage unavailable */ }
    showTheme();
    renderOverview();
  }

  // ---------- boot ----------
  async function boot() {
    showTheme();
    const logo = $("#org-logo");
    logo.addEventListener("error", () => logo.replaceWith(Object.assign(document.createElement("span"), { className: "wordmark", textContent: "ITRUSST" })));
    if (CFG.logo && !logo.src.endsWith(CFG.logo)) logo.src = CFG.logo;
    if (logo.complete && !logo.naturalWidth && logo.getAttribute("src")) logo.dispatchEvent(new Event("error"));
    if (CFG.repo && CFG.repo !== "#") {
      $("#repo-link").href = CFG.repo;
      $("#contrib-link").href = `${CFG.repo}/blob/${CFG.branch}/${CFG.dir || ""}CONTRIBUTING.md`;
      $(".vbadge").href = `${CFG.repo}/blob/${CFG.branch}/${CFG.dir || ""}CHANGELOG.md`;
      $("#release-link").href = `${CFG.repo}/releases/latest`;
    } else { $("#repo-link").remove(); $("#release-link").remove(); $("#contrib-link").href = "CONTRIBUTING.md"; }
    try { const vr = await fetch("data/versions.json", { cache: "no-cache" }); if (vr.ok) ({ current: CURRENT, versions: VERSIONS } = await vr.json()); } catch (e) { /* local preview: current data only */ }
    const want = new URLSearchParams(location.hash.slice(1)).get("v");
    await loadVersion(want && VERSIONS.some((x) => x.version === want) ? want : CURRENT);
    if (giscusOn()) {
      try { const c = await fetch("data/comments.json", { cache: "no-cache" }); if (c.ok) COMMENTS = await c.json(); } catch (e) { /* counts are optional */ }
    }
    S = readHash();
    bind(); render();
  }
  // data of one database version: current files, or the snapshot under versions/X.Y.Z/ (built from git tags)
  async function loadVersion(v) {
    const base = VERSIONS.find((x) => x.version === v)?.path || "";
    const get = (f, optional) => fetch(base + "data/" + f, { cache: "no-cache" }).then((x) => (x.ok ? x.text() : optional ? "" : Promise.reject(new Error(`${base}data/${f}: ${x.status}`))));
    const [m, r, bc, mj] = await Promise.all([get("measurements.csv"), get("references.csv"), get("bounds.csv", true), get("meta.json")]);
    META = JSON.parse(mj); if (!CURRENT) CURRENT = META.version;
    BOUNDS = bc ? parseCSV(bc) : []; BV = META.version;
    DATA = parseCSV(m).filter((r) => r.property in PROPS);
    // versions before `condition`: derive it from the old preparation tags
    DATA.forEach((r) => { if (!("condition" in r)) { r.condition = r.preparation === "fixed" ? "fixed" : r.preparation === "ex vivo" ? "unspecified" : "n/a"; if (r.preparation === "fixed") r.preparation = "ex vivo"; } }); COLS = Object.keys(DATA[0]).filter((k) => k !== "_line");
    DATA.forEach((r) => (r._c = Object.fromEntries(UNIT_FIELDS.map((k) => [k, r[k]]))));
    BOUNDS.forEach((b) => (b._c = b.value));
    REFS = Object.fromEntries(parseCSV(r).map((x) => [x.key, x]));
    document.querySelectorAll("[data-version]").forEach((el) => (el.textContent = `v${META.version}`));
    document.querySelectorAll("[data-version-date]").forEach((el) => (el.textContent = META.date));
  }
  async function switchVersion(v) {
    try { await loadVersion(v); } catch (e) { alert(`Could not load v${v}: ${e.message}`); return renderVersion(); }
    openThread = ""; render();
  }
  boot().catch((e) => { $("#results").innerHTML = `<div class="empty">Could not load data: ${esc(e.message)}</div>`; });
})();
