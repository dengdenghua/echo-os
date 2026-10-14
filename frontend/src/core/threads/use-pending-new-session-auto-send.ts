import { useEffect, useRef } from "react";

import { consumePendingNewSession } from "./pending-new-session";

/** Text-only send: the hand-off never carries attachments. */
type SendText = (
  threadId: string,
  message: { text: string; files: never[] },
) => unknown;

/**
 * Auto-send a one-shot hand-off when a fresh thread is opened by the
 * Assistant timeout, a legacy on-demand-owned conversation migration, or the
 * desktop intent box. Session storage is consumed once, so refresh cannot
 * duplicate the send.
 *
 * The consumed text survives effect re-runs until it is actually sent. On a
 * cold mount `sendMessage` changes identity while the realtime transport
 * settles; the cleanup cancels the pending timer, and without the ref the
 * already-consumed hand-off was silently dropped.
 */
export function usePendingNewSessionAutoSend({
  isNewThread,
  threadId,
  sendMessage,
  markSidebarThreadRunning,
}: {
  isNewThread: boolean;
  threadId: string;
  sendMessage: SendText;
  markSidebarThreadRunning: (threadId: string) => void;
}) {
  const consumedRef = useRef(false);
  const pendingTextRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isNewThread) {
      // The page component survives hash-route transitions. Reset the
      // one-shot latch when returning to an existing thread so a later Retry
      // can hand off and auto-send another fresh task.
      consumedRef.current = false;
      pendingTextRef.current = null;
      return;
    }
    if (!consumedRef.current) {
      consumedRef.current = true;
      pendingTextRef.current = consumePendingNewSession();
    }
    const pendingText = pendingTextRef.current;
    if (!pendingText) return;
    const timer = window.setTimeout(() => {
      pendingTextRef.current = null;
      markSidebarThreadRunning(threadId);
      // sendMessage queues the message until the realtime transport is ready
      // and flushes it then; the composer still shows the prompt as a fallback.
      void sendMessage(threadId, { text: pendingText, files: [] });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [isNewThread, threadId, sendMessage, markSidebarThreadRunning]);
}
