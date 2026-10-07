export type PersistenceSnapshot = {
  lastSuccessfulPersist: string | null;
  lastPersistDurationMs: number | null;
  lastPersistSizeBytes: number | null;
  lastPersistError: string | null;
};

export type BackupMetricsSnapshot = {
  lastSuccessfulBackup: string | null;
  lastBackupPath: string | null;
  lastBackupSizeBytes: number | null;
  lastBackupError: string | null;
};

const persistence: PersistenceSnapshot = {
  lastSuccessfulPersist: null,
  lastPersistDurationMs: null,
  lastPersistSizeBytes: null,
  lastPersistError: null,
};

const backupMetrics: BackupMetricsSnapshot = {
  lastSuccessfulBackup: null,
  lastBackupPath: null,
  lastBackupSizeBytes: null,
  lastBackupError: null,
};

export function getPersistenceMetrics(): PersistenceSnapshot {
  return { ...persistence };
}

export function getBackupMetrics(): BackupMetricsSnapshot {
  return { ...backupMetrics };
}

export function recordPersistSuccess(durationMs: number, sizeBytes: number): void {
  persistence.lastSuccessfulPersist = new Date().toISOString();
  persistence.lastPersistDurationMs = durationMs;
  persistence.lastPersistSizeBytes = sizeBytes;
  persistence.lastPersistError = null;
}

export function recordPersistFailure(message: string): void {
  persistence.lastPersistError = message;
}

export function recordBackupSuccess(filePath: string, sizeBytes: number): void {
  backupMetrics.lastSuccessfulBackup = new Date().toISOString();
  backupMetrics.lastBackupPath = filePath;
  backupMetrics.lastBackupSizeBytes = sizeBytes;
  backupMetrics.lastBackupError = null;
}

export function recordBackupFailure(message: string): void {
  backupMetrics.lastBackupError = message;
}
