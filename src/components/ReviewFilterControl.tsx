import type { ReviewCounts, ReviewFilter } from '../model/reviewModel';

interface Props {
  value: ReviewFilter;
  counts: ReviewCounts;
  onChange: (value: ReviewFilter) => void;
}

export function ReviewFilterControl({ value, counts, onChange }: Props) {
  const options: { value: ReviewFilter; label: string; n: number }[] = [
    { value: 'all', label: 'All', n: counts.total },
    { value: 'unreviewed', label: 'Not reviewed', n: counts.left },
    { value: 'reviewed', label: 'Reviewed', n: counts.reviewed },
  ];
  return (
    <div className="seg" role="group" aria-label="Review status">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} className={value === o.value ? 'is-active' : ''} onClick={() => onChange(o.value)}>
          {o.label} <span className="seg-n">{o.n}</span>
        </button>
      ))}
    </div>
  );
}
