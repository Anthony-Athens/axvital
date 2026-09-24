import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { database } from "../security/test-database.ts";
import { normalizeFoodName } from "./normalization.ts";

const examples = [
  ["  WHOLE\t Milk\n", "whole milk"], ["\r\f\vEggs   and  HAM  ", "eggs and ham"],
  ["", ""], ["   ", ""], ["Sugar-free", "sugar-free"], ["Sugar free", "sugar free"],
  ["2% Milk", "2% milk"], ["Café", "café"], ["Peas & Carrots", "peas & carrots"],
  ["O'Brien’s", "o'brien’s"], ["ÉCLAIR", "Éclair"],
];
test("normalization is deterministic, idempotent and preserves semantic punctuation", () => {
  for (const [input, expected] of examples) {
    assert.equal(normalizeFoodName(input), expected);
    assert.equal(normalizeFoodName(expected), expected);
  }
});

test("migration preserves data, enforces taxonomy constraints, atomic events and role access", async () => {
  const db = await database(false, undefined, "202609100001_product_milestones.sql");
  const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", other = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const sql = readFileSync(new URL("../../supabase/migrations/202609240001_logging_foundation.sql", import.meta.url), "utf8");
  const scalar = async (query: string) => (await db.query<{ n: number }>(query)).rows[0].n;
  try {
    await db.exec(`insert into public.health_events(user_id,title) values('${owner}','old event');`);
    const foodsBefore = await db.query("select id,name,category_id,common_aliases from public.foods order by id");
    const policiesBefore = await db.query("select * from pg_policies where tablename='health_events' order by policyname");
    await db.exec(sql);
    assert.deepEqual((await db.query("select id,name,category_id,common_aliases from public.foods order by id")).rows, foodsBefore.rows);
    assert.deepEqual((await db.query("select * from pg_policies where tablename='health_events' order by policyname")).rows, policiesBefore.rows);
    assert.equal((await db.query<{ input_method: string }>("select input_method from public.health_events")).rows[0].input_method, "manual");
    for (const [input, expected] of examples) assert.equal((await db.query<{ normalized: string }>("select public.axvital_normalize_food_name($1) normalized", [input])).rows[0].normalized, expected);
    // Re-run the exact seed/backfill statements: no duplicate reference data.
    const seed = sql.slice(sql.indexOf("insert into public.food_categories"), sql.lastIndexOf("commit;"));
    const counts = await db.query("select (select count(*) from public.food_categories) c,(select count(*) from public.food_aliases) a,(select count(*) from public.food_category_map) m");
    await db.exec(seed);
    assert.deepEqual((await db.query("select (select count(*) from public.food_categories) c,(select count(*) from public.food_aliases) a,(select count(*) from public.food_category_map) m")).rows, counts.rows);
    assert.equal(await scalar("select count(*)::int n from public.foods f where category_id is not null and not exists(select 1 from public.food_category_map m where m.food_id=f.id and m.category_id=f.category_id)"), 0);
    await db.exec("insert into public.foods(slug,name) values('test-food','  TEST Food  '),('test-food-2','TEST Food');");
    const food = (await db.query<{ id: string }>("select id from public.foods where slug='test-food'")).rows[0].id;
    await db.exec(`insert into public.food_aliases(food_id,alias) values('${food}','  Test ALIAS ');`);
    await assert.rejects(db.exec(`insert into public.food_aliases(food_id,alias) values('${food}','test  alias');`), /unique/);
    await assert.rejects(db.exec(`insert into public.food_aliases(food_id,alias) values('${food}','  ');`), /check constraint/);
    await assert.rejects(db.exec(`insert into public.food_aliases(food_id,alias) values('${other}','missing food');`), /foreign key/);
    await db.exec(`insert into public.food_category_map(food_id,category_id) select '${food}',id from public.food_categories where slug in ('beef','processed_meat');`);
    assert.equal(await scalar(`select count(*)::int n from public.food_category_map where food_id='${food}'`), 2);
    await assert.rejects(db.exec(`insert into public.food_category_map(food_id,category_id) select '${food}',id from public.food_categories where slug='beef';`), /unique/);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    assert.ok(await scalar("select count(*)::int n from public.food_aliases") > 0);
    assert.ok(await scalar("select count(*)::int n from public.food_category_map") > 0);
    for (const table of ["food_aliases", "food_category_map", "foods", "food_categories"]) {
      for (const statement of [`insert into public.${table} default values`, `update public.${table} set ${table === "food_category_map" ? "food_id=food_id" : "id=id"}`, `delete from public.${table}`]) await assert.rejects(db.exec(statement), /permission denied/);
    }
    await db.exec(`insert into public.health_events(user_id,title) values('${owner}','default new');`);
    for (const method of ["manual", "voice", "integration", "import", "system"]) await db.exec(`insert into public.health_events(user_id,input_method) values('${owner}','${method}');`);
    const before = await scalar("select count(*)::int n from public.health_events");
    await assert.rejects(db.exec(`insert into public.health_events(user_id,input_method) values('${owner}','manual'),('${owner}','garmin');`), /check constraint/);
    await assert.rejects(db.exec(`insert into public.health_events(user_id,input_method) values('${owner}','manual'),('${other}','manual');`), /row-level security/);
    await assert.rejects(db.exec(`insert into public.health_events(user_id,input_method) values('${owner}',null);`), /not-null/);
    assert.equal(await scalar("select count(*)::int n from public.health_events"), before);
    await db.exec(`insert into public.health_events(user_id,input_method) values('${owner}','voice'),('${owner}','voice');`);
    assert.equal(await scalar("select count(*)::int n from public.health_events"), before + 2);
    await db.exec(`reset role; update public.foods set is_active=false where id='${food}'; set role authenticated;`);
    assert.equal(await scalar(`select count(*)::int n from public.food_aliases where food_id='${food}'`), 0);
    assert.equal(await scalar(`select count(*)::int n from public.food_category_map where food_id='${food}'`), 0);
    await db.exec("reset role; set role anon;");
    for (const table of ["food_aliases", "food_category_map"]) await assert.rejects(db.exec(`select * from public.${table}`), /permission denied/);
    await db.exec(`reset role; delete from public.foods where id='${food}';`);
    assert.equal(await scalar(`select count(*)::int n from public.food_aliases where food_id='${food}'`), 0);
    assert.equal(await scalar(`select count(*)::int n from public.food_category_map where food_id='${food}'`), 0);
    const eventsBeforeRollback = await db.query("select id,user_id,title from public.health_events order by id");
    await db.exec(readFileSync(new URL("../../supabase/rollback/202609240001_logging_foundation_rollback.sql", import.meta.url), "utf8"));
    assert.deepEqual((await db.query("select id,user_id,title from public.health_events order by id")).rows, eventsBeforeRollback.rows);
    assert.deepEqual((await db.query("select id,name,category_id,common_aliases from public.foods where slug <> 'test-food-2' order by id")).rows, foodsBefore.rows);
  } finally { await db.close(); }
});
