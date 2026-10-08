import {isUuid} from '../rules/validation.ts';
import {ingredientKeys} from '../diets/model.ts';
export const checkinKeys=['body_weight','energy_score','mood_score','sleep_quality_score'] as const;
export const linkedKeys=['diet','food','category','ingredient','alcohol','supplement'] as const;
export type Factor={source:typeof checkinKeys[number]|typeof linkedKeys[number];offset:0|-1;ref?:string};
export type FactorVersion={id:string;effective_from:string;revision:number;factors:Factor[]};
export function factorIdentity(f:Factor){return f.source==='ingredient'&&f.ref==='alcohol'?'alcohol:':`${f.source}:${f.ref??''}`;}
export function validateFactors(factors:Factor[]){
 if(!Array.isArray(factors)||factors.length>10||new Set(factors.map(factorIdentity)).size!==factors.length)throw Error('INVALID_FACTORS');
 for(const f of factors){if(!f||![0,-1].includes(f.offset)||Object.keys(f).some(k=>!['source','offset','ref'].includes(k)))throw Error('INVALID_FACTOR');
  if(checkinKeys.some(k=>k===f.source)||f.source==='alcohol'){if(f.ref!==undefined)throw Error('INVALID_FACTOR');}
  else if(f.source==='ingredient'){if(!ingredientKeys.some(k=>k===f.ref))throw Error('INVALID_FACTOR');}
  else if(!['diet','food','category','supplement'].includes(f.source)||!isUuid(f.ref))throw Error('INVALID_FACTOR');
 }
}
export function factorVersion(versions:FactorVersion[],date:string,initial:FactorVersion){return versions.filter(v=>v.effective_from<=date).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.revision-a.revision)[0]??initial;}
