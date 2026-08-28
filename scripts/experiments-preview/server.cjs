// Isolated manual UI fixture. No credentials, real auth, API server or database.
/* eslint-disable @typescript-eslint/no-require-imports -- Node-only CommonJS preview runner using Next's bundled Webpack. */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), http = require("node:http");
const webpack = require("next/dist/compiled/webpack/webpack-lib");
const root = path.resolve(__dirname,"../.."), output = fs.mkdtempSync(path.join(os.tmpdir(),"axvital-wizard-preview-"));
webpack({ mode:"development", devtool:false, entry:path.join(__dirname,"preview.tsx"), output:{path:output,filename:"preview.js"},
  resolve:{extensions:[".tsx",".ts",".js"],alias:{"@":root,"next/link":path.join(__dirname,"navigation.tsx"),"next/navigation":path.join(__dirname,"navigation.tsx"),[path.join(root,"lib/supabase/browser")]:path.join(__dirname,"data.ts")}},
  module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(__dirname,"loader.cjs")}]},
},async(error,stats)=>{
  if(error||stats.hasErrors()){console.error(error??stats.toString({all:false,errors:true}));process.exitCode=1;return;}
  const css = await require("postcss")([require("@tailwindcss/postcss")({base:root})]).process(fs.readFileSync(path.join(root,"app/globals.css"),"utf8"),{from:path.join(root,"app/globals.css")});
  const server=http.createServer((req,res)=>{
    res.setHeader("Cache-Control","no-store");
    if(req.url==="/preview.js"){res.setHeader("Content-Type","text/javascript; charset=utf-8");res.end(fs.readFileSync(path.join(output,"preview.js")));}
    else if(req.url==="/preview.css"){res.setHeader("Content-Type","text/css");res.end(css.css);}
    else{res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local synthetic experiment preview</title><link rel="stylesheet" href="/preview.css"><div id="root"></div><script src="/preview.js"></script></html>');}
  });server.listen(3101,"127.0.0.1",()=>console.log("Synthetic-only UI preview: http://127.0.0.1:3101 (no live data or writes)"));
});
