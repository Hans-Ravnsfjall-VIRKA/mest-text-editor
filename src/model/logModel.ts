// Pure logic for the change log: what gets logged, how rapid typing is merged, how entries are listed.

import { currentText, type Block, type BlockEdit, type EditPatch, type Lang } from './contentModel';
import { richToPlain } from './richTextModel';

export type LogKind = 'text' | 'revert' | 'approved' | 'inWordPress' | 'reviewed';

export interface LogEntry {
  id: string;
  /** ISO time of the last touch. */
  at: string;
  /** Name from Settings, or the account email when no name is set. */
  by: string;
  byEmail: string;
  pageId: string;
  pageTitle: string;
  /** Empty for page-level entries (reviewed). */
  blockId: string;
  kind: LogKind;
  lang: Lang | null;
  /** Stored text for text entries; "1" or "0" for flags. */
  from: string;
  to: string;
}

export interface LogRow {
  id: string;
  at: string;
  by: string;
  by_email: string;
  page_id: string;
  page_title: string;
  block_id: string;
  kind: LogKind;
  lang: Lang | null;
  from_text: string;
  to_text: string;
}

export const QUIET_MS = 5000;
export const QUEUE_CAP = 5000;

const KINDS: LogKind[] = ['text', 'revert', 'approved', 'inWordPress', 'reviewed'];

interface Who {
  by: string;
  byEmail: string;
  now: string;
  newId: () => string;
}

export interface PatchInput extends Who {
  block: Block;
  pageId: string;
  pageTitle: string;
  patch: EditPatch;
  before: BlockEdit | undefined;
}

export function entriesForPatch(input: PatchInput): LogEntry[] {
  const { block, pageId, pageTitle, patch, before } = input;
  const base = { at: input.now, by: input.by, byEmail: input.byEmail, pageId, pageTitle, blockId: block.id };
  const out: LogEntry[] = [];
  for (const lang of ['fo', 'en'] as const) {
    const to = patch[lang];
    if (to === undefined) continue;
    const from = currentText(block, before, lang);
    if (to === from) continue;
    out.push({ ...base, id: input.newId(), kind: to === block[lang] ? 'revert' : 'text', lang, from, to });
  }
  const flag = (kind: LogKind, lang: Lang | null, was: boolean, next: boolean | undefined): void => {
    if (next === undefined || next === was) return;
    out.push({ ...base, id: input.newId(), kind, lang, from: was ? '1' : '0', to: next ? '1' : '0' });
  };
  flag('approved', null, before?.approved === true, patch.approved);
  flag('inWordPress', 'fo', before?.doneFo === true, patch.doneFo);
  flag('inWordPress', 'en', before?.doneEn === true, patch.doneEn);
  return out;
}

export function reviewEntry(input: Who & { pageId: string; pageTitle: string; was: boolean; next: boolean }): LogEntry | null {
  if (input.was === input.next) return null;
  return {
    id: input.newId(),
    at: input.now,
    by: input.by,
    byEmail: input.byEmail,
    pageId: input.pageId,
    pageTitle: input.pageTitle,
    blockId: '',
    kind: 'reviewed',
    lang: null,
    from: input.was ? '1' : '0',
    to: input.next ? '1' : '0',
  };
}

const isTextKind = (kind: LogKind): boolean => kind === 'text' || kind === 'revert';

/**
 * Adds an entry to the unsent queue. Typing in the same text by the same person merges into one
 * entry, and an edit that ends where it began leaves no entry at all.
 */
export function queueEntry(queue: LogEntry[], entry: LogEntry): LogEntry[] {
  const i = queue.findIndex(
    (q) => q.pageId === entry.pageId && q.blockId === entry.blockId && q.lang === entry.lang && q.by === entry.by && q.byEmail === entry.byEmail && (isTextKind(q.kind) ? isTextKind(entry.kind) : q.kind === entry.kind),
  );
  if (i === -1) return [...queue, entry].slice(-QUEUE_CAP);
  const merged: LogEntry = { ...queue[i], at: entry.at, to: entry.to, kind: entry.kind };
  const rest = queue.filter((_, n) => n !== i);
  return merged.from === merged.to ? rest : [...rest.slice(0, i), merged, ...rest.slice(i)];
}

