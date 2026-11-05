import type { NavTab } from '../model/contentModel';
import type { ChangesFilter, OverviewRow, ReviewCounts, ReviewFilter } from '../model/reviewModel';
import { ReviewFilterControl } from './ReviewFilterControl';

interface Props {
  tab: NavTab;
  onTab: (tab: NavTab) => void;
  review: ReviewFilter;
  onReview: (value: ReviewFilter) => void;
  changes: ChangesFilter;
  onChanges: (value: ChangesFilter) => void;
  counts: ReviewCounts;
  rows: OverviewRow[];
  openPages: number;
  onOpen: (pageId: string) => void;
  onToggleReviewed: (pageId: string, reviewed: boolean) => void;
}

export function Overview({ tab, onTab, review, onReview, changes, onChanges, counts, rows, openPages, onOpen, onToggleReviewed }: Props) {
  return (
    <div className="overview">
      <div className="overview-bar">
        <div className="seg" role="tablist" aria-label="Pages or news">
          <button type="button" role="tab" aria-selected={tab === 'pages'} className={tab === 'pages' ? 'is-active' : ''} onClick={() => onTab('pages')}>Pages</button>
          <button type="button" role="tab" aria-selected={tab === 'news'} className={tab === 'news' ? 'is-active' : ''} onClick={() => onTab('news')}>News</button>
        </div>
        <ReviewFilterControl value={review} counts={counts} onChange={onReview} />
        <div className="seg" role="group" aria-label="Changes">
          <button type="button" aria-pressed={changes === 'all'} className={changes === 'all' ? 'is-active' : ''} onClick={() => onChanges('all')}>All</button>
          <button type="button" aria-pressed={changes === 'open'} className={changes === 'open' ? 'is-active' : ''} onClick={() => onChanges('open')}>
            Open changes <span className="seg-n">{openPages}</span>
          </button>
        </div>
      </div>
      <p className="hint overview-note">Open changes: texts that were changed and are not yet ticked "In WordPress". Showing {rows.length} {rows.length === 1 ? 'row' : 'rows'}.</p>

      {rows.length === 0 ? (
        <p className="state">Nothing matches these filters.</p>
      ) : (
        <ul className="overview-list">
          {rows.map((row) => (
            <li key={row.pageId} className={`overview-row${row.reviewed ? ' is-reviewed' : ''}`}>
              <div className="overview-main">
                <button type="button" className="link overview-title" onClick={() => onOpen(row.pageId)}>{row.title}</button>
                {row.where && <span className="overview-where">{row.where}</span>}
              </div>
              <div className="overview-status">
                {row.open > 0 ? (
                  <span className="chip chip-open">{row.open} to put in WordPress</span>
                ) : row.changed > 0 ? (
                  <span className="chip chip-done">{row.changed} changed, all in WordPress</span>
                ) : (
                  <span className="chip">No changes</span>
                )}
                <span className={`chip ${row.reviewed ? 'chip-done' : 'chip-todo'}`}>{row.reviewed ? 'Reviewed' : 'Not reviewed'}</span>
              </div>
              <div className="overview-links">
                <a href={row.urlFo} target="_blank" rel="noreferrer">Faroese original</a>
                <a href={row.urlEn} target="_blank" rel="noreferrer">English original</a>
              </div>
              <div className="overview-actions">
                <button type="button" onClick={() => onOpen(row.pageId)}>Open</button>
                <button type="button" onClick={() => onToggleReviewed(row.pageId, !row.reviewed)}>
                  {row.reviewed ? 'Mark as not reviewed' : 'Mark as reviewed'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
