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

    if r["status"] == "excluded" and not r["notes"]:
        W("excluded without a reason in notes")
    if r["status"] == "proposed" and r["value"] and not r["test_freq_mhz"] and r["property"] in ("sound_speed", "attenuation"):
        W("frequency-dependent property without test_freq_mhz")

for k, line in refs.items():
    if k not in used:
        report("warning", "references.csv", line, f"'{k}' is not used by any measurement")

summary = f"{len(mrows)} measurements, {len(refs)} references — {len(errors)} error(s), {len(warnings)} warning(s)"
print(summary)
if GHA and os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
        f.write(f"### Data validation\n\n{summary}\n\n")
        for kind, items in (("Error", errors), ("Warning", warnings)):
            for file, line, msg in items:
                f.write(f"- **{kind}** `data/{file}:{line}` {msg}\n")
sys.exit(1 if errors else 0)
