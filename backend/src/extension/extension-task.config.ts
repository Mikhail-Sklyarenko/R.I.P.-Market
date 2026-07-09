export function isExtensionTaskPipelineEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_TASK_PIPELINE === 'true';
}

export function extensionTaskMaxAttempts(): number {
  const raw = Number(process.env.EXTENSION_TASK_MAX_ATTEMPTS ?? 5);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

export function extensionTaskTtlMs(): number {
  const raw = Number(process.env.EXTENSION_TASK_TTL_MS ?? 1_800_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 1_800_000;
}

export function extensionTaskPollBatchSize(): number {
  const raw = Number(process.env.EXTENSION_TASK_POLL_BATCH_SIZE ?? 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}
