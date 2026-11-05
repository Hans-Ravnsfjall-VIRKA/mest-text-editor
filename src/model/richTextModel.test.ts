import { describe, expect, it } from 'vitest';
import { decodeEntities, richToPlain, sanitizeRichHtml, textToRichHtml } from './richTextModel';

describe('sanitizeRichHtml', () => {
  it('leaves stored text unchanged (idempotent)', () => {
    for (const html of [
      'Vit eru MEST',
      'Søla &amp; Eykalutir',
      '<strong>Upplatingartíðir á sølubúðum</strong><br>Mána- til fríggjadag: 8.00 – 16.10',
      'Les <a href="https://mest-fo.com/mest/samband/">meira</a> her',
      'a &lt; b &gt; c',
      'x<sup>2</sup> og <em>H</em><sub>2</sub>O',
    ]) {
      expect(sanitizeRichHtml(html)).toBe(html);
      expect(sanitizeRichHtml(sanitizeRichHtml(html))).toBe(sanitizeRichHtml(html));
    }
  });

  it('turns editable-field output into the stored subset', () => {
    expect(sanitizeRichHtml('Fyrsta&nbsp;línja<div>Onnur</div><div>Triðja</div>')).toBe('Fyrsta línja<br>Onnur<br>Triðja');
    expect(sanitizeRichHtml('<p>Ein</p><p>Tvey</p>')).toBe('Ein<br>Tvey');
    expect(sanitizeRichHtml('Tekstur<br><br>')).toBe('Tekstur');
    expect(sanitizeRichHtml('<span style="color:red">Reytt</span> <font>tekstur</font>')).toBe('Reytt tekstur');
    expect(sanitizeRichHtml('a<br><br>b')).toBe('a<br><br>b');
    expect(sanitizeRichHtml('a<div><br></div><div>b</div>')).toBe('a<br><br>b');
  });

  it('drops scripts, handlers and unsafe links', () => {
    expect(sanitizeRichHtml('<img src=x onerror=alert(1)>Hey')).toBe('Hey');
    expect(sanitizeRichHtml('<a href="javascript:alert(1)" onclick="x()">Leinkja</a>')).toBe('<a>Leinkja</a>');
    expect(sanitizeRichHtml('<strong onclick="x()">Feitt</strong>')).toBe('<strong>Feitt</strong>');
    expect(sanitizeRichHtml('<script>alert(1)</script>Tekstur')).toBe('alert(1)Tekstur');
  });

  it('closes, reorders and removes broken or empty formatting', () => {
    expect(sanitizeRichHtml('<strong>Opið')).toBe('<strong>Opið</strong>');
    expect(sanitizeRichHtml('Lukað</strong> tekstur')).toBe('Lukað tekstur');
    expect(sanitizeRichHtml('<strong></strong>Tekstur<em> </em>')).toBe('Tekstur');
    expect(sanitizeRichHtml('<b><i>Báði</b></i>')).toBe('<b><i>Báði</i></b>');
  });

  it('keeps ampersands and angle brackets as text', () => {
    expect(sanitizeRichHtml('A & B')).toBe('A &amp; B');
    expect(sanitizeRichHtml('1 < 2')).toBe('1 &lt; 2');
    expect(sanitizeRichHtml('Tom &quot;sitat&quot;')).toBe('Tom "sitat"');
  });

  it('in plain mode drops all tags and line breaks', () => {
    expect(sanitizeRichHtml('<strong>SEO</strong> <em>title</em><br>her', { plain: true })).toBe('SEO title her');
    expect(sanitizeRichHtml('a &amp; b', { plain: true })).toBe('a &amp; b');
  });
});

describe('helpers', () => {
  it('decodes entities', () => {
    expect(decodeEntities('&amp; &lt; &#233; &#xe9; &nbsp;|&unknown;')).toBe('& < é é  |&unknown;');
  });
  it('turns AI text with line breaks into stored format', () => {
    expect(textToRichHtml('Fyrsta\nÖnnur\r\n\nTriðja')).toBe('Fyrsta<br>Önnur<br>Triðja');
    expect(textToRichHtml('  Hey <strong>du</strong> ')).toBe('Hey <strong>du</strong>');
  });
  it('makes plain text', () => {
    expect(richToPlain('<strong>A</strong> &amp; B<br>C')).toBe('A & B C');
  });
});
