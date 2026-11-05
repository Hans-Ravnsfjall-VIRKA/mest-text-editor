// Node scraper: crawls the Yoast sitemap of the MEST site, pairs Faroese and
// English texts and writes public/data/content.json.
//
//   npm run scrape
//   npm run scrape -- --types=page,post --limit=20 --out=public/data/content.json
//
// If the server refuses script requests, use the console scraper instead (see README).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseHTML } from 'linkedom';
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

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const SITE = (arg('site') ?? 'https://mest-fo.com/mest').replace(/\/+$/, '');
const OUT = arg('out') ?? 'public/data/content.json';
const TYPES = arg('types')?.split(',');
const LIMIT = Number(arg('limit') ?? 0);
const CONCURRENCY = Number(arg('concurrency') ?? 4);

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mest-text-editor scraper)', Accept: 'text/html,application/xml' },
  });
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
  return parseHTML(html).document as unknown as Document;
}

async function listUrls(): Promise<SitemapEntry[]> {
  const index = parseSitemapLocs(await getText(`${SITE}/sitemap_index.xml`));
  const entries: SitemapEntry[] = [];
  for (const sitemapUrl of index) {
    const type = typeFromSitemapUrl(sitemapUrl);
    if (TYPES ? !TYPES.includes(type) : SKIPPED_TYPES.includes(type)) continue;
    for (const url of parseSitemapLocs(await getText(sitemapUrl))) {
      if (!isEnglishUrl(SITE, url) && !/\.(jpe?g|png|webp|gif|pdf)$/i.test(url)) entries.push({ url, type });
    }
  }
  const seen = new Set<string>();
  return entries.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
}

async function main(): Promise<void> {
  let entries = await listUrls();
  if (LIMIT > 0) entries = entries.slice(0, LIMIT);
  console.log(`Scraping ${entries.length} pages from ${SITE}`);

  const results: (ScrapedPage | null)[] = new Array(entries.length).fill(null);
  const menuUrls = new Set<string>();
  let menu: ReturnType<typeof extractMenu> = [];
  const errors: string[] = [];
  let unmatched = 0;
  let next = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (next < entries.length) {
      const i = next++;
      const entry = entries[i];
      try {
        const foDoc = parse(await getText(entry.url));
        for (const url of extractMenuUrls(foDoc)) menuUrls.add(url);
        if (menu.length === 0) menu = extractMenu(foDoc);
        const en = await getFirst(englishUrlCandidates(SITE, entry.url, findAlternateUrl(foDoc, 'en')));
        const id = pageIdFromUrl(SITE, entry.url);
        const paired = pairBlocks(id, extractBlocks(foDoc), extractBlocks(parse(en.html)));
        unmatched += paired.unmatched;
        results[i] = { id, type: entry.type, urlFo: entry.url, urlEn: en.url, paired };
      } catch (err) {
        errors.push(`${entry.url}: ${String(err)}`);
      }
      done++;
      if (done % 25 === 0 || done === entries.length) console.log(`  ${done}/${entries.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const scraped = results.filter((r): r is ScrapedPage => r !== null);
  const dates: Record<string, string> = {};
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${SITE}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=link,date`);
    if (!res.ok) break;
    const batch: unknown = await res.json();
    Object.assign(dates, datesFromRest(batch));
    if (!Array.isArray(batch) || batch.length < 100) break;
  }
  const content = assembleSite(SITE, new Date().toISOString(), scraped, Array.from(menuUrls), { menu, dates });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(content));

  const blocks = content.pages.reduce((n, p) => n + p.blocks.length, 0);
  console.log(`Wrote ${OUT}: ${content.pages.length} pages, ${blocks} texts, ${unmatched} without an English match.`);
  if (errors.length > 0) {
    console.log(`${errors.length} pages failed:`);
    for (const e of errors) console.log(`  ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
