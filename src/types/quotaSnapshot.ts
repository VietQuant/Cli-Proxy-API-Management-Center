/**
 * Types for Home's DB-backed quota snapshot API (`/quota/credentials`).
 *
 * Distinct from the legacy per-provider payloads in `quota.ts`, which the old
 * page derived from auth files. These describe what Home itself collected.
 */

export type QuotaStatus =
  | 'healthy'
  | 'low'
  | 'exhausted'
  | 'unknown'
  | 'error'
  | 'unsupported';

export type QuotaFreshness = 'fresh' | 'stale' | 'never';

/** How the snapshot was obtained. Only `active_probe` carries usage figures and reset credits. */
export type QuotaSource = 'response_header' | 'active_probe' | 'mixed' | 'none';

export type QuotaCollectionStatus = 'success' | 'partial' | 'failed' | 'collecting';

export interface QuotaWindow {
  id: string;
  label: string | null;
  scope: string | null;
  scope_id: string | null;
  mode: string | null;
  status: QuotaStatus | null;
  /**
   * Always null on the deployments measured so far, including after a successful
   * active probe. Derive the percentage from `limit`/`remaining` instead.
   */
  used_percent: number | null;
  limit: number | null;
  remaining: number | null;
  reset_at: string | null;
}

/** One rate-limit reset credit. Credits expire on a fixed date whether or not they are spent. */
export interface QuotaResetCredit {
  status: string;
  granted_at: string | null;
  expires_at: string | null;
}

export interface QuotaResetCredits {
  available_count: number;
  observed_at: string | null;
  credits: QuotaResetCredit[];
}

/** A row of `GET /quota/credentials`. */
export interface QuotaCredentialSummary {
  credential_id: string;
  auth_index: string | null;
  provider: string;
  credential_type: string | null;
  label: string | null;
  account: string | null;
  project: string | null;
  credential_status: string | null;
  quota_status: QuotaStatus | null;
  freshness: QuotaFreshness | null;
  collection_status: QuotaCollectionStatus | null;
  source: QuotaSource | null;
  observed_at: string | null;
  expires_at: string | null;
  earliest_reset_at: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  next_probe_at: string | null;
  consecutive_failures: number | null;
  primary_windows: QuotaWindow[];
  window_count: number | null;
  error: string | null;
}

export interface QuotaCredentialsSummaryCounts {
  total_credentials: number;
  healthy: number;
  low: number;
  exhausted: number;
  unknown: number;
  error: number;
  unsupported: number;
  stale: number;
  never: number;
  collecting: number;
  /** Counts a credential once when it is non-healthy, non-fresh, partial, or failed. */
  needs_attention: number;
  last_observed_at: string | null;
}

export interface QuotaCredentialsResponse {
  items: QuotaCredentialSummary[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
  generated_at: string | null;
  summary: QuotaCredentialsSummaryCounts;
  global_summary: QuotaCredentialsSummaryCounts;
}

/**
 * `GET /quota/credentials/:id`.
 *
 * `reset_credits` lives only here — the list endpoint omits it entirely, so a page
 * showing credit balances has to fan out one request per credential.
 */
export interface QuotaCredentialDetail {
  credential: QuotaCredentialSummary;
  windows: QuotaWindow[];
  reset_credits: QuotaResetCredits | null;
  collection: {
    status: QuotaCollectionStatus | null;
    source: QuotaSource | null;
    observed_at: string | null;
    error: string | null;
  } | null;
  generated_at: string | null;
}

export interface QuotaCollectResponse {
  accepted: number;
  running: boolean;
}

export interface QuotaCredentialsQuery {
  limit?: number;
  offset?: number;
  search?: string;
  provider?: string;
  quota_status?: string;
  freshness?: string;
  source?: string;
  sort?: string;
}
