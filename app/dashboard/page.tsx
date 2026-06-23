const trendCards = [
  {
    title: "Energy Trend",
    value: "7.8",
    delta: "+12%",
    color: "bg-emerald-500",
    data: [35, 48, 42, 62, 56, 72, 84],
  },
  {
    title: "Sleep Trend",
    value: "7h 24m",
    delta: "+41m",
    color: "bg-sky-500",
    data: [58, 64, 51, 70, 76, 69, 82],
  },
  {
    title: "Weight Trend",
    value: "181.4",
    delta: "-1.8 lb",
    color: "bg-violet-500",
    data: [82, 78, 76, 74, 72, 70, 68],
  },
];

const insights = [
  "Energy is strongest after 7+ hours of sleep.",
  "High stress days are clustering on Mondays.",
  "Moderate exercise aligns with better sleep quality.",
];

function MiniChart({ data, color }: { data: number[]; color: string }) {
  return (
    <div className="mt-5 flex h-24 items-end gap-2">
      {data.map((point, index) => (
        <div
          key={`${point}-${index}`}
          className="flex-1 rounded-t-full bg-slate-100"
          style={{ height: `${point}%` }}
        >
          <div className={`h-full rounded-t-full ${color} opacity-90`} />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
      <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-200 md:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
          Dashboard
        </p>
        <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              Your health baseline
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-slate-300">
              A quick read on the signals most likely to affect your daily
              performance.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-sm font-semibold text-slate-300">Today score</p>
            <p className="text-4xl font-black text-emerald-300">87</p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        {trendCards.map((card) => (
          <article
            key={card.title}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">{card.title}</h2>
                <p className="mt-2 text-3xl font-black">{card.value}</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700">
                {card.delta}
              </span>
            </div>
            <MiniChart data={card.data} color={card.color} />
          </article>
        ))}
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black">Recent Insights</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            Sample data
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {insights.map((insight) => (
            <div
              key={insight}
              className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700"
            >
              {insight}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
