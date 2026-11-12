"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import { logDevError } from "@/lib/app-errors";
import { getOccurrencesForRange } from "@/lib/planner/planner";
import type { PlannedActivityOccurrence } from "@/lib/planner/types";
import { totalKnownNutrition } from "@/lib/nutrition/reuse";
import { localDateString } from "@/lib/timeline/dates";
import { checkinStreak, windowDates, type SummaryRow } from "@/lib/checkins/summary";
import {
  addDays,
  habitStreaks,
  localDate,
  severityStrip,
  weekDates,
  weekSummary,
} from "@/lib/track/overview";
import { CategoryIcon, type Category } from "@/components/ui/CategoryIcon";

type Loaded<T> = T | null | "error";

function formatTime(value: string | null) {
  if (!value) return "";
  const [h, m] = value.split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}
function dayLabel(date: string, today: string) {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
    new Date(`${date}T12:00:00`),
  );
}

function Tile({
  category,
  title,
  href,
  status,
  children,
  links,
}: {
  category: Category;
  title: string;
  href: string;
  status: ReactNode;
  children?: ReactNode;
  links: { label: string; href: string; primary?: boolean }[];
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <CategoryIcon category={category} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-fg">
            <Link
              href={href}
              className="hover:text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-fg"
            >
              {title}
            </Link>
          </h2>
          <p className="truncate text-[13px] text-fg-3">{status}</p>
        </div>
      </div>
      {children ? <div className="min-h-[72px]">{children}</div> : null}
      <div className="mt-auto flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`inline-flex min-h-10 items-center rounded-[10px] px-3.5 text-[13px] font-semibold focus-visible:ring-2 focus-visible:ring-accent-fg ${
              link.primary
                ? "bg-accent text-white hover:bg-accent-hover"
                : "border border-line-strong bg-raised text-fg hover:bg-line"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function Meter({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line">
      <div
        className={`h-full rounded-full ${className}`}
        style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%` }}
      />
    </div>
  );
}

function Pending() {
  return (
    <div
      aria-hidden="true"
      className="h-[72px] animate-pulse rounded-xl bg-raised motion-reduce:animate-none"
    />
  );
}
function Unavailable() {
  return <p className="text-sm text-fg-3">Couldn’t load a summary right now.</p>;
}

type NutritionEntry = Parameters<typeof totalKnownNutrition>[0][number];
type SymptomRow = {
  started_at: string;
  severity: number | null;
  custom_symptom_name: string | null;
  symptom: { name: string } | null;
};

export function TrackOverview() {
  const [today] = useState(localDateString);
  const [plan, setPlan] = useState<Loaded<PlannedActivityOccurrence[]>>(null);
  const [food, setFood] = useState<Loaded<NutritionEntry[]>>(null);
  const [symptoms, setSymptoms] = useState<Loaded<SymptomRow[]>>(null);
  const [checkins, setCheckins] = useState<Loaded<SummaryRow[]>>(null);

  useEffect(() => {
    let active = true;
    const week = weekDates(today);
    const from = addDays(today, -29) < week[0] ? addDays(today, -29) : week[0];
    const settle = <T,>(set: (v: Loaded<T>) => void, label: string) =>
      [
        (value: T) => active && set(value),
        (error: unknown) => {
          logDevError(`Failed to load ${label}`, error);
          if (active) set("error");
        },
      ] as const;

    getOccurrencesForRange(supabase, from, week[6]).then(...settle(setPlan, "plan summary"));

    const start = new Date(`${today}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    Promise.resolve(
      supabase
        .from("nutrition_entries")
        .select(
          "id,nutrition_status,items:nutrition_entry_items(calories,protein_grams,carbohydrate_grams,fat_grams,fiber_grams)",
        )
        .is("deleted_at", null)
        .gte("consumed_at", start.toISOString())
        .lt("consumed_at", end.toISOString()),
    )
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as unknown as NutritionEntry[];
      })
      .then(...settle(setFood, "nutrition summary"));

    const since = new Date(`${addDays(today, -13)}T00:00:00`).toISOString();
    Promise.resolve(
      supabase
        .from("user_symptom_events")
        .select("started_at,severity,custom_symptom_name,symptom:symptoms(name)")
        .is("deleted_at", null)
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
    )
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as unknown as SymptomRow[];
      })
      .then(...settle(setSymptoms, "symptom summary"));

    Promise.resolve(
      supabase
        .from("daily_checkins")
        .select("checkin_date,energy_score,mood_score,sleep_quality")
        .gte("checkin_date", windowDates(today, 60)[0])
        .lte("checkin_date", today),
    )
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as SummaryRow[];
      })
      .then(...settle(setCheckins, "check-in summary"));

    return () => {
      active = false;
    };
  }, [today]);

  const week = Array.isArray(plan) ? weekSummary(plan, today) : null;
  const streaks = Array.isArray(plan) ? habitStreaks(plan, today) : [];
  const totals = Array.isArray(food) ? totalKnownNutrition(food) : null;
  const strip = Array.isArray(symptoms) ? severityStrip(symptoms, today) : null;
  const weekSymptoms = Array.isArray(symptoms)
    ? symptoms.filter((s) => localDate(s.started_at) >= weekDates(today)[0])
    : [];
  const streak = Array.isArray(checkins) ? checkinStreak(checkins, today) : 0;
  const checkedInToday = Array.isArray(checkins) && checkins.some((c) => c.checkin_date === today);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Tile
          category="food"
          title="Nutrition"
          href="/health/nutrition"
          status={
            totals
              ? `Today · ${food && Array.isArray(food) ? food.length : 0} ${Array.isArray(food) && food.length === 1 ? "entry" : "entries"}`
              : "Food intake and daily targets"
          }
          links={[
            { label: "Log food", href: "/health/nutrition", primary: true },
            { label: "Nutrition Goals", href: "/health/nutrition/goals" },
          ]}
        >
          {food === null ? (
            <Pending />
          ) : food === "error" || !totals ? (
            <Unavailable />
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-fg-2">Calories today</span>
                <span className="text-[22px] font-semibold tabular-nums">
                  {Math.round(totals.calories ?? 0).toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-fg-3">kcal</span>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[13px] tabular-nums text-fg-2">
                <span>Protein {Math.round(totals.protein_grams ?? 0)} g</span>
                <span>Carbs {Math.round(totals.carbohydrate_grams ?? 0)} g</span>
                <span>Fat {Math.round(totals.fat_grams ?? 0)} g</span>
              </div>
              {totals.incomplete.size ? (
                <span className="text-xs text-amber-300">Some foods are missing values</span>
              ) : null}
            </div>
          )}
        </Tile>

        <Tile
          category="workout"
          title="Training"
          href="/workouts"
          status={
            week?.workouts.next
              ? `Next: ${week.workouts.next.title} · ${dayLabel(week.workouts.next.date, today)} ${formatTime(week.workouts.next.time)}`
              : "Workouts, templates and history"
          }
          links={[
            { label: "Open Workouts", href: "/workouts", primary: true },
            { label: "Progress", href: "/workouts/progress" },
          ]}
        >
          {plan === null ? (
            <Pending />
          ) : !week ? (
            <Unavailable />
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-fg-2">This week</span>
                <span className="text-[22px] font-semibold tabular-nums">
                  {week.workouts.done}
                  <span className="ml-1 text-sm font-normal text-fg-3">
                    of {week.workouts.total} sessions
                  </span>
                </span>
              </div>
              <ol aria-label="Workouts by day" className="grid grid-cols-7 gap-1.5">
                {week.workouts.days.map((mark, i) => (
                  <li key={week.days[i]} className="flex flex-col items-center gap-1">
                    <span
                      className={`h-6 w-full rounded-md ${
                        mark === "done"
                          ? "bg-cat-workout"
                          : mark === "planned"
                            ? "border-[1.5px] border-dashed border-cat-workout"
                            : mark === "missed"
                              ? "border-[1.5px] border-line-strong"
                              : "bg-raised"
                      } ${week.days[i] === today ? "ring-2 ring-accent-fg ring-offset-2 ring-offset-surface" : ""}`}
                    />
                    <span
                      className={`text-[11px] ${week.days[i] === today ? "font-semibold text-accent-fg" : "text-fg-3"}`}
                    >
                      {new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(
                        new Date(`${week.days[i]}T12:00:00`),
                      )}
                    </span>
                    <span className="sr-only">
                      {mark === "none"
                        ? "no workout"
                        : mark === "done"
                          ? "done"
                          : mark === "planned"
                            ? "planned"
                            : "not done"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Tile>

        <Tile
          category="symptom"
          title="Symptoms and conditions"
          href="/health/symptoms"
          status={
            Array.isArray(symptoms)
              ? `${weekSymptoms.length} logged this week`
              : "What you experience, and your conditions"
          }
          links={[
            { label: "Manage Symptoms", href: "/health/symptoms", primary: true },
            { label: "My Health & Conditions", href: "/health" },
          ]}
        >
          {symptoms === null ? (
            <Pending />
          ) : !strip ? (
            <Unavailable />
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-fg-2">Highest severity, last 14 days</span>
              <div aria-hidden="true" className="grid h-11 grid-cols-14 items-end gap-1">
                {strip.map((value, i) => (
                  <span
                    key={i}
                    className={`rounded-[3px] ${value === null ? "h-1 bg-line" : "bg-cat-symptom"}`}
                    style={
                      value === null
                        ? undefined
                        : {
                            height: `${Math.max(6, (value / 10) * 44)}px`,
                            opacity: 0.45 + (value / 10) * 0.55,
                          }
                    }
                  />
                ))}
              </div>
              <span className="truncate text-[13px] text-fg-3">
                {Array.isArray(symptoms) && symptoms[0]
                  ? `Latest: ${symptoms[0].symptom?.name ?? symptoms[0].custom_symptom_name ?? "Symptom"}${symptoms[0].severity != null ? ` · ${symptoms[0].severity}/10` : ""}`
                  : "Nothing logged in the last 14 days"}
              </span>
            </div>
          )}
        </Tile>

        <Tile
          category="habit"
          title="Habits and routines"
          href="/habits"
          status="Habits you repeat; protocols that bundle them"
          links={[
            { label: "Manage Habits", href: "/habits", primary: true },
            { label: "Manage Protocols", href: "/protocols" },
          ]}
        >
          {plan === null ? (
            <Pending />
          ) : plan === "error" ? (
            <Unavailable />
          ) : streaks.length ? (
            <ul className="flex flex-col gap-2">
              {streaks.map((habit) => (
                <li key={habit.title} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-fg">{habit.title}</span>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${habit.streak ? "text-cat-habit" : "text-fg-3"}`}
                  >
                    {habit.streak ? `${habit.streak}-day streak` : "No current streak"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-3">No habits scheduled yet.</p>
          )}
        </Tile>

        <Tile
          category="plan"
          title="Weekly plan"
          href="/weekly-overview"
          status={
            week
              ? `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${week.days[0]}T12:00:00`))} – ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${week.days[6]}T12:00:00`))}`
              : "Everything scheduled this week"
          }
          links={[{ label: "View Weekly Overview", href: "/weekly-overview", primary: true }]}
        >
          {plan === null ? (
            <Pending />
          ) : !week ? (
            <Unavailable />
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-fg-2">Completed</span>
                <span className="text-[22px] font-semibold tabular-nums">
                  {week.done}
                  <span className="ml-1 text-sm font-normal text-fg-3">
                    of {week.total} planned
                  </span>
                </span>
              </div>
              <Meter value={week.done} max={week.total} className="bg-accent-fg" />
              <span className="text-[13px] tabular-nums text-fg-3">
                {week.done} done · {week.skipped} skipped · {week.upcoming} still to come
              </span>
            </div>
          )}
        </Tile>

        <Tile
          category="cognitive"
          title="Cognitive training"
          href="/cognitive-training"
          status="Mental Mathletics: accuracy, pace and performance"
          links={[
            { label: "Open Cognitive Training", href: "/cognitive-training", primary: true },
            { label: "History", href: "/cognitive-training/history" },
          ]}
        />
      </div>

      <section
        aria-label="Daily check-in"
        className="flex flex-wrap items-center gap-4 rounded-2xl border border-line p-4 sm:px-5"
      >
        <CategoryIcon category="checkin" size="lg" />
        <div className="min-w-[200px] flex-1">
          <p className="text-[15px] font-semibold text-fg">Daily check-in</p>
          <p className="text-[13px] text-fg-3">
            {checkedInToday ? "Done today" : "Not done yet today"}
            {streak > 1 ? ` · ${streak}-day streak` : ""} · energy, mood, sleep and more
          </p>
        </div>
        <Link
          href="/today"
          className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-raised px-4 text-sm font-semibold text-fg hover:bg-line"
        >
          {checkedInToday ? "Open Today" : "Check in"}
        </Link>
        <Link
          href="/health/timeline"
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-accent-fg hover:bg-raised"
        >
          Health Timeline
        </Link>
      </section>
    </div>
  );
}