/** Entries that nobody has touched for a few seconds. */
export function readyToSend(queue: LogEntry[], nowMs: number, quietMs = QUIET_MS): LogEntry[] {
  return queue.filter((e) => nowMs - Date.parse(e.at) >= quietMs);
}

/** Removes sent entries, unless they were extended while the request was running. */
export function afterSend(queue: LogEntry[], sent: LogEntry[]): LogEntry[] {
  const at = new Map(sent.map((e) => [e.id, e.at]));
  return queue.filter((e) => at.get(e.id) !== e.at);
}

/** Remote entries plus unsent local ones, newest first, one per id. */
export function mergeLog(remote: LogEntry[], pending: LogEntry[]): LogEntry[] {
  const byId = new Map<string, LogEntry>();
  for (const e of remote) byId.set(e.id, e);
  for (const e of pending) byId.set(e.id, e);
  return Array.from(byId.values()).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function logToRows(entries: LogEntry[]): LogRow[] {
  return entries.map((e) => ({
    id: e.id,
    at: e.at,
    by: e.by,
    by_email: e.byEmail,
    page_id: e.pageId,
    page_title: e.pageTitle,
    block_id: e.blockId,
    kind: e.kind,
    lang: e.lang,
    from_text: e.from,
    to_text: e.to,
  }));
}

export function rowsToLog(rows: unknown[]): LogEntry[] {
  const out: LogEntry[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Partial<LogRow>;
    if (typeof r.id !== 'string' || typeof r.at !== 'string' || typeof r.page_id !== 'string' || !KINDS.includes(r.kind as LogKind)) continue;
    out.push({
      id: r.id,
      at: new Date(r.at).toISOString(),
      by: r.by ?? 'unknown',
      byEmail: r.by_email ?? '',
      pageId: r.page_id,
      pageTitle: r.page_title ?? '',
      blockId: r.block_id ?? '',
      kind: r.kind as LogKind,
      lang: r.lang === 'fo' || r.lang === 'en' ? r.lang : null,
      from: r.from_text ?? '',
      to: r.to_text ?? '',
    });
  }
  return out;
}

export function parseQueue(text: string | null): LogEntry[] {
  if (!text) return [];
  try {
    const data: unknown = JSON.parse(text);
    return Array.isArray(data) ? validEntries(data) : [];
  } catch {
    return [];
  }
}

function validEntries(data: unknown[]): LogEntry[] {
  return data.filter((e): e is LogEntry => {
    const x = e as Partial<LogEntry>;
    return typeof x?.id === 'string' && typeof x.at === 'string' && typeof x.pageId === 'string' && KINDS.includes(x.kind as LogKind);
  });
}

const LANG_NAME: Record<Lang, string> = { fo: 'Faroese', en: 'English' };

/** One line saying what happened. */
export function describeEntry(e: LogEntry): string {
  const lang = e.lang ? LANG_NAME[e.lang] : '';
  switch (e.kind) {
    case 'text':
      return `Changed the ${lang} text`;
    case 'revert':
      return `Reverted the ${lang} text to the original`;
    case 'approved':
      return e.to === '1' ? 'Approved a text' : 'Removed approval from a text';
    case 'inWordPress':
      return e.to === '1' ? `Marked the ${lang} text as in WordPress` : `Marked the ${lang} text as not in WordPress`;
    case 'reviewed':
      return e.to === '1' ? 'Marked the page as reviewed' : 'Marked the page as not reviewed';
  }
}

export function shorten(html: string, max = 160): string {
  const text = richToPlain(html).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface LogFilter {
  by: string;
  kind: 'all' | LogKind;
  query: string;
}

export function filterLog(entries: LogEntry[], filter: LogFilter): LogEntry[] {
  const q = filter.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (filter.by !== 'all' && e.by !== filter.by) return false;
    if (filter.kind !== 'all' && e.kind !== filter.kind) return false;
    if (q === '') return true;
    return e.pageTitle.toLowerCase().includes(q) || shorten(e.from, 1000).toLowerCase().includes(q) || shorten(e.to, 1000).toLowerCase().includes(q);
  });
}

export function peopleIn(entries: LogEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.by))).sort((a, b) => a.localeCompare(b, 'fo'));
}
