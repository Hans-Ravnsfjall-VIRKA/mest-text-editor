import { describe, expect, it } from 'vitest';
import { aiTargetLang, buildAiPrompt, buildAiRequest, DEFAULT_AI_MODEL, parseAiResponse, type AiInput } from './aiModel';

const base: AiInput = {
  action: 'translateToEn',
  lang: 'fo',
  fo: 'Vit eru MEST',
  en: 'We are MEST',
  pageTitle: 'Home',
  blockLabel: 'H1',
  model: '',
};

describe('ai requests', () => {
  it('targets the right language', () => {
    expect(aiTargetLang('translateToEn', 'fo')).toBe('en');
    expect(aiTargetLang('translateToFo', 'en')).toBe('fo');
    expect(aiTargetLang('proofread', 'fo')).toBe('fo');
  });

  it('builds prompts from the right source text', () => {
    expect(buildAiPrompt(base)).toContain('Vit eru MEST');
    expect(buildAiPrompt(base)).not.toContain('We are MEST');
    const proof = buildAiPrompt({ ...base, action: 'proofread', lang: 'en' });
    expect(proof).toContain('We are MEST');
    expect(proof).not.toContain('Vit eru MEST');
    const custom = buildAiPrompt({ ...base, action: 'custom', instruction: ' Make it punchier ' });
    expect(custom).toContain('Instruction: Make it punchier');
    expect(custom).toContain('Vit eru MEST');
    expect(custom).toContain('We are MEST');
  });

  it('falls back to the default model', () => {
    const req = buildAiRequest(base);
    expect(req.model).toBe(DEFAULT_AI_MODEL);
    expect(req.messages).toHaveLength(1);
    expect(buildAiRequest({ ...base, model: ' my-model ' }).model).toBe('my-model');
  });
});

describe('parseAiResponse', () => {
  it('joins text parts and strips wrapping quotes', () => {
    expect(parseAiResponse({ content: [{ type: 'text', text: ' "We are MEST" ' }] })).toBe('We are MEST');
    expect(parseAiResponse({ content: [{ type: 'text', text: 'A' }, { type: 'other' }, { type: 'text', text: 'B' }] })).toBe('AB');
  });
  it('throws readable errors', () => {
    expect(() => parseAiResponse({ error: { message: 'invalid x-api-key' } })).toThrow('invalid x-api-key');
    expect(() => parseAiResponse({ content: [] })).toThrow('no text');
    expect(() => parseAiResponse(null)).toThrow();
  });
});
