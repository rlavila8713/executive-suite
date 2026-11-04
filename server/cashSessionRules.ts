import type { SqliteStore } from './db.js';
import { ApiError } from './apiError.js';

export type CashSessionRow = {
  id: string;
  opened_at: number;
  closed_at: number | null;
};

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function assertClockNotBeforeSession(
  db: SqliteStore,
  session: CashSessionRow,
  now: number,
): void {
  if (now < session.opened_at) {
    throw new ApiError(409, 'System clock is earlier than the cash session opening', 'ERR_CASH_CLOCK_ROLLBACK');
  }
  const lastMovement = db
    .prepare('SELECT MAX(created_at) AS timestamp FROM transactions WHERE created_at >= ?')
    .get(session.opened_at) as { timestamp: number | null } | undefined;
  if (lastMovement?.timestamp != null && now < lastMovement.timestamp) {
    throw new ApiError(409, 'System clock is earlier than a recorded cash movement', 'ERR_CASH_CLOCK_ROLLBACK');
  }
}

/** A sale must belong to a session opened today, and the local clock may not move behind its opening. */
export function requireCurrentDayCashSession(db: SqliteStore, now: number = Date.now()): CashSessionRow {
  const session = db.prepare('SELECT id, opened_at, closed_at FROM cash_sessions WHERE closed_at IS NULL LIMIT 1').get() as
    | CashSessionRow
    | undefined;
  if (!session) throw new ApiError(409, 'Cash session must be open before selling', 'ERR_CASH_SESSION_REQUIRED');
  assertClockNotBeforeSession(db, session, now);
  if (localDayKey(session.opened_at) !== localDayKey(now)) {
    throw new ApiError(409, 'Close the previous daily cash session before selling', 'ERR_CASH_SESSION_DAILY_CLOSE_REQUIRED');
  }
  return session;
}

/**
 * Resolves which cash session applies to a sale (live or replayed from mobile offline queue).
 * When `allowClosedSession` is true, a sale timestamp within a closed session window is accepted (sync after reconnect).
 */
export function resolveCashSessionForSale(
  db: SqliteStore,
  opts: { now: number; cashSessionId?: string | null; allowClosedSession?: boolean },
): CashSessionRow {
  const cashSessionId = opts.cashSessionId?.trim() || null;
  const allowClosed = opts.allowClosedSession === true;

  if (cashSessionId) {
    const session = db.prepare('SELECT id, opened_at, closed_at FROM cash_sessions WHERE id = ?').get(cashSessionId) as
      | CashSessionRow
      | undefined;
    if (!session) {
      throw new ApiError(409, 'Cash session not found', 'ERR_CASH_SESSION_NOT_FOUND');
    }
    if (session.closed_at == null) {
      assertClockNotBeforeSession(db, session, opts.now);
      if (localDayKey(session.opened_at) !== localDayKey(opts.now)) {
        throw new ApiError(
          409,
          'Close the previous daily cash session before selling',
          'ERR_CASH_SESSION_DAILY_CLOSE_REQUIRED',
        );
      }
      return session;
    }
    if (allowClosed && opts.now >= session.opened_at && opts.now <= session.closed_at) {
      return session;
    }
    throw new ApiError(409, 'Cash session is closed for this sale', 'ERR_CASH_SESSION_CLOSED_OFFLINE_SYNC');
  }

  return requireCurrentDayCashSession(db, opts.now);
}
