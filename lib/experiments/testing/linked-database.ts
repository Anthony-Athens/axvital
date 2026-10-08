import type {PGlite} from '@electric-sql/pglite';
import type {SupabaseClient} from '@supabase/supabase-js';
import {database} from '../../security/test-database.ts';
export const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
export async function linkedDatabase(){return database(false,async db=>{await db.exec('alter table public.health_events add column event_date date,add column event_time time,add column event_type text,add column supplement_name text,add column dose_amount numeric,add column dose_unit text;');});}
/** Synthetic transport ONLY. Queries/RPCs run in real PostgreSQL under caller role/RLS.
 * This is not a test of PostgREST, Supabase deployment, or production grants. */
export function databaseClient(db:PGlite,failRpc?:string):SupabaseClient{
 const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,v)=>(key.endsWith('date')||key==='effective_from'||key==='finished_on')&&typeof v==='string'&&v.includes('T')?v.slice(0,10):['weight_source_value','weight_kg'].includes(key)&&typeof v==='string'?Number(v):v));
 const identifier=(s:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw Error('TEST_IDENTIFIER');return `"${s}"`;};
 return {rpc:async(fn:string,args:Record<string,unknown>)=>{try{if(fn===failRpc)return {data:null,error:{message:'Synthetic failure'}};const keys=Object.keys(args);const result=await db.query<{r:unknown}>(`select public.${identifier(fn)}(${keys.map((key,i)=>`${identifier(key)} => $${i+1}`).join(',')}) r`,keys.map(k=>args[k]));return {data:result.rows[0].r,error:null};}catch{return {data:null,error:{message:'Synthetic RPC failed'}};}},
 from:(table:string)=>{const clauses:string[]=[],args:unknown[]= [];let limit=1000,sort='';const add=(column:string,op:string,value:unknown)=>{args.push(value);clauses.push(`${identifier(column)} ${op} $${args.length}`);return q;};
 const execute=async()=>{try{return {data:normalize((await db.query(`select * from public.${identifier(table)}${clauses.length?' where '+clauses.join(' and '):''}${sort} limit ${limit}`,args)).rows),error:null};}catch{return {data:null,error:{message:'Synthetic query failed'}};}};
 const q={select:()=>q,eq:(column:string,value:unknown)=>add(column,'=',value),gte:(column:string,value:unknown)=>add(column,'>=',value),lte:(column:string,value:unknown)=>add(column,'<=',value),order:(column:string,opts?:{ascending?:boolean})=>{sort=` order by ${identifier(column)} ${opts?.ascending===false?'desc':'asc'}`;return q;},limit:(n:number)=>{limit=n;return q;},then:(...callbacks:Parameters<ReturnType<typeof execute>['then']>)=>execute().then(...callbacks)};return q;}
 } as unknown as SupabaseClient;
}
