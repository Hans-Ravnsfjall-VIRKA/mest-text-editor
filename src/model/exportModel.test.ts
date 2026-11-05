import { describe, expect, it } from 'vitest';
import { buildDictionary, changeRows, csvCell, toCsv } from './exportModel';
import type { Edits, PageDoc, SiteContent } from './contentModel';

const mk = (id: string): PageDoc => ({
  id,
  type: 'page',
  title: id.toUpperCase(),
  urlFo: `https://x.fo/${id}/`,
  urlEn: `https://x.fo/en/${id}/`,
  inMenu: true,
  blocks: [
    { id: 'more', kind: 'text', tag: 'span', fo: 'Les meira', en: 'Read more' },
    { id: 'p', kind: 'text', tag: 'p', fo: 'Gamal tekstur', en: 'Old text' },
  ],
});
const content: SiteContent = { site: 'https://x.fo', scrapedAt: '', pages: [mk('a'), mk('b')] };
const stamp = { updatedAt: '2026-11-05T10:00:00.000Z', updatedBy: 'hans' };

describe('changeRows', () => {
  const edits: Edits = {
    'a/p': { fo: 'Nýggjur tekstur', approved: true, ...stamp },
    'b/p': { en: 'New "text"; here', ...stamp },
    'b/more': { ...stamp },
  };

  it('lists only changed blocks with old and new text', () => {
    const rows = changeRows(content, edits);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ pageId: 'a', foOld: 'Gamal tekstur', foNew: 'Nýggjur tekstur', enNew: 'Old text', foChanged: true, enChanged: false });
    expect(changeRows(content, edits, { onlyApproved: true })).toHaveLength(1);
  });

  it('writes CSV with quoting', () => {
    const csv = toCsv(changeRows(content, edits));
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('page;url_fo;url_en;type;fo_old;fo_new')).toBe(true);
    expect(lines[2]).toContain('"New ""text""; here"');
    expect(csvCell('a,b', ',')).toBe('"a,b"');
    expect(csvCell('a,b', ';')).toBe('a,b');
  });
});

describe('buildDictionary', () => {
  it('gives one entry per Faroese string and remembers the previous original', () => {
    const edits: Edits = {
      'a/p': { fo: 'Nýggjur tekstur', en: 'New text', ...stamp },
      'b/p': { fo: 'Nýggjur tekstur', en: 'New text', ...stamp },
    };
    const dict = buildDictionary(content, edits);
    expect(dict.conflicts).toEqual([]);
    expect(dict.entries).toEqual([
      { original: 'Nýggjur tekstur', translated: 'New text', previousOriginal: 'Gamal tekstur', pages: ['a', 'b'] },
    ]);
  });

  it('reports one Faroese string with two different English texts', () => {
    const edits: Edits = {
      'a/more': { en: 'Learn more', ...stamp },
      'b/more': { en: 'See more', ...stamp },
    };
    const dict = buildDictionary(content, edits);
    expect(dict.entries).toEqual([]);
    expect(dict.conflicts).toHaveLength(1);
    expect(dict.conflicts[0].original).toBe('Les meira');
    expect(dict.conflicts[0].translations.map((t) => t.translated)).toEqual(['Learn more', 'See more']);
  });
});
