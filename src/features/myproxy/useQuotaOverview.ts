/**
 * Loads the quota overview: one list call plus one detail call per credential.
 *
 * The fan-out is not an optimisation gap — `reset_credits` exists only on the
 * detail endpoint, so credit balances cannot be shown from the list alone.
 * Requests run in bounded batches so a large pool does not open 50+ sockets.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { quotaSnapshotApi } from '@/services/api';
import type {
  QuotaCredentialSummary,
  QuotaCredentialsSummaryCounts,
  QuotaResetCredits,
  QuotaWindow,
} from '@/types/quotaSnapshot';

const DETAIL_BATCH_SIZE = 6;

export interface QuotaOverviewRow {
  credential: QuotaCredentialSummary;
  windows: QuotaWindow[];
  resetCredits: QuotaResetCredits | null;
  /** Detail fetch failed; the row still renders from list data. */
  detailError: string | null;
}

interface QuotaOverviewState {
  rows: QuotaOverviewRow[];
  summary: QuotaCredentialsSummaryCounts | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
}

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const runInBatches = async <TIn, TOut>(
  inputs: TIn[],
  size: number,
  worker: (input: TIn) => Promise<TOut>,
): Promise<TOut[]> => {
  const results: TOut[] = [];
  for (let index = 0; index < inputs.length; index += size) {
    const batch = inputs.slice(index, index + size);
    results.push(...(await Promise.all(batch.map(worker))));
  }
  return results;
};

export const useQuotaOverview = () => {
  const [state, setState] = useState<QuotaOverviewState>({
    rows: [],
    summary: null,
    generatedAt: null,
    loading: true,
    error: null,
  });

  // Guards against a slow earlier load overwriting a newer one.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const list = await quotaSnapshotApi.list({ limit: 200, sort: 'risk_desc' });
      if (requestRef.current !== requestId) return;

      const rows = await runInBatches(
        list.items,
        DETAIL_BATCH_SIZE,
        async (credential): Promise<QuotaOverviewRow> => {
          try {
            const detail = await quotaSnapshotApi.detail(credential.credential_id);
            return {
              credential: detail.credential ?? credential,
              windows: detail.windows ?? credential.primary_windows ?? [],
              resetCredits: detail.reset_credits ?? null,
              detailError: null,
            };
          } catch (cause) {
            // An unreadable credential is reported, never silently shown as healthy.
            return {
              credential,
              windows: credential.primary_windows ?? [],
              resetCredits: null,
              detailError: errorMessage(cause),
            };
          }
        },
      );
      if (requestRef.current !== requestId) return;

      setState({
        rows,
        summary: list.summary ?? null,
        generatedAt: list.generated_at ?? null,
        loading: false,
        error: null,
      });
    } catch (cause) {
      if (requestRef.current !== requestId) return;
      setState((prev) => ({ ...prev, loading: false, error: errorMessage(cause) }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
};
