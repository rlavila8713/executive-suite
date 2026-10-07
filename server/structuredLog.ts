/** Structured logs for critical DB operations (no secrets / no image payloads). */

export type StructuredLogEvent =
  | 'DB_PERSIST_START'
  | 'DB_PERSIST_SUCCESS'
  | 'DB_PERSIST_FAILURE'
  | 'DB_BACKUP_START'
  | 'DB_BACKUP_SUCCESS'
  | 'DB_BACKUP_FAILURE'
  | 'BACKUP_IMPORT_START'
  | 'BACKUP_IMPORT_SUCCESS'
  | 'BACKUP_IMPORT_FAILURE'
  | 'DEXIE_MIGRATION_START'
  | 'DEXIE_MIGRATION_SKIPPED'
  | 'DEXIE_MIGRATION_SUCCESS'
  | 'DEXIE_MIGRATION_FAILURE'
  | 'IMAGE_UPLOAD_START'
  | 'IMAGE_UPLOAD_SUCCESS'
  | 'IMAGE_UPLOAD_FAILURE';

export function logStructured(event: StructuredLogEvent, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}
