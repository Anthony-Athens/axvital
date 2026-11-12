"use client";

import { type FormEvent, type ReactNode } from "react";
import { useSheetDialog } from "@/components/ui/useSheetDialog";

type QuickLogDialogProps = {
  title: string;
  saving: boolean;
  message: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
};

export function QuickLogDialog({
  title,
  saving,
  message,
  onClose,
  onSubmit,
  children,
}: QuickLogDialogProps) {
  const { overlayRef, dialogRef, closeRef } = useSheetDialog(onClose, saving);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-x-0 top-[var(--sheet-top,0px)] h-[var(--sheet-vh,100dvh)] z-50 flex items-end justify-center bg-slate-950/40 md:items-center md:p-6"
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
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-log-title"
        className="relative flex h-[calc(var(--sheet-vh,100dvh)-1rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl motion-safe:animate-[quick-log-in_160ms_ease-out] md:h-auto md:max-h-[calc(var(--sheet-vh,100dvh)-3rem)] md:max-w-lg md:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4 md:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Quick Log</p>
            <h2 id="quick-log-title" className="mt-1 text-xl font-semibold text-fg">
              Log {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={saving}
            className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-raised text-xl text-fg-2 outline-none hover:bg-line focus-visible:ring-2 focus-visible:ring-accent-fg disabled:opacity-50"
            aria-label="Close quick log"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div
            data-sheet-body
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-6"
          >
            {children}
            {message ? (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-amber-500/10 p-3 text-sm font-semibold text-amber-100"
              >
                {message}
              </p>
            ) : null}
          </div>

          <div className="safe-bottom shrink-0 border-t border-line bg-surface px-5 pb-3 pt-3 md:px-6">
            <div className="grid grid-cols-[0.75fr_1.25fr] gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="min-h-12 rounded-lg border border-line-strong bg-surface px-4 font-semibold text-fg-2 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent-fg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-12 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-accent-fg focus-visible:ring-offset-2 disabled:bg-slate-600"
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
