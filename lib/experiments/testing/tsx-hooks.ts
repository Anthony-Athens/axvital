import * as nodeModule from "node:module";
import {readFileSync,existsSync} from "node:fs";
import {fileURLToPath,pathToFileURL} from "node:url";
import ts from "typescript";
type Context={parentURL?:string};
const {registerHooks}=nodeModule as unknown as {registerHooks(h:{resolve:(s:string,c:Context,next:(s:string,c:Context)=>unknown)=>unknown;load:(u:string,c:unknown,next:(u:string,c:unknown)=>unknown)=>unknown}):{deregister():void}};
export function testHooks(){return registerHooks({resolve(s,c,next){
 if(s==="server-only")return {url:"data:text/javascript,export{}",shortCircuit:true};
 if(s==="next/link")return next("next/link.js",c);
 if(s.startsWith("@/"))s=pathToFileURL(fileURLToPath(new URL("../../../../"+s.slice(2),import.meta.url))).href;
 if((s.startsWith(".")||s.startsWith("file:"))&&c.parentURL){const p=fileURLToPath(new URL(s,c.parentURL));for(const ext of [".ts",".tsx"])if(existsSync(p+ext))return next(pathToFileURL(p+ext).href,c);}
 return next(s,c);
 },load(u,c,next){if(u.endsWith(".tsx"))return {format:"module",source:ts.transpileModule(readFileSync(fileURLToPath(u),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(u,c);}});}
