// Pure extraction logic. Uses only standard DOM interfaces, so the same code
// runs in Node (linkedom) and in a browser console (DOMParser).

export type BlockKind = 'text' | 'attr' | 'meta';
export type Region = 'content' | 'global';

export interface RawBlock {
  /** Structural key used to pair the Faroese and English version of a block. */
  key: string;
  tag: string;
  kind: BlockKind;
  region: Region;
  /** Sanitised inline HTML (only strong, b, em, i, u, a, sup, sub, br survive). */
  html: string;
}

export interface Block {
  id: string;
  kind: BlockKind;
  tag: string;
  fo: string;
  en: string;
}

export interface PageDoc {
  id: string;
  type: string;
  title: string;
  urlFo: string;
  urlEn: string;
  /** True when the page is linked from the site header or menus. */
  inMenu: boolean;
  blocks: Block[];
}

export interface SiteContent {
  site: string;
  scrapedAt: string;
  pages: PageDoc[];
}

export interface PairedPage {
  content: Block[];
  global: Block[];
  unmatched: number;
  /** Faroese texts that had no English counterpart at the same position (diagnostics only). */
  unmatchedTexts: string[];
}

export const GLOBAL_PAGE_ID = '_global';

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'IFRAME', 'TEXTAREA', 'SELECT', 'CODE', 'PRE', 'HEAD',
]);
const INLINE_TAGS = new Set([
  'A', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'BR', 'SMALL', 'SUP', 'SUB', 'MARK', 'FONT', 'ABBR', 'BDI',
]);
const KEEP_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'A', 'SUP', 'SUB']);

const GLOBAL_SELECTOR = [
  '[data-elementor-type="header"]',
  '[data-elementor-type="footer"]',
  '[data-elementor-type="popup"]',
  '[id^="moove_gdpr"]',
  '[class*="moove-gdpr"]',
  '.skip-link',
  '.ast-mobile-popup-drawer',
  '.mobmenu',
  '.mobmenu-overlay',
  '.mobmenu-panel',
  '.mob-menu-header-holder',
  '.ast-search-menu-icon',
  'form[role="search"]',
].join(',');

const HAS_LETTER = /\p{L}/u;

export function hasLetters(text: string): boolean {
  return HAS_LETTER.test(text);
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ');
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Small stable hash (FNV-1a, base36) for block ids. */
export function hashId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isText(node: Node): boolean {
  return node.nodeType === 3;
}

function tagOf(el: Element): string {
  return el.tagName.toUpperCase();
}

/** Serialise an element's children, keeping only harmless inline formatting. */
export function sanitizeInline(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (isText(node)) {
      out += escapeHtml(node.textContent ?? '');
    } else if (isElement(node)) {
      const tag = tagOf(node);
      if (SKIP_TAGS.has(tag)) continue;
      if (tag === 'BR') {
        out += '<br>';
        continue;
      }
      const inner = sanitizeInline(node);
      if (KEEP_TAGS.has(tag) && inner.trim() !== '') {
        const name = tag.toLowerCase();
        const href = tag === 'A' ? node.getAttribute('href') : null;
        const attr = href ? ` href="${href.replace(/"/g, '&quot;')}"` : '';
        out += `<${name}${attr}>${inner}</${name}>`;
      } else {
        out += inner;
      }
    }
  }
  return tidyHtml(out);
}

export function tidyHtml(html: string): string {
  return collapseWhitespace(html)
    .replace(/\s*<br>\s*/g, '<br>')
    .replace(/^(<br>)+|(<br>)+$/g, '')
    .trim();
}

