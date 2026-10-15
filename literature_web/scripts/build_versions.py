#!/usr/bin/env python3
"""Snapshot the data of every released version (git tags vX.Y.Z) into the built site.

Run at deploy time from the repository root, after the site has been copied to <site>:

    python literature_web/scripts/build_versions.py _site

Writes <site>/versions/X.Y.Z/data/{measurements,references,bounds}.csv, meta.json and schema.json,
taken from each tag with `git show`, and <site>/data/versions.json listing all versions (newest first)
so the site can switch between them. The current data (data/meta.json) is always listed, with path "".
Standard library and git only; a tag without a data/meta.json is skipped.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

SITE = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
SRC = "literature_web/data"
FILES = ("measurements.csv", "references.csv", "bounds.csv", "meta.json", "schema.json")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def vkey(v):
    return tuple(int(x) for x in v.split("."))


current = json.loads((SITE / "data" / "meta.json").read_text(encoding="utf-8"))
versions = {current["version"]: {"version": current["version"], "date": current.get("date", ""), "path": ""}}

for tag in git("tag", "--list", "v*").decode().split():
    if not re.fullmatch(r"v\d+\.\d+\.\d+", tag):
        continue
    v = tag[1:]
    try:
        meta = json.loads(git("show", f"{tag}:{SRC}/meta.json"))
    except subprocess.CalledProcessError:
        print(f"skip {tag}: no {SRC}/meta.json")
        continue
    if meta.get("version") != v:
        print(f"warning: {tag} has meta.json version {meta.get('version')}")
    out = SITE / "versions" / v / "data"
    out.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        try:
            (out / f).write_bytes(git("show", f"{tag}:{SRC}/{f}"))
        except subprocess.CalledProcessError:
            pass  # older versions may lack a file (e.g. bounds.csv); the site copes
    if v != current["version"]:
        versions[v] = {"version": v, "date": meta.get("date", ""), "path": f"versions/{v}/"}

listing = sorted(versions.values(), key=lambda x: vkey(x["version"]), reverse=True)
(SITE / "data" / "versions.json").write_text(json.dumps({"current": current["version"], "versions": listing}, indent=2) + "\n", encoding="utf-8")
print(f"{len(listing)} version(s): " + ", ".join(x["version"] for x in listing))
