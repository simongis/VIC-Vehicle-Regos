import type { TimelineEntry } from "../types";

let cache: TimelineEntry[] | null = null;

/**
 * Loads the state-wide quarterly fuel totals (timeline.json) once and caches
 * them. This is a small (~70-row) state-level series - NOT the per-postcode
 * attribute table - so it's safe to hold in memory whole.
 */
export async function loadTimeline(): Promise<TimelineEntry[]> {
  if (cache) return cache;
  const data = await fetch("/data/timeline.json").then((r) => r.json() as Promise<TimelineEntry[]>);
  cache = data;
  console.log(`[loadTimeline] ${data.length} quarterly fuel records loaded`);
  return data;
}
