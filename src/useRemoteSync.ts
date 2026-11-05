// Keeps local edits and reviews in step with Supabase. Newest entry per text or page wins.

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edits } from './model/contentModel';
import { pendingEntries } from './model/remoteModel';
import { mergeReviews, reviewsEqual, type Reviews } from './model/reviewModel';
import { editsEqual, mergeEdits } from './model/syncModel';
import { pullEdits, pullReviews, pushEdits, pushReviews } from './services/supabase';

export type SyncState = 'off' | 'signedOut' | 'idle' | 'syncing' | 'saved' | 'error';

export interface SyncStatus {
  state: SyncState;
  message: string;
  lastSync: string | null;
  email: string | null;
}

interface Options {
  client: SupabaseClient | null;
  edits: Edits;
  reviews: Reviews;
  onMerged: (edits: Edits, reviews: Reviews) => void;
}

const PUSH_DELAY_MS = 1500;
const PULL_INTERVAL_MS = 30000;

export function useRemoteSync({ client, edits, reviews, onMerged }: Options): {
  status: SyncStatus;
  email: string | null;
  syncNow: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
} {
  const [status, setStatus] = useState<SyncStatus>({ state: client ? 'idle' : 'off', message: '', lastSync: null, email: null });
  const [email, setEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const reviewsRef = useRef(reviews);
  reviewsRef.current = reviews;
  const onMergedRef = useRef(onMerged);
  onMergedRef.current = onMerged;
  const busy = useRef(false);
  const again = useRef(false);
  const known = useRef<{ edits: Edits; reviews: Reviews } | null>(null);

  useEffect(() => {
    known.current = null;
    setAuthChecked(false);
    if (!client) {
      setEmail(null);
      setStatus({ state: 'off', message: '', lastSync: null, email: null });
      return;
    }
    void client.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setAuthChecked(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const sync = useCallback(async (): Promise<void> => {
    if (!client || !email) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    setStatus((s) => ({ ...s, state: 'syncing', message: '', email }));
    try {
      const [remoteEdits, remoteReviews] = await Promise.all([pullEdits(client), pullReviews(client)]);
      const mergedEdits = mergeEdits(remoteEdits, editsRef.current);
      const mergedReviews = mergeReviews(remoteReviews, reviewsRef.current);
      if (!editsEqual(mergedEdits, editsRef.current) || !reviewsEqual(mergedReviews, reviewsRef.current)) {
        onMergedRef.current(mergedEdits, mergedReviews);
      }
      await pushEdits(client, pendingEntries(mergedEdits, remoteEdits));
      await pushReviews(client, pendingEntries(mergedReviews, remoteReviews));
      known.current = { edits: mergedEdits, reviews: mergedReviews };
      setStatus({ state: 'saved', message: '', lastSync: new Date().toISOString(), email });
    } catch (err) {
      setStatus((s) => ({ ...s, state: 'error', message: err instanceof Error ? err.message : String(err), email }));
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void sync();
      }
    }
  }, [client, email]);

  useEffect(() => {
    if (!client || !authChecked) return;
    if (!email) {
      setStatus({ state: 'signedOut', message: '', lastSync: null, email: null });
      return;
    }
    void sync();
    const timer = setInterval(() => void sync(), PULL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [client, email, authChecked, sync]);

  // Push shortly after the last local change.
  useEffect(() => {
    if (!client || !email || !known.current) return;
    if (editsEqual(known.current.edits, edits) && reviewsEqual(known.current.reviews, reviews)) return;
    const timer = setTimeout(() => void sync(), PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [client, email, edits, reviews, sync]);

  const signIn = useCallback(
    async (mail: string, password: string): Promise<string | null> => {
      if (!client) return 'No database is set up.';
      const { error } = await client.auth.signInWithPassword({ email: mail.trim(), password });
      return error ? error.message : null;
    },
    [client],
  );
  const signOut = useCallback(async (): Promise<void> => {
    if (client) await client.auth.signOut();
  }, [client]);

  return { status, email, syncNow: () => void sync(), signIn, signOut };
}
