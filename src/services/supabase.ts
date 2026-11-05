// Supabase access: sign-in, reading everything, writing only what changed.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Edits } from '../model/contentModel';
import { chunk, editsToRows, reviewsToRows, rowsToEdits, rowsToReviews, type SupabaseConfig } from '../model/remoteModel';
import type { Reviews } from '../model/reviewModel';

const PAGE = 1000;
const BATCH = 200;

export function makeClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mest-text-editor:auth' },
  });
}

async function pullAll(client: SupabaseClient, table: string, order: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select('*').order(order).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

export async function pullEdits(client: SupabaseClient): Promise<Edits> {
  return rowsToEdits(await pullAll(client, 'text_edits', 'key'));
}

export async function pullReviews(client: SupabaseClient): Promise<Reviews> {
  return rowsToReviews(await pullAll(client, 'page_reviews', 'page_id'));
}

export async function pushEdits(client: SupabaseClient, edits: Edits): Promise<void> {
  for (const rows of chunk(editsToRows(edits), BATCH)) {
    const { error } = await client.rpc('upsert_text_edits', { rows });
    if (error) throw new Error(error.message);
  }
}

export async function pushReviews(client: SupabaseClient, reviews: Reviews): Promise<void> {
  for (const rows of chunk(reviewsToRows(reviews), BATCH)) {
    const { error } = await client.rpc('upsert_page_reviews', { rows });
    if (error) throw new Error(error.message);
  }
}
