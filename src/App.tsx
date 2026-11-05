import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiJob } from './components/BlockRow';
import { LoginDialog } from './components/LoginDialog';
import { Overview } from './components/Overview';
import { PageView } from './components/PageView';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { WizardBar } from './components/WizardBar';
import {
  applyEdit,
  currentText,
  editKey,
  filterBlocks,
  matchCounts,
  tagLabel,
  type Block,
  type BlockFilter,
  type EditPatch,
  type Edits,
  type NavTab,
  type SiteContent,
} from './model/contentModel';
import { breadcrumbFor, buildNewsNav, buildPagesNav, cleanTitle } from './model/navModel';
import { buildDictionary, changeRows, toCsv } from './model/exportModel';
import { parseSupabaseConfig } from './model/remoteModel';
import {
  firstUnreviewed,
  isReviewed,
  orderedPageIds,
  overviewRows,
  reviewCounts,
  setReviewed,
  stepPage,
  wizardQueue,
  mergeReviews,
  type ChangesFilter,
  type ReviewFilter,
  type Reviews,
} from './model/reviewModel';
import { mergeEdits, parseEdits, serializeEdits } from './model/syncModel';
import { runAi } from './services/ai';
import { downloadText, loadLocalEdits, loadLocalReviews, loadSettings, saveLocalEdits, saveLocalReviews, saveSettings, type Settings } from './services/storage';
import { makeClient } from './services/supabase';
import { useRemoteSync } from './useRemoteSync';

type View = 'edit' | 'wizard' | 'overview';

const VIEWS: { value: View; label: string }[] = [
  { value: 'edit', label: 'Edit' },
  { value: 'wizard', label: 'Wizard' },
  { value: 'overview', label: 'Overview' },
];

const FILTERS: { value: BlockFilter; label: string }[] = [
  { value: 'all', label: 'All texts' },
  { value: 'changed', label: 'Changed' },
  { value: 'approved', label: 'Approved' },
  { value: 'toReplace', label: 'Not yet in WordPress' },
  { value: 'sameBoth', label: 'Same in both languages' },
];

