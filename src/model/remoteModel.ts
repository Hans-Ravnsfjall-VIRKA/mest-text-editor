// Pure logic for the Supabase tables: row mapping, what needs pushing, config parsing.

import type { BlockEdit, Edits } from './contentModel';
import type { Reviews } from './reviewModel';

export interface EditRow {
  key: string;
  data: BlockEdit;
  updated_at: string;
  updated_by: string;
}

export interface ReviewRow {
  page_id: string;
  reviewed: boolean;
  updated_at: string;
  updated_by: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Postgres returns "2026-11-05T10:00:00.123+00:00"; local entries use "...123Z". Compare in one format. */
export function normIso(value: string): string {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}

export function editsToRows(edits: Edits): EditRow[] {
  return Object.entries(edits).map(([key, data]) => ({
    key,
    data,
    updated_at: data.updatedAt,
    updated_by: data.updatedBy,
  }));
}

export function rowsToEdits(rows: unknown[]): Edits {
  const edits: Edits = {};
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Partial<EditRow>;
    if (typeof r.key !== 'string' || typeof r.data !== 'object' || r.data === null) continue;
    const data = r.data as Partial<BlockEdit>;
    const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : typeof r.updated_at === 'string' ? normIso(r.updated_at) : null;
    if (updatedAt === null) continue;
    edits[r.key] = { ...data, updatedAt, updatedBy: data.updatedBy ?? r.updated_by ?? 'unknown' };
  }
  return edits;
}

export function reviewsToRows(reviews: Reviews): ReviewRow[] {
  return Object.entries(reviews).map(([page_id, r]) => ({
    page_id,
    reviewed: r.reviewed,
    updated_at: r.updatedAt,
    updated_by: r.updatedBy,
  }));
}

export function rowsToReviews(rows: unknown[]): Reviews {
  const reviews: Reviews = {};
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Partial<ReviewRow>;
    if (typeof r.page_id !== 'string' || typeof r.reviewed !== 'boolean' || typeof r.updated_at !== 'string') continue;
    reviews[r.page_id] = { reviewed: r.reviewed, updatedAt: normIso(r.updated_at), updatedBy: r.updated_by ?? 'unknown' };
  }
  return reviews;
}

/** Entries of `local` that the remote lacks or has only in an older version. */
export function pendingEntries<T extends { updatedAt: string }>(local: Record<string, T>, remote: Record<string, T>): Record<string, T> {
  const pending: Record<string, T> = {};
  for (const [key, entry] of Object.entries(local)) {
    const known = remote[key];
    if (!known || entry.updatedAt > known.updatedAt) pending[key] = entry;
  }
  return pending;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Reads public/data/config.json. Empty or broken input means "no database": the app then works locally. */
export function parseSupabaseConfig(text: string): SupabaseConfig | null {
  try {
    const data = JSON.parse(text) as { supabaseUrl?: unknown; supabaseAnonKey?: unknown };
    const url = typeof data.supabaseUrl === 'string' ? data.supabaseUrl.trim().replace(/\/+$/, '') : '';
    const anonKey = typeof data.supabaseAnonKey === 'string' ? data.supabaseAnonKey.trim() : '';
    return /^https:\/\/.+/.test(url) && anonKey !== '' ? { url, anonKey } : null;
  } catch {
    return null;
  }
}
