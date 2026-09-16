/**
 * Quota overview: remaining quota, reset credits and credit expiry per credential,
 * with an on-demand active probe.
 *
 * Reads Home's snapshot API rather than deriving figures from auth files, which is
 * what makes usage and credit balances visible at all.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { quotaSnapshotApi } from '@/services/api';
import {
  daysUntil,
  earliestReset,
  maskAccountLabel,
  nextExpiringCredit,
  tightestWindow,
  windowUsedPercent,
} from './quotaMetrics';
import { useQuotaOverview, type QuotaOverviewRow } from './useQuotaOverview';

/** Credits expiring within this many days are called out as use-it-or-lose-it. */
const EXPIRY_WARNING_DAYS = 7;

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString();
};

const formatPercent = (value: number | null): string =>
  value === null ? '—' : `${value.toFixed(0)}%`;

function StatusPill({ status }: { status: string | null }) {
  const tone = status === 'healthy' ? 'ok' : status === 'exhausted' ? 'danger' : 'warn';
  return <span className={`pill pill-${tone}`}>{status ?? 'unknown'}</span>;
}

function QuotaRow({ row }: { row: QuotaOverviewRow }) {
  const { t } = useTranslation();
  const window = tightestWindow(row.windows);
  const used = windowUsedPercent(window);
  const credits = row.resetCredits?.available_count ?? 0;
  const expiring = nextExpiringCredit(row.resetCredits);
  const resetAt = earliestReset(row.windows);
  const resetInDays = daysUntil(resetAt);

  return (
    <TableRow>
      <TableCell>
        <div className="stack-xs">
          <strong>{maskAccountLabel(row.credential.label ?? row.credential.account)}</strong>
          <small className="muted">{row.credential.provider}</small>
        </div>
      </TableCell>

      <TableCell>
        <StatusPill status={row.credential.quota_status} />
      </TableCell>

      <TableCell>
        {window ? (
          <div className="stack-xs">
            <strong>
              {typeof window.remaining === 'number' ? `${window.remaining}%` : '—'}
            </strong>
            <small className="muted">
              {t('myproxy.quota.used_label', { value: formatPercent(used) })}
            </small>
          </div>
        ) : (
          '—'
        )}
      </TableCell>

      <TableCell>
        <div className="stack-xs">
          <strong>{credits}</strong>
          {expiring ? (
            <small className={expiring.daysLeft <= EXPIRY_WARNING_DAYS ? 'text-warn' : 'muted'}>
              {t('myproxy.quota.credit_expires_in', { days: expiring.daysLeft })}
            </small>
          ) : (
            <small className="muted">{t('myproxy.quota.no_credits')}</small>
          )}
        </div>
      </TableCell>

      <TableCell>
        <div className="stack-xs">
          <span>{formatDateTime(resetAt)}</span>
          {resetInDays !== null ? (
            <small className="muted">
              {t('myproxy.quota.reset_in_days', { days: resetInDays })}
            </small>
          ) : null}
        </div>
      </TableCell>

      <TableCell>
        <div className="stack-xs">
          <small className="muted">{row.credential.source ?? '—'}</small>
          <small className="muted">{formatDateTime(row.credential.observed_at)}</small>
          {row.detailError ? (
            <small className="text-danger">{t('myproxy.quota.detail_failed')}</small>
          ) : null}
        </div>
      </TableCell>

      <TableCell>
        {/* Spending a reset credit is irreversible and Home exposes no endpoint for
            it yet, so the control stays disabled until that lands. */}
        <Button size="sm" variant="secondary" disabled title={t('myproxy.quota.reset_pending')}>
          {t('myproxy.quota.reset_action')}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function QuotaOverviewPage() {
  const { t } = useTranslation();
  const { rows, summary, generatedAt, loading, error, reload } = useQuotaOverview();
  const [collecting, setCollecting] = useState(false);
  const [collectNote, setCollectNote] = useState<string | null>(null);

  const totals = useMemo(() => {
    const credits = rows.reduce((sum, row) => sum + (row.resetCredits?.available_count ?? 0), 0);
    const expiringSoon = rows.filter((row) => {
      const next = nextExpiringCredit(row.resetCredits);
      return next !== null && next.daysLeft <= EXPIRY_WARNING_DAYS;
    }).length;
    return { credits, expiringSoon };
  }, [rows]);

  const handleCollect = async () => {
    setCollecting(true);
    setCollectNote(null);
    try {
      const response = await quotaSnapshotApi.collect({ providers: ['codex'] });
      // Collection is queued, not finished — say so rather than implying fresh data.
      setCollectNote(t('myproxy.quota.collect_queued', { count: response.accepted }));
      await reload();
    } catch (cause) {
      setCollectNote(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCollecting(false);
    }
  };

  if (loading && rows.length === 0) {
    return <Skeleton />;
  }

  if (error) {
    return <EmptyState title={t('myproxy.quota.load_failed')} description={error} />;
  }

  return (
    <div className="stack-md">
      <Card
        title={t('myproxy.quota.title')}
        extra={
          <div className="row-sm">
            <Button size="sm" variant="secondary" onClick={() => void reload()} loading={loading}>
              {t('myproxy.quota.reload')}
            </Button>
            <Button size="sm" onClick={() => void handleCollect()} loading={collecting}>
              {t('myproxy.quota.collect')}
            </Button>
          </div>
        }
      >
        <div className="row-sm">
          <span>
            {t('myproxy.quota.stat_credentials', { count: summary?.total_credentials ?? rows.length })}
          </span>
          <span>{t('myproxy.quota.stat_credits', { count: totals.credits })}</span>
          {totals.expiringSoon > 0 ? (
            <span className="text-warn">
              {t('myproxy.quota.stat_expiring', { count: totals.expiringSoon })}
            </span>
          ) : null}
          <span className="muted">
            {t('myproxy.quota.generated_at', { value: formatDateTime(generatedAt) })}
          </span>
        </div>
        {collectNote ? <p className="muted">{collectNote}</p> : null}
      </Card>

      {rows.length === 0 ? (
        <EmptyState title={t('myproxy.quota.empty')} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('myproxy.quota.col_account')}</TableHead>
              <TableHead>{t('myproxy.quota.col_status')}</TableHead>
              <TableHead>{t('myproxy.quota.col_remaining')}</TableHead>
              <TableHead>{t('myproxy.quota.col_credits')}</TableHead>
              <TableHead>{t('myproxy.quota.col_reset')}</TableHead>
              <TableHead>{t('myproxy.quota.col_observed')}</TableHead>
              <TableHead>{t('myproxy.quota.col_actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <QuotaRow key={row.credential.credential_id} row={row} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
