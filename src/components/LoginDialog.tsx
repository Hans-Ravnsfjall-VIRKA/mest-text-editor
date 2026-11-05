import { useState } from 'react';

interface Props {
  email: string | null;
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSignOut: () => Promise<void>;
  onSyncNow: () => void;
  onClose: () => void;
}

export function LoginDialog({ email, onSignIn, onSignOut, onSyncNow, onClose }: Props) {
  const [mail, setMail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (email) {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div className="dialog">
          <h2 id="login-title">Saved online</h2>
          <p>Signed in as <strong>{email}</strong>. Edits and reviews are saved to the shared database.</p>
          <div className="dialog-actions">
            <button type="button" onClick={() => void onSignOut().then(onClose)}>Sign out</button>
            <button type="button" onClick={() => { onSyncNow(); onClose(); }}>Sync now</button>
            <button type="button" className="primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          void onSignIn(mail, password).then((err) => {
            setBusy(false);
            if (err) setError(err);
            else onClose();
          });
        }}
      >
        <h2 id="login-title">Sign in to save online</h2>
        <p className="hint">Use the account you were given. Until you sign in, everything is saved in this browser only.</p>
        <label>
          Email
          <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="notice is-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}
