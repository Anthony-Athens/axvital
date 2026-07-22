export const uiStyles = {
  control: "min-h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
  button: {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-blue-600",
    tertiary: "text-slate-600 hover:bg-slate-100 focus-visible:ring-blue-600",
    destructive: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
  },
  status: {
    success: "bg-emerald-50 text-emerald-700",
    active: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-red-50 text-red-700",
    neutral: "bg-slate-100 text-slate-600",
  },
} as const;
