import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/202608060007_add_red_meat_foods.sql", "utf8");
const repairSql = readFileSync("supabase/migrations/202608060008_repair_red_meat_food_servings.sql", "utf8");
const rows = [...sql.matchAll(/^\('([^']+)','([^']+)',array\[([^\]]*)\],([\d.]+),([\d.]+),([\d.]+),([\d.]+)\),?$/gm)];

test("red-meat migration contains 28 unique curated foods", () => {
  assert.equal(rows.length, 28);
  assert.equal(new Set(rows.map((row) => row[1])).size, 28);
  assert.match(sql, /'curated',false,true/);
});
test("requested red-meat catalog and aliases are present", () => {
  for (const expected of [
    "Ground Beef, 90% Lean, Cooked", "Sirloin Steak, Cooked", "Ribeye Steak, Cooked",
    "New York Strip Steak, Cooked", "Filet Mignon, Cooked", "Lamb Chop, Cooked",
    "Pork Tenderloin, Cooked", "Bison, Ground, Cooked", "Venison, Cooked",
    "'hamburger'", "'strip steak'", "'buffalo'", "'deer meat'",
  ]) assert.ok(sql.includes(expected), expected);
});
test("every catalog food receives an idempotent positive default-capable 4 oz serving", () => {
  assert.match(sql, /'4 oz',4,'oz',113/);
  assert.match(sql, /not exists\(select 1 from public\.food_servings existing/);
  assert.match(sql, /existing\.is_default/);
  for (const row of rows) {
    assert.ok(Number(row[4]) >= 0);
    assert.ok(Number(row[5]) >= 0);
    assert.ok(Number(row[6]) >= 0);
    assert.ok(Number(row[7]) >= 0);
  }
});
test("repair resolves all 28 persisted foods by slug in a later statement", () => {
  const repairRows = [...repairSql.matchAll(/^\('([^']+)',([\d.]+),([\d.]+),([\d.]+),([\d.]+)\),?$/gm)];
  assert.equal(repairRows.length, 28);
  assert.equal(new Set(repairRows.map((row) => row[1])).size, 28);
  assert.match(repairSql, /from catalog join public\.foods food on food\.slug=catalog\.slug/);
});
test("repair preserves existing servings and creates exactly one deterministic default", () => {
  assert.match(repairSql, /where not exists\([\s\S]*existing\.serving_quantity=4/);
  assert.match(repairSql, /not exists\(select 1 from public\.food_servings existing where existing\.food_id=food\.id and existing\.is_default\)/);
  assert.match(repairSql, /where current_default\.food_id=serving\.food_id and current_default\.is_default/);
});
