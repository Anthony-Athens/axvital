"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHabitOccurrencesForRange } from "@/lib/habits/habits";
import { calculateAdherence } from "@/lib/habits/analytics";
import { calculateCurrentStreak } from "@/lib/habits/streaks";
import { addCalendarDays } from "@/lib/planner/recurrence";
import { supabase } from "@/lib/supabase/client";
function todayString() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
export function HabitSummary() { const [data,setData]=useState<{done:number;total:number;rate:number;streak:number}|null>(null); useEffect(()=>{ const timer=setTimeout(async()=>{ try { const today=todayString(); const start=addCalendarDays(today,-29); const rows=await getHabitOccurrencesForRange(supabase,start,today); const todays=rows.filter((row)=>row.scheduled_date===today); const week=rows.filter((row)=>row.scheduled_date>=addCalendarDays(today,-6)); const ids=[...new Set(rows.map((row)=>row.planned_activity_id))]; setData({done:todays.filter((row)=>row.status==="completed").length,total:todays.length,rate:calculateAdherence(week,addCalendarDays(today,-6),today).percentage,streak:Math.max(0,...ids.map((id)=>calculateCurrentStreak(rows.filter((row)=>row.planned_activity_id===id),today)))}); } catch { setData({done:0,total:0,rate:0,streak:0}); } },0); return()=>clearTimeout(timer); },[]); return <section className="mt-5 rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm md:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-widest text-emerald-700">Habits</p><h2 className="mt-2 text-2xl font-black">{data ? `${data.done} of ${data.total} completed today` : "Loading habit summary…"}</h2></div><Link href="/habits" className="rounded-full bg-slate-950 px-4 py-3 text-xs font-black text-white">View Habits</Link></div>{data ? <div className="mt-4 flex gap-4 font-bold text-slate-600"><span>{data.rate}% adherence this week</span><span>Longest streak: {data.streak} days</span></div> : null}</section>; }
