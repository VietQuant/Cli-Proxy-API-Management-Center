/**
 * Derived quota figures for the overview table.
 *
 * Kept free of React so the rules that matter — how usage is derived, which credit
 * expires first — can be reasoned about and tested on their own.
 */

import type { QuotaResetCredits, QuotaWindow } from '@/types/quotaSnapshot';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Percentage of the window already consumed.
 *
 * `used_percent` comes back null even from a successful active probe, so it is
 * derived from limit/remaining and only falls back to the reported field.
 */
export const windowUsedPercent = (window: QuotaWindow | null | undefined): number | null => {
  if (!window) return null;
  const { limit, remaining, used_percent: usedPercent } = window;
  if (typeof limit === 'number' && limit > 0 && typeof remaining === 'number') {
    const used = ((limit - remaining) / limit) * 100;
    return Math.min(100, Math.max(0, used));
  }
  return typeof usedPercent === 'number' ? usedPercent : null;
};

/** The window closest to exhaustion, which is the one worth showing in a single-line summary. */
export const tightestWindow = (windows: QuotaWindow[]): QuotaWindow | null => {
  let tightest: QuotaWindow | null = null;
  let lowest = Number.POSITIVE_INFINITY;
  windows.forEach((window) => {
    if (typeof window.remaining !== 'number') return;
    if (window.remaining < lowest) {
      lowest = window.remaining;
      tightest = window;
    }
  });
  return tightest ?? windows[0] ?? null;
};

/** Earliest reset across windows; null when no window reports one. */
export const earliestReset = (windows: QuotaWindow[]): string | null => {
  const stamps = windows
    .map((window) => window.reset_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  return stamps[0] ?? null;
};

/**
 * The credit that expires first.
 *
 * Credits expire on a fixed date whether or not they are spent, so spending the
 * nearest-expiry one first is what keeps a balance from silently evaporating.
 */
export const nextExpiringCredit = (
  resetCredits: QuotaResetCredits | null,
): { expiresAt: string; daysLeft: number } | null => {
  const expiries = (resetCredits?.credits ?? [])
    .filter((credit) => credit.status === 'available' && credit.expires_at)
    .map((credit) => credit.expires_at as string)
    .sort();
  const soonest = expiries[0];
  if (!soonest) return null;

  const parsed = Date.parse(soonest);
  if (Number.isNaN(parsed)) return null;

  return {
    expiresAt: soonest,
    daysLeft: Math.floor((parsed - Date.now()) / DAY_MS),
  };
};

/** Whole days until `timestamp`; null when absent or unparseable. */
export const daysUntil = (timestamp: string | null | undefined): number | null => {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((parsed - Date.now()) / DAY_MS);
};

/**
 * Masks the local part of an email.
 *
 * `/quota/credentials` redacts labels already, but `/request-events` returns them
 * whole, so anything rendering a credential label masks defensively.
 */
export const maskAccountLabel = (label: string | null | undefined): string => {
  const value = (label ?? '').trim();
  if (!value) return '—';
  const at = value.indexOf('@');
  if (at <= 0) return value;
  const local = value.slice(0, at);
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}${value.slice(at)}`;
};
