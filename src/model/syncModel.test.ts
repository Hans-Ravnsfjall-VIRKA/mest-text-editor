import { describe, expect, it } from 'vitest';
import {
  editsEqual,
  mergeEdits,
  parseEdits,
  serializeEdits,
} from './syncModel';
import type { Edits } from './contentModel';

const older = { fo: 'gamalt', updatedAt: '2026-11-05T10:00:00.000Z', updatedBy: 'a' };
const newer = { fo: 'nýtt', updatedAt: '2026-11-05T11:00:00.000Z', updatedBy: 'b' };

describe('mergeEdits', () => {
  it('keeps the newest entry per block from either side', () => {
    const local: Edits = { x: older, y: newer };
    const remote: Edits = { x: newer, y: older, z: older };
    expect(mergeEdits(local, remote)).toEqual({ x: newer, y: newer, z: older });
    expect(mergeEdits(remote, local)).toEqual({ x: newer, y: newer, z: older });
  });
  it('lets a newer tombstone override older text', () => {
    const tombstone = { updatedAt: '2026-11-05T12:00:00.000Z', updatedBy: 'a' };
    expect(mergeEdits({ x: newer }, { x: tombstone }).x).toEqual(tombstone);
  });
});

describe('edits file', () => {
  it('round-trips through serialise and parse', () => {
    const edits: Edits = { b: newer, a: older };
    const text = serializeEdits(edits, '2026-11-05T12:00:00.000Z');
    expect(parseEdits(text)).toEqual(edits);
    expect(text.indexOf('"a"')).toBeLessThan(text.indexOf('"b"'));
  });
  it('survives broken input', () => {
    expect(parseEdits('')).toEqual({});
    expect(parseEdits('{"edits": 5}')).toEqual({});
    expect(parseEdits('{"edits": {"a": {"fo": "x"}}}')).toEqual({});
  });
  it('compares edit sets regardless of key order', () => {
    expect(editsEqual({ a: older }, { a: { updatedBy: 'a', updatedAt: older.updatedAt, fo: 'gamalt' } })).toBe(true);
    expect(editsEqual({ a: older }, { a: newer })).toBe(false);
    expect(editsEqual({ a: older }, {})).toBe(false);
  });
});
