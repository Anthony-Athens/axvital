"use client";

import { useEffect, useEffectEvent, useRef } from "react";

const sheets: HTMLDivElement[] = [];
let releasePage: (() => void) | undefined;

// Shared by Quick Log and Add Condition. Geometry follows the visible viewport,
// while content changes affect only the sheet's scroll region.
export function useSheetDialog(onClose: () => void, saving: boolean, { boundMobileViewport = false }: { boundMobileViewport?: boolean } = {}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dismiss = useEffectEvent(() => { if (!saving) onClose(); });

  useEffect(() => {
    const dialog = dialogRef.current!;
    sheets.push(dialog);
    const isTop = () => sheets.at(-1) === dialog;
    const previous = document.activeElement as HTMLElement | null;
    const body = document.body;
    if (sheets.length === 1) {
      const original = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
      const scrollY = window.scrollY;
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
      releasePage = () => {
        Object.assign(body.style, original);
        window.scrollTo({ top: scrollY, behavior: "instant" });
      };
    }
    const viewport = window.visualViewport;
    let frame = 0;
    const revealFocus = () => {
      const active = document.activeElement as HTMLElement | null;
      const scroller = active?.closest<HTMLElement>("[data-sheet-body]");
      if (!active || !scroller || !dialogRef.current?.contains(active)) return;
      const field = active.getBoundingClientRect();
      const region = scroller.getBoundingClientRect();
      if (field.bottom > region.bottom) scroller.scrollTop += field.bottom - region.bottom + 12;
      else if (field.top < region.top) scroller.scrollTop -= region.top - field.top + 12;
    };
    const updateViewport = () => {
      const overlay = overlayRef.current;
      let height = viewport?.height ?? window.innerHeight;
      let top = viewport?.offsetTop ?? 0;
      if (boundMobileViewport && window.innerWidth < 640) {
        // Add Condition opts in: disregard impossible transient native-picker
        // bounds, while retaining compensation for real keyboard panning.
        height = Math.min(window.innerHeight, height);
        top = Math.max(0, Math.min(top, window.innerHeight - height));
      }
      overlay?.style.setProperty("--sheet-vh", `${height}px`);
      overlay?.style.setProperty("--sheet-top", `${top}px`);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealFocus);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    const focusFrame = requestAnimationFrame(() => { if (isTop()) closeRef.current?.focus({ preventScroll: true }); });
    const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((node) => node.tabIndex >= 0 && !node.closest("[hidden], [inert], fieldset[disabled]"));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); dismiss(); }
      if (event.key !== "Tab") return;
      const items = focusables();
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return; }
      if (!dialogRef.current?.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const handleFocus = () => {
      if (!isTop()) return;
      if (!dialogRef.current?.contains(document.activeElement)) (focusables()[0] ?? dialogRef.current)?.focus({ preventScroll: true });
      revealFocus();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocus);
    return () => {
      const wasTop = isTop();
      sheets.splice(sheets.indexOf(dialog), 1);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocus);
      if (!sheets.length) { releasePage?.(); releasePage = undefined; }
      if (wasTop && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [boundMobileViewport]);
  return { overlayRef, dialogRef, closeRef };
}
