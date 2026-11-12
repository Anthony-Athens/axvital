import Link from "next/link";
export function UpgradeCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl border border-blue-400/25 bg-blue-500/10 p-5">
      <p className="text-sm font-semibold text-blue-300">AXVital Premium</p>
      <h2 className="mt-1 text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-fg-2">{body}</p>
      <Link
        href="/pricing"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 font-semibold text-white"
      >
        Upgrade to Premium
      </Link>
    </section>
  );
}
