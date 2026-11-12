// Local-only visual QA of the signed-in screens with synthetic data.
// No auth bypass or fixture route is added to the app: real components are bundled
// with an in-memory Supabase stand-in and rendered on a separate local server.
//
//   node scripts/preview-app.mjs
//   open http://127.0.0.1:3102/?screen=today   (today|track|workouts|session|nutrition|weekly)
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const screens = {
  today: { path: "/today", module: "./app/checkin/page", name: "default" },
  track: { path: "/track", module: "./app/track/page", name: "default" },
  workouts: {
    path: "/workouts",
    module: "./components/workouts/WorkoutsHome",
    name: "WorkoutsHome",
  },
  session: {
    path: "/workouts/sessions/session-1",
    module: "./components/workouts/WorkoutExecution",
    name: "WorkoutExecution",
  },
  nutrition: {
    path: "/health/nutrition",
    module: "./components/nutrition/NutritionHome",
    name: "NutritionHome",
  },
  weekly: { path: "/weekly-overview", module: "./app/weekly-overview/page", name: "default" },
};

const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import "./scripts/preview-data.mjs";
import { Navbar } from "./components/Navbar";
${Object.entries(screens)
  .map(
    ([key, s]) =>
      `import ${s.name === "default" ? `S_${key}` : `{ ${s.name} as S_${key} }`} from "${s.module}";`,
  )
  .join("\n")}
const screens = { ${Object.keys(screens)
  .map((k) => `${k}: S_${k}`)
  .join(", ")} };
const key = new URLSearchParams(location.search).get("screen") || "today";
const Screen = screens[key] || screens.today;
window.__path = ${JSON.stringify(Object.fromEntries(Object.entries(screens).map(([k, s]) => [k, s.path])))}[key];
createRoot(document.getElementById("root")).render(
  <>
    <Navbar />
    <main id="main-content" className="min-h-dvh pt-16 lg:pt-20"><Screen /></main>
  </>,
);
`;

const supabaseMock = `
const auth = {
  getUser: async () => ({ data: { user: { id: "preview-user", email: "preview@example.test" } }, error: null }),
  getSession: async () => ({ data: { session: { user: { id: "preview-user" } } }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signOut: async () => ({ error: null }),
};
function builder(table) {
  let rows = (window.DB[table] || []).slice();
  let mode = "many", head = false;
  const keep = (k, test) => { rows = rows.filter((r) => !(k in r) || test(r[k])); return q; };
  const q = {
    select(_c, opts) { if (opts && opts.head) head = true; return q; },
    eq: (k, v) => keep(k, (x) => x === v), neq: (k, v) => keep(k, (x) => x !== v),
    in: (k, v) => keep(k, (x) => v.includes(x)), gte: (k, v) => keep(k, (x) => x >= v),
    lte: (k, v) => keep(k, (x) => x <= v), gt: (k, v) => keep(k, (x) => x > v),
    lt: (k, v) => keep(k, (x) => x < v), is: (k, v) => keep(k, (x) => (x ?? null) === v),
    not: () => q, or: () => q, ilike: () => q, like: () => q, contains: () => q, filter: () => q, match: () => q, textSearch: () => q, overlaps: () => q,
    order(k, o) { const dir = o && o.ascending === false ? -1 : 1; rows.sort((a, b) => (a[k] ?? "") > (b[k] ?? "") ? dir : (a[k] ?? "") < (b[k] ?? "") ? -dir : 0); return q; },
    limit(n) { rows = rows.slice(0, n); return q; }, range(a, b) { rows = rows.slice(a, b + 1); return q; },
    insert(v) { rows = [].concat(v).map((x) => ({ id: "new-" + Math.random().toString(36).slice(2), ...x })); return q; },
    upsert(v) { rows = [].concat(v); return q; }, update(v) { rows = rows.map((r) => ({ ...r, ...v })); return q; }, delete() { return q; },
    single() { mode = "single"; return q; }, maybeSingle() { mode = "maybe"; return q; }, abortSignal() { return q; },
    then(res, rej) {
      const data = mode === "many" ? (head ? null : rows) : rows[0] ?? null;
      return Promise.resolve({ data, error: null, count: rows.length }).then(res, rej);
    },
  };
  return q;
}
export const supabase = {
  auth, from: builder,
  rpc: async (name, args) => (window.RPC[name] ? window.RPC[name](args) : { data: null, error: null }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
};
export const createClient = () => supabase;
`;

const mocks = {
  "@/lib/supabase/client": supabaseMock,
  "@/lib/supabase/browser": supabaseMock,
  "next/navigation": `
    export const useRouter = () => ({ push: (p) => console.log("navigate", p), replace() {}, refresh() {}, back() {}, prefetch() {} });
    export const usePathname = () => window.__path;
    export const useSearchParams = () => new URLSearchParams(location.search);
    export const useParams = () => ({ id: "session-1" });
    export const notFound = () => { throw new Error("notFound"); };
    export const redirect = () => {};`,
  "next/link": `import React from "react"; export default function Link({ href, prefetch, replace, scroll, ...props }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...props }); }`,
};

async function bundle() {
  const result = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    plugins: [
      {
        name: "preview-mocks",
        setup(b) {
          b.onResolve(
            { filter: /^(next\/(navigation|link)|@\/lib\/supabase\/(client|browser))$/ },
            (a) => ({ path: a.path, namespace: "mock" }),
          );
          b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
            contents: mocks[a.path],
            resolveDir: process.cwd(),
            loader: "jsx",
          }));
        },
      },
    ],
    logLevel: "error",
  });
  return result.outputFiles[0].text;
}

async function css() {
  const source = readFileSync("app/globals.css", "utf8");
  const out = await postcss([tailwind({ base: process.cwd() })]).process(source, {
    from: "app/globals.css",
  });
  return out.css;
}

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  try {
    if (request.url === "/bundle.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(await bundle());
      return;
    }
    if (request.url === "/style.css") {
      response.setHeader("Content-Type", "text/css");
      response.end(await css());
      return;
    }
    response.setHeader("Content-Type", "text/html");
    if (request.url.startsWith("/frame")) {
      // Phone-width capture: headless browsers enforce a minimum window width.
      const params = new URL(request.url, "http://x").searchParams;
      const w = Number(params.get("w")) || 390;
      const h = Number(params.get("h")) || 2400;
      response.end(
        `<!doctype html><body style="margin:0;background:#000"><iframe src="/?screen=${encodeURIComponent(params.get("screen") || "today")}" style="border:0;width:${w}px;height:${h}px;display:block"></iframe></body>`,
      );
      return;
    }
    response.end(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AXVital synthetic preview</title><link rel="stylesheet" href="/style.css"></head><body class="min-h-full bg-ground text-fg"><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  } catch (error) {
    response.statusCode = 500;
    response.end(String(error && error.stack ? error.stack : error));
  }
});
server.listen(3102, "127.0.0.1", () =>
  console.log("Synthetic app preview: http://127.0.0.1:3102/?screen=today"),
);
