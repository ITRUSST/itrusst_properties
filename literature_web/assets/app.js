/* TUS Tissue Properties — static client. No build step, no dependencies. */
(() => {
  "use strict";

  const CFG = window.SITE_CONFIG || { repo: "#", branch: "main" };
  const PROPS = {
    sound_speed: { name: "Sound speed", unit: "m/s" },
    density: { name: "Density", unit: "kg/m³" },
    attenuation: { name: "Attenuation", unit: "dB/cm @ 0.5 MHz" },
    thermal_conductivity: { name: "Thermal conductivity", unit: "W/m/K" },
    specific_heat: { name: "Specific heat", unit: "J/kg/K" },
    perfusion: { name: "Perfusion", unit: "mL/min/kg" },
    absorption_fraction: { name: "Absorption fraction", unit: "fraction" },
    absorption_coefficient: { name: "Absorption coefficient", unit: "dB/cm @ 0.5 MHz" },
  };
  const TISSUES = ["skull", "brain", "water"];
  const FACETS = ["status", "species", "division", "preparation"];

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
  const DEFAULT = () => ({ tissue: "skull", props: new Set(), off: Object.fromEntries(FACETS.map((f) => [f, new Set()])), refsOff: new Set(), deep: false, q: "", hl: "", sort: {} });
  let S = DEFAULT();
  let DATA = [], REFS = {}, COLS = [];

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const s = DEFAULT();
    if (p.has("t")) s.tissue = p.get("t");
    if (p.get("p")) s.props = new Set(p.get("p").split(","));
    FACETS.forEach((f) => { if (p.get("x" + f)) s.off[f] = new Set(p.get("x" + f).split("|")); });
    if (p.get("xr")) s.refsOff = new Set(p.get("xr").split(","));
    if (p.get("r")) { // positive ref list is shorter for typical shares
      const keep = new Set(p.get("r").split(","));
      s.refsOff = new Set(Object.keys(REFS).filter((k) => !keep.has(k)));
    }
    s.deep = p.get("deep") === "1";
    s.q = p.get("q") || "";
    s.hl = p.get("hl") || "";
    return s;
  }
  function writeHash() {
    const p = new URLSearchParams();
    if (S.tissue !== "skull") p.set("t", S.tissue);
    if (S.props.size) p.set("p", [...S.props].join(","));
    FACETS.forEach((f) => { if (S.off[f].size) p.set("x" + f, [...S.off[f]].join("|")); });
    if (S.refsOff.size) {
      const used = usedRefKeys(DATA);
      const on = used.filter((k) => !S.refsOff.has(k));
      if (on.length < S.refsOff.size) p.set("r", on.join(",")); else p.set("xr", [...S.refsOff].join(","));
    }
    if (S.deep) p.set("deep", "1");
    if (S.q) p.set("q", S.q);
    if (S.hl) p.set("hl", S.hl);
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
      FACETS.every((f) => f === except || !S.off[f].has(r[f])) &&
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
      const vals = [...new Set(scope.map((r) => r[f]))].sort();
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
  const count = (rows, f) => rows.reduce((a, r) => ((a[r[f]] = (a[r[f]] || 0) + 1), a), {});

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
    if (x !== 0 && Math.abs(x) < 0.01) return x.toPrecision(3);
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
    const W = Math.max(280, ($("#results").clientWidth || 1000) - 2), H = 70, L = 16, R = 16, Y = 28;
    let lo = Math.min(...pts.map((r) => +r.value)), hi = Math.max(...pts.map((r) => +(r.value_max || r.value)));
    if (lo === hi) { lo -= Math.abs(lo) * 0.05 || 1; hi += Math.abs(hi) * 0.05 || 1; }
    const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    const x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
    const ticks = niceTicks(lo, hi, 6);
    const jit = {}; // stack identical values
    const st = rangeStats(rows);
    const band = st ? `<rect class="band" x="${x(st.lo)}" y="${Y - 14}" width="${Math.max(2, x(st.hi) - x(st.lo))}" height="28" rx="3"/>
      <line class="median" x1="${x(st.m)}" x2="${x(st.m)}" y1="${Y - 14}" y2="${Y + 14}"><title>median ${fmt(st.m)}</title></line>` : "";
    const marks = pts.map((r) => {
      const ex = r.status === "excluded" ? " excl" : r.status === "proposed" ? " proposed" : "";
      const on = S.hl && rowKeys(r).includes(S.hl) ? " on" : "";
      const k = Math.round(x(+r.value)); const j = (jit[k] = (jit[k] || 0) + 1) - 1;
      const yy = Y - 8 + (j % 3) * 8;
      const t = `<title>${esc(r.label)} — ${valStr(r)} (${esc(shortRef(r.ref))})</title>`;
      if (r.value_max) return `<line class="rng${ex}${on}" data-id="${r.id}" x1="${x(+r.value)}" x2="${x(+r.value_max)}" y1="${yy}" y2="${yy}">${t}</line>`;
      return `<circle class="dot${ex}${on}" data-id="${r.id}" cx="${x(+r.value)}" cy="${yy}" r="5">${t}</circle>`;
    }).join("");
    return `<svg class="strip" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Distribution of values; shaded band spans non-excluded values, line marks the median">
      ${band}
      <line class="axis" x1="${L}" x2="${W - R}" y1="${Y + 18}" y2="${Y + 18}"/>
      ${ticks.map((t) => `<line class="axis" x1="${x(t)}" x2="${x(t)}" y1="${Y + 18}" y2="${Y + 22}"/><text x="${x(t)}" y="${H - 6}" text-anchor="middle">${fmt(t)}</text>`).join("")}
      ${marks}</svg>`;
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(+v.toPrecision(12));
    return out;
  }

  function table(rows, prop) {
    const att = prop === "attenuation" || prop === "absorption_coefficient";
    const cols = [
      ["division", "Tissue"], ["value", "Value", "num"], ["reported", "Reported"],
      ...(att || rows.some((r) => r.test_freq_mhz) ? [["test_freq_mhz", "f (MHz)", "num"]] : []),
      ...(att ? [["exponent_b", "b", "num"], ["db_cm_1mhz", "dB/cm @1 MHz", "num"]] : []),
      ["species", "Species"], ["preparation", "Preparation"], ["status", "Status"], ["ref", "Reference"],
    ];
    const key = `${rows[0].tissue}:${prop}`;
    const so = S.sort[key] || { k: "value", d: 1 };
    const sorted = rows.slice().sort((a, b) => {
      const av = a[so.k], bv = b[so.k], an = parseFloat(av), bn = parseFloat(bv);
      const c = isFinite(an) && isFinite(bn) ? an - bn : String(so.k === "ref" ? shortRef(av) : av).localeCompare(String(so.k === "ref" ? shortRef(bv) : bv));
      return c * so.d;
    });
    const th = cols.map(([k, n, c]) => `<th data-sort="${k}" data-key="${key}" class="${c || ""} ${so.k === k ? (so.d > 0 ? "asc" : "desc") : ""}">${n}</th>`).join("");
    const tr = sorted.map((r) => {
      const ex = r.status === "excluded";
      const hl = S.hl && rowKeys(r).includes(S.hl);
      const via = r.via ? `<span class="sub">via <button class="refbtn" data-hl="${r.via}">${esc(shortRef(r.via))}</button></span>` : "";
      const src = r.sources ? `<span class="sub">sources: ${r.sources.split(";").map((k) => `<button class="refbtn" data-hl="${k}">${esc(shortRef(k))}</button>`).join(", ")}</span>` : "";
      const edit = CFG.repo && CFG.repo !== "#" ? ` <a class="edit" href="${CFG.repo}/blob/${CFG.branch}/${CFG.dir || ""}data/measurements.csv#L${r._line}" target="_blank" rel="noopener">source</a> · <a class="edit" href="${CFG.repo}/issues/new?template=correction.yml&title=${encodeURIComponent("Correction: " + r.id)}&row_id=${r.id}" target="_blank" rel="noopener">suggest fix</a>` : "";
      const cells = cols.map(([k, , c]) => {
        if (k === "division") return `<td>${esc(r.label)}<span class="sub"><span class="id">${r.id}</span>${edit}</span></td>`;
        if (k === "value") return `<td class="num val">${valStr(r)}</td>`;
        if (k === "reported") return `<td class="reported">${esc(r.reported)}${r.notes ? `<span class="sub">${esc(r.notes)}</span>` : ""}</td>`;
        if (k === "species" || k === "preparation") return `<td class="cat">${esc(r[k])}</td>`;
        if (k === "status") return `<td class="cat st-${r.status}">${esc(r.status)}</td>`;
        if (k === "ref") return `<td><button class="refbtn" data-hl="${r.ref}">${esc(shortRef(r.ref))}</button>${via}${src}</td>`;
        return `<td class="${c || ""}">${k === "test_freq_mhz" ? esc(r[k]) : fmt(r[k])}</td>`;
      }).join("");
      return `<tr id="row-${r.id}" class="${ex ? "excl" : ""} ${hl ? "hl" : ""}">${cells}</tr>`;
    }).join("");
    return `<div class="tbl-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  }

  // ---------- overview: all tissues ----------
  function overviewRows() {
    return DATA.filter((r) => FACETS.every((f) => !S.off[f].has(r[f])) && passRef(r) && passQ(r));
  }
  function renderOverview() {
    const rows = overviewRows();
    const st = {}; // st[prop][tissue] = rangeStats
    rows.forEach((r) => { ((st[r.property] = st[r.property] || {})[r.tissue] = st[r.property][r.tissue] || []).push(r); });
    const props = Object.keys(PROPS).filter((p) => st[p] && TISSUES.some((t) => st[p][t] && rangeStats(st[p][t])));
    const chartProps = () => props.filter((p) => st[p].skull || st[p].brain);
    props.forEach((p) => TISSUES.forEach((t) => { st[p][t] = st[p][t] ? rangeStats(st[p][t]) : null; }));

    // table
    const head = `<thead><tr><th>Property</th>${TISSUES.map((t) => `<th class="num t-${t}">${cap(t)}</th>`).join("")}</tr></thead>`;
    const body = props.map((p) => `<tr><td class="prop">${PROPS[p].name}<span class="sub">${PROPS[p].unit}</span></td>${TISSUES.map((t) => {
      const v = st[p][t];
      if (!v) return `<td class="none">—</td>`;
      const r = v.lo === v.hi ? fmt(v.lo) : `${fmt(v.lo)}–${fmt(v.hi)}`;
      return `<td><button type="button" class="cellbtn" data-ov="${t}|${p}" title="Show ${t} ${PROPS[p].name.toLowerCase()} values"><span class="rng-txt">${r}</span><span class="sub">median ${fmt(v.m)} · n ${v.n}</span></button></td>`;
    }).join("")}</tr>`).join("");
    $("#ov-table").innerHTML = props.length ? head + `<tbody>${body}</tbody>` : `<tbody><tr><td class="none">No values match the current filters.</td></tr></tbody>`;

    // parallel axes
    const box = $("#ov-chart");
    const cp = chartProps();
    const W = Math.max(cp.length * 92, box.clientWidth || 600);
    const n = cp.length || 1, cw = W / n;
    const H = 320, top = 44, bot = H - 58;
    const narrow = cw < 74;
    const cols = cp.map((p, i) => {
      const vals = ["skull", "brain"].flatMap((t) => st[p][t] ? [st[p][t].lo, st[p][t].hi] : []);
      let lo = Math.min(...vals), hi = Math.max(...vals);
      if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
      const ticks = niceTicks(lo, hi, 5), step = ticks.length > 1 ? ticks[1] - ticks[0] : (hi - lo);
      let a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
      if (lo >= 0 && a < 0) a = 0;
      const y = (v) => bot - ((v - a) / (b - a)) * (bot - top);
      const ax = i * cw + Math.min(14, cw * 0.15);
      const bw = Math.max(8, Math.min(22, (cw - 34) / 2.4));
      const xs = { brain: ax + 8, skull: ax + 8 + bw + 5 };
      const minor = []; for (let v = a; v <= b + step / 2; v += step) minor.push(v);
      const bars = ["brain", "skull"].map((t) => {
        const v = st[p][t]; if (!v) return "";
        const y1 = y(v.hi), y2 = y(v.lo), h = Math.max(3, y2 - y1);
        return `<rect class="bar-${t}" x="${xs[t]}" y="${y2 - h === y1 ? y1 : y2 - h}" width="${bw}" height="${h}"><title>${cap(t)} ${PROPS[p].name.toLowerCase()}: ${fmt(v.lo)}–${fmt(v.hi)} ${PROPS[p].unit} (median ${fmt(v.m)}, n ${v.n})</title></rect>
          <ellipse class="med" cx="${xs[t] + bw / 2}" cy="${y(v.m)}" rx="2.6" ry="5.5"><title>median ${fmt(v.m)}</title></ellipse>`;
      }).join("");
      const name = PROPS[p].name.split(" ");
      const unit = PROPS[p].unit.replace(" @ 0.5 MHz", " @0.5MHz");
      return `<g class="col${S.props.has(p) ? " sel" : ""}" data-ovp="${p}">
        <rect x="${i * cw}" y="0" width="${cw}" height="${H}" fill="transparent"/>
        <text class="lbl-unit" x="${ax}" y="13">${narrow ? "" : esc(unit)}</text>
        <text class="lbl-lim" x="${ax}" y="${top - 8}" text-anchor="${i === 0 ? "start" : "middle"}">${fmt(b)}</text>
        <line class="ax" x1="${ax}" x2="${ax}" y1="${top}" y2="${bot}"/>
        ${minor.map((v) => `<line class="tk" x1="${ax}" x2="${ax + 4}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}
        <text class="lbl-lim" x="${ax}" y="${bot + 16}" text-anchor="${i === 0 ? "start" : "middle"}">${fmt(a)}</text>
        ${bars}
        <text class="lbl-prop" x="${ax}" y="${bot + 36}">${esc(name[0])}${name.length > 1 ? `<tspan x="${ax}" dy="14">${esc(name.slice(1).join(" "))}</tspan>` : ""}</text>
        <title>${PROPS[p].name} (${PROPS[p].unit}) — click to filter</title>
      </g>`;
    }).join("");
    box.innerHTML = cp.length ? `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ranges of each property for skull and brain on parallel axes">${cols}</svg>` : "";
  }

  let current = [];
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

    const cited = usedRefKeys(current);
    $("#cited").innerHTML = cited.sort((a, b) => shortRef(a).localeCompare(shortRef(b))).map((k) => {
      const r = REFS[k];
      if (!r) return `<li><span class="key">${k}</span> — missing from references.csv</li>`;
      return `<li id="ref-${k}">${esc(r.citation)}${r.doi ? ` <a href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">doi:${esc(r.doi)}</a>` : ""} <span class="key">${k}</span></li>`;
    }).join("");
  }

  function render() { renderControls(); renderOverview(); renderResults(); writeHash(); }

  // ---------- events ----------
  function bind() {
    document.addEventListener("click", (e) => {
      const t = e.target.closest("button, th[data-sort], [data-ovp]");
      if (!t) return;
      if (t.dataset.ov) {
        const [tt, pp] = t.dataset.ov.split("|");
        S.tissue = tt; S.props = new Set([pp]); S.off.division.clear();
        render(); $(".toolbar").scrollIntoView({ behavior: "smooth", block: "start" }); return;
      }
      if (t.dataset.ovp) { S.props.has(t.dataset.ovp) ? S.props.delete(t.dataset.ovp) : S.props.add(t.dataset.ovp); }
      else if (t.id === "theme") { cycleTheme(); return; }
      else if (t.dataset.t) { S.tissue = t.dataset.t; S.off.division.clear(); }
      else if (t.dataset.p) { S.props.has(t.dataset.p) ? S.props.delete(t.dataset.p) : S.props.add(t.dataset.p); }
      else if (t.dataset.refs === "all") S.refsOff.clear();
      else if (t.dataset.refs === "none") S.refsOff = new Set(usedRefKeys(DATA));
      else if (t.dataset.hl !== undefined) { S.hl = S.hl === t.dataset.hl ? "" : t.dataset.hl; }
      else if (t.dataset.sort) {
        const k = t.dataset.key, cur = S.sort[k] || { k: "value", d: 1 };
        S.sort[k] = { k: t.dataset.sort, d: cur.k === t.dataset.sort ? -cur.d : 1 };
      }
      else if (t.id === "reset") { S = DEFAULT(); $("#ref-search").value = ""; }
      else if (t.id === "dl") return download();
      else if (t.id === "share") { navigator.clipboard?.writeText(location.href); t.textContent = "Copied"; setTimeout(() => (t.textContent = "Copy link"), 1200); return; }
      else return;
      render();
    });
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.f) { t.checked ? S.off[t.dataset.f].delete(t.value) : S.off[t.dataset.f].add(t.value); }
      else if (t.dataset.ref) { t.checked ? S.refsOff.delete(t.dataset.ref) : S.refsOff.add(t.dataset.ref); }
      else if (t.id === "ref-deep") S.deep = t.checked;
      else return;
      render();
    });
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
      if (id) document.getElementById("row-" + id)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function download() {
    const rows = current.map((r) => ({ ...r, citation: REFS[r.ref]?.citation || "", doi: REFS[r.ref]?.doi || "" }));
    const blob = new Blob([toCSV(rows, COLS.concat(["citation", "doi"]))], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `tus_properties_${S.tissue}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
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
    } else { $("#repo-link").remove(); $("#contrib-link").href = "CONTRIBUTING.md"; }
    const [m, r] = await Promise.all(["data/measurements.csv", "data/references.csv"].map((u) => fetch(u, { cache: "no-cache" }).then((x) => x.text())));
    DATA = parseCSV(m); COLS = Object.keys(DATA[0]).filter((k) => k !== "_line");
    REFS = Object.fromEntries(parseCSV(r).map((x) => [x.key, x]));
    S = readHash();
    bind(); render();
  }
  boot().catch((e) => { $("#results").innerHTML = `<div class="empty">Could not load data: ${esc(e.message)}</div>`; });
})();
