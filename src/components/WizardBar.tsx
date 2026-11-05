import type { NavTab } from '../model/contentModel';
import type { ReviewCounts } from '../model/reviewModel';

interface Props {
  tab: NavTab;
  onTab: (tab: NavTab) => void;
  counts: ReviewCounts;
  onlyUnreviewed: boolean;
  onOnlyUnreviewed: (value: boolean) => void;
  position: number;
  queueLength: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function WizardBar({ tab, onTab, counts, onlyUnreviewed, onOnlyUnreviewed, position, queueLength, hasPrev, hasNext, onPrev, onNext }: Props) {
  const percent = counts.total === 0 ? 0 : Math.round((counts.reviewed / counts.total) * 100);
  const noun = tab === 'pages' ? 'pages' : 'news';
  return (
    <div className="wizard-bar">
      <div className="wizard-top">
        <div className="seg" role="tablist" aria-label="What to review">
          <button type="button" role="tab" aria-selected={tab === 'pages'} className={tab === 'pages' ? 'is-active' : ''} onClick={() => onTab('pages')}>Pages</button>
          <button type="button" role="tab" aria-selected={tab === 'news'} className={tab === 'news' ? 'is-active' : ''} onClick={() => onTab('news')}>News</button>
        </div>
        <label className="check">
          <input type="checkbox" checked={onlyUnreviewed} onChange={(e) => onOnlyUnreviewed(e.target.checked)} /> Only not reviewed
        </label>
        <p className="wizard-count">
          <strong>{counts.reviewed}</strong> of {counts.total} {noun} reviewed, <strong>{counts.left}</strong> left
          {queueLength > 0 && <span> · {position} of {queueLength} in this round</span>}
        </p>
        <div className="wizard-nav">
          <button type="button" onClick={onPrev} disabled={!hasPrev}>← Fyrru síðu</button>
          <button type="button" className="primary" onClick={onNext} disabled={!hasNext}>Næstu síðu →</button>
        </div>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Review progress">
        <span style={{ width: `${percent}%` }} />
      </div>
      {counts.left === 0 && counts.total > 0 && <p className="wizard-done">Everything is reviewed. Open the overview to see what still needs to go into WordPress.</p>}
    </div>
  );
}
