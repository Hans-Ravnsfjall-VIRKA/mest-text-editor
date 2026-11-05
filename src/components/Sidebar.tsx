import { useEffect, useState } from 'react';
import type { NavTab } from '../model/contentModel';
import { sectionIdFor, type NavLeaf, type NewsItem, type PagesNav } from '../model/navModel';
import { isReviewed, matchesReview, type ReviewCounts, type ReviewFilter, type Reviews } from '../model/reviewModel';
import { ReviewFilterControl } from './ReviewFilterControl';

interface Props {
  tab: NavTab;
  onTab: (tab: NavTab) => void;
  nav: PagesNav;
  news: NewsItem[];
  /** Page id to match count, present while a text search or text filter is active. */
  counts: Map<string, number> | null;
  reviews: Reviews;
  reviewFilter: ReviewFilter;
  onReviewFilter: (filter: ReviewFilter) => void;
  reviewCounts: ReviewCounts;
  selectedId: string | null;
  onSelect: (pageId: string) => void;
}

export function Sidebar({ tab, onTab, nav, news, counts, reviews, reviewFilter, onReviewFilter, reviewCounts, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Keep the section of the selected page open, as the site menu would highlight it.
  useEffect(() => {
    if (!selectedId) return;
    const id = sectionIdFor(nav, selectedId);
    if (id) setOpen((current) => (current.has(id) ? current : new Set(current).add(id)));
  }, [nav, selectedId]);

  const toggle = (id: string): void =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const narrowing = counts !== null || reviewFilter !== 'all';
  const visible = (pageId: string): boolean =>
    (counts === null || (counts.get(pageId) ?? 0) > 0) && matchesReview(isReviewed(reviews, pageId), reviewFilter);
  const anyVisible = (ids: string[]): boolean => ids.some(visible);
  const sectionIds = (id: string): string[] => {
    const section = nav.sections.find((s) => s.id === id);
    return section ? [...(section.leaf ? [section.leaf.pageId] : []), ...section.groups.flatMap((g) => g.items.map((i) => i.pageId))] : [];
  };

  const leaf = (item: NavLeaf, key?: string) => {
    if (narrowing && !visible(item.pageId)) return null;
    const n = counts?.get(item.pageId) ?? 0;
    const done = isReviewed(reviews, item.pageId);
    return (
      <li key={key ?? item.pageId}>
        <button
          type="button"
          className={`nav-leaf${item.pageId === selectedId ? ' is-active' : ''}`}
          aria-current={item.pageId === selectedId ? 'page' : undefined}
          onClick={() => onSelect(item.pageId)}
        >
          <span>{item.title}</span>
          {counts !== null && n > 0 && <span className="count">{n}</span>}
          {done && <span className="tick" title="Reviewed" aria-label="Reviewed">✓</span>}
        </button>
      </li>
    );
  };

  const visibleNews = news.filter((item) => !narrowing || visible(item.pageId));
  const otherLeaves = nav.others.filter((o) => !narrowing || visible(o.pageId));

  return (
    <nav className="sidebar" aria-label="Site navigation">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'pages'} className={tab === 'pages' ? 'is-active' : ''} onClick={() => onTab('pages')}>
          Pages
        </button>
        <button type="button" role="tab" aria-selected={tab === 'news'} className={tab === 'news' ? 'is-active' : ''} onClick={() => onTab('news')}>
          News
        </button>
      </div>
      <div className="side-filter">
        <ReviewFilterControl value={reviewFilter} counts={reviewCounts} onChange={onReviewFilter} />
      </div>

      <div className="nav-scroll">
        {tab === 'pages' && (
          <ul className="nav-list">
            {nav.home && leaf(nav.home)}
            {nav.sections.map((section) => {
              if (narrowing && !anyVisible(sectionIds(section.id))) return null;
              const expanded = open.has(section.id) || narrowing;
              return (
                <li key={section.id} className="nav-section">
                  <button type="button" className="nav-top" aria-expanded={expanded} onClick={() => toggle(section.id)}>
                    <span className="chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                    {section.title}
                  </button>
                  {expanded && (
                    <div className="nav-sub">
                      {section.leaf && <ul className="nav-list">{leaf(section.leaf)}</ul>}
                      {section.groups.map((group, i) => {
                        if (narrowing && !anyVisible(group.items.map((g) => g.pageId))) return null;
                        return (
                          <div key={`${group.title ?? 'g'}-${i}`}>
                            {group.title && <h3 className="nav-heading">{group.title}</h3>}
                            <ul className="nav-list">{group.items.map((item) => leaf(item, `${item.pageId}-${item.title}`))}</ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
            {otherLeaves.length > 0 && (
              <li className="nav-section">
                <button type="button" className="nav-top" aria-expanded={open.has('_other') || narrowing} onClick={() => toggle('_other')}>
                  <span className="chevron" aria-hidden="true">{open.has('_other') || narrowing ? '▾' : '▸'}</span>
                  Other pages
                </button>
                {(open.has('_other') || narrowing) && <ul className="nav-list nav-sub">{otherLeaves.map((o) => leaf(o))}</ul>}
              </li>
            )}
            {narrowing && !nav.home && otherLeaves.length === 0 && nav.sections.every((s) => !anyVisible(sectionIds(s.id))) && <li className="empty">No pages match.</li>}
          </ul>
        )}

        {tab === 'news' && (
          <ul className="nav-list news-list">
            {visibleNews.map((item) => {
              const n = counts?.get(item.pageId) ?? 0;
              return (
                <li key={item.pageId}>
                  <button
                    type="button"
                    className={`nav-leaf news-item${item.pageId === selectedId ? ' is-active' : ''}`}
                    aria-current={item.pageId === selectedId ? 'page' : undefined}
                    onClick={() => onSelect(item.pageId)}
                  >
                    <span className="news-title">{item.title}</span>
                    <span className="news-date">{item.date}</span>
                    {counts !== null && n > 0 && <span className="count">{n}</span>}
                    {isReviewed(reviews, item.pageId) && <span className="tick" title="Reviewed" aria-label="Reviewed">✓</span>}
                  </button>
                </li>
              );
            })}
            {narrowing && visibleNews.length === 0 && <li className="empty">No news match.</li>}
          </ul>
        )}
      </div>
    </nav>
  );
}
