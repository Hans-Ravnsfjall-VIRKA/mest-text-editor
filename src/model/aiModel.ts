// Pure logic for the AI helper: which actions exist, how the request is built, how the reply is read.

import type { Lang } from './contentModel';

export type AiAction = 'translateToEn' | 'translateToFo' | 'proofread' | 'shorten' | 'custom';

export const DEFAULT_AI_MODEL = 'claude-sonnet-5-5';

export interface AiActionInfo {
  action: AiAction;
  label: string;
}

export const AI_ACTIONS: AiActionInfo[] = [
  { action: 'translateToEn', label: 'Translate FO to EN' },
  { action: 'translateToFo', label: 'Translate EN to FO' },
  { action: 'proofread', label: 'Proofread' },
  { action: 'shorten', label: 'Shorten' },
  { action: 'custom', label: 'Custom instruction' },
];

export interface AiInput {
  action: AiAction;
  /** Language the result is written in (ignored for the two translate actions). */
  lang: Lang;
  fo: string;
  en: string;
  pageTitle: string;
  blockLabel: string;
  instruction?: string;
  model: string;
}

export interface AiRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: 'user'; content: string }[];
}

const LANG_NAME: Record<Lang, string> = { fo: 'Faroese', en: 'British English' };

export const AI_SYSTEM_PROMPT = [
  'You help edit website copy for MEST, a Faroese shipyard and maritime service company.',
  'Reply with the finished text only: no quotes, no explanations, no alternatives.',
  'Keep inline HTML tags (such as <strong>, <a href="...">) and line breaks exactly where they belong.',
  'Keep names, numbers, phone numbers and email addresses unchanged.',
  'Faroese must be natural modern Faroese. Never use Icelandic or Danish words or spellings.',
  'English is British English, in a clear and professional maritime industry tone.',
].join('\n');

/** Language the action writes its result in. */
export function aiTargetLang(action: AiAction, lang: Lang): Lang {
  if (action === 'translateToEn') return 'en';
  if (action === 'translateToFo') return 'fo';
  return lang;
}

export function buildAiPrompt(input: AiInput): string {
  const target = aiTargetLang(input.action, input.lang);
  const context = `Page: ${input.pageTitle}\nElement: ${input.blockLabel}`;
  const both = `Faroese text:\n${input.fo}\n\nEnglish text:\n${input.en}`;
  const own = `${LANG_NAME[target]} text:\n${input[target]}`;
  switch (input.action) {
    case 'translateToEn':
      return `${context}\n\nTranslate this Faroese text to British English.\n\n${input.fo}`;
    case 'translateToFo':
      return `${context}\n\nTranslate this English text to Faroese.\n\n${input.en}`;
    case 'proofread':
      return `${context}\n\nProofread the ${LANG_NAME[target]} text. Fix spelling, grammar and punctuation. Change nothing else.\n\n${own}`;
    case 'shorten':
      return `${context}\n\nShorten the ${LANG_NAME[target]} text by about a third without losing the main message.\n\n${own}`;
    case 'custom':
      return `${context}\n\nInstruction: ${(input.instruction ?? '').trim()}\nWrite the result in ${LANG_NAME[target]}.\n\n${both}`;
  }
}

export function buildAiRequest(input: AiInput): AiRequestBody {
  return {
    model: input.model.trim() || DEFAULT_AI_MODEL,
    max_tokens: 2000,
    system: AI_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildAiPrompt(input) }],
  };
}

/** Read the text out of an Anthropic Messages API response. */
export function parseAiResponse(data: unknown): string {
  if (typeof data !== 'object' || data === null) throw new Error('Empty AI response');
  const error = (data as { error?: { message?: string } }).error;
  if (error) throw new Error(error.message ?? 'AI request failed');
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new Error('Unexpected AI response');
  const text = content
    .filter((part): part is { type: 'text'; text: string } => {
      const p = part as { type?: unknown; text?: unknown };
      return p.type === 'text' && typeof p.text === 'string';
    })
    .map((part) => part.text)
    .join('')
    .trim();
  if (text === '') throw new Error('The AI returned no text');
  return text.replace(/^["“](.*)["”]$/s, '$1');
}
