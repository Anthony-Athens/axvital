import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { database } from "../security/test-database.ts";
import { createExercise, searchExercises, ExerciseDuplicateError } from "./exercises.ts";
import { EXERCISE_CATEGORIES, EQUIPMENT_OPTIONS, MOVEMENT_PATTERNS, TRACKING_TYPES } from "./exercise-metadata.ts";
import type { Exercise } from "./types.ts";

const migration = readFileSync(new URL("../../supabase/migrations/202610080001_expand_shared_exercise_library.sql", import.meta.url), "utf8");
const user = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

test("expanded library preserves IDs, is idempotent, searchable, filtered and usable in workouts", async () => {
  const db = await database(false, undefined, "202609260001_fooddata_central.sql");
  try {
    const before = (await db.query<Exercise>("select * from exercises order by id")).rows;
    await db.exec(migration);
    const all = (await db.query<Exercise>("select * from exercises order by id")).rows;
    assert.equal(all.length - before.length, 92);
    for (const old of before) {
      const current = all.find(e => e.id === old.id)!;
      assert.equal(current.name, old.name);
      assert.equal(current.equipment, old.equipment);
      assert.ok(old.aliases.every(alias => current.aliases.includes(alias)));
    }
    await db.exec(migration);
    assert.deepEqual((await db.query<Exercise>("select * from exercises order by id")).rows, all);
    assert.equal(new Set(all.map(e => e.normalized_name)).size, all.length);
    assert.ok(!all.some(e => e.name === "Icon Carry"));
    for (const e of all) {
      assert.ok(EXERCISE_CATEGORIES.includes(e.category));
      assert.ok(!e.equipment || EQUIPMENT_OPTIONS.includes(e.equipment));
      assert.ok(!e.movement_pattern || MOVEMENT_PATTERNS.includes(e.movement_pattern));
      assert.ok(TRACKING_TYPES.includes(e.default_tracking_type));
    }
    for (const name of ["Preacher Curl", "Calf Raise", "Back Extensions", "Weighted Dips"])
      assert.equal(all.find(e => e.name === name)!.equipment, null);

    // Authenticated PostgreSQL RLS and foreign keys, with the builder's group/item fields.
    await db.exec(`select set_config('request.jwt.claim.sub','${user}',false);set role authenticated;`);
    const template = (await db.query<{id:string}>("insert into workout_templates(user_id,name) values($1,'Catalog validation') returning id", [user])).rows[0].id;
    const group = (await db.query<{id:string}>("insert into workout_template_groups(user_id,workout_template_id,group_order,group_label,group_type) values($1,$2,0,'A','circuit') returning id", [user, template])).rows[0].id;
    for (const [index, e] of all.entries()) {
      await db.query("insert into workout_template_exercises(user_id,workout_template_id,workout_template_group_id,exercise_id,exercise_order,display_label,tracking_type,target_sets) values($1,$2,$3,$4,$5,$6,$7,1)", [user,template,group,e.id,index,`A${index+1}`,e.default_tracking_type]);
    }
    assert.equal((await db.query("select * from workout_template_exercises")).rows.length, all.length);

    // Exercise search uses actual database rows, including a result beyond the old 300-row cap.
    await db.exec(`insert into exercises(user_id,name,category,default_tracking_type) select '${user}', 'AAA custom ' || n, 'custom','repetitions' from generate_series(1,310) n;`);
    const client = {auth:{getUser:async()=>({data:{user:{id:user}},error:null})},from(table:string){
      assert.equal(table,"exercises");
      const filters: [string,unknown][]=[]; let offset=0,limit=300;
      const q={select(){return q;},or(){return q;},eq(key:string,value:unknown){filters.push([key,value]);return q;},order(){return q;},range(start:number,end:number){offset=start;limit=end-start+1;return q;},
        then(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown){
          const params:unknown[]=[];
          const where=filters.map(([key,value])=>{assert.match(key,/^[a-z_]+$/);params.push(value);return `${key}=$${params.length}`;}).join(' and ');
          return db.query<Exercise>(`select * from exercises where ${where} order by name,id limit ${limit} offset ${offset}`,params).then(r=>resolve({data:r.rows,error:null}),reject);
        }}; return q;
    }} as unknown as SupabaseClient;
    for (const [query,name] of [["two-hand kettlebell swing","Kettlebell Swing"],["kettlebell goblet squat","Goblet Squat"],["KB snatch","Kettlebell Snatch"],["kettlebell squat to press","Kettlebell Thruster"],["kettlebell plank drag","Kettlebell Plank Pull Through"],["farmer’s carry","Kettlebell Farmer's Carry"],["barbell shrugs","Barbell Shrugs"],["reaction ball","Reaction Ball Training"],["back extensions","Back Extensions"],["crunch","Crunch"]]) {
      assert.ok((await searchExercises(client,query)).some(e=>e.name===name),query);
    }
    const carries=await searchExercises(client,"",{equipment:"kettlebell",movement_pattern:"carry",category:"conditioning"});
    assert.equal(carries.length,10);
    await assert.rejects(createExercise(client,{name:"KETTLEBELL Goblet-Squat!",category:"strength",default_tracking_type:"weight_reps"}),ExerciseDuplicateError);
    // An alternate existing shared name is reused rather than inserted under the seed name.
    await db.exec("reset role; update exercises set name='Barbell Shrug', aliases='{}' where name='Barbell Shrugs';");
    await db.exec(migration);
    assert.equal((await db.query("select * from exercises where user_id is null")).rows.length,all.length);
    assert.equal((await db.query<{id:string}>("select id from exercises where name='Barbell Shrug'")).rows[0].id,all.find(e=>e.name==='Barbell Shrugs')!.id);
  } finally { await db.close(); }
});
