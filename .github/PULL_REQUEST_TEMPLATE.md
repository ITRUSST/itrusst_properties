## What changes

<!-- e.g. adds 3 skull sound-speed values from Smith et al. (2025); corrects unit of skull-att-008 -->

## Source

- Reference key(s):
- Table / figure / page in the source:

## Checklist

- [ ] Values are as printed in the source (`reported`), converted to the canonical unit in `value`
- [ ] New references added to `literature_web/data/references.csv` (bare DOI, no URL prefix)
- [ ] New rows use `status = proposed`; maintainers set `included` / `excluded`
- [ ] Attenuation rows: `db_cm_1mhz` and `exponent_b` filled, `value = db_cm_1mhz · 0.5^b`
- [ ] `python3 literature_web/scripts/validate.py` passes locally (CI runs it too)
