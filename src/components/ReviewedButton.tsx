interface Props {
  reviewed: boolean;
  onToggle: () => void;
}

export function ReviewedButton({ reviewed, onToggle }: Props) {
  return (
    <button type="button" className={`reviewed-btn${reviewed ? ' is-on' : ''}`} aria-pressed={reviewed} onClick={onToggle}>
      {reviewed ? '✓ Reviewed · mark as not reviewed' : 'Mark as reviewed'}
    </button>
  );
}
