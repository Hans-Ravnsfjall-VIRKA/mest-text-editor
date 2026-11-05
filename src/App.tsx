import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockRow, type AiJob } from './components/BlockRow';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import {
  applyEdit,
  currentText,
  editKey,
  filterBlocks,
  listPages,
  siteProgress,
  tagLabel,
  type Block,
  type BlockFilter,
  type EditPatch,
  type Edits,
  type PageGroup,
  type SiteContent,
} from './model/contentModel';
import { buildDictionary, changeRows, toCsv } from './model/exportModel';
import { detectRepoFromLocation, mergeEdits, parseEdits, serializeEdits } from './model/syncModel';
import { runAi } from './services/ai';
import type { GitHubConfig } from './services/github';
import { downloadText, loadLocalEdits, loadSettings, saveLocalEdits, saveSettings, type Settings } from './services/storage';
import { useSync } from './useSync';

const FILTERS: { value: BlockFilter; label: string }[] = [
  { value: 'all', label: 'All texts' },
  { value: 'changed', label: 'Changed' },
  { value: 'approved', label: 'Approved' },
  { value: 'toReplace', label: 'Not yet in WordPress' },
  { value: 'sameBoth', label: 'Same in both languages' },
];

const PAGE_SIZE = 150;

export function App() {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [loadError, setLoadError] = useState('');
  const [edits, setEdits] = useState<Edits>(() => loadLocalEdits());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [group, setGroup] = useState<PageGroup>('menu');
  const [filter, setFilter] = useState<BlockFilter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [notice, setNotice] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('./data/content.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`content.json: ${res.status}`);
        return res.json() as Promise<SiteContent>;
      })
      .then(setContent)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => saveLocalEdits(edits), [edits]);

  const detected = useMemo(() => detectRepoFromLocation(window.location.hostname, window.location.pathname), []);
  const ghConfig = useMemo<GitHubConfig | null>(() => {
    const owner = settings.ghOwner || detected?.owner || '';
    const repo = settings.ghRepo || detected?.repo || '';
    if (!settings.ghToken || !owner || !repo) return null;
    return { owner, repo, branch: settings.ghBranch || 'edits', token: settings.ghToken };
  }, [settings, detected]);

  const onMerged = useCallback((merged: Edits) => setEdits((local) => mergeEdits(merged, local)), []);
  const { status, syncNow } = useSync({ config: ghConfig, edits, userName: settings.userName, onMerged });

  const userRef = useRef(settings.userName);
  userRef.current = settings.userName;
  const pageRef = useRef<string | null>(null);

  const items = useMemo(
    () => (content ? listPages(content, edits, group, filter, query) : []),
    [content, edits, group, filter, query],
  );
  const page = useMemo(() => {
    if (!content) return null;
    return content.pages.find((p) => p.id === selectedId) ?? items[0]?.page ?? null;
  }, [content, selectedId, items]);
  pageRef.current = page?.id ?? null;

  const blocks = useMemo(() => (page ? filterBlocks(page, edits, filter, query) : []), [page, edits, filter, query]);
  const total = useMemo(() => (content ? siteProgress(content, edits) : null), [content, edits]);

  useEffect(() => setLimit(PAGE_SIZE), [page?.id, filter, query]);

  const onPatch = useCallback((block: Block, patch: EditPatch) => {
    const pageId = pageRef.current;
    if (!pageId) return;
    setEdits((current) =>
      applyEdit(current, block, editKey(pageId, block.id), patch, userRef.current || 'unknown', new Date().toISOString()),
    );
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
    const rows = changeRows(content, edits);
    if (rows.length === 0) return flash('Nothing has been changed yet.');
    downloadText('mest-text-changes.csv', `﻿${toCsv(rows)}`, 'text/csv');
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

  if (loadError) return <p className="state">Could not load the site texts ({loadError}).</p>;
  if (!content) return <p className="state">Loading texts…</p>;

  const narrowed = filter !== 'all' || query.trim() !== '';
  const syncLabel: Record<typeof status.state, string> = {
    off: 'Saved in this browser only',
    idle: 'Connecting…',
    syncing: 'Saving…',
    saved: status.lastSync ? `Saved ${new Date(status.lastSync).toLocaleTimeString()}` : 'Saved',
    error: 'Could not save to GitHub',
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>MEST</strong> text editor
          {total && (
            <span className="totals">
              {total.changed} changed, {total.approved} approved, {total.toReplace} to put in WordPress
            </span>
          )}
        </div>
        <input
          type="search"
          className="search"
          placeholder="Search all texts"
          aria-label="Search all texts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Filter texts" value={filter} onChange={(e) => setFilter(e.target.value as BlockFilter)}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
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
        <button
          type="button"
          className={`sync sync-${status.state}`}
          title={status.message || 'Sync now'}
          onClick={status.state === 'off' ? () => setShowSettings(true) : syncNow}
        >
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

      <div className="layout">
        <Sidebar
          items={items}
          selectedId={page?.id ?? null}
          group={group}
          narrowed={narrowed}
          onGroup={setGroup}
          onSelect={setSelectedId}
        />
        <main className="main">
          {page ? (
            <>
              <div className="page-head">
                <h1>{page.title}</h1>
                <p>
                  <a href={page.urlFo} target="_blank" rel="noreferrer">Faroese page</a>
                  <a href={page.urlEn} target="_blank" rel="noreferrer">English page</a>
                  <span>{blocks.length} of {page.blocks.length} texts</span>
                </p>
              </div>
              <div className="columns-head" aria-hidden="true">
                <span>Føroyskt</span>
                <span>English</span>
              </div>
              {blocks.slice(0, limit).map((block) => (
                <BlockRow
                  key={`${page.id}/${block.id}`}
                  block={block}
                  edit={edits[editKey(page.id, block.id)]}
                  aiEnabled={settings.aiKey !== ''}
                  onPatch={onPatch}
                  onAi={onAi}
                />
              ))}
              {blocks.length > limit && (
                <button type="button" className="more" onClick={() => setLimit(limit + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, blocks.length - limit)} more
                </button>
              )}
              {blocks.length === 0 && <p className="state">No texts match on this page.</p>}
            </>
          ) : (
            <p className="state">No pages match.</p>
          )}
        </main>
      </div>

      {showSettings && (
        <SettingsDialog
          settings={settings}
          detectedRepo={detected ? `${detected.owner}/${detected.repo}` : ''}
          onClose={() => setShowSettings(false)}
          onSave={(next) => {
            setSettings(next);
            saveSettings(next);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
