import type { ReactNode } from "react";

export function CheckInFieldGroup({
  id,
  label,
  helper,
  value,
  children,
}: {
  id: string;
  label: string;
  helper?: string;
  /** Short readout of the current answer, shown at the right of the label. */
  value?: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <fieldset aria-labelledby={headingId} className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div id={headingId}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold text-fg">{label}</span>
          {value ? (
            <span className="text-[13px] font-semibold tabular-nums text-accent-fg">{value}</span>
          ) : null}
        </div>
        {helper ? <span className="mt-0.5 block text-[13px] text-fg-3">{helper}</span> : null}
      </div>
      {children}
    </fieldset>
  );
}
