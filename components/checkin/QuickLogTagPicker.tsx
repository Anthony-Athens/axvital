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
    () =>
      options.filter(
        (tag) =>
          !selected.includes(tag) && tag.toLowerCase().includes(normalizedQuery.toLowerCase()),
      ),
    [normalizedQuery, options, selected],
  );
  const canCreate =
    normalizedQuery.length > 0 &&
    ![...options, ...selected].some((tag) => tag.toLowerCase() === normalizedQuery.toLowerCase());

  function add(tag: string) {
    onChange([...selected, tag]);
    setQuery("");
  }

  return (
    <section className="mt-5" aria-label="Tags">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((tag) => (
          <span
            key={tag}
            className="inline-flex min-h-9 items-center gap-1 rounded-full bg-blue-500/10 pl-3 pr-1 text-sm font-semibold text-blue-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(selected.filter((item) => item !== tag))}
              className="grid min-h-8 min-w-8 place-items-center rounded-xl hover:bg-blue-500/15 focus-visible:ring-2 focus-visible:ring-accent-fg"
              aria-label={`Remove ${tag} tag`}
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="min-h-11 rounded-lg px-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/10 focus-visible:ring-2 focus-visible:ring-accent-fg"
          aria-expanded={open}
          aria-controls={`${inputId}-picker`}
        >
          + Add tag
        </button>
      </div>

      {open ? (
        <div id={`${inputId}-picker`} className="mt-2 rounded-xl border border-line bg-raised p-3">
          <label htmlFor={inputId} className="text-sm font-semibold text-fg-2">
            Search or create a tag
          </label>
          <input
            id={inputId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. morning"
            className="mt-2 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30"
          />
          <div
            className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto"
            aria-label="Available tags"
          >
            {matches.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => add(tag)}
                className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-fg-2 hover:border-blue-400/40 hover:bg-blue-500/10"
              >
                {tag}
              </button>
            ))}
            {canCreate ? (
              <button
                type="button"
                onClick={() => add(normalizedQuery)}
                className="min-h-10 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 text-sm font-semibold text-blue-200"
              >
                Add “{normalizedQuery}”
              </button>
            ) : null}
            {!matches.length && !canCreate ? (
              <p className="py-2 text-sm text-fg-3">No more matching tags.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
