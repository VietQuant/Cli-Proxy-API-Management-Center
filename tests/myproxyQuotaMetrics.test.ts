import { describe, expect, it } from 'bun:test';
import {
  daysUntil,
  earliestReset,
  maskAccountLabel,
  nextExpiringCredit,
  tightestWindow,
  windowUsedPercent,
} from '@/features/myproxy/quotaMetrics';
import type { QuotaResetCredits, QuotaWindow } from '@/types/quotaSnapshot';

const makeWindow = (overrides: Partial<QuotaWindow> = {}): QuotaWindow => ({
  id: 'codex-1-week',
  label: null,
  scope: 'account',
  scope_id: null,
  mode: 'rolling',
  status: 'healthy',
  used_percent: null,
  limit: 100,
  remaining: 82,
  reset_at: '2026-09-22T10:13:30Z',
  ...overrides,
});

const inDays = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe('windowUsedPercent', () => {
  it('derives usage from limit and remaining when used_percent is absent', () => {
    // Home reports used_percent as null even after a successful probe.
    expect(windowUsedPercent(makeWindow({ remaining: 82 }))).toBe(18);
  });

  it('falls back to the reported percentage when remaining is missing', () => {
    expect(windowUsedPercent(makeWindow({ remaining: null, used_percent: 40 }))).toBe(40);
  });

  it('clamps derived values into 0..100', () => {
    expect(windowUsedPercent(makeWindow({ remaining: 140 }))).toBe(0);
    expect(windowUsedPercent(makeWindow({ remaining: -20 }))).toBe(100);
  });

  it('returns null when neither source is usable', () => {
    expect(windowUsedPercent(makeWindow({ limit: null, remaining: null }))).toBeNull();
    expect(windowUsedPercent(null)).toBeNull();
  });
});

describe('tightestWindow', () => {
  it('picks the window closest to exhaustion', () => {
    const chosen = tightestWindow([
      makeWindow({ id: 'week', remaining: 82 }),
      makeWindow({ id: 'five-hour', remaining: 12 }),
    ]);
    expect(chosen?.id).toBe('five-hour');
  });

  it('falls back to the first window when none report remaining', () => {
    const chosen = tightestWindow([makeWindow({ id: 'a', remaining: null })]);
    expect(chosen?.id).toBe('a');
  });

  it('returns null for an empty list', () => {
    expect(tightestWindow([])).toBeNull();
  });
});

describe('earliestReset', () => {
  it('returns the soonest reset timestamp', () => {
    expect(
      earliestReset([
        makeWindow({ reset_at: '2026-09-23T00:00:00Z' }),
        makeWindow({ reset_at: '2026-09-19T00:00:00Z' }),
      ]),
    ).toBe('2026-09-19T00:00:00Z');
  });

  it('ignores windows without a reset timestamp', () => {
    expect(earliestReset([makeWindow({ reset_at: null })])).toBeNull();
  });
});

describe('nextExpiringCredit', () => {
  const credits = (values: string[]): QuotaResetCredits => ({
    available_count: values.length,
    observed_at: null,
    credits: values.map((expires_at) => ({ status: 'available', granted_at: null, expires_at })),
  });

  it('returns the credit that expires first', () => {
    // Spending order matters: credits expire whether or not they are used.
    const result = nextExpiringCredit(credits([inDays(30), inDays(5)]));
    expect(result?.daysLeft).toBe(5);
  });

  it('skips credits that are not available', () => {
    const payload: QuotaResetCredits = {
      available_count: 1,
      observed_at: null,
      credits: [{ status: 'redeemed', granted_at: null, expires_at: inDays(2) }],
    };
    expect(nextExpiringCredit(payload)).toBeNull();
  });

  it('returns null when there are no credits', () => {
    expect(nextExpiringCredit(null)).toBeNull();
    expect(nextExpiringCredit(credits([]))).toBeNull();
  });
});

describe('daysUntil', () => {
  it('counts whole days ahead', () => {
    expect(daysUntil(inDays(3))).toBe(3);
  });

  it('returns null for missing or unparseable input', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil('not-a-date')).toBeNull();
  });
});

describe('maskAccountLabel', () => {
  it('keeps two leading characters and the domain', () => {
    expect(maskAccountLabel('example@gmail.com')).toBe('ex*****@gmail.com');
  });

  it('leaves non-email labels untouched', () => {
    expect(maskAccountLabel('service-account')).toBe('service-account');
  });

  it('renders a dash for empty input', () => {
    expect(maskAccountLabel(null)).toBe('—');
  });
});
