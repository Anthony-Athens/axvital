"use client";

import { useEffect, useEffectEvent, useRef } from "react";

// Shared by Quick Log and Add Condition. Geometry follows the visible viewport,
// while content changes affect only the sheet's scroll region.
export function useSheetDialog(onClose: () => void, saving: boolean) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dismiss = useEffectEvent(() => { if (!saving) onClose(); });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const body = document.body;
    const original = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    const scrollY = window.scrollY;
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
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
      overlay?.style.setProperty("--sheet-vh", `${viewport?.height ?? window.innerHeight}px`);
      overlay?.style.setProperty("--sheet-top", `${viewport?.offsetTop ?? 0}px`);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealFocus);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((node) => node.tabIndex >= 0 && !node.closest("[hidden], [inert]"));
    const handleKeyDown = (event: KeyboardEvent) => {
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
      if (!dialogRef.current?.contains(document.activeElement)) (focusables()[0] ?? dialogRef.current)?.focus({ preventScroll: true });
      revealFocus();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocus);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocus);
      Object.assign(body.style, original);
      window.scrollTo(0, scrollY);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return { overlayRef, dialogRef, closeRef };
}
