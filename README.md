# VIC Vehicle Registrations

A full-screen web app visualising aggregated vehicle registration counts across 694 Victorian postcodes, built with the ArcGIS Maps SDK for JavaScript (v5), React and TypeScript.

**Live demo:** https://simongis.github.io/VIC-Vehicle-Regos/

## Views

- **Explore** - choropleth with fuel/make filters and a per-household or total-vehicles toggle
- **EV Advantage** - bivariate map (EV share x socio-economic advantage) with a linked scatter plot
- **Dominant Make** - predominance choropleth with a pie-chart cluster toggle showing the top-5 make mix
- **New vs Old** - percentage of the fleet made in the last 5 years, with a ranked postcode table
- **Fleet Trends** - statewide quarterly timeline (electric uptake and fuel mix)

## Data

Source: [Victorian DTP Whole Fleet Vehicle Registration Snapshot by Postcode](https://discover.data.vic.gov.au/dataset/whole-fleet-vehicle-registration-snapshot-by-postcode) (open data, quarterly snapshots 2023 Q2 to 2026 Q1).

Static JSON files in `public/data/` are pre-aggregated from the source CSVs. Geometry is fetched once on load from ArcGIS Online and never re-requested during filtering.

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build
npm run preview   # preview the production build
```

Requires Node 20+.

## Stack

- [Vite](https://vite.dev/) + [React](https://react.dev/) + TypeScript
- [@arcgis/core](https://developers.arcgis.com/javascript/) (ArcGIS Maps SDK for JavaScript v5)
- [@esri/calcite-components](https://developers.arcgis.com/calcite-design-system/)
- [Apache ECharts](https://echarts.apache.org/)

## Licence

[MIT](LICENCE)
