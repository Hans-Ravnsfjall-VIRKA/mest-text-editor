import { describe, expect, it } from 'vitest';
import { breadcrumbFor, buildNewsNav, buildPagesNav, cleanTitle, formatDate, sectionIdFor } from './navModel';
import type { SiteContent } from '../scrape/extractModel';

const mk = (id: string, type: string, title: string, extra: object = {}) => ({
  id,
  type,
  title,
  urlFo: `https://x.fo/mest/${id === 'home' ? '' : `${id}/`}`,
  urlEn: '',
  inMenu: false,
  blocks: [],
  ...extra,
});

const content: SiteContent = {
  site: 'https://x.fo/mest',
  scrapedAt: '',
  menu: [
    {
      title: 'Sjóvinna',
      url: null,
      groups: [
        { title: 'Verkætlanir', links: [{ title: 'Nýbygging', url: 'https://x.fo/mest/nybygging/' }, { title: 'Burtur', url: 'https://x.fo/mest/finst-ikki/' }] },
        { title: null, links: [{ title: 'Video', url: 'https://x.fo/mest/video' }] },
      ],
    },
    { title: 'Treytir', url: 'https://x.fo/mest/treytir/', groups: [{ title: null, links: [{ title: 'Treytir', url: 'https://x.fo/mest/treytir/' }] }] },
    { title: 'Tómt', url: null, groups: [{ title: 'Einki', links: [{ title: 'Burtur', url: 'https://x.fo/mest/finst-ikki/' }] }] },
  ],
  pages: [
    mk('_global', 'global', 'Header'),
    mk('home', 'page', 'Vit eru MEST'),
    mk('nybygging', 'page', 'Nýbygging'),
    mk('video', 'page', 'Video'),
    mk('treytir', 'page', 'Treytir'),
    mk('avrik', 'page', 'Avrik - MEST Shipyard'),
    mk('aeldri', 'post', 'Gamalt', { date: '2025-12-10T09:00:00' }),
    mk('nyggjari', 'post', 'Nýtt', { date: '2026-07-01T09:55:55' }),
    mk('uttan-dato', 'post', 'Uttan dato'),
    mk('kristian', 'wpm_team', 'Kristian'),
  ],
};

describe('buildPagesNav', () => {
  const nav = buildPagesNav(content);

  it('follows the menu with its groups and drops links without a page', () => {
    expect(nav.sections.map((s) => s.title)).toEqual(['Sjóvinna', 'Treytir']);
    expect(nav.sections[0].groups).toEqual([
      { title: 'Verkætlanir', items: [{ pageId: 'nybygging', title: 'Nýbygging' }] },
      { title: null, items: [{ pageId: 'video', title: 'Video' }] },
    ]);
    expect(nav.sections[1].leaf).toEqual({ pageId: 'treytir', title: 'Treytir' });
    expect(nav.sections[1].groups).toEqual([]);
  });

  it('puts the front page first and lists the rest alphabetically as other pages', () => {
    expect(nav.home).toEqual({ pageId: 'home', title: 'Home' });
    expect(nav.others).toEqual([{ pageId: 'avrik', title: 'Avrik' }]);
  });

  it('finds where a page is', () => {
    expect(breadcrumbFor(nav, 'nybygging')).toEqual(['Sjóvinna', 'Verkætlanir']);
    expect(breadcrumbFor(nav, 'video')).toEqual(['Sjóvinna']);
    expect(breadcrumbFor(nav, 'treytir')).toEqual(['Treytir']);
    expect(breadcrumbFor(nav, 'home')).toEqual(['Home']);
    expect(breadcrumbFor(nav, 'avrik')).toEqual(['Other pages']);
    expect(breadcrumbFor(nav, 'nonexistent')).toEqual([]);
    expect(sectionIdFor(nav, 'video')).toBe('Sjóvinna');
    expect(sectionIdFor(nav, 'avrik')).toBeNull();
  });

  it('copes with a site without menu data', () => {
    const bare = buildPagesNav({ ...content, menu: [] });
    expect(bare.sections).toEqual([]);
    expect(bare.others.map((o) => o.pageId)).toEqual(['avrik', 'nybygging', 'treytir', 'video']);
  });
});

describe('buildNewsNav', () => {
  it('lists posts newest first with the site date format, undated last', () => {
    expect(buildNewsNav(content)).toEqual([
      { pageId: 'nyggjari', title: 'Nýtt', date: '01-07-2026' },
      { pageId: 'aeldri', title: 'Gamalt', date: '10-12-2025' },
      { pageId: 'uttan-dato', title: 'Uttan dato', date: '' },
    ]);
  });
});

describe('helpers', () => {
  it('formats dates and cleans titles', () => {
    expect(formatDate('2026-07-01T09:55:55')).toBe('01-07-2026');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('junk')).toBe('');
    expect(cleanTitle('Tænastur - MEST Shipyard')).toBe('Tænastur');
    expect(cleanTitle('MEST Shipyard')).toBe('MEST Shipyard');
  });
});
