import type { FilterState, AggregateResult } from "../types";

/**
 * Memoises aggregate results by a hash of the filter state.
 * Re-selecting a prior make/fuel/year combination is instant - zero network
 * requests and zero row iteration.
 */
export class AggregateCache {
  private readonly store = new Map<string, AggregateResult>();

  private key(fs: FilterState): string {
    // Sort both arrays so ["P","E"] and ["E","P"] produce the same key.
    const fuels = [...fs.fuels].sort().join(",");
    const makes = [...fs.makes].sort().join(",");
    return `${fs.year}|${fuels}|${makes}`;
  }

  get(fs: FilterState): AggregateResult | undefined {
    return this.store.get(this.key(fs));
  }

  set(fs: FilterState, result: AggregateResult): void {
    this.store.set(this.key(fs), result);
  }

  has(fs: FilterState): boolean {
    return this.store.has(this.key(fs));
  }

  invalidateYear(year: number): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(`${year}|`)) this.store.delete(k);
    }
  }

  get size(): number {
    return this.store.size;
  }
}
