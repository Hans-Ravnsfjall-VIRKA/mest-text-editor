// Pure logic for exports: change list (CSV) and a string dictionary for TranslatePress.

import { currentText, editKey, isChanged, type Edits, type SiteContent } from './contentModel';

export interface ChangeRow {
  pageId: string;
  pageTitle: string;
  urlFo: string;
  urlEn: string;
  blockId: string;
  type: string;
  foOld: string;
  foNew: string;
  enOld: string;
  enNew: string;
  foChanged: boolean;
  enChanged: boolean;
  approved: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface ChangeOptions {
  onlyApproved?: boolean;
}

/** One row per changed block, in page order. */
export function changeRows(content: SiteContent, edits: Edits, options: ChangeOptions = {}): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const page of content.pages) {
    for (const block of page.blocks) {
      const edit = edits[editKey(page.id, block.id)];
      if (!edit || !isChanged(block, edit)) continue;
      if (options.onlyApproved && !edit.approved) continue;
      rows.push({
        pageId: page.id,
        pageTitle: page.title,
        urlFo: page.urlFo,
        urlEn: page.urlEn,
        blockId: block.id,
        type: block.kind === 'text' ? block.tag : `${block.kind}:${block.tag}`,
        foOld: block.fo,
        foNew: currentText(block, edit, 'fo'),
        enOld: block.en,
        enNew: currentText(block, edit, 'en'),
        foChanged: isChanged(block, edit, 'fo'),
        enChanged: isChanged(block, edit, 'en'),
        approved: edit.approved === true,
        updatedBy: edit.updatedBy,
        updatedAt: edit.updatedAt,
      });
    }
  }
  return rows;
}

export function csvCell(value: string, delimiter: string): string {
  const needsQuotes = value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

const CSV_COLUMNS: { header: string; value: (r: ChangeRow) => string }[] = [
  { header: 'page', value: (r) => r.pageTitle },
  { header: 'url_fo', value: (r) => r.urlFo },
  { header: 'url_en', value: (r) => r.urlEn },
  { header: 'type', value: (r) => r.type },
  { header: 'fo_old', value: (r) => r.foOld },
  { header: 'fo_new', value: (r) => r.foNew },
  { header: 'en_old', value: (r) => r.enOld },
  { header: 'en_new', value: (r) => r.enNew },
  { header: 'fo_changed', value: (r) => (r.foChanged ? 'yes' : 'no') },
  { header: 'en_changed', value: (r) => (r.enChanged ? 'yes' : 'no') },
  { header: 'approved', value: (r) => (r.approved ? 'yes' : 'no') },
  { header: 'edited_by', value: (r) => r.updatedBy },
  { header: 'edited_at', value: (r) => r.updatedAt },
];

/** Semicolon is the default so the file opens correctly in Excel with Faroese or Danish regional settings. */
export function toCsv(rows: ChangeRow[], delimiter = ';'): string {
  const lines = [CSV_COLUMNS.map((c) => c.header).join(delimiter)];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(c.value(row), delimiter)).join(delimiter));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export interface DictionaryEntry {
  /** Faroese string as it will be on the site after the edit (TranslatePress matches on this). */
  original: string;
  translated: string;
  /** Faroese string currently on the site, when it differs from `original`. */
  previousOriginal?: string;
  pages: string[];
}

export interface DictionaryConflict {
  original: string;
  translations: { translated: string; pages: string[] }[];
}

export interface Dictionary {
  entries: DictionaryEntry[];
  conflicts: DictionaryConflict[];
}

/**
 * TranslatePress keeps one English translation per Faroese string for the whole site.
 * This builds that list from the edited content and reports Faroese strings that
 * were given different English texts on different pages.
 */
export function buildDictionary(content: SiteContent, edits: Edits, options: ChangeOptions = {}): Dictionary {
  const byOriginal = new Map<string, Map<string, { pages: Set<string>; previous?: string }>>();
  for (const page of content.pages) {
    for (const block of page.blocks) {
      const edit = edits[editKey(page.id, block.id)];
      if (!edit || !isChanged(block, edit)) continue;
      if (options.onlyApproved && !edit.approved) continue;
      const original = currentText(block, edit, 'fo');
      const translated = currentText(block, edit, 'en');
      const variants = byOriginal.get(original) ?? new Map<string, { pages: Set<string>; previous?: string }>();
      const variant = variants.get(translated) ?? { pages: new Set<string>() };
      variant.pages.add(page.id);
      if (original !== block.fo) variant.previous = block.fo;
      variants.set(translated, variant);
      byOriginal.set(original, variants);
    }
  }

  const dictionary: Dictionary = { entries: [], conflicts: [] };
  for (const [original, variants] of byOriginal) {
    const list = Array.from(variants, ([translated, v]) => ({ translated, pages: Array.from(v.pages), previous: v.previous }));
    if (list.length > 1) {
      dictionary.conflicts.push({
        original,
        translations: list.map(({ translated, pages }) => ({ translated, pages })),
      });
      continue;
    }
    const only = list[0];
    const entry: DictionaryEntry = { original, translated: only.translated, pages: only.pages };
    if (only.previous !== undefined) entry.previousOriginal = only.previous;
    dictionary.entries.push(entry);
  }
  return dictionary;
}
