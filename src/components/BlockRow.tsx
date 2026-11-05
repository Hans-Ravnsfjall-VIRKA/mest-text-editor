import { memo, useState } from 'react';
import {
  currentText,
  editableToHtml,
  htmlToEditable,
  isChanged,
  tagLabel,
  type Block,
  type BlockEdit,
  type EditPatch,
  type Lang,
} from '../model/contentModel';
import { AI_ACTIONS, aiTargetLang, type AiAction } from '../model/aiModel';

export interface AiJob {
  action: AiAction;
  lang: Lang;
  instruction?: string;
}

interface Props {
  block: Block;
  edit: BlockEdit | undefined;
  aiEnabled: boolean;
  onPatch: (block: Block, patch: EditPatch) => void;
  onAi: (block: Block, job: AiJob) => Promise<string>;
}

interface Suggestion {
  lang: Lang;
  text: string;
}

const LANG_LABEL: Record<Lang, string> = { fo: 'Føroyskt', en: 'English' };

function rowsFor(text: string): number {
  const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 58)), 0);
  return Math.min(Math.max(lines, 1), 18);
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard blocked: nothing else to do
  }
}

function BlockRowInner({ block, edit, aiEnabled, onPatch, onAi }: Props) {
  const [aiLang, setAiLang] = useState<Lang>('fo');
  const [aiAction, setAiAction] = useState<AiAction>('translateToEn');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [copied, setCopied] = useState<Lang | null>(null);

  const changed = isChanged(block, edit);
  const needsLang = aiAction !== 'translateToEn' && aiAction !== 'translateToFo';

  const runAi = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const text = await onAi(block, { action: aiAction, lang: aiLang, instruction });
      setSuggestion({ lang: aiTargetLang(aiAction, aiLang), text });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const field = (lang: Lang) => {
    const value = htmlToEditable(currentText(block, edit, lang));
    const langChanged = isChanged(block, edit, lang);
    const done = lang === 'fo' ? edit?.doneFo === true : edit?.doneEn === true;
    return (
      <div className={`field${langChanged ? ' is-changed' : ''}`}>
        <textarea
          lang={lang}
          aria-label={`${LANG_LABEL[lang]}: ${tagLabel(block)}`}
          spellCheck={lang === 'en'}
          rows={rowsFor(value)}
          value={value}
          onChange={(e) => onPatch(block, { [lang]: editableToHtml(e.target.value) })}
        />
        {langChanged && (
          <div className="field-foot">
            <details>
              <summary>Original</summary>
              <p className="original" lang={lang}>{htmlToEditable(block[lang])}</p>
            </details>
            <span className="field-actions">
              <button type="button" className="link" onClick={() => onPatch(block, { [lang]: block[lang] })}>
                Revert
              </button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  void copy(value);
                  setCopied(lang);
                  setTimeout(() => setCopied(null), 1200);
                }}
              >
                {copied === lang ? 'Copied' : 'Copy new'}
              </button>
              <label className="check">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => onPatch(block, lang === 'fo' ? { doneFo: e.target.checked } : { doneEn: e.target.checked })}
                />
                In WordPress
              </label>
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <article className={`block${changed ? ' is-changed' : ''}${edit?.approved ? ' is-approved' : ''}`}>
      <header className="block-head">
        <span className={`tag tag-${block.kind}`}>{tagLabel(block)}</span>
        {changed && edit && (
          <span className="byline">
            {edit.updatedBy}, {new Date(edit.updatedAt).toLocaleString()}
          </span>
        )}
        <label className="check approve">
          <input type="checkbox" checked={edit?.approved === true} onChange={(e) => onPatch(block, { approved: e.target.checked })} />
          Approved
        </label>
      </header>
      <div className="fields">
        {field('fo')}
        {field('en')}
      </div>
      {aiEnabled && (
        <div className="ai">
          <select aria-label="AI action" value={aiAction} onChange={(e) => setAiAction(e.target.value as AiAction)}>
            {AI_ACTIONS.map((a) => (
              <option key={a.action} value={a.action}>{a.label}</option>
            ))}
          </select>
          {needsLang && (
            <select aria-label="AI language" value={aiLang} onChange={(e) => setAiLang(e.target.value as Lang)}>
              <option value="fo">Føroyskt</option>
              <option value="en">English</option>
            </select>
          )}
          {aiAction === 'custom' && (
            <input
              type="text"
              className="grow"
              placeholder="What should the AI do with this text?"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          )}
          <button type="button" disabled={busy || (aiAction === 'custom' && instruction.trim() === '')} onClick={() => void runAi()}>
            {busy ? 'Working…' : 'Ask AI'}
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      )}
      {suggestion && (
        <div className="suggestion">
          <span className="suggestion-label">AI suggestion, {LANG_LABEL[suggestion.lang]}</span>
          <p lang={suggestion.lang}>{htmlToEditable(suggestion.text)}</p>
          <div className="suggestion-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                onPatch(block, { [suggestion.lang]: editableToHtml(htmlToEditable(suggestion.text)) });
                setSuggestion(null);
              }}
            >
              Use this
            </button>
            <button type="button" onClick={() => setSuggestion(null)}>Discard</button>
          </div>
        </div>
      )}
    </article>
  );
}

export const BlockRow = memo(BlockRowInner);
