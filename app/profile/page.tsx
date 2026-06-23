const integrations = ["Garmin", "WHOOP", "Strava", "Apple Health"];

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-10">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-emerald-500 text-2xl font-black text-white">
            AJ
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
              Profile
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">
              Alex Johnson
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              axvital.member@example.com
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Goal", "Better energy"],
            ["Baseline", "14 days"],
            ["Plan", "MVP Access"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-lg font-black">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
        <h2 className="text-2xl font-black">Future integrations</h2>
        <p className="mt-2 leading-7 text-slate-600">
          Connect wearables and health platforms when backend functionality is
          added.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {integrations.map((name) => (
            <div
              key={name}
              className="flex min-h-16 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4"
            >
              <span className="text-lg font-black">{name}</span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
