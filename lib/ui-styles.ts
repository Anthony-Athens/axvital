export const uiStyles = {
  control:
    "min-h-12 w-full rounded-xl border border-line-strong bg-raised px-4 text-base text-fg outline-none transition placeholder:text-fg-3 focus:border-accent-fg focus:ring-2 focus:ring-accent-fg/30 disabled:cursor-not-allowed disabled:opacity-60",
  button: {
    primary:
      "bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent-fg disabled:bg-line-strong",
    secondary:
      "border border-line-strong bg-raised text-fg hover:bg-line focus-visible:ring-accent-fg",
    tertiary: "text-accent-fg hover:bg-raised focus-visible:ring-accent-fg",
    destructive:
      "border border-rose-400/35 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 focus-visible:ring-rose-400",
  },
  status: {
    success: "bg-emerald-500/10 text-emerald-300",
    active: "bg-blue-500/10 text-blue-300",
    warning: "bg-amber-500/10 text-amber-300",
    error: "bg-red-500/10 text-red-300",
    neutral: "bg-raised text-fg-2",
  },
} as const;
