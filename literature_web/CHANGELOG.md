# Changelog

Database versions follow `MAJOR.MINOR.PATCH`:

- **MAJOR**: schema changes (columns, vocabularies, units) that break downstream readers
- **MINOR**: new values or references, status changes, or new LOW/HIGH bounds
- **PATCH**: corrections to existing values, citations, tags or notes

Each release bumps `data/meta.json`, appends its bounds to `data/bounds.csv` (earlier versions stay in the file), adds an entry here and is tagged `vX.Y.Z` in git.

## 0.1.0 — 2026-10-08

- Initial release: 143 values, 50 references, seeded from Supplementary Table S1.
- LOW/HIGH bounds and reference benchmark for skull and brain, and uniform values for water, as in Table 1 of the manuscript (brain thermal conductivity bounds rounded to 0.48 and 0.55 as in Table 1).
- Marked as excluded (grey in Supp. Table S1): skull-k-001, skull-k-002, brain-c-001, brain-c-009.
- Synced with the Supp. Table S1 draft of 2026-10-14: Fry & Barger diploë and whole-skull attenuation re-digitised (skull-att-013, skull-att-014; HIGH now defined by skull-att-013); Labuda (2022) brain attenuation included; Lyons & Parker brain absorption fraction 0.89; Robinson & Lele dated 1972.
