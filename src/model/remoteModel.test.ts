import { describe, expect, it } from 'vitest';
import type { Edits } from './contentModel';
import { chunk, editsToRows, normIso, parseSupabaseConfig, pendingEntries, reviewsToRows, rowsToEdits, rowsToReviews } from './remoteModel';

const e1 = { fo: 'nýtt', updatedAt: '2026-11-05T10:00:00.000Z', updatedBy: 'hans' };
const e2 = { en: 'new', updatedAt: '2026-11-05T11:00:00.000Z', updatedBy: 'bardur' };

describe('rows', () => {
  it('round-trips edits', () => {
    const edits: Edits = { 'p/b1': e1, 'p/b2': e2 };
    expect(rowsToEdits(editsToRows(edits))).toEqual(edits);
  });
  it('skips broken rows', () => {
    expect(rowsToEdits([{ key: 'x' }, null, { key: 'y', data: 5 }, { key: 'z', data: { fo: 'a' } }])).toEqual({});
  });
  it('round-trips reviews and normalises Postgres timestamps', () => {
    const rows = [{ page_id: 'a', reviewed: true, updated_at: '2026-11-05T10:00:00.123+00:00', updated_by: 'h' }];
    expect(rowsToReviews(rows)).toEqual({ a: { reviewed: true, updatedAt: '2026-11-05T10:00:00.123Z', updatedBy: 'h' } });
    expect(rowsToReviews(reviewsToRows(rowsToReviews(rows)))).toEqual(rowsToReviews(rows));
    expect(rowsToReviews([{ page_id: 'a', reviewed: 'yes' }])).toEqual({});
  });
  it('normalises iso strings', () => {
    expect(normIso('2026-11-05T10:00:00.123+00:00')).toBe('2026-11-05T10:00:00.123Z');
    expect(normIso('garbage')).toBe('garbage');
  });
});

describe('pendingEntries', () => {
  it('returns new and newer local entries only', () => {
    const local = { a: e2, b: e1, c: e1 };
    const remote = { a: e1, b: e2 };
    expect(Object.keys(pendingEntries(local, remote)).sort()).toEqual(['a', 'c']);
  });
  it('returns nothing when remote is in step', () => {
    expect(pendingEntries({ a: e1 }, { a: e1 })).toEqual({});
  });
});

describe('helpers', () => {
  it('chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
  it('parses config only when complete', () => {
    expect(parseSupabaseConfig('{"supabaseUrl":"https://abc.supabase.co/","supabaseAnonKey":" k "}')).toEqual({ url: 'https://abc.supabase.co', anonKey: 'k' });
    expect(parseSupabaseConfig('{"supabaseUrl":"","supabaseAnonKey":""}')).toBeNull();
    expect(parseSupabaseConfig('{"supabaseUrl":"http://x","supabaseAnonKey":"k"}')).toBeNull();
    expect(parseSupabaseConfig('<html>')).toBeNull();
  });
});
