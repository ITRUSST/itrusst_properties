#!/usr/bin/env python3
"""Build the downloadable bundle for the current database version (data/meta.json).

Standard library only. Writes to dist/ (or the folder given as the first argument):

    tus-properties_vX.Y.Z.zip              data files, licences, changelog and the settings tables
    tus-properties_vX.Y.Z_settings.csv     LOW / reference / HIGH per tissue and property (long format)
    tus-properties_vX.Y.Z_settings.json    the same, nested as tissue -> property -> setting
    release_notes.md                       this version's CHANGELOG section plus file descriptions

    python scripts/build_release.py [outdir]

Run scripts/validate.py first; CI does both on every vX.Y.Z tag.
"""
import csv
import io
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist"

meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
schema = json.loads((DATA / "schema.json").read_text(encoding="utf-8"))
version = meta["version"]
name = f"tus-properties_v{version}"

# ---------- settings table for this version ----------
with open(DATA / "bounds.csv", newline="", encoding="utf-8") as f:
    bounds = [b for b in csv.DictReader(f) if b["version"] == version]
if not bounds:
    sys.exit(f"no bounds for version {version} in data/bounds.csv")

order = {k: i for i, k in enumerate(schema["property"])}
tissues = {t: i for i, t in enumerate(schema["tissue"])}
settings = {}  # (tissue, property) -> {low, reference, high} or {uniform}
for b in bounds:
    settings.setdefault((b["tissue"], b["property"]), {})[b["bound"]] = b

cols = ["tissue", "property", "unit", "low", "reference", "high", "low_id", "high_id", "notes"]
rows = []
for (t, p), s in sorted(settings.items(), key=lambda kv: (tissues[kv[0][0]], order[kv[0][1]])):
    u = s.get("uniform")
    get = lambda k: (u or s.get(k) or {}).get("value", "")
    rows.append({
        "tissue": t, "property": p, "unit": schema["property"][p]["unit"],
        "low": get("low"), "reference": get("reference"), "high": get("high"),
        "low_id": (u or s.get("low") or {}).get("id", ""), "high_id": (u or s.get("high") or {}).get("id", ""),
        "notes": "; ".join(dict.fromkeys(x["notes"] for k, x in s.items() if x["notes"] and k != "reference")),
    })

buf = io.StringIO()
w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
w.writeheader()
w.writerows(rows)
settings_csv = buf.getvalue()

num = lambda v: None if v == "" else int(float(v)) if float(v).is_integer() else float(v)
settings_json = json.dumps({
    "version": version, "date": meta["date"],
    "note": "Values per tissue and property as in Table 1 of the manuscript; water uses one uniform value (low = reference = high). "
            "Attenuation and absorption coefficient are in dB/cm at 0.5 MHz; convert with each property's power law for other frequencies.",
    "tissues": {t: {r["property"]: {"unit": r["unit"], "low": num(r["low"]), "reference": num(r["reference"]), "high": num(r["high"])}
                    for r in rows if r["tissue"] == t} for t in dict.fromkeys(r["tissue"] for r in rows)},
}, indent=2, ensure_ascii=False) + "\n"

# ---------- release notes: this version's CHANGELOG section ----------
log = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
m = re.search(rf"^## {re.escape(version)}\b.*?$(.*?)(?=^## |\Z)", log, flags=re.M | re.S)
notes = (m.group(1).strip() if m else "See CHANGELOG.md.") + f"""

### Files

- `{name}_settings.csv` / `.json`: LOW, reference and HIGH value per tissue and property for this version (the simulation settings of Table 1). Water: one uniform value.
- `{name}.zip`: the full database at this version: `measurements.csv` (one row per literature value), `references.csv`, `bounds.csv` (all versions), `schema.json`, `meta.json`, the settings tables, CHANGELOG and licences.

Attenuation is given in dB/cm at 0.5 MHz. Data: CC BY 4.0; code: MIT. Please cite the compilation and the original sources (see `data/LICENSE.md`).
"""

# ---------- write ----------
OUT.mkdir(parents=True, exist_ok=True)
(OUT / f"{name}_settings.csv").write_text(settings_csv, encoding="utf-8")
(OUT / f"{name}_settings.json").write_text(settings_json, encoding="utf-8")
(OUT / "release_notes.md").write_text(notes, encoding="utf-8")
with zipfile.ZipFile(OUT / f"{name}.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for f in ("measurements.csv", "references.csv", "bounds.csv", "schema.json", "meta.json", "LICENSE.md"):
        z.write(DATA / f, f"{name}/data/{f}")
    for f in ("CHANGELOG.md", "LICENSE", "README.md"):
        z.write(ROOT / f, f"{name}/{f}")
    z.writestr(f"{name}/{name}_settings.csv", settings_csv)
    z.writestr(f"{name}/{name}_settings.json", settings_json)
print(f"v{version}: {len(rows)} settings rows -> {OUT}/{name}.zip, {name}_settings.csv/.json, release_notes.md")
