import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { conditionCampaigns } from "./conditions.ts";

test("real metadata, sitemap and robots agree on clean production URLs", async () => {
  const bundle = await build({stdin:{contents:`export {generateMetadata} from './app/conditions/[slug]/page';export {default as sitemap} from './app/sitemap';export {default as robots} from './app/robots';`,resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"render-boundary",setup(b){
    b.onResolve({filter:/^(next\/navigation|@\/components\/campaigns\/ConditionLandingPage)$/},a=>({path:a.path,namespace:"mock"}));
    b.onLoad({filter:/.*/,namespace:"mock"},a=>({contents:a.path==="next/navigation"?'export function notFound(){throw Error("404")}':'export const ConditionLandingPage=()=>null;'}));
  }}]});
  const result={exports:{} as {generateMetadata:(p:unknown)=>Promise<{title:string;description:string;alternates:{canonical:string};robots:{index:boolean};openGraph:{url:string}}>;sitemap:()=>{url:string}[];robots:()=>{rules:{disallow:string[]};sitemap:string}}};
  runInNewContext(bundle.outputFiles[0].text,{module:result,exports:result.exports,process:{env:{NEXT_PUBLIC_APP_URL:"http://localhost:3000"}},Date,Intl,URL});
  const titles=new Set(), descriptions=new Set();
  for(const slug of Object.keys(conditionCampaigns)) {
    const plain=await result.exports.generateMetadata({params:Promise.resolve({slug})});
    const campaign=await result.exports.generateMetadata({params:Promise.resolve({slug}),searchParams:Promise.resolve({utm_source:"google",utm_campaign:"anything"})});
    assert.equal(JSON.stringify(plain),JSON.stringify(campaign));
    assert.equal(plain.alternates.canonical,`https://axvital.com/conditions/${slug}`);
    assert.equal(plain.openGraph.url,plain.alternates.canonical);
    assert.equal(plain.robots.index,true);
    assert.ok(result.exports.sitemap().some(row=>row.url===plain.alternates.canonical));
    assert.ok(result.exports.robots().rules.disallow.every(path=>!`/conditions/${slug}`.startsWith(path)));
    titles.add(plain.title);descriptions.add(plain.description);
  }
  assert.equal(titles.size,3);assert.equal(descriptions.size,3);
  assert.equal(result.exports.robots().sitemap,"https://axvital.com/sitemap.xml");
  await assert.rejects(result.exports.generateMetadata({params:Promise.resolve({slug:"unknown"})}),/404/);
});
