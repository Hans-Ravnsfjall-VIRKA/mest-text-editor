import { useLayoutEffect, useRef } from 'react';
import { sanitizeRichHtml } from '../model/richTextModel';
import type { Lang } from '../model/contentModel';

interface Props {
  value: string;
  lang: Lang;
  label: string;
  /** Plain text only (SEO texts): no formatting, no line breaks. */
  plain?: boolean;
  changed: boolean;
  onChange: (html: string) => void;
}

function format(command: 'bold' | 'italic'): void {
  document.execCommand(command);
}

/**
 * An editable field that shows formatting the way the browser draws it
 * (bold as bold, links as links) and stores only the small safe HTML subset.
 */
export function RichField({ value, lang, label, plain = false, changed, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);

  // Write the value into the field on first show and whenever it changes from outside
  // (revert, AI suggestion, sync). Typing emits the same value back, so it is skipped.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === emitted.current) return;
    el.innerHTML = value;
    emitted.current = value;
  }, [value]);

  const read = (): void => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeRichHtml(el.innerHTML, { plain });
    if (html === emitted.current) return;
    emitted.current = html;
    onChange(html);
  };

  return (
    <div className={`field${changed ? ' is-changed' : ''}`}>
      {!plain && (
        <div className="rt-tools" aria-hidden="true">
          <button type="button" tabIndex={-1} title="Bold (Ctrl/Cmd+B)" onMouseDown={(e) => { e.preventDefault(); format('bold'); }}>
            <strong>B</strong>
          </button>
          <button type="button" tabIndex={-1} title="Italic (Ctrl/Cmd+I)" onMouseDown={(e) => { e.preventDefault(); format('italic'); }}>
            <em>I</em>
          </button>
        </div>
      )}
      <div
        ref={ref}
        className="rt"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={!plain}
        aria-label={label}
        lang={lang}
        spellCheck={lang === 'en'}
        onInput={read}
        onBlur={() => {
          // Tidy the field to exactly what is stored.
          const el = ref.current;
          if (el && emitted.current !== null && el.innerHTML !== emitted.current) el.innerHTML = emitted.current;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!plain) document.execCommand('insertLineBreak');
          } else if (plain && (e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
            e.preventDefault();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, plain ? text.replace(/\s*\n\s*/g, ' ') : text);
        }}
        onDrop={(e) => e.preventDefault()}
      />
    </div>
  );
}
