import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startOperationPoll } from '../../../local/operation-poll';

describe('startOperationPoll', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('runs a tick each interval until the budget is exhausted', async () => {
    const tick = vi.fn(async () => {});
    startOperationPoll({ intervalMs: 1000, budgetMs: 5000, tick, isResolved: () => false });

    await vi.advanceTimersByTimeAsync(5000);
    // budget/interval = 5 ticks; no more after that
    expect(tick).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(5);
  });

  it('stops early as soon as isResolved() returns true', async () => {
    const tick = vi.fn(async () => {});
    let resolvedAfter = 2;
    const isResolved = () => { resolvedAfter -= 1; return resolvedAfter <= 0; };
    // isResolved returns false on the 1st check, true on the 2nd.
    startOperationPoll({ intervalMs: 1000, budgetMs: 60000, tick, isResolved });

    await vi.advanceTimersByTimeAsync(60000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('cancel() halts further ticks', async () => {
    const tick = vi.fn(async () => {});
    const handle = startOperationPoll({ intervalMs: 1000, budgetMs: 60000, tick, isResolved: () => false });

    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(1);
    handle.cancel();
    await vi.advanceTimersByTimeAsync(60000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('never overlaps ticks — awaits each tick before scheduling the next', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const tick = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>(r => setTimeout(r, 3000)); // tick slower than the interval
      inFlight--;
    });
    startOperationPoll({ intervalMs: 1000, budgetMs: 60000, tick, isResolved: () => false });

    await vi.advanceTimersByTimeAsync(20000);
    expect(maxInFlight).toBe(1);
  });

  it('never ticks when the budget is smaller than one interval', async () => {
    const tick = vi.fn(async () => {});
    startOperationPoll({ intervalMs: 5000, budgetMs: 2000, tick, isResolved: () => false });

    await vi.advanceTimersByTimeAsync(60000);
    expect(tick).not.toHaveBeenCalled();
  });

  it('keeps polling when a tick throws (errors are swallowed)', async () => {
    const tick = vi.fn(async () => { throw new Error('scan failed'); });
    startOperationPoll({ intervalMs: 1000, budgetMs: 3000, tick, isResolved: () => false });

    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(3);
  });
});
