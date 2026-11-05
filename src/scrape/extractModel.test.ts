import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import {
  assembleSite,
  englishUrlCandidates,
  extractBlocks,
  extractMenuUrls,
  findAlternateUrl,
  GLOBAL_PAGE_ID,
  isEnglishUrl,
  pageIdFromUrl,
  pairBlocks,
  parseSitemapLocs,
  typeFromSitemapUrl,
  uniquifyIds,
} from './extractModel';

function doc(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

const page = (lang: string, t: Record<string, string>): string => `<!doctype html><html lang="${lang}"><head>
<title>${t.title}</title>
<meta name="description" content="${t.desc}">
<link rel="alternate" hreflang="fo" href="https://x.fo/mest/samband/">
<link rel="alternate" hreflang="en-GB" href="https://x.fo/mest/en/samband/">
<style>.a{color:red}</style></head><body>
<header><nav><ul><li><a href="https://x.fo/mest/samband/">${t.menu}</a></li></ul></nav></header>
<main>
  <div data-id="abc"><h1>${t.h1}</h1></div>
  <div data-id="def"><p>${t.p} <strong>${t.bold}</strong><br>${t.line2}</p></div>
  <div data-id="ghi">${t.loose}<p>${t.inner}</p></div>
  <img alt="${t.alt}" src="a.jpg">
  <p>01-07-2026</p>
  <a class="btn"><span>${t.button}</span></a>
  <a class="btn"><span>${t.button}</span></a>
  <script>var x = "ignore me";</script>
</main>
<footer><p>${t.footer}</p></footer>
</body></html>`;

const FO = { title: 'Samband - MEST', desc: 'Set teg í samband', menu: 'Samband', h1: 'Samband', p: 'Ring til okkara', bold: 'í dag', line2: 'Vit svara', loose: 'Leysur tekstur', inner: 'Innari tekstur', alt: 'Skip í dokk', button: 'Les meira', footer: 'Upplatingartíðir' };
const EN = { title: 'Contact - MEST', desc: 'Get in touch', menu: 'Contact', h1: 'Contact', p: 'Call us', bold: 'today', line2: 'We answer', loose: 'Loose text', inner: 'Inner text', alt: 'Ship in dock', button: 'Read more', footer: 'Opening hours' };

describe('extractBlocks', () => {
  const blocks = extractBlocks(doc(page('fo', FO)));
  const texts = blocks.map((b) => b.html);

  it('collects meta, headings, paragraphs, attributes', () => {
    expect(texts).toContain('Samband - MEST');
    expect(texts).toContain('Set teg í samband');
    expect(texts).toContain('Skip í dokk');
    expect(blocks.find((b) => b.html === 'Skip í dokk')?.kind).toBe('attr');
  });

  it('keeps inline formatting and line breaks in one block', () => {
    expect(texts).toContain('Ring til okkara <strong>í dag</strong><br>Vit svara');
  });

  it('splits loose text from nested block elements', () => {
    expect(texts).toContain('Leysur tekstur');
    expect(texts).toContain('Innari tekstur');
  });

  it('skips scripts, styles and text without letters', () => {
    expect(texts.join('|')).not.toContain('ignore me');
    expect(texts.join('|')).not.toContain('color:red');
    expect(texts).not.toContain('01-07-2026');
  });

  it('marks header and footer texts as global', () => {
    expect(blocks.find((b) => b.html === 'Upplatingartíðir')?.region).toBe('global');
    expect(blocks.find((b) => b.tag === 'a' && b.html === 'Samband')?.region).toBe('global');
    expect(blocks.find((b) => b.tag === 'h1')?.region).toBe('content');
  });
});

describe('pairBlocks', () => {
  const paired = pairBlocks('samband', extractBlocks(doc(page('fo', FO))), extractBlocks(doc(page('en', EN))));

  it('pairs Faroese with English by position', () => {
    expect(paired.unmatched).toBe(0);
    expect(paired.content.find((b) => b.fo === 'Samband')?.en).toBe('Contact');
    expect(paired.content.find((b) => b.tag === 'title')?.en).toBe('Contact - MEST');
    expect(paired.global.find((b) => b.fo === 'Upplatingartíðir')?.en).toBe('Opening hours');
  });

  it('drops repeated identical blocks', () => {
    expect(paired.content.filter((b) => b.fo === 'Les meira')).toHaveLength(1);
  });

  it('treats a paragraph of word-by-word spans as one block and pairs it inside the same widget', () => {
    const wrap = (inner: string) => `<!doctype html><html><head></head><body class="mob-menu-slideout"><main><div data-id="w1"><div>${inner}</div></div></main></body></html>`;
    const fo = extractBlocks(doc(wrap('<p>Fyrsta</p><p><span lang="da"><span>Bíleggingar</span>&nbsp;<span>kunnu</span>&nbsp;<span>gerast</span></span></p>')));
    const en = extractBlocks(doc(wrap('<p>First</p><p class="translation-block">Orders can be placed</p>')));
    expect(fo.map((b) => b.html)).toEqual(['Fyrsta', 'Bíleggingar kunnu gerast']);
    expect(fo.every((b) => b.region === 'content')).toBe(true);
    const result = pairBlocks('x', fo, en);
    expect(result.unmatched).toBe(0);
    expect(result.content.map((b) => b.en)).toEqual(['First', 'Orders can be placed']);
  });

  it('keeps headers inside articles as page content', () => {
    const blocks = extractBlocks(doc('<!doctype html><html><head></head><body><header><p>Síðuhøvd</p></header><main><article><header><h2><a href="/x">Tíðindi</a></h2></header></article></main></body></html>'));
    expect(blocks.map((b) => `${b.region}:${b.html}`)).toEqual(['global:Síðuhøvd', 'content:Tíðindi']);
  });

  it('unwraps single-link list items', () => {
    const blocks = extractBlocks(doc('<!doctype html><html><head></head><body><ul><li><a href="/x">Leinkja</a></li></ul></body></html>'));
    expect(blocks.map((b) => `${b.tag}:${b.html}`)).toEqual(['a:Leinkja']);
  });

  it('falls back to Faroese when English is missing', () => {
    const fo = extractBlocks(doc('<!doctype html><html><head></head><body><div data-id="a"><p>Bara føroyskt</p></div></body></html>'));
    const result = pairBlocks('x', fo, []);
    expect(result.unmatched).toBe(1);
    expect(result.content[0].en).toBe('Bara føroyskt');
  });

  it('gives stable ids that depend on page and text', () => {
    const again = pairBlocks('samband', extractBlocks(doc(page('fo', FO))), extractBlocks(doc(page('en', EN))));
    expect(again.content.map((b) => b.id)).toEqual(paired.content.map((b) => b.id));
    const other = pairBlocks('onnur', extractBlocks(doc(page('fo', FO))), extractBlocks(doc(page('en', EN))));
    expect(other.content[0].id).not.toBe(paired.content[0].id);
  });
});

describe('assembleSite', () => {
  const make = (id: string) => ({
    id,
    type: 'page',
    urlFo: `https://x.fo/mest/${id}/`,
    urlEn: `https://x.fo/mest/en/${id}/`,
    paired: pairBlocks(id, extractBlocks(doc(page('fo', FO))), extractBlocks(doc(page('en', EN)))),
  });
  const site = assembleSite('https://x.fo/mest', '2026-11-05T00:00:00Z', [make('samband'), make('onnur')], [
    'https://x.fo/mest/samband',
  ]);

  it('puts global texts once on a separate page', () => {
    expect(site.pages[0].id).toBe(GLOBAL_PAGE_ID);
    expect(site.pages[0].blocks.filter((b) => b.fo === 'Upplatingartíðir')).toHaveLength(1);
    expect(site.pages).toHaveLength(3);
  });

  it('uses the first heading as title and flags menu pages', () => {
    expect(site.pages[1].title).toBe('Samband');
    expect(site.pages[1].inMenu).toBe(true);
    expect(site.pages[2].inMenu).toBe(false);
  });
});

describe('url helpers', () => {
  it('finds the English alternate', () => {
    expect(findAlternateUrl(doc(page('fo', FO)), 'en')).toBe('https://x.fo/mest/en/samband/');
  });
  it('lists menu urls', () => {
    expect(extractMenuUrls(doc(page('fo', FO)))).toEqual(['https://x.fo/mest/samband']);
  });
  it('builds page ids', () => {
    expect(pageIdFromUrl('https://x.fo/mest', 'https://x.fo/mest/')).toBe('home');
    expect(pageIdFromUrl('https://x.fo/mest', 'https://x.fo/mest/a/b/')).toBe('a/b');
  });
  it('offers a fallback when hreflang is broken', () => {
    expect(englishUrlCandidates('https://x.fo/mest', 'https://x.fo/mest/mest-design/', 'https://x.fo/mest/en/-design/')).toEqual([
      'https://x.fo/mest/en/-design/',
      'https://x.fo/mest/en/mest-design/',
    ]);
    expect(englishUrlCandidates('https://x.fo/mest', 'https://x.fo/mest/a/', 'https://x.fo/mest/en/a/')).toHaveLength(1);
  });
  it('reads sitemaps', () => {
    const xml = '<urlset><url><loc>https://x.fo/mest/a/</loc></url><url><loc> https://x.fo/mest/en/a/ </loc></url></urlset>';
    expect(parseSitemapLocs(xml)).toEqual(['https://x.fo/mest/a/', 'https://x.fo/mest/en/a/']);
    expect(typeFromSitemapUrl('https://x.fo/mest/wpm_team-sitemap.xml')).toBe('wpm_team');
    expect(typeFromSitemapUrl('https://x.fo/mest/post-sitemap2.xml')).toBe('post');
    expect(isEnglishUrl('https://x.fo/mest', 'https://x.fo/mest/en/a/')).toBe(true);
    expect(isEnglishUrl('https://x.fo/mest', 'https://x.fo/mest/enn/')).toBe(false);
  });
  it('makes duplicate ids unique', () => {
    const b = { id: 'x', kind: 'text' as const, tag: 'p', fo: 'a', en: 'b' };
    expect(uniquifyIds([b, b, b]).map((x) => x.id)).toEqual(['x', 'x-1', 'x-2']);
  });
});
