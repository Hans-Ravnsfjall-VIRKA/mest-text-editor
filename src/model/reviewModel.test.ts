import { describe, expect, it } from 'vitest';
import type { Edits, SiteContent } from './contentModel';
import {
  firstUnreviewed,
  isReviewed,
  mergeReviews,
  orderedPageIds,
  overviewRows,
  parseReviews,
  reviewCounts,
  reviewsEqual,
  setReviewed,
  stepPage,
  wizardQueue,
  type Reviews,
} from './reviewModel';

const page = (id: string, type: 'page' | 'post', date?: string) => ({
  id,
  type,
  title: `${id} - MEST Shipyard`,
  urlFo: `https://x.fo/mest/${id}/`,
  urlEn: `https://x.fo/mest/en/${id}/`,
  date,
  blocks: [{ id: `${id}-b`, kind: 'text' as const, tag: 'p', fo: `fo ${id}`, en: `en ${id}` }],
});

const content = {
  pages: [page('home', 'page'), page('a', 'page'), page('b', 'page'), page('c', 'page'), page('n1', 'post', '2026-01-01T00:00:00'), page('n2', 'post', '2026-02-01T00:00:00')],
  menu: [{ title: 'A', url: 'https://x.fo/mest/a/', groups: [{ title: null, links: [{ title: 'B', url: 'https://x.fo/mest/b/' }] }] }],
} as unknown as SiteContent;

const t = (n: number) => `2026-11-05T10:0${n}:00.000Z`;

describe('reviews', () => {
  it('marks and unmarks a page', () => {
    let r: Reviews = setReviewed({}, 'a', true, 'hans', t(1));
    expect(isReviewed(r, 'a')).toBe(true);
    r = setReviewed(r, 'a', false, 'hans', t(2));
    expect(isReviewed(r, 'a')).toBe(false);
    expect(r.a.updatedAt).toBe(t(2));
  });
  it('merges newest entry per page', () => {
    const x: Reviews = { a: { reviewed: true, updatedAt: t(1), updatedBy: 'x' } };
    const y: Reviews = { a: { reviewed: false, updatedAt: t(2), updatedBy: 'y' }, b: { reviewed: true, updatedAt: t(1), updatedBy: 'y' } };
    expect(mergeReviews(x, y)).toEqual(y);
    expect(mergeReviews(y, x)).toEqual(y);
  });
  it('compares and parses', () => {
    const x: Reviews = { a: { reviewed: true, updatedAt: t(1), updatedBy: 'x' } };
    expect(reviewsEqual(x, { a: { ...x.a } })).toBe(true);
    expect(reviewsEqual(x, {})).toBe(false);
    expect(parseReviews(JSON.stringify(x))).toEqual(x);
    expect(parseReviews('nonsense')).toEqual({});
    expect(parseReviews('{"a":{"reviewed":"yes"}}')).toEqual({});
  });
});

describe('order and wizard', () => {
  it('orders pages like the menu, then others; news newest first', () => {
    expect(orderedPageIds(content, 'pages')).toEqual(['home', 'a', 'b', 'c']);
    expect(orderedPageIds(content, 'news')).toEqual(['n2', 'n1']);
  });
  it('counts reviewed and left', () => {
    const r = setReviewed({}, 'a', true, 'h', t(1));
    expect(reviewCounts(['home', 'a', 'b'], r)).toEqual({ total: 3, reviewed: 1, left: 2 });
  });
  it('keeps the current page in an unreviewed-only queue', () => {
    const r = setReviewed(setReviewed({}, 'a', true, 'h', t(1)), 'home', true, 'h', t(1));
    const ids = ['home', 'a', 'b', 'c'];
    expect(wizardQueue(ids, r, true, null)).toEqual(['b', 'c']);
    expect(wizardQueue(ids, r, true, 'a')).toEqual(['a', 'b', 'c']);
    expect(wizardQueue(ids, r, false, 'a')).toEqual(ids);
  });
  it('steps through the queue and stops at the ends', () => {
    const q = ['a', 'b', 'c'];
    expect(stepPage(q, 'a', 1)).toBe('b');
    expect(stepPage(q, 'a', -1)).toBeNull();
    expect(stepPage(q, 'c', 1)).toBeNull();
    expect(stepPage(q, 'zzz', 1)).toBe('a');
    expect(stepPage([], null, 1)).toBeNull();
  });
  it('finds the first unreviewed page', () => {
    const r = setReviewed({}, 'home', true, 'h', t(1));
    expect(firstUnreviewed(['home', 'a'], r)).toBe('a');
    expect(firstUnreviewed(['home'], r)).toBeNull();
  });
});

describe('overviewRows', () => {
  const edits: Edits = {
    'a/a-b': { fo: 'nýtt', updatedAt: t(1), updatedBy: 'h' },
    'b/b-b': { fo: 'nýtt', doneFo: true, updatedAt: t(1), updatedBy: 'h' },
  };
  const reviews = setReviewed({}, 'a', true, 'h', t(1));
  const opts = { tab: 'pages' as const, review: 'all' as const, changes: 'all' as const };

  it('lists pages with counts and menu location', () => {
    const rows = overviewRows(content, edits, reviews, opts);
    expect(rows.map((r) => r.pageId)).toEqual(['home', 'a', 'b', 'c']);
    const a = rows.find((r) => r.pageId === 'a')!;
    expect(a).toMatchObject({ title: 'a', where: 'A', reviewed: true, changed: 1, open: 1, total: 1 });
    expect(rows.find((r) => r.pageId === 'b')).toMatchObject({ changed: 1, open: 0, where: 'A' });
  });
  it('shows only pages with open changes', () => {
    expect(overviewRows(content, edits, reviews, { ...opts, changes: 'open' }).map((r) => r.pageId)).toEqual(['a']);
  });
  it('filters by review state', () => {
    expect(overviewRows(content, edits, reviews, { ...opts, review: 'reviewed' }).map((r) => r.pageId)).toEqual(['a']);
    expect(overviewRows(content, edits, reviews, { ...opts, review: 'unreviewed' }).map((r) => r.pageId)).toEqual(['home', 'b', 'c']);
  });
  it('uses dates for news', () => {
    const rows = overviewRows(content, {}, {}, { tab: 'news', review: 'all', changes: 'all' });
    expect(rows.map((r) => r.where)).toEqual(['01-02-2026', '01-01-2026']);
  });
});
