// Browser storage for settings and a local copy of the edits. Every access is
// guarded, because storage can be unavailable (private windows, blocked site data).

import type { Edits } from '../model/contentModel';
import { DEFAULT_AI_MODEL } from '../model/aiModel';
import { parseQueue, type LogEntry } from '../model/logModel';
import { parsePosition, positionKey, type Position } from '../model/positionModel';
import { parseReviews, type Reviews } from '../model/reviewModel';
import { parseEdits, serializeEdits } from '../model/syncModel';

export interface Settings {
  userName: string;
  aiKey: string;
  aiModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  aiKey: '',
  aiModel: DEFAULT_AI_MODEL,
};

const SETTINGS_KEY = 'mest-text-editor:settings';
const EDITS_KEY = 'mest-text-editor:edits';
const REVIEWS_KEY = 'mest-text-editor:reviews';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable: settings last for this visit only
  }
}

export function loadLocalEdits(): Edits {
  try {
    return parseEdits(localStorage.getItem(EDITS_KEY) ?? '');
  } catch {
    return {};
  }
}

export function saveLocalEdits(edits: Edits): void {
  try {
    localStorage.setItem(EDITS_KEY, serializeEdits(edits, new Date().toISOString()));
  } catch {
    // storage unavailable or full
  }
}

export function loadLocalReviews(): Reviews {
  try {
    return parseReviews(localStorage.getItem(REVIEWS_KEY) ?? '');
  } catch {
    return {};
  }
}

export function saveLocalReviews(reviews: Reviews): void {
  try {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
  } catch {
    // storage unavailable or full
  }
}

export function loadPosition(email: string): Position | null {
  try {
    return parsePosition(localStorage.getItem(positionKey(email)));
  } catch {
    return null;
  }
}

export function savePosition(email: string, position: Position): void {
  try {
    localStorage.setItem(positionKey(email), JSON.stringify(position));
  } catch {
    // storage unavailable or full
  }
}

const LOG_QUEUE_KEY = 'mest-text-editor:log-queue';

export function loadLogQueue(): LogEntry[] {
  try {
    return parseQueue(localStorage.getItem(LOG_QUEUE_KEY));
  } catch {
    return [];
  }
}

export function saveLogQueue(queue: LogEntry[]): void {
  try {
    localStorage.setItem(LOG_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // storage unavailable or full
  }
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
