# Changelog

Database versions follow `MAJOR.MINOR.PATCH`:

- **MAJOR**: schema changes (columns, vocabularies, units) that break downstream readers
- **MINOR**: new values or references, status changes, or new LOW/HIGH bounds
- **PATCH**: corrections to existing values, citations, tags or notes
- **Pre-release label** (`X.Y.Z-alpha`, `-beta`): data still being checked; values and bounds may change before `X.Y.Z`

Each release bumps `data/meta.json`, appends its bounds to `data/bounds.csv` (earlier versions stay in the file), adds an entry here and is tagged `vX.Y.Z` in git.

## 0.2.0 — 2026-10-27

- Schema: property `absorption_fraction` (prefix `abs`) removed from `schema.json`; absorption is given as absorption coefficient (dB/cm @0.5 MHz) only. Readers that filter on `absorption_fraction` find no rows.
- Removed the seven absorption-fraction rows (skull-abs-001, -002; brain-abs-001 to -004; water-abs-001). They had no bounds and were no longer shown on the site or in its downloads since the 2026-10-16 sync. The absorption-coefficient rows cover the same measurements where a coefficient is available (skull-alpha-001: Pinton 2012; skull-alpha-002/-003/-005: White 1978; brain-alpha-004 to -007: Lyons & Parker 1988; water-alpha-001: Hill 2004). The proxy-tissue fractions (muscle, liver, soft tissue) have no coefficient counterpart.
- Removed the references used only by those rows: Damianou et al. (1997), Chavrier et al. (2000).
- Values and bounds as in 0.1.0-alpha of 2026-10-27 (bounds copied to version 0.2.0 in `bounds.csv`).

## 0.1.0-alpha — 2026-10-27

- Alpha pre-release of 0.1.0 (first drafted 2026-10-08). Values and LOW/HIGH bounds may still change before v0.1.0.
- Synced with the Supp. Table S1 draft of 2026-10-21: White et al. (2006) skull attenuation 4.03 dB/cm @0.5 MHz (b = 1.43, scaled from the 0.548 MHz value; was 3.22 from a least-squares fit; skull-att-003), now the skull attenuation LOW; new single-frequency row skull-att-018 (53 Np/m, b = 1 assumed, 4.20 dB/cm). Skull absorption coefficient LOW 1.05 dB/cm (White 1978, fresh bovine ivory bone, new skull-alpha-003; was Pinton 2012, 1.35) and HIGH 4.03 dB/cm (skull-alpha-004, b = 1.46; was 3.22); new skull-alpha-005 (White 1978 sample 2, 2.6 dB/cm/MHz). Ammi et al. (2008) pooled over 1.03 and 2 MHz, front-surface reflection correction only, dried bone (skull-att-009); Pinton (2012) attenuation noted as insertion loss (skull-att-004). Water absorption coefficient as its own row (water-alpha-001, Hill 2004). dB/cm @1 MHz added to brain-alpha-002 and -003.
- Synced with the Supp. Table S1 draft of 2026-10-27: White et al. (2006) skull attenuation 4.02 dB/cm @0.5 MHz, scaled from the 0.548 MHz value with the least-squares exponent across the three frequencies (b = 1.47; was 4.03 with b = 1.43; skull-att-003), now also the skull absorption HIGH (skull-alpha-004, was 4.03 with b = 1.46). Brain sound speed HIGH 1573 m/s (Kremkau 1981 at 40 °C via Duck 1990; brain-c-009 now included, was excluded; was 1568, brain-c-008). brain-c-007 1562–1567 m/s, measured at 1 and 5 MHz (was 1561–1565; 1565 was the predicted 5 MHz value). New row brain-att-015 (Etoh et al. 1994, bovine cerebral cortex, 25 °C, resonance method) and reference etoh1994. Reference benchmarks for absorption coefficient: skull 1.40 (skull-alpha-002), brain 0.093 dB/cm (brain-alpha-003).
- Initial content: 143 values, 50 references, seeded from Supplementary Table S1.
- LOW/HIGH bounds and reference benchmark for skull and brain, and uniform values for water, as in Table 1 of the manuscript (brain thermal conductivity bounds rounded to 0.48 and 0.55 as in Table 1).
- Marked as excluded (grey in Supp. Table S1): skull-k-001, skull-k-002, brain-c-001 (brain-c-009 included again from the 2026-10-27 draft).
- Synced with the Supp. Table S1 draft of 2026-10-14: Fry & Barger diploë and whole-skull attenuation re-digitised (skull-att-013, skull-att-014; HIGH now defined by skull-att-013); Labuda (2022) brain attenuation included; Lyons & Parker brain absorption fraction 0.89; Robinson & Lele dated 1972.
- Absorption reported as absorption coefficient (dB/cm @0.5 MHz) instead of absorption fraction, synced with the Supp. Table S1 draft of 2026-10-16: LOW/HIGH skull 1.35 (Pinton 2012, skull-alpha-001) / 3.22 dB/cm (White 2006 attenuation as upper limit, skull-alpha-004); brain 0.045 / 0.231 dB/cm (Lyons & Parker 1988 gray / white matter, brain-alpha-004 / brain-alpha-007); water equals its attenuation. New rows skull-alpha-001, -002, -004 and brain-alpha-004 to -007; shear-wave and shear-adjusted skull absorption (Supp. Table S1, grey) left out for now. Absorption fraction rows stay in `measurements.csv` without bounds and are no longer shown on the site or in its downloads. No reference benchmark for absorption coefficient yet.
- Checked against the source papers: brain-att-002 (Lyons & Parker 1988) 0.154 dB/cm from the Table I power law (was 0.156 from a rounded value); skull-att-003 and skull-att-007 now list all frequencies their power-law fits use (White 2006; Pichardo 2011); skull-abs-001 relabelled cortical; notes added to skull-att-004 and skull-alpha-002. The validator counts a reference cited by its key in notes as used. Removed the uncited reference White et al. (2007). skull-att-004 (Pinton 2012): single-frequency measurement, exponent now assumed 1 (was 1.69 without a source), 8.3 dB/cm @0.5 MHz (was 5.14). Lyons & Parker absorption rows note why non-human data are included.
