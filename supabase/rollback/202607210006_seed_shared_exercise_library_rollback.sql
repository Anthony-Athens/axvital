delete from public.exercises
where user_id is null and normalized_name in (
  'backsquat','frontsquat','gobletsquat','romaniandeadlift','conventionaldeadlift','hipthrust','glutebridge','walkinglunge','reverselunge','bulgariansplitsquat',
  'benchpress','inclinebenchpress','dumbbellbenchpress','pushup','dumbbellfly','overheadpress','dumbbellshoulderpress','landminepress',
  'pullup','chinup','latpulldown','barbellrow','dumbbellrow','seatedcablerow','barbellcurl','dumbbellcurl','hammercurl','tricepspushdown','skullcrusher','benchdip',
  'plank','sideplank','deadbug','birddog','russiantwist','hangingkneeraise','pallofpress','lateralraise','facepull','farmercarry','boxjump','kettlebellswing'
);
