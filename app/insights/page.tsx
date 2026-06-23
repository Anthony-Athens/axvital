const insights = [
  {
    text: "Your energy is 23% higher on days following high-quality sleep.",
    confidence: 92,
    signal: "Sleep quality",
  },
  {
    text: "Stress appears to have a stronger impact on your mood than exercise frequency.",
    confidence: 84,
    signal: "Stress",
  },
  {
    text: "Moderate exercise is associated with more consistent sleep than intense late workouts.",
    confidence: 76,
    signal: "Exercise",
  },
  {
    text: "Alcohol days are followed by lower next-morning energy in this sample period.",
    confidence: 71,
    signal: "Alcohol",
  },
];

export default function InsightsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-10">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
          Insights
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
          What your signals are saying
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          Example personalized findings that AXVital could generate from daily
          check-ins and connected health data.
        </p>
      </header>

      <section className="mt-6 space-y-4">
        {insights.map((insight) => (
          <article
            key={insight.text}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                {insight.signal}
              </span>
              <span className="text-sm font-black text-emerald-700">
                {insight.confidence}% confidence
              </span>
            </div>
            <p className="mt-4 text-xl font-black leading-8 text-slate-950">
              {insight.text}
            </p>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${insight.confidence}%` }}
              />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
