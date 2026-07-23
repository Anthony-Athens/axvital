import type { ReactNode } from "react";

export function CheckInFieldGroup({
  id,
  label,
  helper,
  children,
}: {
  id: string;
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <fieldset
      aria-labelledby={headingId}
      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <legend className="sr-only">{label}</legend>
      <div id={headingId}>
        <span className="block text-base font-semibold text-slate-900">{label}</span>
        {helper ? (
          <span className="mt-1 block text-sm font-medium leading-6 text-slate-500">
            {helper}
          </span>
        ) : null}
      </div>
      {children}
    </fieldset>
  );
}
