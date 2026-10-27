#!/usr/bin/env python3
"""Validate data/measurements.csv and data/references.csv against data/schema.json.

Standard library only. Exit code 1 on any error; warnings never fail the run.
On GitHub Actions, findings are emitted as inline annotations on the PR diff.

    python scripts/validate.py
"""
import csv
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
GHA = os.environ.get("GITHUB_ACTIONS") == "true"
errors, warnings = [], []


def report(kind, file, line, msg):
    (errors if kind == "error" else warnings).append((file, line, msg))
    if GHA:
        print(f"::{kind} file=data/{file},line={line}::{msg}")
    else:
        print(f"{kind.upper():7} data/{file}:{line}  {msg}")


def num(s):
    try:
        return float(s)
    except ValueError:
        return None


def read(name):
    with open(DATA / name, newline="", encoding="utf-8") as f:
        text = f.read()
    if "\r\n" in text:
        report("warning", name, 1, "Windows line endings (CRLF); please save with LF")
    rows = list(csv.reader(text.splitlines()))
    return rows[0], rows[1:]


schema = json.loads((DATA / "schema.json").read_text(encoding="utf-8"))

# ---------- references ----------
rhead, rrows = read("references.csv")
if rhead != ["key", "year", "citation", "doi"]:
    report("error", "references.csv", 1, f"header must be key,year,citation,doi (got {','.join(rhead)})")
refs = {}
for i, r in enumerate(rrows, start=2):
    if len(r) != 4:
        report("error", "references.csv", i, f"expected 4 fields, got {len(r)} (unquoted comma?)")
        continue
    key, year, cit, doi = r
    if not re.fullmatch(r"[a-z]+\d{4}[a-z]?", key):
        report("error", "references.csv", i, f"key '{key}' must be firstauthorYYYY (lowercase), optional a/b suffix")
    if key in refs:
        report("error", "references.csv", i, f"duplicate key '{key}'")
    if not re.fullmatch(r"\d{4}", year) or (key[-4:] != year and key[-5:-1] != year):
        report("error", "references.csv", i, f"year '{year}' must be 4 digits and match the key")
    if len(cit) < 20:
        report("error", "references.csv", i, "citation missing or too short")
    if doi and not re.fullmatch(r"10\.\d{4,9}/\S+", doi):
        report("error", "references.csv", i, f"DOI '{doi}' should be bare (10.xxxx/...), no https://doi.org/ prefix")
    refs[key] = i

# ---------- measurements ----------
mhead, mrows = read("measurements.csv")
if mhead != schema["columns"]:
    report("error", "measurements.csv", 1, "header must be: " + ",".join(schema["columns"]))
    sys.exit(1)

