// Pure logic for the formatted-text editor. The stored format is a small HTML subset
// (strong, b, em, i, u, a, sup, sub, br). Everything the browser's editable field
// produces is cleaned back into that subset here.

const INLINE = new Set(['strong', 'b', 'em', 'i', 'u', 'a', 'sup', 'sub']);
const BLOCK = new Set(['div', 'p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'blockquote']);
const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i;

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED[body.toLowerCase()] ?? match;
  });
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hrefOf(attrs: string): string | null {
  const m = attrs.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const raw = m ? decodeEntities(m[1] ?? m[2] ?? '') : '';
  return SAFE_HREF.test(raw) ? raw : null;
}

const TOKEN = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|<!--[\s\S]*?-->|[^<]+|</g;

/**
 * Clean HTML from the editable field (or from the AI) into the stored subset.
 * With `plain` every tag is dropped and line breaks become spaces.
 */
export function sanitizeRichHtml(input: string, options: { plain?: boolean } = {}): string {
  const plain = options.plain === true;
  let out = '';
  const open: string[] = [];
  const lineBreak = (): void => {
    if (plain) {
      if (out !== '' && !out.endsWith(' ')) out += ' ';
    } else if (out !== '' && !out.endsWith('<br>')) {
      out += '<br>';
    }
  };

  for (const match of input.matchAll(TOKEN)) {
    const [token, rawName, attrs = ''] = match;
    if (token.startsWith('<!--')) continue;
    if (rawName === undefined) {
      out += escapeText(decodeEntities(token === '<' ? '<' : token).replace(/ /g, ' '));
      continue;
    }
    const name = rawName.toLowerCase();
    const closing = token.startsWith('</');
    if (name === 'br') {
      // An explicit <br> is always kept (two in a row make a blank line); block ends are not doubled.
      if (plain) lineBreak();
      else out += '<br>';
      continue;
    }
    if (BLOCK.has(name)) {
      lineBreak();
      continue;
    }
    if (plain || !INLINE.has(name)) continue;
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at + 1) out += `</${open.pop()}>`;
      open.pop();
      out += `</${name}>`;
    } else {
      const href = name === 'a' ? hrefOf(attrs) : null;
      out += href ? `<a href="${href.replace(/"/g, '&quot;')}">` : `<${name}>`;
      open.push(name);
    }
  }
  while (open.length > 0) out += `</${open.pop()}>`;
  return tidy(out);
}

function tidy(html: string): string {
  let result = html.replace(/[ \t\r\n\f\v]+/g, ' ');
  // Remove empty formatting, repeatedly, so nested empties disappear too.
  for (let i = 0; i < 4; i++) {
    result = result.replace(/<(strong|b|em|i|u|a|sup|sub)(?: [^>]*)?>\s*<\/\1>/g, '');
  }
  return result
    .replace(/ ?<br> ?/g, '<br>')
    .replace(/^(<br>)+|(<br>)+$/g, '')
    .trim();
}

/** Convert AI output to stored format: real line breaks become <br>. */
export function textToRichHtml(text: string): string {
  return sanitizeRichHtml(text.trim().replace(/\s*\r?\n\s*/g, '<br>'));
}

/** Same text with tags removed; used for searching and titles. */
export function richToPlain(html: string): string {
  return decodeEntities(html.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}
