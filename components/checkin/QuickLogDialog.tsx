"use client";

import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type QuickLogDialogProps = {
  title: string;
  saving: boolean;
  message: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
};

type ViewportStyle = CSSProperties & { "--quick-log-vh": string };

export function QuickLogDialog({
  title,
  saving,
  message,
  onClose,
  onSubmit,
  children,
}: QuickLogDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(saving);
  const [viewportHeight, setViewportHeight] = useState("100dvh");

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const updateViewportHeight = () => {
      setViewportHeight(`${window.visualViewport?.height ?? window.innerHeight}px`);
    };
    updateViewportHeight();
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);

    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const style: ViewportStyle = { "--quick-log-vh": viewportHeight };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 md:items-center md:p-6"
      style={style}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        disabled={saving}
        aria-label="Close quick log"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-log-title"
        className="relative flex h-[calc(var(--quick-log-vh)-1rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl motion-safe:animate-[quick-log-in_160ms_ease-out] md:h-auto md:max-h-[calc(100dvh-3rem)] md:max-w-lg md:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Quick Log</p>
            <h2 id="quick-log-title" className="mt-1 text-xl font-semibold text-slate-950">
              Log {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={saving}
            className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-slate-100 text-xl text-slate-700 outline-none hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50"
            aria-label="Close quick log"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-6">
            {children}
            {message ? (
              <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                {message}
              </p>
            ) : null}
          </div>

          <div className="safe-bottom shrink-0 border-t border-slate-200 bg-white px-5 pb-3 pt-3 md:px-6">
            <div className="grid grid-cols-[0.75fr_1.25fr] gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="min-h-12 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-12 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:bg-slate-400"
              >
                {saving ? "Saving…" : `Log ${title}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
