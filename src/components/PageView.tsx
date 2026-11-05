import { useState } from 'react';
import { editKey, type Block, type EditPatch, type Edits, type PageDoc } from '../model/contentModel';
import { BlockRow, type AiJob } from './BlockRow';
import { ReviewedButton } from './ReviewedButton';

const PAGE_SIZE = 150;

interface Props {
  page: PageDoc;
  title: string;
  crumbs: string[];
  edits: Edits;
  contentBlocks: Block[];
  seoBlocks: Block[];
  narrowed: boolean;
  aiEnabled: boolean;
  reviewed: boolean;
  onToggleReviewed: () => void;
  onPatch: (block: Block, patch: EditPatch) => void;
  onAi: (block: Block, job: AiJob) => Promise<string>;
}

export function PageView({ page, title, crumbs, edits, contentBlocks, seoBlocks, narrowed, aiEnabled, reviewed, onToggleReviewed, onPatch, onAi }: Props) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const row = (block: Block) => (
    <BlockRow key={`${page.id}/${block.id}`} block={block} edit={edits[editKey(page.id, block.id)]} aiEnabled={aiEnabled} onPatch={onPatch} onAi={onAi} />
  );
  return (
    <>
      <div className="page-head">
        {crumbs.length > 0 && <p className="crumbs">{crumbs.join(' / ')}</p>}
        <h1>{title}</h1>
        <p>
          <a href={page.urlFo} target="_blank" rel="noreferrer">Faroese original</a>
          <a href={page.urlEn} target="_blank" rel="noreferrer">English original</a>
          {narrowed && <span>{contentBlocks.length + seoBlocks.length} matching texts</span>}
        </p>
        <ReviewedButton reviewed={reviewed} onToggle={onToggleReviewed} />
      </div>
      <div className="columns-head" aria-hidden="true">
        <span>Føroyskt</span>
        <span>English</span>
      </div>
      {contentBlocks.slice(0, limit).map(row)}
      {contentBlocks.length > limit && (
        <button type="button" className="more" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, contentBlocks.length - limit)} more
        </button>
      )}
      {seoBlocks.length > 0 && (
        <details className="seo" open={narrowed}>
          <summary>Search engine texts</summary>
          {seoBlocks.map(row)}
        </details>
      )}
      {contentBlocks.length + seoBlocks.length === 0 && <p className="state">No texts match on this page.</p>}
    </>
  );
}
