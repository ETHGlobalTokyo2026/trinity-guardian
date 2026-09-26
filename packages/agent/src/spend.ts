// Spend accumulator with UTC daily reset (AG-004)

import type { SpendState } from "./types.js";

const todayWindow = () => new Date().toISOString().slice(0, 10);

export class SpendAccumulator {
  private state: SpendState = {
    spendToday: 0n,
    txCount: 0,
    window: todayWindow(),
    lastUpdated: new Date(),
  };

  get(): SpendState {
    this.maybeReset();
    return { ...this.state };
  }

  /** Returns effective dailySpend after reset check. */
  dailySpend(): bigint {
    this.maybeReset();
    return this.state.spendToday;
  }

  /** Record a settled payment (atomic units). */
  record(amount: bigint): SpendState {
    this.maybeReset();
    this.state.spendToday += amount;
    this.state.txCount += 1;
    this.state.lastUpdated = new Date();
    return this.get();
  }

  private maybeReset(): void {
    const today = todayWindow();
    if (this.state.window !== today) {
      this.state = { spendToday: 0n, txCount: 0, window: today, lastUpdated: new Date() };
    }
  }
}
