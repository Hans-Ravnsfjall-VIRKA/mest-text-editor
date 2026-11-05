// Pure logic for page review state, the wizard queue and the overview list.

import {
  pageProgress,
  type Edits,
  type NavTab,
  type PageDoc,
  type SiteContent,
} from './contentModel';
import { breadcrumbFor, buildNewsNav, buildPagesNav, cleanTitle, formatDate } from './navModel';

export interface PageReview {
  reviewed: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** Keyed by page id. Entries are never removed: "not reviewed" is a newer entry with reviewed false. */
export type Reviews = Record<string, PageReview>;

export type ReviewFilter = 'all' | 'unreviewed' | 'reviewed';
export type ChangesFilter = 'all' | 'open';

export function isReviewed(reviews: Reviews, pageId: string): boolean {
  return reviews[pageId]?.reviewed === true;
}

export function setReviewed(reviews: Reviews, pageId: string, reviewed: boolean, user: string, now: string): Reviews {
  return { ...reviews, [pageId]: { reviewed, updatedAt: now, updatedBy: user } };
}

/** Newest entry per page wins. */
export function mergeReviews(a: Reviews, b: Reviews): Reviews {
  const merged: Reviews = { ...a };
  for (const [id, entry] of Object.entries(b)) {
    const existing = merged[id];
    if (!existing || entry.updatedAt > existing.updatedAt) merged[id] = entry;
  }
  return merged;
}

export function reviewsEqual(a: Reviews, b: Reviews): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    return y !== undefined && x.reviewed === y.reviewed && x.updatedAt === y.updatedAt && x.updatedBy === y.updatedBy;
  });
}

export function parseReviews(text: string): Reviews {
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null) return {};
    const result: Reviews = {};
    for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const v = value as Partial<PageReview>;
      if (typeof v.reviewed !== 'boolean' || typeof v.updatedAt !== 'string') continue;
      result[id] = { reviewed: v.reviewed, updatedAt: v.updatedAt, updatedBy: v.updatedBy ?? 'unknown' };
    }
    return result;
  } catch {
    return {};
  }
}

export function matchesReview(reviewed: boolean, filter: ReviewFilter): boolean {
  return filter === 'all' || (filter === 'reviewed' ? reviewed : !reviewed);
}

/** Page ids in the order a visitor meets them: the menu first, then pages outside it; news newest first. */
export function orderedPageIds(content: SiteContent, tab: NavTab): string[] {
  const exists = new Set(content.pages.map((p) => p.id));
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (id: string): void => {
    if (exists.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  if (tab === 'news') {
    for (const item of buildNewsNav(content)) add(item.pageId);
    return out;
  }
  const nav = buildPagesNav(content);
  if (nav.home) add(nav.home.pageId);
  for (const section of nav.sections) {
    if (section.leaf) add(section.leaf.pageId);
    for (const group of section.groups) for (const item of group.items) add(item.pageId);
  }
  for (const other of nav.others) add(other.pageId);
  return out;
}

export interface ReviewCounts {
  total: number;
  reviewed: number;
  left: number;
}

export function reviewCounts(ids: string[], reviews: Reviews): ReviewCounts {
  const reviewed = ids.filter((id) => isReviewed(reviews, id)).length;
  return { total: ids.length, reviewed, left: ids.length - reviewed };
}

/** Pages the wizard walks through. The current page always stays in, so marking it reviewed does not pull it away. */
export function wizardQueue(ids: string[], reviews: Reviews, onlyUnreviewed: boolean, currentId: string | null): string[] {
  if (!onlyUnreviewed) return ids;
  return ids.filter((id) => id === currentId || !isReviewed(reviews, id));
}

/** The neighbour of the current page in the queue, or null at either end. */
export function stepPage(queue: string[], currentId: string | null, dir: 1 | -1): string | null {
  const i = currentId === null ? -1 : queue.indexOf(currentId);
  if (i === -1) return dir === 1 ? queue[0] ?? null : null;
  return queue[i + dir] ?? null;
}

export function firstUnreviewed(ids: string[], reviews: Reviews): string | null {
  return ids.find((id) => !isReviewed(reviews, id)) ?? null;
}

export interface OverviewRow {
  pageId: string;
  title: string;
  /** Menu location for pages, publishing date for news. */
  where: string;
  urlFo: string;
  urlEn: string;
  reviewed: boolean;
  changed: number;
  /** Changed texts still to be put into WordPress. */
  open: number;
  total: number;
}

export interface OverviewOptions {
  tab: NavTab;
  review: ReviewFilter;
  changes: ChangesFilter;
}

export function overviewRows(content: SiteContent, edits: Edits, reviews: Reviews, options: OverviewOptions): OverviewRow[] {
  const byId = new Map<string, PageDoc>(content.pages.map((p) => [p.id, p]));
  const nav = options.tab === 'pages' ? buildPagesNav(content) : null;
  const rows: OverviewRow[] = [];
  for (const id of orderedPageIds(content, options.tab)) {
    const page = byId.get(id);
    if (!page) continue;
    const progress = pageProgress(page, edits);
    const reviewed = isReviewed(reviews, id);
    if (!matchesReview(reviewed, options.review)) continue;
    if (options.changes === 'open' && progress.toReplace === 0) continue;
    rows.push({
      pageId: id,
      title: cleanTitle(page.title),
      where: nav ? breadcrumbFor(nav, id).join(' / ') : formatDate(page.date),
      urlFo: page.urlFo,
      urlEn: page.urlEn,
      reviewed,
      changed: progress.changed,
      open: progress.toReplace,
      total: progress.total,
    });
  }
  return rows;
}
