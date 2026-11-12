export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-3 p-6" aria-busy="true">
      <div className="h-20 animate-pulse rounded-xl bg-raised" />
      <div className="h-16 animate-pulse rounded-xl bg-raised" />
      <span className="sr-only">Loading Health Timeline</span>
    </div>
  );
}
