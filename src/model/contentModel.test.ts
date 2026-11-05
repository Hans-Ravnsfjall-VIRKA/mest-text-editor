import { describe, expect, it } from 'vitest';
import {
  applyEdit,
  editorBlocks,
  editorPages,
  currentText,
  editKey,
  filterBlocks,
  isChanged,
  listPages,
  matchCounts,
  needsReplace,
  pageProgress,
  siteProgress,
  tagLabel,
  type Edits,
  type PageDoc,
  type SiteContent,
} from './contentModel';

const page: PageDoc = {
  id: 'samband',
  type: 'page',
  title: 'Samband',
  urlFo: 'https://x.fo/samband/',
  urlEn: 'https://x.fo/en/samband/',
  inMenu: true,
  blocks: [
    { id: 'a', kind: 'text', tag: 'h1', fo: 'Samband', en: 'Contact' },
    { id: 'b', kind: 'text', tag: 'p', fo: 'Ring til okkara', en: 'Call us' },
    { id: 'c', kind: 'text', tag: 'p', fo: 'sales@mest.fo', en: 'sales@mest.fo' },
    { id: 'alt', kind: 'attr', tag: 'img', fo: 'Skip', en: 'Skip' },
  ],
};
const post: PageDoc = { ...page, id: 'tidindi-1', type: 'post', title: 'Ábending', inMenu: false, date: '2026-07-01T00:00:00' };
const staff: PageDoc = { ...page, id: 'kristian', type: 'wpm_team', title: 'Kristian' };
const global: PageDoc = { ...page, id: '_global', type: 'global', title: 'Header', blocks: [page.blocks[0]] };
const content: SiteContent = { site: 'https://x.fo', scrapedAt: '', menu: [], pages: [post, page, global, staff] };

const T1 = '2026-11-05T10:00:00.000Z';
const T2 = '2026-11-05T11:00:00.000Z';
const key = editKey('samband', 'b');
const edit = (patch: Parameters<typeof applyEdit>[3], edits: Edits = {}, now = T1): Edits =>
  applyEdit(edits, page.blocks[1], key, patch, 'hans', now);

describe('applyEdit', () => {
  it('stores changed text with author and time', () => {
    const edits = edit({ fo: 'Ring til okkum' });
    expect(edits[key]).toEqual({ fo: 'Ring til okkum', updatedAt: T1, updatedBy: 'hans' });
    expect(currentText(page.blocks[1], edits[key], 'fo')).toBe('Ring til okkum');
    expect(currentText(page.blocks[1], edits[key], 'en')).toBe('Call us');
    expect(isChanged(page.blocks[1], edits[key])).toBe(true);
    expect(isChanged(page.blocks[1], edits[key], 'en')).toBe(false);
  });

  it('clears a field typed back to the original but keeps the entry as tombstone', () => {
    const edits = edit({ fo: 'Ring til okkara' }, edit({ fo: 'X' }), T2);
    expect(edits[key]).toEqual({ updatedAt: T2, updatedBy: 'hans' });
    expect(isChanged(page.blocks[1], edits[key])).toBe(false);
  });

  it('does not mutate the previous state', () => {
    const before = edit({ fo: 'X' });
    const copy = JSON.stringify(before);
    edit({ en: 'Y' }, before, T2);
    expect(JSON.stringify(before)).toBe(copy);
  });

  it('tracks approval and replaced flags, and resets replaced when text changes again', () => {
    let edits = edit({ fo: 'X', approved: true });
    expect(needsReplace(page.blocks[1], edits[key])).toBe(true);
    edits = edit({ doneFo: true }, edits);
    expect(needsReplace(page.blocks[1], edits[key])).toBe(false);
    edits = edit({ fo: 'Y' }, edits);
    expect(edits[key].doneFo).toBeUndefined();
    expect(edits[key].approved).toBe(true);
    edits = edit({ approved: false }, edits);
    expect(edits[key].approved).toBeUndefined();
  });
});

describe('filtering and progress', () => {
  const edits = edit({ fo: 'Ring til okkum', approved: true });

  it('filters by state', () => {
    expect(filterBlocks(page, edits, 'all', '')).toHaveLength(3);
    expect(filterBlocks(page, edits, 'changed', '').map((b) => b.id)).toEqual(['b']);
    expect(filterBlocks(page, edits, 'approved', '').map((b) => b.id)).toEqual(['b']);
    expect(filterBlocks(page, edits, 'toReplace', '').map((b) => b.id)).toEqual(['b']);
    expect(filterBlocks(page, edits, 'sameBoth', '').map((b) => b.id)).toEqual(['c']);
  });

  it('searches through formatting', () => {
    const marked = { ...page, blocks: [{ id: 'm', kind: 'text' as const, tag: 'p', fo: '<strong>Opið</strong> hvønn dag', en: 'Open' }] };
    expect(filterBlocks(marked, {}, 'all', 'opið hvønn')).toHaveLength(1);
  });

  it('searches original and edited text in both languages', () => {
    expect(filterBlocks(page, edits, 'all', 'okkum').map((b) => b.id)).toEqual(['b']);
    expect(filterBlocks(page, edits, 'all', 'OKKARA').map((b) => b.id)).toEqual(['b']);
    expect(filterBlocks(page, edits, 'all', 'call').map((b) => b.id)).toEqual(['b']);
    expect(filterBlocks(page, edits, 'all', 'finst ikki')).toHaveLength(0);
  });

  it('counts progress', () => {
    expect(pageProgress(page, edits)).toEqual({ total: 3, changed: 1, approved: 1, toReplace: 1 });
    expect(siteProgress(content, edits).changed).toBe(1);
  });

  it('hides image alt texts', () => {
    expect(editorBlocks(page).map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(filterBlocks(page, edits, 'all', 'skip')).toHaveLength(0);
    expect(filterBlocks(page, edits, 'sameBoth', '').map((b) => b.id)).toEqual(['c']);
  });

  it('only edits pages and news', () => {
    expect(editorPages(content).map((p) => p.id)).toEqual(['tidindi-1', 'samband']);
    expect(siteProgress(content, edits).total).toBe(6);
  });

  it('lists pages and news in separate tabs, only those with matches when filtering', () => {
    expect(listPages(content, edits, 'pages', 'changed', '').map((i) => i.page.id)).toEqual(['samband']);
    expect(listPages(content, edits, 'pages', 'all', 'okkum').map((i) => i.matches)).toEqual([1]);
    expect(listPages(content, edits, 'news', 'all', '').map((i) => i.page.id)).toEqual(['tidindi-1']);
    expect(listPages(content, edits, 'news', 'changed', '')).toEqual([]);
    expect(matchCounts(content, edits, 'changed', '').get('samband')).toBe(1);
  });

  it('labels blocks', () => {
    expect(tagLabel(page.blocks[0])).toBe('H1');
    expect(tagLabel({ ...page.blocks[0], kind: 'meta', tag: 'title' })).toBe('SEO title');
    expect(tagLabel({ ...page.blocks[0], kind: 'attr', tag: 'img' })).toBe('Image alt');
  });
});
