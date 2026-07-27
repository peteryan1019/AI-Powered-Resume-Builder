/**
 * Wall-clock instrumentation for multi-stage pipelines.
 *
 * Each step logs as it finishes — including when it throws — so a build that
 * fails still shows which stage it reached and how long that stage took. The
 * closing summary reprints the breakdown on one line so a slow build can be
 * read at a glance without scrolling through interleaved logs.
 */

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

export interface StepTimer {
  /** Runs `fn`, logging its duration. Re-throws whatever `fn` throws. */
  step<T>(label: string, fn: () => Promise<T>): Promise<T>;
  /** Logs the total elapsed time and the per-step breakdown. */
  done(): void;
}

export function createStepTimer(scope: string): StepTimer {
  const startedAt = performance.now();
  const steps: Array<{ label: string; ms: number; failed: boolean }> = [];

  const record = (label: string, ms: number, failed: boolean): void => {
    steps.push({ label, ms, failed });
    console.log(
      `${scope} ${label} — ${formatMs(ms)}${failed ? " (FAILED)" : ""}`,
    );
  };

  return {
    async step<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const startedStepAt = performance.now();
      try {
        const result = await fn();
        record(label, performance.now() - startedStepAt, false);
        return result;
      } catch (error: unknown) {
        record(label, performance.now() - startedStepAt, true);
        throw error;
      }
    },

    done(): void {
      const total = performance.now() - startedAt;
      const breakdown = steps
        .map((s) => `${s.label} ${formatMs(s.ms)}${s.failed ? " (failed)" : ""}`)
        .join(" | ");
      console.log(
        `${scope} TOTAL ${formatMs(total)}${breakdown ? ` — ${breakdown}` : ""}`,
      );
    },
  };
}
