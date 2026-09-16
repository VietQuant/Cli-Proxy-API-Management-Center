/**
 * Home's DB-backed quota snapshot API.
 *
 * Availability is gated by the `quota_snapshots`, `quota_snapshot_details` and
 * `quota_recollect` capability flags — read those from `/capabilities` rather than
 * probing a route, since an older Home answers 404 for endpoints it never wired up.
 */

import { apiClient } from './client';
import type {
  QuotaCollectResponse,
  QuotaCredentialDetail,
  QuotaCredentialsQuery,
  QuotaCredentialsResponse,
} from '@/types/quotaSnapshot';

const buildQuery = (query: QuotaCredentialsQuery = {}): string => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

export const quotaSnapshotApi = {
  list: (query: QuotaCredentialsQuery = {}) =>
    apiClient.get<QuotaCredentialsResponse>(`/quota/credentials${buildQuery(query)}`),

  /** The only endpoint that returns `reset_credits`; the list view omits it. */
  detail: (credentialId: string) =>
    apiClient.get<QuotaCredentialDetail>(
      `/quota/credentials/${encodeURIComponent(credentialId)}`,
    ),

  /**
   * Queues an active probe round and returns immediately (HTTP 202); snapshots are
   * written in the background, so callers re-read the list after it settles.
   */
  collect: (payload: { credential_ids?: string[]; providers?: string[] } = {}) =>
    apiClient.post<QuotaCollectResponse>('/quota/collect', payload),
};
