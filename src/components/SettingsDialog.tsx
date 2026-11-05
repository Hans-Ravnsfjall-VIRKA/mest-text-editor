import { useState } from 'react';
import type { Settings } from '../services/storage';

interface Props {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsDialog({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(settings);
  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...draft, aiKey: draft.aiKey.trim(), userName: draft.userName.trim() });
        }}
      >
        <h2 id="settings-title">Settings</h2>
        <p className="hint">Saved in this browser only.</p>

        <label>
          Your name
          <input type="text" value={draft.userName} onChange={set('userName')} placeholder="Shown next to your edits" required />
        </label>

        <fieldset>
          <legend>AI helper (optional)</legend>
          <label>
            Anthropic API key
            <input type="password" value={draft.aiKey} onChange={set('aiKey')} placeholder="sk-ant-…" autoComplete="off" />
          </label>
          <label>
            Model
            <input type="text" value={draft.aiModel} onChange={set('aiModel')} />
          </label>
        </fieldset>

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
    </div>
  );
}
