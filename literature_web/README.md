# TUS Tissue Properties

Literature values for acoustic and thermal properties of skull, brain and water used in transcranial ultrasound (TUS) simulation, compiled by the [ITRUSST Acoustic Properties Working Group](https://www.itrusst.com/working-group/properties), with a filterable table on GitHub Pages. Corrections and additions from the community are welcome.

- **Site**: https://itrusst.github.io/itrusst_properties/
- **Data**: [`data/measurements.csv`](data/measurements.csv) (one row per value) and [`data/references.csv`](data/references.csv)
- **Contribute**: see [CONTRIBUTING.md](CONTRIBUTING.md)

## Features

- Overview of all tissues: range table (skull, brain, water) and parallel-axes chart of skull vs brain ranges with medians; click a cell or axis to drill down (keyboard: Tab, then Enter)
- Comparison plot with selectable grouping: tissue, skull layer (all / layer unclear / cortical / trabecular), brain region, species, preparation or status (split by tissue); individual literature values, LOW/HIGH bounds, toggleable groups, SVG/PNG export
- Light and dark mode (follows the system setting; toggle in the header)
- Filter by tissue, property, status (excluded values hidden by default), species, division, preparation and reference (optionally matching secondary/underlying sources, e.g. what IT'IS cites)
- Per-property strip plot and summary (n, range, median of non-excluded rows; a row reported as a range enters the median at its midpoint)
- Shareable URLs (filter state in the hash)
- Downloads ("Download selection"; "Download Table" in the header for all values of the version in view): a zip with the CSV and a metadata JSON (database and bounds version, export time, source URL, filters, bounds, column descriptions, licence, citation); file names carry the version
- Column chooser for the tables (row ID and status hidden by default; the choice is kept in shared links)
- Per-row link to a pre-filled correction issue

## Layout

```
index.html, assets/      static site (no build step, no dependencies)
data/                    measurements.csv, references.csv, schema.json
scripts/validate.py      schema + consistency checks (CI on every PR)
scripts/build_release.py versioned bundle + settings tables (CI on every vX.Y.Z tag)
scripts/build_versions.py data snapshots of every tag for the version picker (at deploy)
../.github/              Actions (validate, deploy Pages, release), issue/PR templates (repository root)
```

## Setup

The site lives in `literature_web/` of the `itrusst_properties` repository; GitHub Actions workflows and issue templates live in `.github/` at the repository root.

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Push to `main`; the *Deploy site* workflow validates the data and publishes `literature_web/`.
3. Pages from a private repository needs GitHub Pro/Team (the published site is public). On GitHub Free, make the repository public.

## Versions and LOW/HIGH bounds

- The database version is in `data/meta.json` and shown in the page header and citation; see [CHANGELOG.md](CHANGELOG.md).
- `data/bounds.csv` holds the LOW/HIGH bound and the reference benchmark per tissue and property (water: the uniform reference value) for **every** version, as in Table 1 of the manuscript. The validator requires LOW ≤ reference ≤ HIGH. Each bound names the row that defines it (`id`), or explains in `notes` when no single row does.
- The site shows the current version and can switch to any released version ("Database version" in the overview; links keep it as `#v=X.Y.Z`). At deploy, `scripts/build_versions.py` copies the data of every `vX.Y.Z` tag to `versions/X.Y.Z/` on the site; the local preview shows the current data only.

## Using a version in simulations

Each tagged version is published as a [GitHub Release](https://github.com/ITRUSST/itrusst_properties/releases) with:

- `tus-properties_vX.Y.Z_settings.csv` / `.json`: LOW, reference and HIGH value per tissue and property (Table 1 of the manuscript; water: one uniform value). Attenuation in dB/cm at 0.5 MHz.
- `tus-properties_vX.Y.Z.zip`: the full database at that version (measurements, references, bounds, schema, changelog, licences).

Cite the version you used (e.g. "TUS Tissue Properties v0.1.0"). Release files never change; corrections appear as a new version. The site's "Download Database" link opens the latest release.

Build the same files locally with `python3 scripts/build_release.py` (writes `dist/`).

## Comments per value

Each row has a "comment" link that opens an inline thread ([giscus](https://giscus.app), stored in GitHub Discussions, one discussion per value ID). Formal corrections still go through "suggest fix" (pre-filled issue).

1. Make the repository public (giscus cannot read private repositories).
2. Settings → General → Features → enable **Discussions**; create a category **Value comments** (type: Announcement, so only giscus creates threads).
3. Install the giscus app: https://github.com/apps/giscus (this repository only).
4. On https://giscus.app enter the repository and category, copy `data-repo-id` and `data-category-id` into `assets/config.js` (`giscus.repoId`, `giscus.categoryId`).

Comment counts shown next to each row are refreshed by the *Deploy site* workflow whenever a thread changes. Threads stay hidden while the IDs are empty.

## Preview locally

```bash
cd literature_web && python3 -m http.server 8000   # then open http://localhost:8000
```

Opening `index.html` directly from disk does not work: browsers block loading the CSV files from `file://`.

## Citation

If you find this resource useful, please cite:

> Kosciessa, J. Q., Webb, T., Martin, E., Treeby, B., Yengul, S., Verhagen, L., Butts Pauly, K., & Pichardo, S. (in preparation). *Impact of acoustic property uncertainty on transcranial ultrasound simulation*.

## Provenance

Seeded from Supplementary Table S1 of the manuscript above. Attenuation values are compared at 0.5 MHz using a per-row power-law exponent; see CONTRIBUTING.md.

## Licence

- Data (`data/`): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — see [data/LICENSE.md](data/LICENSE.md)
- Code: [MIT](LICENSE)
- ITRUSST logo (`assets/img/itrusst.png`): property of ITRUSST, not covered by either licence
