import { describe, expect, it } from 'vitest';
import type { Block } from './contentModel';
import {
  afterSend,
  describeEntry,
  entriesForPatch,
  filterLog,
  mergeLog,
  parseQueue,
  queueEntry,
  readyToSend,
  reviewEntry,
  rowsToLog,
  logToRows,
  shorten,
  type LogEntry,
} from './logModel';

const block: Block = { id: 'b1', kind: 'text', tag: 'p', fo: 'upprunaligt', en: 'original' };
let n = 0;
const who = { by: 'Hans', byEmail: 'h@x.fo', now: '2026-11-05T10:00:00.000Z', newId: () => `id${++n}` };
const t = (s: number) => `2026-11-05T10:00:${String(s).padStart(2, '0')}.000Z`;

describe('entriesForPatch', () => {
  it('logs a text change with before and after', () => {
    const [e] = entriesForPatch({ ...who, block, pageId: 'p', pageTitle: 'Page', patch: { fo: 'nýtt' }, before: undefined });
    expect(e).toMatchObject({ kind: 'text', lang: 'fo', from: 'upprunaligt', to: 'nýtt', pageId: 'p', blockId: 'b1', by: 'Hans', byEmail: 'h@x.fo' });
  });
  it('uses the edited text as "from" and marks a return to the original as revert', () => {
    const [e] = entriesForPatch({ ...who, block, pageId: 'p', pageTitle: 'P', patch: { en: 'original' }, before: { en: 'changed', updatedAt: t(0), updatedBy: 'x' } });
    expect(e).toMatchObject({ kind: 'revert', from: 'changed', to: 'original' });
  });
  it('logs nothing when nothing changes', () => {
    expect(entriesForPatch({ ...who, block, pageId: 'p', pageTitle: 'P', patch: { fo: 'upprunaligt', approved: false }, before: undefined })).toEqual([]);
  });
  it('logs flags only when they flip', () => {
    const before = { approved: true, doneFo: false, updatedAt: t(0), updatedBy: 'x' };
    const out = entriesForPatch({ ...who, block, pageId: 'p', pageTitle: 'P', patch: { approved: true, doneFo: true, doneEn: false }, before });
    expect(out.map((e) => [e.kind, e.lang, e.to])).toEqual([['inWordPress', 'fo', '1']]);
  });
});

describe('reviewEntry', () => {
  it('logs a flip and skips a no-op', () => {
    expect(reviewEntry({ ...who, pageId: 'p', pageTitle: 'P', was: false, next: true })).toMatchObject({ kind: 'reviewed', to: '1', from: '0', blockId: '' });
    expect(reviewEntry({ ...who, pageId: 'p', pageTitle: 'P', was: true, next: true })).toBeNull();
  });
});

describe('queueEntry', () => {
  const mk = (to: string, at: string, id = 'a'): LogEntry => ({ id, at, by: 'Hans', byEmail: 'h', pageId: 'p', pageTitle: 'P', blockId: 'b1', kind: 'text', lang: 'fo', from: 'x', to });
  it('merges typing into one entry that keeps the first "from"', () => {
    const q = queueEntry(queueEntry([], mk('xa', t(1), 'a')), mk('xab', t(2), 'b'));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: 'a', from: 'x', to: 'xab', at: t(2) });
  });
  it('drops an entry that ends where it began', () => {
    const q = queueEntry(queueEntry([], mk('xa', t(1), 'a')), mk('x', t(2), 'b'));
    expect(q).toEqual([]);
  });
  it('keeps different people and languages apart', () => {
    const q = queueEntry([mk('xa', t(1))], { ...mk('xb', t(2), 'b'), by: 'Bárður' });
    expect(q).toHaveLength(2);
    expect(queueEntry([mk('xa', t(1))], { ...mk('xb', t(2), 'b'), lang: 'en' })).toHaveLength(2);
  });
});

describe('sending', () => {
  const e = (id: string, at: string): LogEntry => ({ id, at, by: 'H', byEmail: '', pageId: 'p', pageTitle: '', blockId: 'b', kind: 'text', lang: 'fo', from: 'a', to: 'b' });
  it('only sends entries that have been quiet', () => {
    const q = [e('old', t(0)), e('new', t(9))];
    expect(readyToSend(q, Date.parse(t(10))).map((x) => x.id)).toEqual(['old']);
  });
  it('keeps entries that changed while sending', () => {
    const q = [e('a', t(1)), { ...e('b', t(8)), to: 'more' }];
    expect(afterSend(q, [e('a', t(1)), e('b', t(2))]).map((x) => x.id)).toEqual(['b']);
  });
});

describe('listing', () => {
  const mk = (id: string, at: string, by = 'H'): LogEntry => ({ id, at, by, byEmail: '', pageId: 'p', pageTitle: 'Nýbygging', blockId: 'b', kind: 'text', lang: 'fo', from: '<strong>gamalt</strong>', to: 'nýtt' });
  it('merges, dedupes and sorts newest first', () => {
    const merged = mergeLog([mk('a', t(1)), mk('b', t(3))], [{ ...mk('a', t(5)), to: 'later' }, mk('c', t(2))]);
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(merged[0].to).toBe('later');
  });
  it('filters by person, kind and text', () => {
    const list = [mk('a', t(1), 'Hans'), { ...mk('b', t(2), 'Bárður'), kind: 'approved' as const }];
    expect(filterLog(list, { by: 'Hans', kind: 'all', query: '' }).map((x) => x.id)).toEqual(['a']);
    expect(filterLog(list, { by: 'all', kind: 'approved', query: '' }).map((x) => x.id)).toEqual(['b']);
    expect(filterLog(list, { by: 'all', kind: 'all', query: 'gamalt' }).map((x) => x.id)).toEqual(['a', 'b']);
    expect(filterLog(list, { by: 'all', kind: 'all', query: 'ekki til' })).toEqual([]);
  });
  it('round-trips rows and rejects broken ones', () => {
    const list = [mk('a', t(1))];
    expect(rowsToLog(logToRows(list))).toEqual(list);
    expect(rowsToLog([null, { id: 1 }, { id: 'x', at: t(1), page_id: 'p', kind: 'nope' }])).toEqual([]);
  });
  it('parses a stored queue defensively', () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue('{{')).toEqual([]);
    expect(parseQueue('{}')).toEqual([]);
    expect(parseQueue(JSON.stringify([mk('a', t(1)), { id: 5 }]))).toHaveLength(1);
  });
  it('describes and shortens', () => {
    expect(describeEntry(mk('a', t(1)))).toBe('Changed the Faroese text');
    expect(describeEntry({ ...mk('a', t(1)), kind: 'reviewed', lang: null, to: '0' })).toBe('Marked the page as not reviewed');
    expect(shorten('<strong>ab</strong> cd', 4)).toBe('ab …');
  });
});
