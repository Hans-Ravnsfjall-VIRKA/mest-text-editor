// Pure logic for merging and (de)serialising the shared edits file.

import type { BlockEdit, Edits } from './contentModel';

export interface EditsFile {
  version: 1;
  savedAt: string;
  edits: Edits;
}

/** Merge two edit sets block by block; the most recently updated entry wins. */
export function mergeEdits(a: Edits, b: Edits): Edits {
  const merged: Edits = { ...a };
  for (const [key, entry] of Object.entries(b)) {
    const existing = merged[key];
    if (!existing || entry.updatedAt > existing.updatedAt) merged[key] = entry;
  }
  return merged;
}

export function editsEqual(a: Edits, b: Edits): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => b[key] !== undefined && JSON.stringify(sortKeys(a[key])) === JSON.stringify(sortKeys(b[key])));
}

function sortKeys(entry: BlockEdit): Record<string, unknown> {
  const source = entry as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.keys(source).sort().map((k) => [k, source[k]]));
}

export function serializeEdits(edits: Edits, now: string): string {
  const sorted = Object.fromEntries(Object.keys(edits).sort().map((k) => [k, edits[k]]));
  const file: EditsFile = { version: 1, savedAt: now, edits: sorted };
  return `${JSON.stringify(file, null, 1)}\n`;
}

/** Parse an edits file. Unknown or broken input gives an empty set rather than throwing. */
export function parseEdits(text: string): Edits {
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null) return {};
    const edits = (data as { edits?: unknown }).edits;
    if (typeof edits !== 'object' || edits === null) return {};
    const result: Edits = {};
    for (const [key, value] of Object.entries(edits as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const entry = value as Partial<BlockEdit>;
      if (typeof entry.updatedAt !== 'string') continue;
      result[key] = { ...entry, updatedAt: entry.updatedAt, updatedBy: entry.updatedBy ?? 'unknown' };
    }
    return result;
  } catch {
    return {};
  }
}

export function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export interface RepoRef {
  owner: string;
  repo: string;
}

/** On GitHub Pages (owner.github.io/repo/) the repository can be read from the address. */
export function detectRepoFromLocation(hostname: string, pathname: string): RepoRef | null {
  const host = hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (!host) return null;
  const repo = pathname.split('/').filter(Boolean)[0];
  return repo ? { owner: host[1], repo } : null;
}
