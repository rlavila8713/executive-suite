import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAppDateTime, formatAppTime } from '../src/lib/dateFormat.ts';

describe('dateFormat', () => {
  const afternoon = new Date('2026-10-17T15:30:00').getTime();

  it('includes 12-hour marker in Spanish', () => {
    const s = formatAppDateTime(afternoon, 'es', 'short');
    assert.match(s, /p\.?\s*m\.?|PM/i);
  });

  it('includes AM/PM in English', () => {
    const s = formatAppTime(afternoon, 'en');
    assert.match(s, /PM/i);
  });

  it('accepts ISO strings from API diagnostics', () => {
    const s = formatAppDateTime('2026-10-17T15:30:00.000Z', 'en', 'short');
    assert.notEqual(s, '—');
    assert.ok(s.length > 4);
  });
});
