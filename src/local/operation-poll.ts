export interface OperationPollOptions {
  /** Delay between ticks, in ms. */
  intervalMs: number;
  /** Total time budget before the poll gives up, in ms. */
  budgetMs: number;
  /** One unit of work (e.g. rescan + sync). Errors are swallowed so the poll continues. */
  tick: () => Promise<void>;
  /** Checked after each tick; returning true stops the poll early. */
  isResolved: () => boolean;
}

export interface OperationPollHandle {
  cancel(): void;
}

/**
 * A bounded, non-overlapping poll: runs `tick()` every `intervalMs` until
 * `isResolved()` is true, the `budgetMs` is exhausted, or `cancel()` is called.
 *
 * Uses a recursive setTimeout that awaits each `tick()` before scheduling the
 * next, so ticks never overlap even if a tick takes longer than the interval.
 * Designed to be dependency-injected (no vscode / scanner) so it's unit-testable.
 */
export function startOperationPoll(opts: OperationPollOptions): OperationPollHandle {
  const { intervalMs, budgetMs, tick, isResolved } = opts;
  const maxTicks = Math.floor(budgetMs / intervalMs);

  let ticks = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Budget smaller than one interval → no ticks fit; don't poll at all.
  if (maxTicks < 1) {
    return { cancel(): void { /* nothing scheduled */ } };
  }

  const schedule = (): void => {
    timer = setTimeout(async () => {
      if (cancelled) { return; }
      ticks++;
      try {
        await tick();
      } catch {
        // A failed scan shouldn't abort the poll — keep trying within budget.
      }
      if (cancelled) { return; }
      if (isResolved()) { return; }
      if (ticks >= maxTicks) { return; }
      schedule();
    }, intervalMs);
  };

  schedule();

  return {
    cancel(): void {
      cancelled = true;
      if (timer) { clearTimeout(timer); }
    },
  };
}
