import type { ReactNode } from "react";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-md items-center px-4 py-8">
    <section className="min-w-0 w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-sm font-semibold text-blue-700">Account security</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
      {children}
    </section>
  </div>;
}
