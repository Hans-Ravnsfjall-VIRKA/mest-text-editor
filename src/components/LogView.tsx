import { useMemo, useState } from 'react';
import { describeEntry, filterLog, peopleIn, shorten, type LogEntry, type LogFilter, type LogKind } from '../model/logModel';
import { sanitizeRichHtml } from '../model/richTextModel';

interface Props {
  entries: LogEntry[];
  loading: boolean;
  error: string;
  /** More history exists on the server than is loaded. */
  canLoadMore: boolean;
  onLoadMore: () => void;
  onOpen: (pageId: string) => void;
  signedIn: boolean;
}

const KIND_OPTIONS: { value: 'all' | LogKind; label: string }[] = [
  { value: 'all', label: 'All changes' },
  { value: 'text', label: 'Text changes' },
  { value: 'revert', label: 'Reverts' },
  { value: 'approved', label: 'Approvals' },
  { value: 'inWordPress', label: 'In WordPress' },
  { value: 'reviewed', label: 'Page reviews' },
];

function when(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LogView({ entries, loading, error, canLoadMore, onLoadMore, onOpen, signedIn }: Props) {
  const [filter, setFilter] = useState<LogFilter>({ by: 'all', kind: 'all', query: '' });
  const people = useMemo(() => peopleIn(entries), [entries]);
  const shown = useMemo(() => filterLog(entries, filter), [entries, filter]);

  return (
    <div className="log">
      <div className="overview-bar">
        <select aria-label="Person" value={filter.by} onChange={(e) => setFilter({ ...filter, by: e.target.value })}>
          <option value="all">Everyone</option>
          {people.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select aria-label="Kind of change" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value as LogFilter['kind'] })}>
          {KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <input type="search" className="search" placeholder="Search page or text" aria-label="Search the log" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
      </div>
      <p className="hint overview-note">
        {signedIn ? 'Everyone\'s changes, newest first. The log cannot be edited.' : 'Changes made in this browser. They are added to the shared log when you sign in.'} Showing {shown.length} of {entries.length}.
      </p>
      {error && <p className="notice is-error" role="alert">{error}</p>}
      {loading && entries.length === 0 && <p className="state">Loading the log…</p>}
      {!loading && shown.length === 0 && <p className="state">No changes match.</p>}
      <ul className="overview-list">
        {shown.map((e) => (
          <li key={e.id} className="log-row">
            <div className="log-meta">
              <span className="log-when">{when(e.at)}</span>
              <span className="log-by" title={e.byEmail}>{e.by}</span>
            </div>
            <div className="log-main">
              <p className="log-what">
                {describeEntry(e)} on <button type="button" className="link" onClick={() => onOpen(e.pageId)}>{e.pageTitle || e.pageId}</button>
              </p>
              {(e.kind === 'text' || e.kind === 'revert') && (
                <details className="log-detail">
                  <summary>{shorten(e.to, 100) || '(empty)'}</summary>
                  <p className="log-from">Before</p>
                  <div className="original" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(e.from) || '(empty)' }} />
                  <p className="log-from">After</p>
                  <div className="original" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(e.to) || '(empty)' }} />
                </details>
              )}
            </div>
          </li>
        ))}
      </ul>
      {canLoadMore && (
        <button type="button" className="more" onClick={onLoadMore} disabled={loading}>
          {loading ? 'Loading…' : 'Show older changes'}
        </button>
      )}
    </div>
  );
}
