import type { VehiclesMeta, VehiclesYear } from "../types";

const BASE = import.meta.env.BASE_URL;

export interface DataStore {
  meta: VehiclesMeta;
  yearCache: Map<number, VehiclesYear>;
}

let store: DataStore | null = null;

/**
 * Fetches vehicles_meta.json (shared dictionaries) and the active year's data
 * file. Both are cached in memory - switching years only fetches the new file
 * once; subsequent switches are instant.
 */
export async function loadData(defaultYear: number): Promise<DataStore> {
  if (store) return store;

  const [meta, yearData] = await Promise.all([
    fetch(`${BASE}data/vehicles_meta.json`).then((r) => r.json() as Promise<VehiclesMeta>),
    fetch(`${BASE}data/vehicles_${defaultYear}.json`).then(
      (r) => r.json() as Promise<VehiclesYear>
    ),
  ]);

  store = {
    meta,
    yearCache: new Map([[defaultYear, yearData]]),
  };

  console.log(
    `[loadData] Meta loaded - postcodes: ${meta.postcodes.length}, ` +
      `makes: ${meta.makes.length}, years: ${meta.years.join(", ")}`
  );
  console.log(
    `[loadData] Year ${defaultYear} loaded - ${yearData.rows.length.toLocaleString()} rows`
  );

  return store;
}

/**
 * Returns the VehiclesYear data for the requested year, fetching and caching
 * it on demand. Throws if the year is not in vehicles_meta.json.
 */
export async function getYearData(
  dataStore: DataStore,
  year: number
): Promise<VehiclesYear> {
  const cached = dataStore.yearCache.get(year);
  if (cached) return cached;

  if (!dataStore.meta.years.includes(year)) {
    throw new Error(`Year ${year} not available in data. Available: ${dataStore.meta.years}`);
  }

  const yearData = await fetch(`${BASE}data/vehicles_${year}.json`).then(
    (r) => r.json() as Promise<VehiclesYear>
  );
  dataStore.yearCache.set(year, yearData);

  console.log(
    `[loadData] Year ${year} loaded - ${yearData.rows.length.toLocaleString()} rows`
  );

  return yearData;
}
