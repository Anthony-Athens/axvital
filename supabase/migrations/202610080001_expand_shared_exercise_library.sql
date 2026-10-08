-- Add shared exercises without changing IDs, user exercises, or workout snapshots.
-- Squat to Press/Thruster and Plank Drag/Pull Through are searchable aliases.
-- Icon Carry is intentionally excluded pending a definition. Descriptions are optional.
do $$
declare
  seed record;
  existing_id uuid;
  candidates uuid[];
begin
  for seed in select * from (values
    ('Kettlebell Swing', array['Two Hand Kettlebell Swing','Two Handed Kettlebell Swing','kb swing','KB Swing']::text[], 'conditioning', 'hinge', 'full_body', 'kettlebell', 'repetitions'),
    ('Goblet Squat', array['Kettlebell Goblet Squat','Goblet Squat']::text[], 'strength', 'squat', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('One Hand Kettlebell Swing', array['One Hand KB Swing']::text[], 'conditioning', 'hinge', 'full_body', 'kettlebell', 'repetitions'),
    ('Hand to Hand Kettlebell Swing', array['Hand to Hand KB Swing']::text[], 'conditioning', 'hinge', 'full_body', 'kettlebell', 'repetitions'),
    ('Double Kettlebell Swing', array['Double KB Swing']::text[], 'conditioning', 'hinge', 'full_body', 'kettlebell', 'repetitions'),
    ('Dead Stop Kettlebell Swing', array['Dead Stop KB Swing']::text[], 'conditioning', 'hinge', 'full_body', 'kettlebell', 'repetitions'),
    ('Staggered Stance Kettlebell Swing', array['Staggered Stance KB Swing']::text[], 'conditioning', 'hinge', 'full_body', 'kettlebell', 'repetitions'),
    ('Kettlebell Deadlift', array['KB Deadlift']::text[], 'strength', 'hinge', 'hamstrings', 'kettlebell', 'weight_reps'),
    ('Kettlebell Suitcase Deadlift', array['KB Suitcase Deadlift']::text[], 'strength', 'hinge', 'hamstrings', 'kettlebell', 'weight_reps'),
    ('Kettlebell Romanian Deadlift', array['KB Romanian Deadlift']::text[], 'strength', 'hinge', 'hamstrings', 'kettlebell', 'weight_reps'),
    ('Single Leg Kettlebell Romanian Deadlift', array['Single Leg KB Romanian Deadlift']::text[], 'strength', 'hinge', 'hamstrings', 'kettlebell', 'weight_reps'),
    ('Kickstand Kettlebell Romanian Deadlift', array['Kickstand KB Romanian Deadlift']::text[], 'strength', 'hinge', 'hamstrings', 'kettlebell', 'weight_reps'),
    ('Kettlebell Sumo Deadlift', array['KB Sumo Deadlift']::text[], 'strength', 'hinge', 'hamstrings', 'kettlebell', 'weight_reps'),
    ('Kettlebell Good Morning', array['KB Good Morning']::text[], 'strength', 'hinge', 'hamstrings', 'kettlebell', 'weight_reps'),
    ('One Arm Kettlebell Clean', array['One Arm KB Clean']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Double Kettlebell Clean', array['Double KB Clean']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Dead Kettlebell Clean', array['Dead KB Clean']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Hang Kettlebell Clean', array['Hang KB Clean']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Swing Clean', array['KB Swing Clean']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Clean and Press', array['KB Clean and Press']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Clean and Jerk', array['KB Clean and Jerk']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell High Pull', array['KB High Pull']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Snatch', array['KB Snatch']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Dead Kettlebell Snatch', array['Dead KB Snatch']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Double Kettlebell Snatch', array['Double KB Snatch']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Long Cycle Clean and Jerk', array['KB Long Cycle Clean and Jerk']::text[], 'strength', 'olympic_lift', 'full_body', 'kettlebell', 'weight_reps'),
    ('Double Kettlebell Front Squat', array['Double KB Front Squat']::text[], 'strength', 'squat', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Suitcase Squat', array['KB Suitcase Squat']::text[], 'strength', 'squat', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Sumo Squat', array['KB Sumo Squat']::text[], 'strength', 'squat', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Cossack Squat', array['KB Cossack Squat']::text[], 'strength', 'squat', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Split Squat', array['KB Split Squat']::text[], 'strength', 'lunge', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Reverse Lunge', array['KB Reverse Lunge']::text[], 'strength', 'lunge', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Forward Lunge', array['KB Forward Lunge']::text[], 'strength', 'lunge', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Walking Lunge', array['KB Walking Lunge']::text[], 'strength', 'lunge', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Lateral Lunge', array['KB Lateral Lunge']::text[], 'strength', 'lunge', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Curtsy Lunge', array['KB Curtsy Lunge']::text[], 'strength', 'lunge', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Step Up', array['KB Step Up']::text[], 'strength', 'lunge', 'quadriceps', 'kettlebell', 'weight_reps'),
    ('Kettlebell Thruster', array['Kettlebell Squat to Press','KB Thruster']::text[], 'strength', 'squat', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Strict Overhead Press', array['KB Strict Overhead Press']::text[], 'strength', 'vertical_push', 'shoulders', 'kettlebell', 'weight_reps'),
    ('Double Kettlebell Overhead Press', array['Double KB Overhead Press']::text[], 'strength', 'vertical_push', 'shoulders', 'kettlebell', 'weight_reps'),
    ('Kettlebell Push Press', array['KB Push Press']::text[], 'strength', 'vertical_push', 'shoulders', 'kettlebell', 'weight_reps'),
    ('Kettlebell Jerk', array['KB Jerk']::text[], 'strength', 'vertical_push', 'shoulders', 'kettlebell', 'weight_reps'),
    ('Bottoms Up Kettlebell Press', array['Bottoms Up KB Press']::text[], 'strength', 'vertical_push', 'shoulders', 'kettlebell', 'weight_reps'),
    ('Half Kneeling Kettlebell Press', array['Half Kneeling KB Press']::text[], 'strength', 'vertical_push', 'shoulders', 'kettlebell', 'weight_reps'),
    ('Kettlebell Z Press', array['KB Z Press']::text[], 'strength', 'vertical_push', 'shoulders', 'kettlebell', 'weight_reps'),
    ('Kettlebell Floor Press', array['KB Floor Press']::text[], 'strength', 'horizontal_push', 'chest', 'kettlebell', 'weight_reps'),
    ('Kettlebell Bench Press', array['KB Bench Press']::text[], 'strength', 'horizontal_push', 'chest', 'kettlebell', 'weight_reps'),
    ('Alternating Kettlebell Floor Press', array['Alternating KB Floor Press']::text[], 'strength', 'horizontal_push', 'chest', 'kettlebell', 'weight_reps'),
    ('Kettlebell Bent Over Row', array['KB Bent Over Row']::text[], 'strength', 'horizontal_pull', 'back', 'kettlebell', 'weight_reps'),
    ('Kettlebell Gorilla Row', array['KB Gorilla Row']::text[], 'strength', 'horizontal_pull', 'back', 'kettlebell', 'weight_reps'),
    ('Kettlebell Renegade Row', array['KB Renegade Row']::text[], 'strength', 'horizontal_pull', 'back', 'kettlebell', 'weight_reps'),
    ('Kettlebell Upright Row', array['KB Upright Row']::text[], 'strength', 'vertical_pull', 'shoulders', 'kettlebell', 'weight_reps'),
    ('Kettlebell Halo', array['KB Halo']::text[], 'mobility', 'mobility', 'shoulders', 'kettlebell', 'repetitions'),
    ('Kettlebell Suitcase Carry', array['KB Suitcase Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Kettlebell Farmer''s Carry', array['KB Farmer''s Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Kettlebell Front Rack Carry', array['KB Front Rack Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Double Kettlebell Front Rack Carry', array['Double KB Front Rack Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Kettlebell Goblet Carry', array['KB Goblet Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Kettlebell Waiter''s Carry', array['KB Waiter''s Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Double Kettlebell Overhead Carry', array['Double KB Overhead Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Bottoms Up Kettlebell Carry', array['Bottoms Up KB Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Bottoms Up Kettlebell Rack Carry', array['Bottoms Up KB Rack Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Offset Kettlebell Carry', array['Offset KB Carry']::text[], 'conditioning', 'carry', 'full_body', 'kettlebell', 'distance_duration'),
    ('Kettlebell Suitcase Hold', array['KB Suitcase Hold']::text[], 'strength', 'carry', 'full_body', 'kettlebell', 'duration'),
    ('Kettlebell Rack Hold', array['KB Rack Hold']::text[], 'strength', 'carry', 'full_body', 'kettlebell', 'duration'),
    ('Kettlebell Overhead Hold', array['KB Overhead Hold']::text[], 'strength', 'carry', 'full_body', 'kettlebell', 'duration'),
    ('Kettlebell Turkish Get Up', array['KB Turkish Get Up']::text[], 'strength', 'custom', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Half Get Up', array['KB Half Get Up']::text[], 'strength', 'custom', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Get Up to Elbow', array['KB Get Up to Elbow']::text[], 'strength', 'custom', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Get Up to Hand', array['KB Get Up to Hand']::text[], 'strength', 'custom', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Windmill', array['KB Windmill']::text[], 'strength', 'rotation', 'core', 'kettlebell', 'weight_reps'),
    ('Half Kneeling Kettlebell Windmill', array['Half Kneeling KB Windmill']::text[], 'strength', 'rotation', 'core', 'kettlebell', 'weight_reps'),
    ('Kettlebell Bent Press', array['KB Bent Press']::text[], 'strength', 'vertical_push', 'full_body', 'kettlebell', 'weight_reps'),
    ('Kettlebell Arm Bar', array['KB Arm Bar']::text[], 'mobility', 'mobility', 'shoulders', 'kettlebell', 'duration'),
    ('Kettlebell Plank Pull Through', array['Kettlebell Plank Drag','KB Plank Pull Through']::text[], 'strength', 'anti_rotation', 'core', 'kettlebell', 'weight_reps'),
    ('Kettlebell Russian Twist', array['KB Russian Twist']::text[], 'strength', 'rotation', 'core', 'kettlebell', 'weight_reps'),
    ('Kettlebell Dead Bug Hold', array['KB Dead Bug Hold']::text[], 'strength', 'anti_extension', 'core', 'kettlebell', 'duration'),
    ('Kettlebell Weighted Sit Up', array['KB Weighted Sit Up']::text[], 'strength', 'isolation', 'core', 'kettlebell', 'weight_reps'),
    ('Kettlebell Side Bend', array['KB Side Bend']::text[], 'strength', 'isolation', 'core', 'kettlebell', 'weight_reps'),
    ('Kettlebell Swing → Clean → Press', array['KB Swing → Clean → Press','Kettlebell Swing and Clean and Press']::text[], 'conditioning', 'custom', 'full_body', 'kettlebell', 'completion'),
    ('Kettlebell Clean → Squat → Press', array['KB Clean → Squat → Press','Kettlebell Clean and Squat and Press']::text[], 'conditioning', 'custom', 'full_body', 'kettlebell', 'completion'),
    ('Kettlebell Snatch → Overhead Squat', array['KB Snatch → Overhead Squat','Kettlebell Snatch and Overhead Squat']::text[], 'conditioning', 'custom', 'full_body', 'kettlebell', 'completion'),
    ('Kettlebell Get Up → Overhead Carry', array['KB Get Up → Overhead Carry','Kettlebell Get Up and Overhead Carry']::text[], 'conditioning', 'custom', 'full_body', 'kettlebell', 'completion'),
    ('Kettlebell Reverse Lunge → Press', array['KB Reverse Lunge → Press','Kettlebell Reverse Lunge and Press']::text[], 'conditioning', 'custom', 'full_body', 'kettlebell', 'completion'),
    ('Kettlebell Clean → Front Squat → Reverse Lunge', array['KB Clean → Front Squat → Reverse Lunge','Kettlebell Clean and Front Squat and Reverse Lunge']::text[], 'conditioning', 'custom', 'full_body', 'kettlebell', 'completion'),
    ('Kettlebell Swing → High Pull → Snatch', array['KB Swing → High Pull → Snatch','Kettlebell Swing and High Pull and Snatch']::text[], 'conditioning', 'custom', 'full_body', 'kettlebell', 'completion'),
    ('Barbell Shrugs', array['Barbell Shrug']::text[], 'strength', 'isolation', 'back', 'barbell', 'weight_reps'),
    ('Weighted Dips', array['Weighted Dip']::text[], 'strength', 'vertical_push', 'triceps', null, 'weight_reps'),
    ('Preacher Curl', array[]::text[], 'strength', 'isolation', 'biceps', null, 'weight_reps'),
    ('Reaction Ball Training', array[]::text[], 'conditioning', 'locomotion', 'full_body', 'other', 'duration'),
    ('Calf Raise', array['Calf Raises']::text[], 'strength', 'isolation', 'calves', null, 'repetitions'),
    ('Crunch', array['Crunches']::text[], 'strength', 'isolation', 'core', 'bodyweight', 'bodyweight_reps'),
    ('Barbell Roll-Out', array['Barbell Rollout']::text[], 'strength', 'anti_extension', 'core', 'barbell', 'weight_reps'),
    ('Back Extensions', array['Back Extension']::text[], 'strength', 'hinge', 'back', null, 'repetitions')
  ) as catalog(name, aliases, category, movement_pattern, primary_muscle_group, equipment, default_tracking_type)
  loop
    -- Match canonical names AND alternate names, ignoring punctuation/case.
    select array_agg(e.id order by e.id) into candidates
    from public.exercises e
    where e.user_id is null and exists (
      select 1 from unnest(array[seed.name] || seed.aliases) requested(name)
      cross join lateral unnest(array[e.name] || e.aliases) stored(name)
      where lower(regexp_replace(requested.name, '[^a-zA-Z0-9]+', '', 'g')) =
            lower(regexp_replace(stored.name, '[^a-zA-Z0-9]+', '', 'g'))
    );
    if cardinality(candidates) > 1 then
      raise exception 'Ambiguous shared exercise matches for %; reconcile existing records without deleting workout references', seed.name;
    end if;
    existing_id := candidates[1];
    if existing_id is null then
      insert into public.exercises (user_id, name, normalized_name, aliases, category, movement_pattern, primary_muscle_group, equipment, default_tracking_type)
      values (null, seed.name, lower(regexp_replace(seed.name, '[^a-zA-Z0-9]+', '', 'g')), array(select distinct alias from unnest(seed.aliases) alias order by alias), seed.category, seed.movement_pattern, seed.primary_muscle_group, seed.equipment, seed.default_tracking_type);
    else
      -- Preserve existing names/metadata and merge aliases rather than replacing them.
      update public.exercises e set aliases = array(
        select distinct alias from unnest(e.aliases || seed.aliases || case when e.name = seed.name then '{}'::text[] else array[seed.name] end) alias order by alias
      ), is_archived = false where e.id = existing_id and (e.is_archived or not (e.aliases @> seed.aliases) or (e.name <> seed.name and not (seed.name = any(e.aliases))));
    end if;
  end loop;
end;
$$;
