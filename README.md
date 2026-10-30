# ITRUSST tissue properties

Acoustic and thermal properties of skull, brain and water for transcranial ultrasound (TUS) simulation, compiled by the [ITRUSST Acoustic Properties Working Group](https://www.itrusst.com/working-group/properties), and the simulations that test how uncertainty in these properties changes predicted intensity and heating.

- **Site**: https://itrusst.github.io/itrusst_properties/ (filterable table, comparison plots, downloads)
- **Releases**: [GitHub Releases](https://github.com/ITRUSST/itrusst_properties/releases) hold each database version with its LOW/reference/HIGH settings tables

## Contents

| path | content |
|---|---|
| [`literature_web/`](literature_web/) | the database (`data/`), the site and its build scripts; see [literature_web/README.md](literature_web/README.md) |
| [`PRESTUS_itrusst/`](https://github.com/jkosciessa/PRESTUS_itrusst) | submodule: benchmark simulations with [PRESTUS](https://github.com/Donders-Institute/PRESTUS) on digital phantoms; see its README |

Clone with the simulations:

```bash
git clone --recurse-submodules https://github.com/ITRUSST/itrusst_properties.git
```

The database and site do not need the submodule.

## Contributing

Corrections and new values are welcome through the issue templates or a pull request; see [literature_web/CONTRIBUTING.md](literature_web/CONTRIBUTING.md).

## Citation

> Kosciessa, J. Q., Webb, T., Martin, E., Treeby, B., Butts Pauly, K., Verhagen, L., & Pichardo, S. (in preparation). *Impact of acoustic property uncertainty on transcranial ultrasound simulation*.

When reusing values, also cite the original publications listed in `literature_web/data/references.csv`.

## Licence

- Data (`literature_web/data/`): [CC BY 4.0](literature_web/data/LICENSE.md)
- Site code: [MIT](literature_web/LICENSE)
- ITRUSST logo: property of ITRUSST, not covered by either licence
