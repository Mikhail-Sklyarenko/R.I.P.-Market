import type { ExtensionApiClient } from './extension-api-client.js';
import type { TaskProgressReport } from '../types.js';
import type { TaskProgressReporter } from './task-progress-reporter.js';

export class HttpTaskProgressReporter implements TaskProgressReporter {
  constructor(private readonly client: ExtensionApiClient) {}

  async report(progress: TaskProgressReport): Promise<{ terminal: boolean }> {
    const result = await this.client.reportTaskProgress(progress);
    return { terminal: result.terminal };
  }
}
