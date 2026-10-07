export function logDexieMigration(action: string, reason: string): void {
  console.info(
    JSON.stringify({
      event:
        action === 'import'
          ? 'DEXIE_MIGRATION_START'
          : action === 'skip'
            ? 'DEXIE_MIGRATION_SKIPPED'
            : 'DEXIE_MIGRATION_SKIPPED',
      action,
      reason,
    }),
  );
}
