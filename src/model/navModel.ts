// Pure logic for site-like navigation: the menu tree, the news list and breadcrumbs.

import type { MenuItem, PageDoc, SiteContent } from '../scrape/extractModel';
import { normalizeUrl } from '../scrape/extractModel';

export interface NavLeaf {
  pageId: string;
  title: string;
}

export interface NavGroup {
  title: string | null;
  items: NavLeaf[];
}

export interface NavSection {
  id: string;
  title: string;
  /** The section's own page when the menu item is a link itself. */
  leaf: NavLeaf | null;
  groups: NavGroup[];
}

export interface PagesNav {
  home: NavLeaf | null;
  sections: NavSection[];
  /** Pages that exist but are not in the menu. */
  others: NavLeaf[];
}

export interface NewsItem {
  pageId: string;
  title: string;
  /** dd-mm-yyyy as on the site, or empty when unknown. */
  date: string;
}

const SITE_SUFFIX = /\s+[-–]\s+MEST Shipyard\s*$/;

export function cleanTitle(title: string): string {
  return title.replace(SITE_SUFFIX, '').trim() || title;
}

/** "2026-07-01T09:55:55" gives "01-07-2026" without any time zone conversion. */
export function formatDate(iso: string | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function pagesByUrl(content: SiteContent): Map<string, PageDoc> {
  const map = new Map<string, PageDoc>();
  for (const page of content.pages) {
    if (page.type === 'page') map.set(normalizeUrl(page.urlFo), page);
  }
  return map;
}

function leafFor(byUrl: Map<string, PageDoc>, url: string, title: string): NavLeaf | null {
  const page = byUrl.get(normalizeUrl(url));
  return page ? { pageId: page.id, title } : null;
}

function sectionOf(byUrl: Map<string, PageDoc>, item: MenuItem): NavSection | null {
  const groups: NavGroup[] = [];
  for (const group of item.groups) {
    const items = group.links.map((l) => leafFor(byUrl, l.url, l.title)).filter((l): l is NavLeaf => l !== null);
    if (items.length > 0) groups.push({ title: group.title, items });
  }
  const leaf = item.url ? leafFor(byUrl, item.url, item.title) : null;
  if (leaf) {
    // An item that is a link itself is not listed again inside its own dropdown.
    for (const group of groups) group.items = group.items.filter((i) => i.pageId !== leaf.pageId);
    groups.splice(0, groups.length, ...groups.filter((g) => g.items.length > 0));
  }
  if (!leaf && groups.length === 0) return null;
  return { id: item.title, title: item.title, leaf, groups };
}

export function buildPagesNav(content: SiteContent): PagesNav {
  const byUrl = pagesByUrl(content);
  const sections = (content.menu ?? []).map((item) => sectionOf(byUrl, item)).filter((s): s is NavSection => s !== null);

  const used = new Set<string>();
  for (const section of sections) {
    if (section.leaf) used.add(section.leaf.pageId);
    for (const group of section.groups) for (const item of group.items) used.add(item.pageId);
  }

  const homePage = content.pages.find((p) => p.id === 'home' && p.type === 'page');
  const others = content.pages
    .filter((p) => p.type === 'page' && p.id !== 'home' && !used.has(p.id))
    .map((p) => ({ pageId: p.id, title: cleanTitle(p.title) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'fo'));

  return { home: homePage ? { pageId: homePage.id, title: 'Home' } : null, sections, others };
}

export function buildNewsNav(content: SiteContent): NewsItem[] {
  return content.pages
    .filter((p) => p.type === 'post')
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title, 'fo'))
    .map((p) => ({ pageId: p.id, title: cleanTitle(p.title), date: formatDate(p.date) }));
}

/** Where a page sits in the menu, e.g. ["Sjóvinna", "Veitingar"]. */
export function breadcrumbFor(nav: PagesNav, pageId: string): string[] {
  if (nav.home?.pageId === pageId) return ['Home'];
  for (const section of nav.sections) {
    if (section.leaf?.pageId === pageId) return [section.title];
    for (const group of section.groups) {
      if (group.items.some((i) => i.pageId === pageId)) {
        return group.title ? [section.title, group.title] : [section.title];
      }
    }
  }
  return nav.others.some((o) => o.pageId === pageId) ? ['Other pages'] : [];
}

/** Id of the menu section holding a page, so it can be opened in the sidebar. */
export function sectionIdFor(nav: PagesNav, pageId: string): string | null {
  for (const section of nav.sections) {
    if (section.leaf?.pageId === pageId) return section.id;
    if (section.groups.some((g) => g.items.some((i) => i.pageId === pageId))) return section.id;
  }
  return null;
}
