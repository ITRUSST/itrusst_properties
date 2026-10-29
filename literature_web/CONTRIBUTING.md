# Contributing

Two routes:

- **No git**: open an issue — *Correct a value* or *Propose a new value*. Each row on the site has a "suggest fix" link that pre-fills the row ID.
- **Pull request**: edit the CSVs in `data/` directly (GitHub's web editor works) and open a PR. CI validates the files and annotates problems on the diff.

## Data model

`data/measurements.csv` — one row per literature value.

| column | content |
|---|---|
| `id` | `<tissue>-<prefix>-NNN`, e.g. `skull-att-012`. New rows: next free number. Never renumber existing rows. |
| `tissue` | `skull`, `brain`, `water` (target tissue in the simulation) |
| `division` | measured sub-tissue; vocabulary per tissue in `data/schema.json` |
| `label` | free-text tissue description as it should appear in the table; leave out the species (it has its own column) |
| `property` | `sound_speed`, `density`, `attenuation`, `thermal_conductivity`, `specific_heat`, `perfusion`, `absorption_coefficient` |
| `value`, `value_max` | number in the canonical unit; `value_max` only for ranges |
| `unit` | canonical unit (fixed per property, see schema) |
| `reported` | value **exactly as printed** in the source, with its unit |
| `test_freq_mhz` | test frequency or range, if reported |
| `exponent_b`, `db_cm_1mhz` | attenuation only: power-law exponent and value at 1 MHz |
| `species` | `human`, `cow`, … (`;`-separate several) |
| `preparation` | source of the value: `in vivo`, `ex vivo`, `model-derived`, `compilation`, `reference standard`, `unspecified` |
| `condition` | tissue state at measurement, ex vivo rows only: `fresh`, `frozen` (frozen–thawed), `fixed` (chemical fixative; name it in `notes`), `embalmed`, `dried` (also when rehydrated or degassed before measurement), `mixed` (several states, values not separated), `unspecified`; all other rows `n/a` |
| `status` | `included`, `excluded`, `proposed` |
| `ref` | key of the primary source |
| `via` | key of the secondary source the value was taken from (e.g. `duck1990`, `hasgall2022`) |
| `sources` | for compilations: `;`-separated keys of the sources they cite |
| `notes` | exclusion reason, caveats, conversions; cite a reference not in `ref`, `via` or `sources` by its key, e.g. `(chavrier2000)` |

`data/references.csv` — `key,year,citation,doi`. Key = first-author surname (lowercase, letters only) + year, with `a`/`b` suffix if needed. DOI bare (`10.1121/1.381852`).

## Rules

1. **Keep the original.** `reported` holds the printed value; `value` holds the converted one. State non-trivial conversions in `notes`.
2. **Attenuation at 0.5 MHz.** `value = db_cm_1mhz · 0.5^exponent_b` (CI checks to 3 %). Use the source's own exponent or a fit to its multi-frequency data; if none is available, `b = 1` with `exponent assumed` in `notes`. 1 Np = 8.686 dB.
3. **New rows start as `proposed`.** Maintainers decide `included` / `excluded`; excluded rows need a reason in `notes`.
4. **New vocabulary terms** (species, division, …) go into `data/schema.json` in the same PR.
5. Run `python3 scripts/validate.py` (from `literature_web/`) before pushing (Python ≥ 3.8, no dependencies).

## Releasing a database version (maintainers)

1. Bump `version` and `date` in `data/meta.json` (MAJOR: schema, MINOR: new values/bounds, PATCH: corrections).
2. In `data/bounds.csv`, copy the previous version's block, set the new version and update any LOW/HIGH or reference values or defining `id`s. Never edit an earlier block.
3. Add an entry to `CHANGELOG.md`.
4. Merge, then tag: `git tag v0.1.1 && git push --tags`. The *Release database version* workflow checks that the tag matches `meta.json`, builds the bundle (`scripts/build_release.py`) and publishes it as a GitHub Release. The *Deploy site* workflow also runs on the tag and adds the version to the site's version picker.

## Local preview

```bash
cd literature_web && python3 -m http.server 8000   # then open http://localhost:8000
```

(Opening `index.html` directly from disk does not work; browsers block `fetch` of local files.)