export function stripTags(html: string): string {
  return html
    .replace(/<br>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function onlyInlineDescendants(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (!INLINE_TAGS.has(tagOf(child))) return false;
    if (!onlyInlineDescendants(child)) return false;
  }
  return true;
}

/** Anchor on stable ids (Elementor data-id or id attribute) so a shifted sibling does not break pairing. */
function anchorOf(el: Element): string | null {
  const dataId = el.getAttribute('data-id');
  if (dataId) return `d:${dataId}`;
  const id = el.getAttribute('id');
  if (id) return `i:${id}`;
  return null;
}

/**
 * Site-wide chrome: the theme header, footer, menus and cookie banner. A <header>
 * or <footer> inside the page content (post cards, article headers) is not global.
 */
function isGlobalElement(el: Element, tag: string): boolean {
  if (el.matches(GLOBAL_SELECTOR)) return true;
  if (tag !== 'HEADER' && tag !== 'FOOTER' && tag !== 'NAV') return false;
  return el.parentElement?.closest('main, article') == null;
}

interface WalkState {
  blocks: RawBlock[];
  seen: Map<string, number>;
}

function push(state: WalkState, path: string, tag: string, kind: BlockKind, region: Region, html: string): void {
  if (!hasLetters(stripTags(html))) return;
  const n = state.seen.get(path) ?? 0;
  state.seen.set(path, n + 1);
  state.blocks.push({ key: `${path}~${n}`, tag: tag.toLowerCase(), kind, region, html });
}

function walk(el: Element, path: string, region: Region, state: WalkState): void {
  const tag = tagOf(el);
  if (SKIP_TAGS.has(tag)) return;
  if (region === 'content' && tag !== 'BODY' && isGlobalElement(el, tag)) region = 'global';
  const anchor = anchorOf(el);
  if (anchor) path = anchor;

  if (tag === 'IMG') {
    const alt = el.getAttribute('alt');
    if (alt) push(state, `${path}@alt`, tag, 'attr', region, escapeHtml(collapseWhitespace(alt).trim()));
    return;
  }
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'hidden') return;
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) push(state, `${path}@placeholder`, tag, 'attr', region, escapeHtml(placeholder.trim()));
    const value = el.getAttribute('value');
    if (value && (type === 'submit' || type === 'button')) {
      push(state, `${path}@value`, tag, 'attr', region, escapeHtml(value.trim()));
    }
    return;
  }

  const directText = Array.from(el.childNodes).filter(
    (n) => isText(n) && hasLetters(n.textContent ?? ''),
  );

  if (onlyInlineDescendants(el) && hasLetters(el.textContent ?? '')) {
    // A wrapper around one single element is skipped so that "<li><a>Link</a></li>" gives "Link".
    const isWrapper = directText.length === 0 && el.children.length === 1;
    if (!isWrapper) {
      push(state, path, tag, 'text', region, sanitizeInline(el));
      return;
    }
  }

  let textIndex = 0;
  let childIndex = 0;
  for (const node of Array.from(el.childNodes)) {
    if (isText(node)) {
      const text = node.textContent ?? '';
      if (hasLetters(text)) {
        push(state, `${path}#${textIndex}`, tag, 'text', region, escapeHtml(collapseWhitespace(text).trim()));
      }
      textIndex++;
    } else if (isElement(node)) {
      walk(node, `${path}/${childIndex}`, region, state);
      childIndex++;
    }
  }
}

function metaContent(doc: Document, selector: string): string {
  const el = doc.querySelector(selector);
  return collapseWhitespace(el?.getAttribute('content') ?? '').trim();
}

/** Extract every translatable text block from a parsed page. */
export function extractBlocks(doc: Document): RawBlock[] {
  const state: WalkState = { blocks: [], seen: new Map() };

  const title = collapseWhitespace(doc.querySelector('title')?.textContent ?? '').trim();
  if (title) push(state, 'meta:title', 'title', 'meta', 'content', escapeHtml(title));
  const description =
    metaContent(doc, 'meta[name="description"]') || metaContent(doc, 'meta[property="og:description"]');
  if (description) push(state, 'meta:description', 'meta', 'meta', 'content', escapeHtml(description));

  if (doc.body) walk(doc.body, 'body', 'content', state);
  return state.blocks;
}

