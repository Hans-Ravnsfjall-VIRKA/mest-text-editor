// Pure logic for remembering where a reviewer was, per signed-in user.

import type { NavTab } from './contentModel';
import type { ChangesFilter, ReviewFilter } from './reviewModel';

export type View = 'edit' | 'wizard' | 'overview' | 'log';

export interface Position {
  view: View;
  tab: NavTab;
  pageId: string | null;
  reviewFilter: ReviewFilter;
  changesFilter: ChangesFilter;
  onlyUnreviewed: boolean;
}

export const DEFAULT_POSITION: Position = {
  view: 'wizard',
  tab: 'pages',
  pageId: null,
  reviewFilter: 'all',
  changesFilter: 'all',
  onlyUnreviewed: true,
};

export function positionKey(email: string): string {
  return `mest-text-editor:position:${email.trim().toLowerCase()}`;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Reads a saved position; anything unknown or broken falls back to the defaults. */
export function parsePosition(text: string | null): Position | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as Partial<Record<keyof Position, unknown>>;
    if (typeof data !== 'object' || data === null) return null;
    return {
      view: pick(data.view, ['edit', 'wizard', 'overview', 'log'], DEFAULT_POSITION.view),
      tab: pick(data.tab, ['pages', 'news'], DEFAULT_POSITION.tab),
      pageId: typeof data.pageId === 'string' ? data.pageId : null,
      reviewFilter: pick(data.reviewFilter, ['all', 'unreviewed', 'reviewed'], DEFAULT_POSITION.reviewFilter),
      changesFilter: pick(data.changesFilter, ['all', 'open'], DEFAULT_POSITION.changesFilter),
      onlyUnreviewed: typeof data.onlyUnreviewed === 'boolean' ? data.onlyUnreviewed : DEFAULT_POSITION.onlyUnreviewed,
    };
  } catch {
    return null;
  }
}
