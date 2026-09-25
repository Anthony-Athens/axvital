import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { MessageChannel } from "node:worker_threads";

const code=(await build({stdin:{contents:`import {act} from 'react';import {createRoot} from 'react-dom/client';import {NutritionHome} from './components/nutrition/NutritionHome';export {act};let root;export function mount(){root=createRoot(document.getElementById('root'));root.render(<NutritionHome/>)}export function unmount(){root.unmount()}`,resolveDir:process.cwd(),loader:"tsx"},jsx:"automatic",bundle:true,write:false,format:"iife",globalName:"Harness",platform:"browser",define:{"process.env.NODE_ENV":'"test"',"process.env":"{}"},plugins:[{name:"manual-recipe",setup(b){
  b.onResolve({filter:/^@\/lib\/supabase\/browser$/},()=>({path:"client",namespace:"mock"}));
  b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:`export const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:table=>{const q={select:()=>q,eq:()=>q,is:()=>q,gte:()=>q,lt:()=>q,order:()=>q,limit:()=>q,then:resolve=>resolve({data:table==='foods'?[window.globalFood]:table==='nutrition_entries'?window.entries:[],error:null})};return q},rpc:async(name,args)=>{window.writes.push({name,args});window.entries=[window.savedEntry];return {error:null}}});`}));
}}]})).outputFiles[0].text;
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const serving=(n:number,name:string,unit:string,calories:number)=>({id:id(n+100),food_id:id(n),serving_name:`1 ${unit}`,serving_quantity:1,serving_unit:unit,grams_equivalent:null,calories,protein_grams:1,carbohydrate_grams:1,fat_grams:1,is_default:true,display_order:0});
const component=(n:number,label:string,unit:string,quantity:number,calories:number)=>({food_id:id(n),label,source:"library",confidence:null,included:true,confirmed:false,categories:[],nutrition:{quantity,unit,serving_id:id(n+100),servings:[serving(n,label,unit,calories)]}});

test("manual recipe review edits, excludes, removes and matches additions; saves one meal and displays aggregate items",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"https://example.test",pretendToBeVisual:true,runScripts:"outside-only"}),w=dom.window,doc=w.document;
  const channels:MessageChannel[]=[];class Channel extends MessageChannel{constructor(){super();channels.push(this);}}
  const writes:{name:string;args:{rows:{nutrition:{recipe:{food_id:string;multiplier:number}[]}}[]}}[]=[];
  const food={label:"Eggs and Toast",canonical_name:"Eggs and Toast",food_id:id(1),recipe_unit:"serving",method:"exact",confirmed:false,categories:[],components:[component(2,"Egg","each",2,72),component(3,"Bread","slice",2,100)]};
  const draft={quantity:1,unit:"serving",recipe_unit:"serving",recipe_confirmed:false,servings:[],serving_id:null,meal_type:null,accept_incomplete:false,reference_confirmed:false};
  Object.assign(w,{MessageChannel:Channel,AbortController,AbortSignal,IS_REACT_ACT_ENVIRONMENT:true,writes,entries:[],globalFood:{id:id(1),name:food.label,brand_name:null,common_aliases:[],recipe_unit:"serving",source_reference:"axvital:component-library:v1"},savedEntry:{id:id(900),title:food.label,consumed_at:new Date().toISOString(),nutrition_status:"recorded",items:[{...serving(2,"Egg","each",216),id:id(901),source_name:"Egg",quantity_multiplier:3,serving_name_snapshot:"1 each"},{...serving(4,"Milk","cup",149),id:id(902),source_name:"Milk",quantity_multiplier:1,serving_name_snapshot:"1 cup"}]}});
  w.fetch=(async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body));
    if(body.label==="Milk") return Response.json({food:{...food,label:"Milk",canonical_name:"Milk",food_id:id(4),recipe_unit:null,components:[]},nutrition:{...draft,quantity:null,unit:null,servings:[serving(4,"Milk","cup",149)],serving_id:null}});
    return Response.json({food,nutrition:draft});
  }) as typeof fetch;
  const h=w.eval(code+';Harness;') as {act:(fn:()=>unknown)=>Promise<void>;mount:()=>void;unmount:()=>void};
  const settle=()=>h.act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  const click=async(text:string,last=false)=>{const buttons=[...doc.querySelectorAll('button')].filter(b=>b.textContent===text);const b=last?buttons.at(-1):buttons[0];assert.ok(b,text);await h.act(async()=>b.click());await settle();};
  const label=(text:string)=>{const n=[...doc.querySelectorAll('label')].find(l=>l.textContent?.startsWith(text));assert.ok(n,text);return n;};
  const check=async(text:string)=>{await h.act(async()=>(label(text).querySelector('input') as HTMLInputElement).click());};
  const field=async(text:string,value:string)=>{const n=label(text).querySelector('input,select') as HTMLInputElement;assert.ok(n);await h.act(async()=>{Object.getOwnPropertyDescriptor(n.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype,'value')!.set!.call(n,value);n.dispatchEvent(new w.Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
  try {
    await h.act(async()=>h.mount());await settle();await click("Eggs and Toast");
    assert.match(doc.body.textContent!,/Macros unavailable/);
    await check("I checked this component recipe");assert.match(doc.body.textContent!,/344 kcal/);
    await field("Quantity for Egg","3");assert.match(doc.body.textContent!,/416 kcal/);
    await check("Bread");assert.match(doc.body.textContent!,/216 kcal/);
    await check("Bread");await click("Remove component Bread");assert.match(doc.body.textContent!,/216 kcal/);
    await field("Add a component","Milk");await click("Add");assert.match(doc.body.textContent!,/Macros unavailable/);
    await click("Match component",true);await field("Quantity for Milk","1");await field("Unit for Milk","cup");await field("Serving for Milk",id(104));assert.match(doc.body.textContent!,/365 kcal/);
    await click("Log food");assert.equal(writes.length,1);assert.equal(writes[0].name,"ingest_manual_nutrition");
    assert.equal(writes[0].args.rows.length,1);assert.deepEqual(JSON.parse(JSON.stringify(writes[0].args.rows[0].nutrition.recipe.map(i=>i.multiplier))),[3,1]);
    assert.match(doc.body.textContent!,/365 calories/);assert.equal([...doc.querySelectorAll('button')].filter(b=>b.getAttribute('aria-label')==='Delete Eggs and Toast food log').length,1);
    assert.match(doc.body.textContent!,/Components \(2\)/);
  } finally {await h.act(async()=>h.unmount());dom.window.close();channels.forEach(c=>{c.port1.close();c.port2.close();});}
});