ids, used = set(), set()
props = schema["property"]
for i, vals in enumerate(mrows, start=2):
    if len(vals) != len(mhead):
        report("error", "measurements.csv", i, f"expected {len(mhead)} fields, got {len(vals)} (unquoted comma?)")
        continue
    r = dict(zip(mhead, vals))
    E = lambda m: report("error", "measurements.csv", i, f"{r['id'] or '(no id)'}: {m}")
    W = lambda m: report("warning", "measurements.csv", i, f"{r['id'] or '(no id)'}: {m}")

    for c in schema["required"]:
        if not r[c].strip():
            E(f"'{c}' is required")
    if r["tissue"] not in schema["tissue"]:
        E(f"tissue '{r['tissue']}' not in {schema['tissue']}")
        continue
    p = props.get(r["property"])
    if not p:
        E(f"property '{r['property']}' not in {list(props)}")
        continue

    # id
    m = re.fullmatch(r"(skull|brain|water)-([a-z]+)-(\d{3})", r["id"])
    if not m:
        E("id must look like skull-att-012")
    elif m.group(1) != r["tissue"] or m.group(2) != p["prefix"]:
        E(f"id prefix should be {r['tissue']}-{p['prefix']}-NNN")
    if r["id"] in ids:
        E("duplicate id")
    ids.add(r["id"])

    # vocabularies
    if r["division"] not in schema["division"][r["tissue"]]:
        E(f"division '{r['division']}' not allowed for {r['tissue']}; add it to data/schema.json if new")
    for s in r["species"].split(";"):
        if s.strip() not in schema["species"]:
            E(f"species '{s.strip()}' not in vocabulary; add it to data/schema.json if new")
    if r["preparation"] not in schema["preparation"]:
        E(f"preparation '{r['preparation']}' not in {schema['preparation']}")
    if r["status"] not in schema["status"]:
        E(f"status '{r['status']}' not in {schema['status']}")
    if r["unit"] != p["unit"]:
        E(f"unit must be '{p['unit']}' for {r['property']} (convert, and keep the original in 'reported')")

    # numbers
    v, vmax = num(r["value"]), num(r["value_max"]) if r["value_max"] else None
    if r["value"] and v is None:
        E(f"value '{r['value']}' is not numeric")
    if not r["value"] and r["status"] != "proposed":
        E("value is empty")
    if r["value_max"]:
        if vmax is None:
            E(f"value_max '{r['value_max']}' is not numeric")
        elif v is not None and vmax < v:
            E("value_max < value")
    for x in (v, vmax):
        if x is not None and not (p["min"] <= x <= p["max"]):
            E(f"{x:g} {p['unit']} outside plausible range [{p['min']}, {p['max']}] — unit error?")
    for c in ("exponent_b", "db_cm_1mhz"):
        if r[c] and num(r[c]) is None:
            E(f"{c} '{r[c]}' is not numeric")

    # attenuation: value must equal db_cm_1mhz * 0.5^b
    if r["property"] == "attenuation":
        if not r["exponent_b"] or not r["db_cm_1mhz"]:
            E("attenuation rows need exponent_b and db_cm_1mhz (use b = 1 if the source reports none, and say so in notes)")
        elif v is not None and num(r["exponent_b"]) is not None and num(r["db_cm_1mhz"]) is not None:
            pred = num(r["db_cm_1mhz"]) * 0.5 ** num(r["exponent_b"])
            if v > 0 and abs(pred - v) / v > schema["attenuation_tolerance"]:
                E(f"value {v:g} ≠ db_cm_1mhz·0.5^b = {pred:.4g} dB/cm (tolerance {schema['attenuation_tolerance']:.0%})")

    # references
    for c in ("ref", "via"):
        if r[c]:
            used.add(r[c])
            if r[c] not in refs:
                E(f"{c} '{r[c]}' missing from references.csv")
    for k in filter(None, r["sources"].split(";")):
        used.add(k)
        if k not in refs:
            E(f"sources key '{k}' missing from references.csv")
    # a reference cited by its key in notes (e.g. a disputed value) counts as used
    used.update(k for k in refs if re.search(rf"\b{re.escape(k)}\b", r["notes"]))

    named = [s for s in schema["species"] if s not in ("unspecified", "n/a", "mixed species") and re.search(rf"\b{s}\b", r["label"], re.I)]
    if named:
        W(f"label names the species ({', '.join(named)}); it has its own column")
    if r["status"] == "excluded" and not r["notes"]:
        W("excluded without a reason in notes")
    if r["status"] == "proposed" and r["value"] and not r["test_freq_mhz"] and r["property"] in ("sound_speed", "attenuation"):
        W("frequency-dependent property without test_freq_mhz")

# ---------- meta.json (database version) ----------
rows_by_id = {dict(zip(mhead, v))["id"]: dict(zip(mhead, v)) for v in mrows if len(v) == len(mhead)}
try:
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
except (OSError, ValueError) as e:
    report("error", "meta.json", 1, f"cannot read: {e}")
    meta = {}
version = meta.get("version", "")
semver = lambda v: re.fullmatch(r"\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?", v or "")  # optional pre-release label, e.g. 0.1.0-alpha
def vkey(v):  # a pre-release sorts before its release
    core, _, pre = v.partition("-")
    return tuple(int(x) for x in core.split(".")) + ((0, pre) if pre else (1, ""))
if not semver(version):
    report("error", "meta.json", 1, f"version '{version}' must be MAJOR.MINOR.PATCH[-label]")
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta.get("date", "")):
    report("error", "meta.json", 1, "date must be YYYY-MM-DD")
ref_name = os.environ.get("GITHUB_REF", "")
if ref_name.startswith("refs/tags/v") and ref_name[len("refs/tags/v"):] != version:
    report("error", "meta.json", 1, f"git tag {ref_name[10:]} does not match data version {version}")

# ---------- bounds.csv (LOW/HIGH per version) ----------
bhead, brows = read("bounds.csv")
if bhead != ["version", "tissue", "property", "bound", "value", "id", "notes"]:
    report("error", "bounds.csv", 1, "header must be version,tissue,property,bound,value,id,notes")