/** URL of the alternate language version, taken from the hreflang link tags. */
export function findAlternateUrl(doc: Document, langPrefix: string): string | null {
  const links = Array.from(doc.querySelectorAll('link[rel="alternate"][hreflang]'));
  const hit = links.find((l) => (l.getAttribute('hreflang') ?? '').toLowerCase().startsWith(langPrefix));
  return hit?.getAttribute('href') ?? null;
}

/**
 * English URLs to try for a Faroese page, best guess first. The hreflang link is
 * usually right, but TranslatePress writes a broken one for some slugs, so the
 * plain "/en/" + path form is the fallback.
 */
export function englishUrlCandidates(site: string, urlFo: string, hreflang: string | null): string[] {
  const root = site.replace(/\/+$/, '');
  const rel = urlFo.startsWith(root) ? urlFo.slice(root.length) : '';
  const built = `${root}/en${rel.startsWith('/') ? rel : `/${rel}`}`;
  return Array.from(new Set([hreflang, built].filter((u): u is string => !!u)));
}

function anchorOfKey(key: string): string {
  return key.replace(/[/#@~].*$/, '');
}

function groupByAnchor(blocks: RawBlock[]): Map<string, RawBlock[]> {
  const groups = new Map<string, RawBlock[]>();
  for (const block of blocks) {
    const anchor = anchorOfKey(block.key);
    groups.set(anchor, [...(groups.get(anchor) ?? []), block]);
  }
  return groups;
}

/**
 * Second chance for blocks whose exact position differs between the languages
 * (TranslatePress sometimes changes the markup inside a widget). Within one
 * anchored widget, leftovers are paired in order when both sides have the same number.
 */
function fallbackPairs(fo: RawBlock[], en: RawBlock[], enByKey: Map<string, RawBlock>): Map<string, RawBlock> {
  const foKeys = new Set(fo.map((b) => b.key));
  const missing = groupByAnchor(fo.filter((b) => !enByKey.has(b.key)));
  const spare = groupByAnchor(en.filter((b) => !foKeys.has(b.key)));
  const pairs = new Map<string, RawBlock>();
  for (const [anchor, foBlocks] of missing) {
    const enBlocks = spare.get(anchor);
    if (!enBlocks || enBlocks.length !== foBlocks.length) continue;
    foBlocks.forEach((block, i) => pairs.set(block.key, enBlocks[i]));
  }
  return pairs;
}

/**
 * Pair Faroese and English blocks by structural key, then drop duplicates.
 * A block with no English counterpart keeps the Faroese text as its English value.
 */
export function pairBlocks(pageId: string, fo: RawBlock[], en: RawBlock[]): PairedPage {
  const enByKey = new Map(en.map((b) => [b.key, b]));
  const fallback = fallbackPairs(fo, en, enByKey);
  const result: PairedPage = { content: [], global: [], unmatched: 0, unmatchedTexts: [] };
  const seen = new Set<string>();

  for (const block of fo) {
    const match = enByKey.get(block.key) ?? fallback.get(block.key);
    if (!match) {
      result.unmatched++;
      result.unmatchedTexts.push(block.html);
    }
    const enHtml = match ? match.html : block.html;
    const dedupeKey = `${block.region}|${block.kind}|${block.html}|${enHtml}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const owner = block.region === 'global' ? GLOBAL_PAGE_ID : pageId;
    const paired: Block = {
      id: hashId(`${owner}|${block.kind}|${block.html}`),
      kind: block.kind,
      tag: block.tag,
      fo: block.html,
      en: enHtml,
    };
    (block.region === 'global' ? result.global : result.content).push(paired);
  }
  return result;
}

/** Make block ids unique within a page (same Faroese text with different English). */
export function uniquifyIds(blocks: Block[]): Block[] {
  const counts = new Map<string, number>();
  return blocks.map((b) => {
    const n = counts.get(b.id) ?? 0;
    counts.set(b.id, n + 1);
    return n === 0 ? b : { ...b, id: `${b.id}-${n}` };
  });
}

export interface ScrapedPage {
  id: string;
  type: string;
  urlFo: string;
  urlEn: string;
  paired: PairedPage;
}

function pageTitle(blocks: Block[], fallback: string): string {
  const meta = blocks.find((b) => b.kind === 'meta' && b.tag === 'title');
  const heading = blocks.find((b) => b.tag === 'h1') ?? blocks.find((b) => b.tag === 'h2');
  const raw = heading?.fo ?? meta?.fo ?? fallback;
  return stripTags(raw).trim() || fallback;
}

/** Combine scraped pages into one dataset; header, footer and menu texts are collected once. */
export function assembleSite(
  site: string,
  scrapedAt: string,
  scraped: ScrapedPage[],
  menuUrls: string[] = [],
): SiteContent {
  const menu = new Set(menuUrls.map(normalizeUrl));
  const globalSeen = new Set<string>();
  const globalBlocks: Block[] = [];
  const pages: PageDoc[] = [];

  for (const page of scraped) {
    for (const block of page.paired.global) {
      const key = `${block.kind}|${block.fo}|${block.en}`;
      if (globalSeen.has(key)) continue;
      globalSeen.add(key);
      globalBlocks.push(block);
    }
    const blocks = uniquifyIds(page.paired.content);
    pages.push({
      id: page.id,
      type: page.type,
      title: pageTitle(blocks, page.id),
      urlFo: page.urlFo,
      urlEn: page.urlEn,
      inMenu: menu.has(normalizeUrl(page.urlFo)),
      blocks,
    });
  }

  const globalPage: PageDoc = {
    id: GLOBAL_PAGE_ID,
    type: 'global',
    title: 'Header, menus, footer, cookie banner',
    urlFo: site,
    urlEn: `${site.replace(/\/+$/, '')}/en/`,
    inMenu: true,
    blocks: uniquifyIds(globalBlocks),
  };
  return { site, scrapedAt, pages: [globalPage, ...pages] };
}

export function normalizeUrl(url: string): string {
  return url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
}

/** Every link target found in the header, menus and footer of a page. */
export function extractMenuUrls(doc: Document): string[] {
  const links = Array.from(doc.querySelectorAll('header a[href], nav a[href], .mobmenu-panel a[href]'));
  const urls = links.map((a) => a.getAttribute('href') ?? '').filter((h) => /^https?:/.test(h));
  return Array.from(new Set(urls.map(normalizeUrl)));
}

/** Page id from its URL path relative to the site root, e.g. "samband" or "burdardygd/samfelagsabyrgd". */
export function pageIdFromUrl(site: string, url: string): string {
  const rel = url.startsWith(site) ? url.slice(site.length) : url;
  const id = rel.replace(/^\/+|\/+$/g, '').replace(/[?#].*$/, '');
  return id === '' ? 'home' : id;
}

/** Archive listings have no text of their own, so they are left out unless asked for. */
export const SKIPPED_TYPES = ['category', 'post_tag', 'author'];

export interface SitemapEntry {
  url: string;
  type: string;
}

export function parseSitemapLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)).map((m) => m[1].replace(/&amp;/g, '&'));
}

/** Post type from a Yoast sub-sitemap URL: ".../page-sitemap.xml" gives "page". */
export function typeFromSitemapUrl(url: string): string {
  const m = url.match(/\/([a-z0-9_-]+?)-sitemap\d*\.xml/i);
  return m ? m[1] : 'page';
}

export function isEnglishUrl(site: string, url: string): boolean {
  return url.startsWith(`${site.replace(/\/+$/, '')}/en/`) || url === `${site.replace(/\/+$/, '')}/en`;
}
