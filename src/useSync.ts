// Keeps the local edits and the shared edits file on GitHub in step.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edits } from './model/contentModel';
import { editsEqual, mergeEdits, parseEdits, serializeEdits } from './model/syncModel';
import { ensureBranch, getFile, GitHubError, putFile, type GitHubConfig } from './services/github';

export const EDITS_PATH = 'data/edits.json';

export type SyncState = 'off' | 'idle' | 'syncing' | 'saved' | 'error';

export interface SyncStatus {
  state: SyncState;
  message: string;
  lastSync: string | null;
}

interface Options {
  config: GitHubConfig | null;
  edits: Edits;
  userName: string;
  onMerged: (edits: Edits) => void;
}

const PUSH_DELAY_MS = 2500;
const PULL_INTERVAL_MS = 60000;

export function useSync({ config, edits, userName, onMerged }: Options): { status: SyncStatus; syncNow: () => void } {
  const [status, setStatus] = useState<SyncStatus>({ state: config ? 'idle' : 'off', message: '', lastSync: null });
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const onMergedRef = useRef(onMerged);
  onMergedRef.current = onMerged;
  const busy = useRef(false);
  const again = useRef(false);
  const branchReady = useRef(false);
  const lastRemote = useRef<Edits | null>(null);

  const sync = useCallback(async (): Promise<void> => {
    if (!config) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    setStatus((s) => ({ ...s, state: 'syncing', message: '' }));
    try {
      if (!branchReady.current) {
        await ensureBranch(config);
        branchReady.current = true;
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await getFile(config, EDITS_PATH);
        const remoteEdits = remote ? parseEdits(remote.text) : {};
        const merged = mergeEdits(remoteEdits, editsRef.current);
        if (!editsEqual(merged, editsRef.current)) onMergedRef.current(merged);
        if (remote && editsEqual(merged, remoteEdits)) {
          lastRemote.current = merged;
          break;
        }
        try {
          const now = new Date().toISOString();
          await putFile(config, EDITS_PATH, serializeEdits(merged, now), remote?.sha ?? null, `Text edits by ${userName || 'unknown'}`);
          lastRemote.current = merged;
          break;
        } catch (err) {
          if (err instanceof GitHubError && err.status === 409 && attempt < 2) continue;
          throw err;
        }
      }
      setStatus({ state: 'saved', message: '', lastSync: new Date().toISOString() });
    } catch (err) {
      setStatus((s) => ({ ...s, state: 'error', message: err instanceof Error ? err.message : String(err) }));
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void sync();
      }
    }
  }, [config, userName]);

  // First load and whenever the connection settings change.
  useEffect(() => {
    branchReady.current = false;
    lastRemote.current = null;
    if (!config) {
      setStatus({ state: 'off', message: '', lastSync: null });
      return;
    }
    void sync();
    const timer = setInterval(() => void sync(), PULL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [config, sync]);

  // Push shortly after the last local change.
  useEffect(() => {
    if (!config) return;
    if (lastRemote.current && editsEqual(lastRemote.current, edits)) return;
    const timer = setTimeout(() => void sync(), PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [config, edits, sync]);

  return { status, syncNow: () => void sync() };
}
