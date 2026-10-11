import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { currentActorId } from "@/core/auth/api";

/** Retain browser requests through login and consume them once for this actor. */
export function useDesktopBrowserRequest({
  ready,
  onOpen,
}: {
  ready: boolean;
  onOpen: (query?: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const consumed = useRef<string | null>(null);
  const actor = currentActorId();
  useEffect(() => {
    if (!ready || location.pathname !== "/desktop") return;
    const params = new URLSearchParams(location.search);
    if (params.get("app") !== "browser") return;
    const key = `${actor}:${location.key}:${location.search}`;
    if (consumed.current === key) return;
    consumed.current = key;
    onOpen(params.get("browserQuery")?.trim() || undefined);
    params.delete("app");
    params.delete("browserQuery");
    const query = params.toString();
    navigate(`/desktop${query ? `?${query}` : ""}`, {
      replace: true,
      state: null,
    });
  }, [actor, location, navigate, onOpen, ready]);
}
