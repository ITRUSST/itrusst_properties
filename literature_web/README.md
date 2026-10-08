# TUS Tissue Properties

Literature values for acoustic and thermal properties of skull, brain and water used in transcranial ultrasound (TUS) simulation, compiled by the [ITRUSST Acoustic Properties Working Group](https://www.itrusst.com/working-group/properties), with a filterable table on GitHub Pages. Corrections and additions from the community are welcome.

- **Site**: https://jkosciessa.github.io/itrusst_acousticproperties/
- **Data**: [`data/measurements.csv`](data/measurements.csv) (one row per value) and [`data/references.csv`](data/references.csv)
- **Contribute**: see [CONTRIBUTING.md](CONTRIBUTING.md)

## Features

- Overview of all tissues: range table (skull, brain, water) and parallel-axes chart of skull vs brain ranges with medians; click a cell or axis to drill down
- Light and dark mode (follows the system setting; toggle in the header)
- Filter by tissue, property, status, species, division, preparation and reference (optionally matching secondary/underlying sources, e.g. what IT'IS cites)
- Per-property strip plot and summary (n, range, median of non-excluded rows)
- Shareable URLs (filter state in the hash), CSV export of the current selection
- Per-row links to the CSV line and a pre-filled correction issue

## Layout

```
index.html, assets/      static site (no build step, no dependencies)
data/                    measurements.csv, references.csv, schema.json
scripts/validate.py      schema + consistency checks (CI on every PR)
.github/                 Actions (validate, deploy Pages), issue/PR templates
```

## Setup

The site lives in `literature_web/` of the `itrusst_acousticproperties` repository; GitHub Actions workflows and issue templates live in `.github/` at the repository root.

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Push to `main`; the *Deploy site* workflow validates the data and publishes `literature_web/`.
3. Pages from a private repository needs GitHub Pro/Team (the published site is public). On GitHub Free, make the repository public.

## Preview locally

```bash
python -m http.server 8000   # in the repository folder, then open http://localhost:8000
```

Opening `index.html` directly from disk does not work: browsers block loading the CSV files from `file://`.

## Provenance

Seeded from Supplementary Table S1 of *Impact of acoustic property uncertainty on transcranial ultrasound simulation* (in preparation). Attenuation values are compared at 0.5 MHz using a per-row power-law exponent; see CONTRIBUTING.md.

## Licence

- Data (`data/`): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — see [data/LICENSE.md](data/LICENSE.md)
- Code: [MIT](LICENSE)
- ITRUSST logo (`assets/img/itrusst.png`): property of ITRUSST, not covered by either licence
