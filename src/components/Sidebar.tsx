import type { PageGroup, PageListItem } from '../model/contentModel';

interface Props {
  items: PageListItem[];
  selectedId: string | null;
  group: PageGroup;
  narrowed: boolean;
  onGroup: (group: PageGroup) => void;
  onSelect: (pageId: string) => void;
}

const GROUPS: { value: PageGroup; label: string }[] = [
  { value: 'menu', label: 'In menu' },
  { value: 'page', label: 'Pages' },
  { value: 'post', label: 'News' },
  { value: 'other', label: 'Other' },
  { value: 'all', label: 'All' },
];

export function Sidebar({ items, selectedId, group, narrowed, onGroup, onSelect }: Props) {
  return (
    <nav className="sidebar" aria-label="Pages">
      <div className="groups" role="tablist">
        {GROUPS.map((g) => (
          <button
            key={g.value}
            type="button"
            role="tab"
            aria-selected={group === g.value}
            className={group === g.value ? 'is-active' : ''}
            onClick={() => onGroup(g.value)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <ul className="pages">
        {items.map(({ page, matches, progress }) => (
          <li key={page.id}>
            <button
              type="button"
              className={`page-item${page.id === selectedId ? ' is-active' : ''}`}
              aria-current={page.id === selectedId ? 'page' : undefined}
              onClick={() => onSelect(page.id)}
            >
              <span className="page-title">{page.title}</span>
              <span className="page-meta">
                <span className="page-slug">{page.type === 'global' ? 'whole site' : `/${page.id}`}</span>
                {narrowed ? (
                  <span className="count">{matches}</span>
                ) : (
                  progress.changed > 0 && (
                    <span className={`count${progress.toReplace === 0 ? ' is-done' : ''}`} title="Changed texts">
                      {progress.changed}
                    </span>
                  )
                )}
              </span>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="empty">No pages match.</li>}
      </ul>
    </nav>
  );
}
