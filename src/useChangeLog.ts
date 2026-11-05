// Sends the unsent change log entries to Supabase once they have been quiet for a few seconds.

import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import { QUIET_MS, readyToSend, type LogEntry } from './model/logModel';
import { pushLog } from './services/supabase';

interface Options {
  client: SupabaseClient | null;
  signedIn: boolean;
  queue: LogEntry[];
  onSent: (sent: LogEntry[]) => void;
}

const RETRY_MS = 60000;

export function useChangeLog({ client, signedIn, queue, onSent }: Options): void {
  const sending = useRef(false);
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;
  const queueRef = useRef(queue);
  queueRef.current = queue;

  useEffect(() => {
    if (!client || !signedIn) return;
    const flush = (): void => {
      const ready = readyToSend(queueRef.current, Date.now());
      if (ready.length === 0 || sending.current) return;
      sending.current = true;
      pushLog(client, ready)
        .then(() => onSentRef.current(ready))
        .catch(() => undefined) // stays queued, tried again below
        .finally(() => {
          sending.current = false;
        });
    };
    const timer = queue.length > 0 ? setTimeout(flush, QUIET_MS + 250) : undefined;
    const retry = setInterval(flush, RETRY_MS);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(retry);
    };
  }, [client, signedIn, queue]);
}