export function App() {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [loadError, setLoadError] = useState('');
  const [edits, setEdits] = useState<Edits>(() => loadLocalEdits());
  const [reviews, setReviews] = useState<Reviews>(() => loadLocalReviews());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [view, setView] = useState<View>('edit');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<NavTab>('pages');
  const [filter, setFilter] = useState<BlockFilter>('all');
  const [query, setQuery] = useState('');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [changesFilter, setChangesFilter] = useState<ChangesFilter>('all');
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(true);
  const [notice, setNotice] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch('./data/content.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`content.json: ${res.status}`);
        return res.json() as Promise<SiteContent>;
      })
      .then(setContent)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
    fetch('./data/config.json', { cache: 'no-cache' })
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        const config = parseSupabaseConfig(text);
        if (config) setClient(makeClient(config));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    saveLocalEdits(edits);
  }, [edits]);
  useEffect(() => {
    saveLocalReviews(reviews);
  }, [reviews]);

  const onMerged = useCallback((remoteEdits: Edits, remoteReviews: Reviews) => {
    setEdits((local) => mergeEdits(remoteEdits, local));
    setReviews((local) => mergeReviews(remoteReviews, local));
  }, []);
  const { status, syncNow, signIn, signOut } = useRemoteSync({ client, edits, reviews, onMerged });

  const userRef = useRef(settings.userName);
  userRef.current = settings.userName;
  const pageRef = useRef<string | null>(null);

  const nav = useMemo(() => (content ? buildPagesNav(content) : null), [content]);
  const news = useMemo(() => (content ? buildNewsNav(content) : []), [content]);
  const ids = useMemo(() => (content ? orderedPageIds(content, tab) : []), [content, tab]);
  const counts = useMemo(() => (content ? reviewCounts(ids, reviews) : { total: 0, reviewed: 0, left: 0 }), [content, ids, reviews]);

  const pageId =
    selectedId && ids.includes(selectedId) ? selectedId : view === 'wizard' ? firstUnreviewed(ids, reviews) ?? ids[0] ?? null : ids[0] ?? null;
  const page = useMemo(() => content?.pages.find((p) => p.id === pageId) ?? null, [content, pageId]);
  pageRef.current = page?.id ?? null;

  const narrowed = filter !== 'all' || query.trim() !== '';
  const textCounts = useMemo(
    () => (content && narrowed ? matchCounts(content, edits, filter, query) : null),
    [content, edits, filter, query, narrowed],
  );
  const blocks = useMemo(() => (page ? filterBlocks(page, edits, filter, query) : []), [page, edits, filter, query]);
  const contentBlocks = blocks.filter((b) => b.kind !== 'meta');
  const seoBlocks = blocks.filter((b) => b.kind === 'meta');

  const queue = useMemo(() => wizardQueue(ids, reviews, onlyUnreviewed, pageId), [ids, reviews, onlyUnreviewed, pageId]);
  const prevId = stepPage(queue, pageId, -1);
  const nextId = stepPage(queue, pageId, 1);

  const rows = useMemo(
    () => (content && view === 'overview' ? overviewRows(content, edits, reviews, { tab, review: reviewFilter, changes: changesFilter }) : []),
    [content, view, edits, reviews, tab, reviewFilter, changesFilter],
  );
  const openPages = useMemo(
    () => (content && view === 'overview' ? overviewRows(content, edits, reviews, { tab, review: reviewFilter, changes: 'open' }).length : 0),
    [content, view, edits, reviews, tab, reviewFilter],
  );

  // Pin a fallback page so it does not jump away when review state changes.
  useEffect(() => {
    if (pageId && selectedId !== pageId) setSelectedId(pageId);
  }, [pageId, selectedId]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [page?.id, view]);

  const toggleReviewed = useCallback((id: string, value: boolean) => {
    setReviews((current) => setReviewed(current, id, value, userRef.current || 'unknown', new Date().toISOString()));
  }, []);

  const onPatch = useCallback((block: Block, patch: EditPatch) => {
    const id = pageRef.current;
    if (!id) return;
    setEdits((current) => applyEdit(current, block, editKey(id, block.id), patch, userRef.current || 'unknown', new Date().toISOString()));
  }, []);

  const editsRef = useRef(edits);
  editsRef.current = edits;
  const pageDocRef = useRef(page);
  pageDocRef.current = page;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const onAi = useCallback((block: Block, job: AiJob): Promise<string> => {
    const current = pageDocRef.current;
    const edit = current ? editsRef.current[editKey(current.id, block.id)] : undefined;
    return runAi(settingsRef.current.aiKey, {
      action: job.action,
      lang: job.lang,
      instruction: job.instruction,
      fo: currentText(block, edit, 'fo'),
      en: currentText(block, edit, 'en'),
      pageTitle: current?.title ?? '',
      blockLabel: tagLabel(block),
      model: settingsRef.current.aiModel,
    });
  }, []);

  const flash = (text: string): void => {
    setNotice(text);
    setTimeout(() => setNotice(''), 4000);
  };

  const exportCsv = (): void => {
    if (!content) return;
    const changed = changeRows(content, edits);
    if (changed.length === 0) return flash('Nothing has been changed yet.');
    downloadText('mest-text-changes.csv', `﻿${toCsv(changed)}`, 'text/csv');
  };
  const exportDictionary = (): void => {
    if (!content) return;
    const dictionary = buildDictionary(content, edits);
    if (dictionary.entries.length + dictionary.conflicts.length === 0) return flash('Nothing has been changed yet.');
    downloadText('mest-translatepress-dictionary.json', JSON.stringify(dictionary, null, 1), 'application/json');
    if (dictionary.conflicts.length > 0) {
      flash(`${dictionary.conflicts.length} Faroese text(s) have different English versions on different pages. See "conflicts" in the file.`);
    }
  };
  const exportEdits = (): void => downloadText('mest-edits.json', serializeEdits(edits, new Date().toISOString()), 'application/json');
  const importEdits = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const incoming = parseEdits(await file.text());
    const count = Object.keys(incoming).length;
    if (count === 0) return flash('That file has no edits in it.');
    setEdits((local) => mergeEdits(local, incoming));
    flash(`Imported ${count} edits. The newest version of each text was kept.`);
  };

  const openPage = (id: string): void => {
    setSelectedId(id);
    setView('edit');
  };

  if (loadError) return <p className="state">Could not load the site texts ({loadError}).</p>;
  if (!content || !nav) return <p className="state">Loading texts…</p>;

  const syncLabel: Record<typeof status.state, string> = {
    off: 'Saved in this browser only',
    signedOut: 'Sign in to save online',
    idle: 'Connecting…',
    syncing: 'Saving…',
    saved: status.lastSync ? `Saved online ${new Date(status.lastSync).toLocaleTimeString()}` : 'Saved online',
    error: 'Could not save online',
  };
  const onSyncButton = (): void => {
    if (status.state === 'off') return flash('No online database is set up yet. Edits are kept in this browser.');
    setShowLogin(true);
  };

  const pageTitle = page ? cleanTitle(page.title) : '';
  const crumbs = page && tab === 'pages' ? breadcrumbFor(nav, page.id) : [];
  const pageBody = page && (
    <PageView
      key={page.id}
      page={page}
      title={pageTitle}
      crumbs={crumbs}
      edits={edits}
      contentBlocks={contentBlocks}
      seoBlocks={seoBlocks}
      narrowed={narrowed}
      aiEnabled={settings.aiKey !== ''}
      reviewed={isReviewed(reviews, page.id)}
      onToggleReviewed={() => toggleReviewed(page.id, !isReviewed(reviews, page.id))}
      onPatch={onPatch}
      onAi={onAi}
    />
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>MEST</strong> text editor
        </div>
        <div className="seg views" role="tablist" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" role="tab" aria-selected={view === v.value} className={view === v.value ? 'is-active' : ''} onClick={() => setView(v.value)}>
              {v.label}
            </button>
          ))}
        </div>
        {view !== 'overview' && (
          <>
            <input type="search" className="search" placeholder="Search all texts" aria-label="Search all texts" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Filter texts" value={filter} onChange={(e) => setFilter(e.target.value as BlockFilter)}>
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </>
        )}
        <details className="menu">
          <summary>Export</summary>
          <div className="menu-items">
            <button type="button" onClick={exportCsv}>Change list (CSV for Excel)</button>
            <button type="button" onClick={exportDictionary}>TranslatePress dictionary (JSON)</button>
            <button type="button" onClick={exportEdits}>Backup of all edits (JSON)</button>
            <button type="button" onClick={() => importRef.current?.click()}>Import edits…</button>
          </div>
        </details>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void importEdits(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" className={`sync sync-${status.state}`} title={status.message || status.email || ''} onClick={onSyncButton}>
          {syncLabel[status.state]}
        </button>
        <button type="button" onClick={() => setShowSettings(true)}>Settings</button>
      </header>

      {notice && <div className="notice" role="status">{notice}</div>}
      {status.state === 'error' && <div className="notice is-error" role="alert">{status.message}. Your edits are still safe in this browser.</div>}
      {!settings.userName && (
        <div className="notice">
          Add your name in <button type="button" className="link" onClick={() => setShowSettings(true)}>Settings</button> so others can see who changed what.
        </div>
      )}

      {view === 'edit' && (
        <div className="layout">
          <Sidebar
            tab={tab}
            onTab={setTab}
            nav={nav}
            news={news}
            counts={textCounts}
            reviews={reviews}
            reviewFilter={reviewFilter}
            onReviewFilter={setReviewFilter}
            reviewCounts={counts}
            selectedId={page?.id ?? null}
            onSelect={setSelectedId}
          />
          <main className="main" ref={mainRef}>
            {pageBody || <p className="state">No pages match.</p>}
          </main>
        </div>
      )}

      {view === 'wizard' && (
        <div className="layout is-single">
          <main className="main" ref={mainRef}>
            <WizardBar
              tab={tab}
              onTab={setTab}
              counts={counts}
              onlyUnreviewed={onlyUnreviewed}
              onOnlyUnreviewed={setOnlyUnreviewed}
              position={Math.max(1, queue.indexOf(pageId ?? '') + 1)}
              queueLength={queue.length}
              hasPrev={prevId !== null}
              hasNext={nextId !== null}
              onPrev={() => prevId && setSelectedId(prevId)}
              onNext={() => nextId && setSelectedId(nextId)}
            />
            {pageBody || <p className="state">No pages to review.</p>}
          </main>
        </div>
      )}

      {view === 'overview' && (
        <div className="layout is-single">
          <main className="main" ref={mainRef}>
            <Overview
              tab={tab}
              onTab={setTab}
              review={reviewFilter}
              onReview={setReviewFilter}
              changes={changesFilter}
              onChanges={setChangesFilter}
              counts={counts}
              rows={rows}
              openPages={openPages}
              onOpen={openPage}
              onToggleReviewed={toggleReviewed}
            />
          </main>
        </div>
      )}

      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(next) => {
            setSettings(next);
            saveSettings(next);
            setShowSettings(false);
          }}
        />
      )}
      {showLogin && <LoginDialog email={status.email} onSignIn={signIn} onSignOut={signOut} onSyncNow={syncNow} onClose={() => setShowLogin(false)} />}
    </div>
  );
}
