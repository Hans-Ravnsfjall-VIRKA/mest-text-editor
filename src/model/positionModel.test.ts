import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITION, parsePosition, positionKey } from './positionModel';

describe('positionModel', () => {
  it('keys by lower-cased email', () => {
    expect(positionKey(' Hans@Virka.fo ')).toBe('mest-text-editor:position:hans@virka.fo');
  });
  it('round-trips a saved position', () => {
    const pos = { ...DEFAULT_POSITION, view: 'overview' as const, tab: 'news' as const, pageId: 'abc', reviewFilter: 'unreviewed' as const, onlyUnreviewed: false };
    expect(parsePosition(JSON.stringify(pos))).toEqual(pos);
  });
  it('falls back per field on unknown values', () => {
    expect(parsePosition('{"view":"nope","tab":5,"pageId":7,"onlyUnreviewed":"x"}')).toEqual(DEFAULT_POSITION);
  });
  it('returns null for nothing or garbage', () => {
    expect(parsePosition(null)).toBeNull();
    expect(parsePosition('')).toBeNull();
    expect(parsePosition('{{')).toBeNull();
    expect(parsePosition('5')).toBeNull();
  });
});
