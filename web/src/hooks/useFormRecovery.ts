import { useCallback, useEffect, useRef, useState } from 'react';

import { deleteFormDraft, loadFormDraft, saveFormDraft } from '../lib/form-recovery';

import type { SavedForm } from '../lib/form-recovery';
import type { z } from 'zod';

export function useFormRecovery<T>({
  userId,
  form,
  schema,
  value,
  hasContent,
  onRestore,
  paused = false,
}: {
  userId: number | undefined;
  form: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  value: T;
  hasContent: boolean;
  paused?: boolean;
  onRestore: (payload: T) => void;
}) {
  const [candidate, setCandidate] = useState<SavedForm<T> | null>(null);
  const [ready, setReady] = useState(!userId);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(true);
  const enabled = useRef(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const draftId = useRef<string>(crypto.randomUUID());
  const latest = useRef({ value, hasContent });
  latest.current = { value, hasContent };
  const restore = useRef(onRestore);
  restore.current = onRestore;
  const pending = useRef(false);
  const durableValue = useRef<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    active.current = true;
    setReady(!userId);
    if (userId)
      void loadFormDraft(userId, form, schema)
        .then((record) => {
          if (cancelled) return;
          setCandidate(record);
          setReady(!record);
        })
        .catch(() => {
          if (!cancelled) {
            setError(true);
            setReady(true);
          }
        });
    return () => {
      cancelled = true;
      active.current = false;
    };
  }, [userId, form, schema]);

  const persist = useCallback(
    (payload: T): Promise<void> => {
      if (!userId || !enabled.current) return Promise.resolve();
      pending.current = true;
      if (active.current) setSaving(true);
      const operation = saveFormDraft(userId, form, payload, draftId.current);
      queue.current = operation;
      return operation
        .then(() => {
          if (queue.current !== operation) return;
          pending.current = false;
          durableValue.current = payload;
          if (active.current) {
            setSavedAt(Date.now());
            setSaving(false);
            setError(false);
          }
        })
        .catch(() => {
          if (active.current) {
            setSaving(false);
            setError(true);
          }
          // The live form remains available even if browser storage is full.
        });
    },
    [userId, form],
  );

  useEffect(() => {
    if (!ready || paused || !enabled.current) return;
    if (hasContent) void persist(value);
    else if (userId)
      void deleteFormDraft(userId, form, draftId.current)
        .then(() => {
          if (active.current) setSavedAt(null);
        })
        .catch(() => {
          if (active.current) setError(true);
        });
  }, [value, hasContent, ready, paused, persist, userId, form]);

  useEffect(() => {
    const flush = () => {
      if (ready && !paused && enabled.current && latest.current.hasContent)
        void persist(latest.current.value);
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const leave = (event: BeforeUnloadEvent) => {
      if (ready && enabled.current && latest.current.hasContent && (pending.current || error || (!paused && latest.current.value !== durableValue.current))) {
        flush();
        event.preventDefault();
        event.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', leave);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', leave);
    };
  }, [ready, paused, error, persist]);

  const clear = useCallback(async () => {
    enabled.current = false;
    if (userId) {
      const operation = deleteFormDraft(userId, form, draftId.current);
      queue.current = operation;
      await operation.catch(() => {
        if (active.current) setError(true);
      });
    }
    pending.current = false;
    if (active.current) {
      setCandidate(null);
      setSavedAt(null);
      setSaving(false);
    }
  }, [userId, form]);

  const recover = () => {
    if (!candidate) return;
    draftId.current = candidate.draftId;
    restore.current(candidate.payload);
    setSavedAt(candidate.updatedAt);
    setCandidate(null);
    setReady(true);
  };
  const discard = async () => {
    if (userId) {
      const operation = deleteFormDraft(userId, form, candidate?.draftId);
      queue.current = operation;
      try {
        await operation;
      } catch {
        setError(true);
        return;
      }
    }
    draftId.current = crypto.randomUUID();
    setCandidate(null);
    setReady(true);
  };
  return {
    candidate,
    ready,
    saving,
    savedAt,
    error,
    persist,
    clear,
    recover,
    discard,
    retry: async () => {
      if (userId) {
        try {
          const record = await loadFormDraft(userId, form, schema);
          if (record && record.draftId !== draftId.current) {
            setCandidate(record);
            setReady(false);
            setError(false);
            return;
          }
        } catch {
          setError(true);
          return;
        }
      }
      await persist(latest.current.value);
    },
  };
}
