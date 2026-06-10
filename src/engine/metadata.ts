import { MAKE_LABELS, FUEL_LABELS } from "../types";
import type { VehiclesMeta, VehiclesYear } from "../types";

export interface MakeOption {
  code: string;
  label: string;
  total: number;
}

export interface FuelOption {
  code: string;
  label: string;
  total: number;
}

/**
 * Returns makes sorted by total registrations (most common first), so the
 * filter dropdown surfaces Toyota/Ford/Holden before obscure makes.
 * Capped at `limit` to keep the DOM manageable; type-ahead handles the rest.
 */
export function getMakesByFrequency(
  meta: VehiclesMeta,
  yearData: VehiclesYear,
  limit = 150
): MakeOption[] {
  const freq = new Map<number, number>();
  for (const [, makeIdx, , total] of yearData.rows) {
    freq.set(makeIdx, (freq.get(makeIdx) ?? 0) + total);
  }

  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([idx, total]) => {
      const code = meta.makes[idx];
      return { code, label: MAKE_LABELS[code] ?? (code || "Unknown"), total };
    });

  // Separate null/empty ("Unknown") so it always appears at the end regardless
  // of frequency, then take the top `limit` of the named makes.
  const unknown = sorted.filter((m) => !m.code);
  const named   = sorted.filter((m) => m.code).slice(0, limit);

  return unknown.length > 0
    ? [...named, { code: "", label: "Unknown", total: unknown.reduce((s, m) => s + m.total, 0) }]
    : named;
}

/**
 * Returns fuels present in the data, sorted by total registrations.
 */
export function getFuelsByFrequency(
  meta: VehiclesMeta,
  yearData: VehiclesYear
): FuelOption[] {
  const freq = new Map<number, number>();
  for (const [, , fuelIdx, total] of yearData.rows) {
    freq.set(fuelIdx, (freq.get(fuelIdx) ?? 0) + total);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([idx, total]) => {
      const code = meta.fuels[idx];
      return {
        code,
        label: FUEL_LABELS[code] ?? code,
        total,
      };
    });
}
