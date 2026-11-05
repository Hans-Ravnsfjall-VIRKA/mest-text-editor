// In-browser scraper. Build with `npm run build:console-scraper`, then paste
// scripts/console-scraper.js into the DevTools console on https://mest-fo.com/mest/.
// It crawls the Yoast sitemap, pairs Faroese and English texts and downloads content.json.
// Use this when the site blocks requests from scripts (the Node scraper needs direct access).

import {
  assembleSite,
  datesFromRest,
  extractMenu,
  englishUrlCandidates,
  extractBlocks,
  extractMenuUrls,
  findAlternateUrl,
  isEnglishUrl,
  pageIdFromUrl,
  pairBlocks,
  parseSitemapLocs,
  SKIPPED_TYPES,
  typeFromSitemapUrl,
  type ScrapedPage,
  type SitemapEntry,
} from '../src/scrape/extractModel';

interface ScrapeState {
  done: number;
  total: number;
  errors: string[];
  unmatched: Record<string, string[]>;
  finished: boolean;
  result: unknown;
}

declare global {
  interface Window {
    __mestScrape?: ScrapeState;
    __mestScrapeOptions?: { types?: string[]; limit?: number; download?: boolean };
  }
}

const SITE = 'https://mest-fo.com/mest';

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function getFirst(urls: string[]): Promise<{ url: string; html: string }> {
  let lastError: unknown = new Error('No English URL');
  for (const url of urls) {
    try {
      return { url, html: await getText(url) };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

async function listUrls(types: string[] | undefined): Promise<SitemapEntry[]> {
  const index = parseSitemapLocs(await getText(`${SITE}/sitemap_index.xml`));
  const entries: SitemapEntry[] = [];
  for (const sitemapUrl of index) {
    const type = typeFromSitemapUrl(sitemapUrl);
    if (types ? !types.includes(type) : SKIPPED_TYPES.includes(type)) continue;
    for (const url of parseSitemapLocs(await getText(sitemapUrl))) {
      if (!isEnglishUrl(SITE, url) && !/\.(jpe?g|png|webp|gif|pdf)$/i.test(url)) entries.push({ url, type });
    }
  }
  const seen = new Set<string>();
  return entries.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
}

interface Shared {
  menuUrls: Set<string>;
  menu: ReturnType<typeof extractMenu>;
}

async function fetchDates(): Promise<Record<string, string>> {
  const dates: Record<string, string> = {};
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${SITE}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=link,date`, { credentials: 'omit' });
    if (!res.ok) break;
    const batch: unknown = await res.json();
    Object.assign(dates, datesFromRest(batch));
    if (!Array.isArray(batch) || batch.length < 100) break;
  }
  return dates;
}

async function scrapeOne(entry: SitemapEntry, state: ScrapeState, shared: Shared): Promise<ScrapedPage | null> {
  try {
    const foDoc = parse(await getText(entry.url));
    for (const url of extractMenuUrls(foDoc)) shared.menuUrls.add(url);
    if (shared.menu.length === 0) shared.menu = extractMenu(foDoc);
    const { url: urlEn, html: enHtml } = await getFirst(
      englishUrlCandidates(SITE, entry.url, findAlternateUrl(foDoc, 'en')),
    );
    const enDoc = parse(enHtml);
    const id = pageIdFromUrl(SITE, entry.url);
    const paired = pairBlocks(id, extractBlocks(foDoc), extractBlocks(enDoc));
    if (paired.unmatched > 0) state.unmatched[id] = paired.unmatchedTexts;
    return { id, type: entry.type, urlFo: entry.url, urlEn, paired };
  } catch (err) {
    state.errors.push(`${entry.url}: ${String(err)}`);
    return null;
  } finally {
    state.done++;
  }
}

async function run(): Promise<void> {
  const options = window.__mestScrapeOptions ?? {};
  const state: ScrapeState = { done: 0, total: 0, errors: [], unmatched: {}, finished: false, result: null };
  window.__mestScrape = state;

  let entries = await listUrls(options.types);
  if (options.limit) entries = entries.slice(0, options.limit);
  state.total = entries.length;

  const results: (ScrapedPage | null)[] = new Array(entries.length).fill(null);
  const shared: Shared = { menuUrls: new Set<string>(), menu: [] };
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < entries.length) {
      const i = next++;
      results[i] = await scrapeOne(entries[i], state, shared);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  const scraped = results.filter((r): r is ScrapedPage => r !== null);
  const content = assembleSite(SITE, new Date().toISOString(), scraped, Array.from(shared.menuUrls), {
    menu: shared.menu,
    dates: await fetchDates().catch(() => ({})),
  });
  state.result = content;
  state.finished = true;

  if (options.download !== false) {
    const blob = new Blob([JSON.stringify(content)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'content.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  console.log(`Scraped ${scraped.length} pages, ${state.errors.length} errors.`);
}

void run();
