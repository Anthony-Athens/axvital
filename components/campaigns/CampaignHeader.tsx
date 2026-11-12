/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation with noreferrer avoids carrying campaign context into app navigation. */
export function CampaignHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-ground/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:h-20">
        <a
          href="/"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-accent-fg"
          aria-label="AXVital home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-sm font-semibold text-white">
            AX
          </span>
          <span className="text-lg font-semibold tracking-tight">AXVital</span>
        </a>
        <a
          href="/login"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-fg-2 focus-visible:outline-2 focus-visible:outline-accent-fg"
        >
          Sign In
        </a>
      </div>
    </header>
  );
}
