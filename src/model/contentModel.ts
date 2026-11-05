// Pure logic for content, edits, filtering and progress. No DOM, no network.

import type { Block, PageDoc, SiteContent } from '../scrape/extractModel';

export type { Block, PageDoc, SiteContent };

export type Lang = 'fo' | 'en';

export interface BlockEdit {
  fo?: string;
  en?: string;
  approved?: boolean;
  /** New text has been put into WordPress. */
  doneFo?: boolean;
  doneEn?: boolean;
  updatedAt: string;
  updatedBy: string;
}

export type Edits = Record<string, BlockEdit>;

export type BlockFilter = 'all' | 'changed' | 'approved' | 'toReplace' | 'sameBoth';
export type PageGroup = 'all' | 'menu' | 'page' | 'post' | 'other';

export interface EditPatch {
  fo?: string;
  en?: string;
  approved?: boolean;
  doneFo?: boolean;
  doneEn?: boolean;
}

export function editKey(pageId: string, blockId: string): string {
  return `${pageId}/${blockId}`;
}

export function currentText(block: Block, edit: BlockEdit | undefined, lang: Lang): string {
  const value = edit?.[lang];
  return value === undefined ? block[lang] : value;
}

export function isChanged(block: Block, edit: BlockEdit | undefined, lang?: Lang): boolean {
  if (!edit) return false;
  const changed = (l: Lang): boolean => edit[l] !== undefined && edit[l] !== block[l];
  return lang ? changed(lang) : changed('fo') || changed('en');
}

/** A changed block still waiting to be put into WordPress in at least one language. */
export function needsReplace(block: Block, edit: BlockEdit | undefined): boolean {
  if (!edit) return false;
  return (isChanged(block, edit, 'fo') && !edit.doneFo) || (isChanged(block, edit, 'en') && !edit.doneEn);
}

/** Stored text uses <br> and HTML entities; the editor shows line breaks and plain ampersands. */
export function htmlToEditable(html: string): string {
  return html.replace(/<br>/g, '\n').replace(/&amp;/g, '&');
}

export function editableToHtml(text: string): string {
  return text
    .replace(/&(?!(?:lt|gt|quot|amp);)/g, '&amp;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');
}

/** Apply a patch to one block's edit. Text equal to the original clears that field. */
export function applyEdit(
  edits: Edits,
  block: Block,
  key: string,
  patch: EditPatch,
  user: string,
  now: string,
): Edits {
  const next: BlockEdit = { ...(edits[key] ?? { updatedAt: now, updatedBy: user }), updatedAt: now, updatedBy: user };
  for (const lang of ['fo', 'en'] as const) {
    const value = patch[lang];
    if (value === undefined) continue;
    if (value === block[lang]) {
      delete next[lang];
      delete next[lang === 'fo' ? 'doneFo' : 'doneEn'];
    } else {
      next[lang] = value;
      // New text invalidates an earlier "replaced in WordPress" tick.
      delete next[lang === 'fo' ? 'doneFo' : 'doneEn'];
    }
  }
  for (const flag of ['approved', 'doneFo', 'doneEn'] as const) {
    const value = patch[flag];
    if (value === undefined) continue;
    if (value) next[flag] = true;
    else delete next[flag];
  }
  // Entries are never removed: an empty entry acts as a tombstone so a revert survives syncing.
  return { ...edits, [key]: next };
}

function plain(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').toLowerCase();
}

export function matchesQuery(block: Block, edit: BlockEdit | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    plain(block.fo).includes(q) ||
    plain(block.en).includes(q) ||
    plain(currentText(block, edit, 'fo')).includes(q) ||
    plain(currentText(block, edit, 'en')).includes(q)
  );
}

export function matchesFilter(block: Block, edit: BlockEdit | undefined, filter: BlockFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'changed':
      return isChanged(block, edit);
    case 'approved':
      return edit?.approved === true;
    case 'toReplace':
      return needsReplace(block, edit);
    case 'sameBoth':
      return currentText(block, edit, 'fo') === currentText(block, edit, 'en');
  }
}

export function filterBlocks(page: PageDoc, edits: Edits, filter: BlockFilter, query: string): Block[] {
  return page.blocks.filter((block) => {
    const edit = edits[editKey(page.id, block.id)];
    return matchesFilter(block, edit, filter) && matchesQuery(block, edit, query);
  });
}

export interface Progress {
  total: number;
  changed: number;
  approved: number;
  toReplace: number;
}

export function pageProgress(page: PageDoc, edits: Edits): Progress {
  const progress: Progress = { total: page.blocks.length, changed: 0, approved: 0, toReplace: 0 };
  for (const block of page.blocks) {
    const edit = edits[editKey(page.id, block.id)];
    if (isChanged(block, edit)) progress.changed++;
    if (edit?.approved) progress.approved++;
    if (needsReplace(block, edit)) progress.toReplace++;
  }
  return progress;
}

export function siteProgress(content: SiteContent, edits: Edits): Progress {
  return content.pages.reduce<Progress>(
    (sum, page) => {
      const p = pageProgress(page, edits);
      return {
        total: sum.total + p.total,
        changed: sum.changed + p.changed,
        approved: sum.approved + p.approved,
        toReplace: sum.toReplace + p.toReplace,
      };
    },
    { total: 0, changed: 0, approved: 0, toReplace: 0 },
  );
}

export function pageInGroup(page: PageDoc, group: PageGroup): boolean {
  if (page.type === 'global') return true;
  switch (group) {
    case 'all':
      return true;
    case 'menu':
      return page.inMenu;
    case 'page':
      return page.type === 'page';
    case 'post':
      return page.type === 'post';
    case 'other':
      return page.type !== 'page' && page.type !== 'post';
  }
}

export interface PageListItem {
  page: PageDoc;
  matches: number;
  progress: Progress;
}

/** Pages for the sidebar: global texts first, then menu pages, then the rest, each sorted by title. */
export function listPages(
  content: SiteContent,
  edits: Edits,
  group: PageGroup,
  filter: BlockFilter,
  query: string,
): PageListItem[] {
  const narrowed = filter !== 'all' || query.trim() !== '';
  const rank = (p: PageDoc): number => (p.type === 'global' ? 0 : p.inMenu ? 1 : 2);
  return content.pages
    .filter((page) => pageInGroup(page, group))
    .map((page) => ({
      page,
      matches: filterBlocks(page, edits, filter, query).length,
      progress: pageProgress(page, edits),
    }))
    .filter((item) => !narrowed || item.matches > 0)
    .sort((a, b) => rank(a.page) - rank(b.page) || a.page.title.localeCompare(b.page.title, 'fo'));
}

export function tagLabel(block: Block): string {
  if (block.kind === 'meta') return block.tag === 'title' ? 'SEO title' : 'SEO description';
  if (block.kind === 'attr') return block.tag === 'img' ? 'Image alt' : 'Form field';
  const labels: Record<string, string> = {
    h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6',
    p: 'Text', li: 'List item', a: 'Link', button: 'Button', span: 'Label', div: 'Text',
    td: 'Table cell', th: 'Table head', label: 'Label', figcaption: 'Caption',
  };
  return labels[block.tag] ?? block.tag;
}
