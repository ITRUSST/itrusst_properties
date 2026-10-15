#!/usr/bin/env python3
"""Write {value_id: n_comments} for giscus threads to a JSON file (run at deploy time).

Reads the Discussions category used by giscus (see assets/config.js) via the GitHub
GraphQL API. Needs GITHUB_TOKEN with discussions:read and GITHUB_REPOSITORY=owner/name.
Standard library only; on any error it writes {} so the deploy never fails on comments.

    python scripts/discussion_counts.py _site/data/comments.json
"""
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "data/comments.json")
CONFIG = Path(__file__).resolve().parent.parent / "assets" / "config.js"
QUERY = """query($owner:String!,$name:String!,$cat:ID!,$after:String){
  repository(owner:$owner,name:$name){
    discussions(first:100,after:$after,categoryId:$cat){
      pageInfo{hasNextPage endCursor}
      nodes{title comments{totalCount} }
    }}}"""


def main():
    cfg = CONFIG.read_text(encoding="utf-8")
    cat = re.search(r'categoryId:\s*"([^"]*)"', cfg)
    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY", "")
    if not (cat and cat.group(1) and token and "/" in repo):
        return {}
    owner, name = repo.split("/", 1)
    counts, after = {}, None
    while True:
        body = json.dumps({"query": QUERY, "variables": {"owner": owner, "name": name, "cat": cat.group(1), "after": after}}).encode()
        req = urllib.request.Request("https://api.github.com/graphql", body, {"Authorization": f"bearer {token}", "Content-Type": "application/json"})
        data = json.load(urllib.request.urlopen(req, timeout=30))["data"]["repository"]["discussions"]
        for d in data["nodes"]:
            if re.fullmatch(r"(skull|brain|water)-[a-z]+-\d{3}", d["title"]):
                counts[d["title"]] = d["comments"]["totalCount"]
        if not data["pageInfo"]["hasNextPage"]:
            return counts
        after = data["pageInfo"]["endCursor"]


try:
    result = main()
except Exception as e:  # never block a deploy on comment counts
    print(f"warning: could not read discussion counts: {e}")
    result = {}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(result, sort_keys=True), encoding="utf-8")
print(f"{len(result)} value threads -> {OUT}")
