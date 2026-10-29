# Changelog

Database versions follow `MAJOR.MINOR.PATCH`:

- **MAJOR**: changes that break downstream readers (removing or renaming columns, vocabulary terms or units); applied only after the first stable release (1.0.0). Before 1.0.0, such changes bump MINOR and are flagged in the entry.
- **MINOR**: backward-compatible schema additions (new columns, new vocabulary terms), new values or references, status changes, or new LOW/HIGH bounds
- **PATCH**: corrections to existing values, citations, tags or notes
- **Pre-release label** (`X.Y.Z-alpha`, `-beta`): data still being checked; values and bounds may change before `X.Y.Z`

Each release bumps `data/meta.json`, appends its bounds to `data/bounds.csv` (earlier versions stay in the file), adds an entry here and is tagged `vX.Y.Z` in git.

## 0.1.0 — 2026-10-29

First release. Earlier drafts (0.1.0-alpha, 0.2.0) were never in production and are superseded by this version.

- Content: 144 values and 47 references for skull, brain and water (sound speed, density, attenuation, absorption coefficient, thermal conductivity, specific heat, perfusion), seeded from Supplementary Table S1 and checked against the source papers (audit of 2026-10-28), synced with Supplementary Table S1 (draft 29.10.26).
- IT'IS values and citations from database v5.0 (Baumgartner et al., 2025; DOI 10.13099/VIP21000-05-0).
- LOW/HIGH bounds and reference benchmark for skull and brain, and uniform values for water, as in Table 1 of the manuscript (the values used in the simulations).
- Attenuation and absorption compared at 0.5 MHz using a per-row power-law exponent; absorption given as absorption coefficient only.
- `preparation` records the source of a value (in vivo, ex vivo, model-derived, compilation, reference standard); `condition` records the tissue state of ex vivo rows (fresh, frozen, fixed, embalmed, dried, mixed, unspecified).
- Excluded values (status `excluded`) are kept with the reason in `notes`.
