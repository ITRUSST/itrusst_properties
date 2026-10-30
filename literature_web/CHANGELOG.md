# Changelog

Database versions follow `MAJOR.MINOR.PATCH`:

- **MAJOR**: changes that break downstream readers (removing or renaming columns, vocabulary terms or units); applied only after the first stable release (1.0.0). Before 1.0.0, such changes bump MINOR and are flagged in the entry.
- **MINOR**: backward-compatible schema additions (new columns, new vocabulary terms), new values or references, status changes, or new LOW/HIGH bounds
- **PATCH**: corrections to existing values, citations, tags or notes
- **Pre-release label** (`X.Y.Z-alpha`, `-beta`): data still being checked; values and bounds may change before `X.Y.Z`

Each release bumps `data/meta.json` and `version`/`date-released` in `CITATION.cff` (repository root), appends its bounds to `data/bounds.csv` (earlier versions stay in the file), adds an entry here and is tagged `vX.Y.Z` in git.

## 0.1.0 — 2026-10-30

First release, corresponding to Supplementary Table S1 and Table 1 of Kosciessa et al. (in preparation).

- 143 values and 47 references for skull, brain and water (sound speed, density, attenuation, absorption coefficient, thermal conductivity, specific heat, perfusion), from Supplementary Table S1 and checked against the source papers.
- LOW/HIGH bounds and reference benchmark for skull and brain, and uniform values for water, from Table 1 (the values used in the simulations).