else:
    seen, versions = set(), set()
    for i, vals in enumerate(brows, start=2):
        if len(vals) != len(bhead):
            report("error", "bounds.csv", i, f"expected {len(bhead)} fields, got {len(vals)}")
            continue
        b = dict(zip(bhead, vals))
        E = lambda m: report("error", "bounds.csv", i, m)
        if not semver(b["version"]):
            E(f"version '{b['version']}' must be MAJOR.MINOR.PATCH[-label]"); continue
        versions.add(b["version"])
        if semver(version) and vkey(b["version"]) > vkey(version):
            E(f"version {b['version']} is newer than data/meta.json ({version})")
        if b["tissue"] not in schema["tissue"]:
            E(f"tissue '{b['tissue']}' not in {schema['tissue']}")
        if b["property"] not in props:
            E(f"property '{b['property']}' not in vocabulary")
        if b["bound"] not in schema["bound"]:
            E(f"bound '{b['bound']}' not in {schema['bound']}")
        if (b["bound"] == "uniform") != (b["tissue"] == "water"):
            E("use 'uniform' for water and low/high for other tissues")
        key = (b["version"], b["tissue"], b["property"], b["bound"])
        if key in seen:
            E(f"duplicate bound {key}")
        seen.add(key)
        v = num(b["value"])
        if v is None:
            E(f"value '{b['value']}' is not numeric"); continue
        if b["id"]:
            r = rows_by_id.get(b["id"])
            if not r:
                E(f"id '{b['id']}' not in measurements.csv"); continue
            if (r["tissue"], r["property"]) != (b["tissue"], b["property"]):
                E(f"id '{b['id']}' is {r['tissue']}/{r['property']}, not {b['tissue']}/{b['property']}")
            rv = num(r["value_max"] or r["value"]) if b["bound"] == "high" else num(r["value"])
            if rv is not None and abs(rv - v) > schema["bound_tolerance"] * max(abs(v), 1e-12) and not b["notes"]:
                report("warning", "bounds.csv", i, f"bound {v:g} differs from {b['id']} ({rv:g}); explain in notes")
            if r["status"] == "excluded":
                report("warning", "bounds.csv", i, f"{b['id']} is excluded but defines a bound")
        elif not b["notes"]:
            E("bound without a defining row needs a note")
    # current bounds should enclose every included point value, or say why in notes;
    # a reported range is not a point estimate: it only has to overlap [LOW, HIGH]
    cur = {}
    for vals in brows:
        if len(vals) == len(bhead):
            b = dict(zip(bhead, vals))
            if b["version"] == version and b["bound"] in ("low", "high") and num(b["value"]) is not None:
                cur[(b["tissue"], b["property"], b["bound"])] = (num(b["value"]), b["notes"], brows.index(vals) + 2)
    # the reference benchmark sits between LOW and HIGH
    for vals in brows:
        if len(vals) == len(bhead):
            b = dict(zip(bhead, vals))
            v = num(b["value"])
            if b["version"] != version or b["bound"] != "reference" or v is None:
                continue
            lo, hi = cur.get((b["tissue"], b["property"], "low")), cur.get((b["tissue"], b["property"], "high"))
            if not (lo and hi) or not (lo[0] <= v <= hi[0]):
                report("error", "bounds.csv", brows.index(vals) + 2, f"reference {v:g} for {b['tissue']}/{b['property']} needs LOW <= reference <= HIGH in the same version")
    for r in rows_by_id.values():
        if r["status"] != "included" or num(r["value"]) is None:
            continue
        lo, hi = num(r["value"]), num(r["value_max"]) if r["value_max"] else num(r["value"])
        if r["value_max"]:
            lo, hi = hi, lo  # range rows: outside only if the whole range lies beyond a bound
        for side, x, outside in (("low", lo, lambda x, bv: x < bv), ("high", hi, lambda x, bv: x > bv)):
            bv = cur.get((r["tissue"], r["property"], side))
            if bv and outside(x, bv[0]) and not bv[1]:
                report("warning", "bounds.csv", bv[2], f"{side.upper()} {bv[0]:g} does not enclose included {r['id']} ({x:g}); explain in notes")
    if semver(version) and version not in versions:
        report("error", "bounds.csv", 1, f"no bounds for current data version {version} (copy the previous block and update)")

# possible double counting: same value, tissue, division and species, one row's primary source cited by the other
keys = lambda r: {k for k in [r["ref"], r["via"], *r["sources"].split(";")] if k}
live = [(i, dict(zip(mhead, v))) for i, v in enumerate(mrows, start=2) if len(v) == len(mhead)]
live = [(i, r) for i, r in live if r["status"] != "excluded" and r["value"]]
for n, (i, a) in enumerate(live):
    for j, b in live[n + 1:]:
        same = ("tissue", "property", "division", "species", "value", "value_max")
        if all(a[c] == b[c] for c in same) \
                and (a["ref"] in keys(b) or b["ref"] in keys(a)) and a["id"] not in b["notes"] and b["id"] not in a["notes"]:
            report("warning", "measurements.csv", j, f"{b['id']}: same value as {a['id']} from the same primary source; possible double count (exclude one, or name the other id in notes)")

for k, line in refs.items():
    if k not in used:
        report("warning", "references.csv", line, f"'{k}' is not used by any measurement")

summary = f"v{version}: {len(mrows)} measurements, {len(refs)} references — {len(errors)} error(s), {len(warnings)} warning(s)"
print(summary)
if GHA and os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
        f.write(f"### Data validation\n\n{summary}\n\n")
        for kind, items in (("Error", errors), ("Warning", warnings)):
            for file, line, msg in items:
                f.write(f"- **{kind}** `data/{file}:{line}` {msg}\n")
sys.exit(1 if errors else 0)
