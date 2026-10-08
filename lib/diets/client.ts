import type { Diet,Enrollment,Catalog,Bundle,Assessment } from './model.ts';
export type DietMetadata={diets:Diet[];enrollments:Enrollment[];catalog:Catalog};
export type DailyResponse={bundle:Bundle;assessment:Assessment;history:Assessment[]};
export async function dietRequest<T>(query='',action?:string,payload?:unknown):Promise<T>{const r=await fetch(`/api/nutrition/diets${query?'?'+query:''}`,{cache:'no-store',...(action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})}:{})});const data=await r.json();if(!r.ok)throw Error(data.error??'Diets are unavailable.');return data;}
