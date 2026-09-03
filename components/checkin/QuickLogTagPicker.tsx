"use client";

import { useId, useMemo, useState } from "react";

type QuickLogTagPickerProps = {
  options: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
};

export function QuickLogTagPicker({ options, selected, onChange }: QuickLogTagPickerProps) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim();
  const matches = useMemo(
    () => options.filter((tag) => !selected.includes(tag) && tag.toLowerCase().includes(normalizedQuery.toLowerCase())),
    [normalizedQuery, options, selected],
  );
  const canCreate = normalizedQuery.length > 0 && ![...options, ...selected].some(
    (tag) => tag.toLowerCase() === normalizedQuery.toLowerCase(),
  );

  function add(tag: string) {
    onChange([...selected, tag]);
    setQuery("");
  }

  return (
    <section className="mt-5" aria-label="Tags">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((tag) => (
          <span key={tag} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-blue-50 pl-3 pr-1 text-sm font-semibold text-blue-800">
            {tag}
            <button
              type="button"
              onClick={() => onChange(selected.filter((item) => item !== tag))}
              className="grid min-h-8 min-w-8 place-items-center rounded-full hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label={`Remove ${tag} tag`}
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="min-h-11 rounded-lg px-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600"
          aria-expanded={open}
          aria-controls={`${inputId}-picker`}
        >
          + Add tag
        </button>
      </div>

      {open ? (
        <div id={`${inputId}-picker`} className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label htmlFor={inputId} className="text-sm font-semibold text-slate-700">Search or create a tag</label>
          <input
            id={inputId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. morning"
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto" aria-label="Available tags">
            {matches.map((tag) => (
              <button key={tag} type="button" onClick={() => add(tag)} className="min-h-10 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50">
                {tag}
              </button>
            ))}
            {canCreate ? (
              <button type="button" onClick={() => add(normalizedQuery)} className="min-h-10 rounded-full border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800">
                Add “{normalizedQuery}”
              </button>
            ) : null}
            {!matches.length && !canCreate ? <p className="py-2 text-sm text-slate-500">No more matching tags.</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
