import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { checkPhotoAvailable, photoOriginalUrl } from "@/appliance/photos";
import {
  forgetContinueItem,
  rememberPhoto,
  type ContinueItem,
} from "@/core/tv/continuity";
import { useTVDialogFocus } from "./use-tv-focus";

export type RecentPhoto = Extract<ContinueItem, { kind: "photo" }>;

export function TVRecentPhotos({
  photo,
  actor,
  covered,
  onClose,
}: {
  photo: RecentPhoto;
  actor: string;
  covered: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useTVDialogFocus(dialog);
  const [status, setStatus] = useState<
    "loading" | "ready" | "failed" | "missing"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (status !== "failed") return;
    const controller = new AbortController();
    void checkPhotoAvailable(photo.path, controller.signal)
      .then((available) => {
        if (controller.signal.aborted || available) return;
        setStatus("missing");
        forgetContinueItem(actor, photo);
      })
      .catch(() => {
        /* Keep retry available for temporary errors. */
      });
    return () => controller.abort();
  }, [actor, photo, status]);
  return (
    <div
      ref={dialog}
      className="tv-photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="最近查看的照片"
      data-tv-dialog
      inert={covered || undefined}
    >
      <header>
        <button data-tv-focus data-tv-back onClick={onClose}>
          <ArrowLeft /> 返回
        </button>
        <h2>{photo.title}</h2>
      </header>
      <div className="tv-photo-stage">
        {status === "missing" ? (
          <p role="status">这张照片已移除或不再可访问。</p>
        ) : status === "failed" ? (
          <div role="alert">
            <p>暂时无法打开这张照片。</p>
            <button
              data-tv-focus
              onClick={() => {
                setStatus("loading");
                setAttempt((value) => value + 1);
              }}
            >
              重试
            </button>
          </div>
        ) : (
          <>
            {status === "loading" && <p role="status">正在打开照片…</p>}
            <img
              key={attempt}
              src={photoOriginalUrl(photo.path)}
              alt={photo.title}
              onError={() => setStatus("failed")}
              onLoad={() => {
                setStatus("ready");
                rememberPhoto(actor, photo);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
