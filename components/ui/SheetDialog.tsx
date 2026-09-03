"use client";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { useSheetDialog } from "./useSheetDialog";
type Props = {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
  saving?: boolean; error?: string; backdropClose?: boolean; wide?: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  failureMessage?: string;
};
// Quick Log's header/body/footer architecture, shared by the remaining forms.
export function SheetDialog({title,onClose,children,footer,saving=false,error,onSubmit,
  failureMessage="We couldn’t save your changes. Please try again.",backdropClose=false,wide=false}:Props) {
  const titleId=useId(), lock=useRef(false);
  const [pending,setPending]=useState(false),[failure,setFailure]=useState("");
  const busy=saving||pending;
  function close(){if(!saving&&!lock.current)onClose();}
  const {overlayRef,dialogRef,closeRef}=useSheetDialog(close,busy);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(lock.current||saving)return;
    lock.current=true;setPending(true);setFailure("");
    try{await onSubmit?.(event);}catch{setFailure(failureMessage);}
    finally{lock.current=false;setPending(false);}
  }
  const contents=<>
    <div data-sheet-body className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 [overflow-wrap:anywhere] [&_input]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0 [&_input]:max-w-full [&_select]:max-w-full [&_textarea]:max-w-full [&_input]:text-base [&_select]:text-base [&_textarea]:text-base">
      {children}{failure||error?<p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{failure||error}</p>:null}
    </div>
    {footer?<fieldset disabled={busy} className="safe-bottom [overflow-wrap:anywhere] m-0 min-w-0 shrink-0 border-0 border-t border-solid border-slate-200 bg-white px-5 pt-3 sm:px-6 [&_button]:min-h-11 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-blue-600">{footer}</fieldset>:null}
  </>;
  return <div ref={overlayRef} className="fixed inset-x-0 top-[var(--sheet-top,0px)] z-[80] flex h-[var(--sheet-vh,100dvh)] items-end justify-center bg-slate-950/50 sm:items-center sm:p-6" onMouseDown={event=>{if(backdropClose&&event.target===event.currentTarget)close();}}>
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative flex h-[calc(var(--sheet-vh,100dvh)-1rem)] min-w-0 w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:max-h-[calc(var(--sheet-vh,100dvh)-3rem)] sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
        <h2 id={titleId} className="min-w-0 break-words text-xl font-semibold [overflow-wrap:anywhere]">{title}</h2>
        <button ref={closeRef} type="button" disabled={busy} onClick={close} aria-label={`Close ${title}`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">×</button>
      </header>
      {onSubmit?<form onSubmit={submit} aria-busy={busy} className="flex min-h-0 flex-1 flex-col">{contents}</form>:<div aria-busy={busy} className="flex min-h-0 flex-1 flex-col">{contents}</div>}
    </div>
  </div>;
}
