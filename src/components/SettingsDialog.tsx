import { useState } from 'react';
import type { Settings } from '../services/storage';

interface Props {
  settings: Settings;
  detectedRepo: string;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsDialog({ settings, detectedRepo, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(settings);
  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [key]: e.target.value.trim() === '' ? '' : e.target.value });

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...draft, ghToken: draft.ghToken.trim(), aiKey: draft.aiKey.trim(), userName: draft.userName.trim() });
        }}
      >
        <h2 id="settings-title">Settings</h2>
        <p className="hint">Saved in this browser only. Keys are never written to the repository.</p>

        <label>
          Your name
          <input type="text" value={draft.userName} onChange={set('userName')} placeholder="Shown next to your edits" required />
        </label>

        <fieldset>
          <legend>Shared saving (GitHub)</legend>
          <p className="hint">
            Edits are saved to <code>data/edits.json</code> on a separate branch so everyone sees the same text.
            Without a token, edits stay in this browser and can be moved with Export and Import.
          </p>
          <div className="row">
            <label>
              Owner
              <input type="text" value={draft.ghOwner} onChange={set('ghOwner')} placeholder={detectedRepo.split('/')[0] || 'github user or org'} />
            </label>
            <label>
              Repository
              <input type="text" value={draft.ghRepo} onChange={set('ghRepo')} placeholder={detectedRepo.split('/')[1] || 'mest-text-editor'} />
            </label>
            <label>
              Branch
              <input type="text" value={draft.ghBranch} onChange={set('ghBranch')} placeholder="edits" />
            </label>
          </div>
          <label>
            Access token
            <input type="password" value={draft.ghToken} onChange={set('ghToken')} placeholder="Fine-grained token with Contents: read and write" autoComplete="off" />
          </label>
        </fieldset>

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
