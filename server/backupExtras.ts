import type { SqliteStore } from './db.js';
import { migrateExpenseCategoriesSchema, rowToExpenseCategory, type ExpenseCategoryRow } from './expenseCategories.js';
import { ensureLicenseRow } from './license.js';
import {
  migrateUserAuditSchema,
  type UserAdminAuditAction,
  type UserAdminAuditDetails,
} from './userAuditLog.js';

export type BackupExpenseCategory = {
  id: string;
  name: string;
  code: string;
  isSystem: boolean;
  createdAt: number;
};

export type BackupUserAdminAuditEntry = {
  id: string;
  action: UserAdminAuditAction;
  createdAt: number;
  actorUserId: string | null;
  actorDisplayName: string;
  actorUsername: string | null;
  deviceId: string | null;
  details: UserAdminAuditDetails;
};

export type BackupLicenseSnapshot = {
  trialStartedAt: number;
  planId: string | null;
  paidUntil: number | null;
  deviceFingerprint: string | null;
  deviceRegisteredAt: number | null;
  lastPaymentAt: number | null;
  licenseNonce: string | null;
  redemptions: { nonce: string; redeemedAt: number }[];
};

export type BackupExtrasSnapshot = {
  expenseCategories: BackupExpenseCategory[];
  userAdminAudit: BackupUserAdminAuditEntry[];
  license: BackupLicenseSnapshot;
};

export function buildBackupExtrasSnapshot(db: SqliteStore): BackupExtrasSnapshot {
  migrateExpenseCategoriesSchema(db);
  migrateUserAuditSchema(db);
  ensureLicenseRow(db);

  const expenseRows = db.prepare('SELECT * FROM expense_categories ORDER BY name').all() as ExpenseCategoryRow[];
  const expenseCategories = expenseRows.map(rowToExpenseCategory);

  const auditRows = db
    .prepare(
      `SELECT id, action, created_at, actor_user_id, actor_display_name, actor_username, device_id, details_json
       FROM user_admin_audit_log
       ORDER BY created_at ASC, id ASC`,
    )
    .all() as {
    id: string;
    action: string;
    created_at: number;
    actor_user_id: string | null;
    actor_display_name: string;
    actor_username: string | null;
    device_id: string | null;
    details_json: string;
  }[];

  const userAdminAudit: BackupUserAdminAuditEntry[] = auditRows.map((row) => ({
    id: row.id,
    action: row.action as UserAdminAuditAction,
    createdAt: row.created_at,
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    actorUsername: row.actor_username,
    deviceId: row.device_id,
    details: parseAuditDetails(row.details_json),
  }));

  const licenseRow = db.prepare('SELECT * FROM license_state WHERE id = ?').get('main') as {
    trial_started_at: number;
    plan_id: string | null;
    paid_until: number | null;
    device_fingerprint: string | null;
    device_registered_at: number | null;
    last_payment_at: number | null;
    license_nonce: string | null;
  };

  const redemptionRows = db
    .prepare('SELECT nonce, redeemed_at FROM license_redemptions ORDER BY redeemed_at ASC')
    .all() as { nonce: string; redeemed_at: number }[];

  const license: BackupLicenseSnapshot = {
    trialStartedAt: licenseRow.trial_started_at,
    planId: licenseRow.plan_id,
    paidUntil: licenseRow.paid_until,
    deviceFingerprint: licenseRow.device_fingerprint,
    deviceRegisteredAt: licenseRow.device_registered_at,
    lastPaymentAt: licenseRow.last_payment_at,
    licenseNonce: licenseRow.license_nonce,
    redemptions: redemptionRows.map((r) => ({ nonce: r.nonce, redeemedAt: r.redeemed_at })),
  };

  return { expenseCategories, userAdminAudit, license };
}

function parseAuditDetails(raw: string): UserAdminAuditDetails {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as UserAdminAuditDetails;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function applyBackupExtrasSnapshot(db: SqliteStore, extras: Partial<BackupExtrasSnapshot> | undefined): void {
  migrateExpenseCategoriesSchema(db);
  migrateUserAuditSchema(db);

  db.prepare('DELETE FROM expense_categories').run();
  if (extras?.expenseCategories?.length) {
    const insertCat = db.prepare(
      'INSERT INTO expense_categories (id, name, code, is_system, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const c of extras.expenseCategories) {
      insertCat.run(c.id, c.name, c.code, c.isSystem ? 1 : 0, c.createdAt);
    }
  } else {
    migrateExpenseCategoriesSchema(db);
  }

  db.prepare('DELETE FROM user_admin_audit_log').run();
  if (extras?.userAdminAudit?.length) {
    const insertAudit = db.prepare(
      `INSERT INTO user_admin_audit_log
       (id, action, created_at, actor_user_id, actor_display_name, actor_username, device_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of extras.userAdminAudit) {
      insertAudit.run(
        e.id,
        e.action,
        e.createdAt,
        e.actorUserId,
        e.actorDisplayName.slice(0, 120),
        e.actorUsername?.slice(0, 80) ?? null,
        e.deviceId,
        JSON.stringify(e.details ?? {}),
      );
    }
  }

  if (extras?.license) {
    ensureLicenseRow(db);
    db.prepare('DELETE FROM license_redemptions').run();
    db.prepare(
      `UPDATE license_state SET trial_started_at = ?, plan_id = ?, paid_until = ?, device_fingerprint = ?, device_registered_at = ?, last_payment_at = ?, license_nonce = ? WHERE id = ?`,
    ).run(
      extras.license.trialStartedAt,
      extras.license.planId,
      extras.license.paidUntil,
      extras.license.deviceFingerprint,
      extras.license.deviceRegisteredAt,
      extras.license.lastPaymentAt,
      extras.license.licenseNonce,
      'main',
    );
    const insertRedemption = db.prepare('INSERT INTO license_redemptions (nonce, redeemed_at) VALUES (?, ?)');
    for (const r of extras.license.redemptions ?? []) {
      insertRedemption.run(r.nonce, r.redeemedAt);
    }
  }
}
