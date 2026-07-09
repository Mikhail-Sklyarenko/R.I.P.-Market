import type { TaskProgressReport } from '../types.js';

export interface TaskProgressReporter {
  report(progress: TaskProgressReport): Promise<{ terminal: boolean }>;
}

export class InMemoryTaskProgressReporter implements TaskProgressReporter {
  readonly reports: TaskProgressReport[] = [];

  async report(progress: TaskProgressReport): Promise<{ terminal: boolean }> {
    const duplicate = this.reports.find(
      (entry) => entry.idempotencyKey === progress.idempotencyKey,
    );
    if (duplicate) {
      return {
        terminal:
          duplicate.phase === 'OFFER_SENT' ||
          duplicate.phase === 'OFFER_FAILED',
      };
    }
    this.reports.push(progress);
    return {
      terminal:
        progress.phase === 'OFFER_SENT' || progress.phase === 'OFFER_FAILED',
    };
  }
}
