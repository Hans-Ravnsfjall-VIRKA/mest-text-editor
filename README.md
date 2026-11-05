# MEST text editor

Internal tool for rewriting the texts on https://mest-fo.com/mest/ in Faroese and English, side by side, before they go back into WordPress (Elementor + TranslatePress).

- `public/data/content.json` holds every text scraped from the site, paired Faroese / English.
- Only pages and news are edited for now. Image alt texts are left as they are; bold, italic and links show formatted, as on the site.
- Navigation follows the website: the Pages tab mirrors the site menu (sections, dropdown groups, then "Other pages"), the News tab lists posts newest first with date (dd-mm-yyyy). Search and the filter switch the sidebar to a flat result list.
- The app is static (Vite + React + TypeScript) and runs on GitHub Pages.
- Edits and reviews are saved in the browser and, once signed in, to Supabase so everyone works on the same text.

## Run locally

```bash
npm install
npm run dev      # editor on http://localhost:5173
npm test         # model tests
npm run build    # production build in dist/
```

## Deploy on GitHub Pages

1. Create a repository and push this folder to `main`.
2. Repository Settings, Pages: set Source to "GitHub Actions".
3. The workflow in `.github/workflows/deploy.yml` tests, builds and publishes on every push to `main`.

A GitHub Pages site is reachable by anyone who has the address, also when the repository itself is private (private Pages needs GitHub Enterprise Cloud). The page is marked `noindex`.

## Shared saving (Supabase)

Edits and page reviews are saved in a Supabase database so everyone sees the same state. Without it the app still works and keeps everything in the browser.

One-time setup:

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Authentication, Providers: keep Email on, turn off "Allow new users to sign up". Add each team member under Authentication, Users (email and password).
4. Put the project URL and the anon (public) key in `public/data/config.json` (Project Settings, API). The anon key is meant to be public: the tables only answer to signed-in users.
5. Commit and push. Pages redeploys.

Each person opens the app and signs in; nothing is shown before that. "Sign out" is in the top bar, and the next sign-in returns that person to the view, page and filters they left on (remembered per account in the browser). Changes are pushed a moment after each edit and pulled every 30 seconds. When two people change the same text or page, the newest change wins. Nothing is deleted: a revert or "not reviewed" is stored as a newer row.

Use Export, "Backup of all edits" and "Import edits" as a safety copy.

## Change log

Every text change, revert, approval, "In WordPress" tick and page review is logged with who did it (name from Settings, account email on hover) and when. Typing is merged: one editing burst is one entry, with the text before and after. The log lives in the `change_log` table, can be added to but not edited or deleted, and is shown in the **Log** view with filters for person, kind of change and text. Entries made before sign-in are kept in the browser and added once you sign in. If you updated from an earlier version, run `supabase/schema.sql` again (it is safe to repeat) to create the table.

## Views

- **Edit**: the sidebar follows the site menu. The Not reviewed / Reviewed filter above it narrows the tree, and a tick marks reviewed pages.
- **Wizard** (the start view): one page at a time with "Fyrru síðu" and "Næstu síðu", a progress bar (reviewed, left), and links to the Faroese and English originals. "Only not reviewed" keeps the round to what is left. Mark a page as reviewed on the page itself.
- **Log**: who changed what and when, newest first.
- **Overview**: every page or news item with its status. Filter on reviewed or not, and on "Open changes" (changed texts not yet ticked "In WordPress"). A reviewed page can be set back to not reviewed here or on the page.

## AI helper

Add an Anthropic API key in Settings to get an "Ask AI" row under each text: translate either way, proofread, shorten or a custom instruction. The suggestion is shown first and only applied when you press "Use this". The key is stored in the browser and sent only to api.anthropic.com.

AI Faroese needs a human read. Check it before approving.

## Workflow

1. **Edit**: the text editor rewrites Faroese and English. Changed fields turn orange, "Original" shows what is on the site now.
2. **Approve**: tick "Approved" when a text is final.
3. **Put into WordPress**: filter on "Not yet in WordPress", open the page links, use "Copy new" and tick "In WordPress" per language when done.

### Getting the text back into WordPress

- **Faroese** is the source language and lives in Elementor. Replace it in the Elementor editor of each page (header and menu texts under Appearance, Menus and the Elementor header templates).
- **English** lives in TranslatePress, which keeps one translation per Faroese string for the whole site. Open the page with the TranslatePress editor ("Translate Page") and paste the new English.
- When a Faroese text changes, TranslatePress sees a new string and the old English translation no longer applies. Always re-enter the English after changing the Faroese, even when the English itself did not change.

Exports to help with this:

- **Change list (CSV)**: every changed text with old and new Faroese and English, per page. Opens in Excel.
- **TranslatePress dictionary (JSON)**: one entry per Faroese string with its English, plus `conflicts` where the same Faroese string was given different English on different pages (TranslatePress can only hold one).

There is no automatic import yet. That needs access to the WordPress database or a small plugin on the site.

## Scraping the site again

The texts are a snapshot. Scrape again when the site has changed. Block ids are built from page and Faroese text, so edits stay attached to texts that did not change on the site.

**Node** (when the server accepts script requests):

```bash
npm run scrape
npm run scrape -- --types=page,post --limit=20
```

**Browser console** (always works):

```bash
npm run build:console-scraper
```

The scrape also captures the site menu and news dates, which drive the navigation.

Open https://mest-fo.com/mest/ in Chrome, open DevTools, Console, paste the content of `scripts/console-scraper.js` and press Enter. After a few minutes `content.json` downloads. Move it to `public/data/content.json`, commit and push. Progress: type `__mestScrape.done` in the console.

What the scraper does:

- Reads the Yoast sitemap (pages, posts, staff, landing pages; category, tag and author archives are skipped).
- Fetches each Faroese page and its English version (`/en/...`).
- Extracts headings, paragraphs, list items, buttons, image alt texts, form placeholders, SEO title and description.
- Pairs Faroese and English by position in the page, anchored on Elementor element ids.
- Collects header, menu, footer and cookie banner texts once, under "Header, menus, footer, cookie banner".

## Code layout

```
src/scrape/extractModel.ts   text extraction and FO/EN pairing (pure, tested)
src/model/contentModel.ts    edits, filters, progress (pure, tested)
src/model/syncModel.ts       merging and the edits file format (pure, tested)
src/model/exportModel.ts     CSV and dictionary exports (pure, tested)
src/model/aiModel.ts         AI prompts and response parsing (pure, tested)
src/services/                GitHub API, Anthropic API, browser storage
src/components/, src/App.tsx UI
scripts/scrape.ts            Node scraper
scripts/browser-scrape.ts    console scraper source
```
