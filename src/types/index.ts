// ---------------------------------------------------------------------------
// Filter state - the current selections in the filter panel.
// Year is always required (it selects which annual snapshot to display).
// Empty arrays mean "all values" for that dimension.
// ---------------------------------------------------------------------------

export interface FilterState {
  year: number;       // required, default 2025
  makes: string[];    // CD_MAKE_VEH1 codes; empty = all makes
  fuels: string[];    // CD_CL_FUEL_ENG codes; empty = all fuel types
}

export const DEFAULT_FILTER_STATE: FilterState = {
  year: 2025,
  makes: [],
  fuels: [],
};

// ---------------------------------------------------------------------------
// Aggregation result - output of a filter pass over the in-memory dataset.
// Maps POSTCODE string to the summed TOTAL1 for that postcode.
// ---------------------------------------------------------------------------

export type AggregateResult = Map<string, number>;

// ---------------------------------------------------------------------------
// Static data file shapes (vehicles_meta.json + vehicles_YYYY.json)
// ---------------------------------------------------------------------------

export interface VehiclesMeta {
  years: number[];
  postcodes: string[];
  makes: string[];
  fuels: string[];   // fixed order: P D E G M H O
}

// Each row: [postcode_idx, make_idx, fuel_idx, total]
export type VehicleRow = [number, number, number, number];

export interface VehiclesYear {
  year: number;
  rows: VehicleRow[];
}

export interface TimelineEntry {
  year: number;
  quarter: number;
  fuel: string;
  total: number;
}

// vehicle_age_YYYY.json - per-postcode manufacture-era counts.
// Each row: [postcode_idx, counts] where counts aligns with `buckets`.
// New files: buckets = ["unknown","pre2000","d2000s","d2010s","new_recent"],
//            threshold = year - 4 (manufacture year >= threshold = "recent fleet").
// Legacy files (pre E-014): bucket key is "new2020", threshold absent (defaults to 2020).
export interface VehicleAgeYear {
  year: number;
  threshold?: number;  // manufacture year >= this is "recent"; absent in legacy files → 2020
  buckets: string[];
  rows: [number, number[]][];
}

// ---------------------------------------------------------------------------
// Fuel decode map (CD_CL_FUEL_ENG code → display label)
// ---------------------------------------------------------------------------

export const FUEL_LABELS: Record<string, string> = {
  P: "Petrol",
  D: "Diesel",
  E: "Electric",
  G: "Gas (LPG/CNG/LNG)",
  M: "Multi/Dual Fuel",
  H: "Hybrid",
  O: "Other",
};

// ---------------------------------------------------------------------------
// Make decode map - abbreviated source codes → proper display names.
// Source data uses truncated codes; unknown codes fall back to the raw value.
// ---------------------------------------------------------------------------

export const MAKE_LABELS: Record<string, string> = {
  TOYOTA: "Toyota",
  FORD: "Ford",
  HOLDEN: "Holden",
  MAZDA: "Mazda",
  HYNDAI: "Hyundai",
  NISSAN: "Nissan",
  MITSUB: "Mitsubishi",
  HONDA: "Honda",
  VOLKS: "Volkswagen",
  "MERC B": "Mercedes-Benz",
  KIA: "Kia",
  SUBARU: "Subaru",
  "B M W": "BMW",
  ISUZU: "Isuzu",
  SUZUKI: "Suzuki",
  AUDI: "Audi",
  JEEP: "Jeep",
  VOLVO: "Volvo",
  "M G": "MG",
  LEXUS: "Lexus",
  "L ROV": "Land Rover",
  REN: "Renault",
  "H DAV": "Harley-Davidson",
  YAMAHA: "Yamaha",
  TESLA: "Tesla",
  SKODA: "Skoda",
  PORSCH: "Porsche",
  MINI: "Mini",
  CHERY: "Chery",
  BYD: "BYD",
  GWM: "GWM",
};

// ---------------------------------------------------------------------------
// Preset system - declarative view configs (implemented fully in Phase 4).
// ---------------------------------------------------------------------------

export type RendererType = "continuous" | "classed";

export interface RendererSpec {
  type: RendererType;
  // classed breaks config TBD in Phase 4
}

export type ChartType = "histogram" | "scatter" | "bivariate";

export interface ChartSpec {
  type: ChartType;
  // chart config TBD in Phase 4
}

export interface ViewPreset {
  id: string;
  label: string;
  filterState: FilterState;
  renderer: RendererSpec;
  chart?: ChartSpec;
}
