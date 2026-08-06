-- Structured symptom definitions and occurrences. Existing public.health_events rows are preserved unchanged.
create table public.symptom_categories (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null unique,
  description text, display_order integer not null default 0 check(display_order >= 0), is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), check(char_length(btrim(name)) > 0)
);
create table public.symptoms (
  id uuid primary key default gen_random_uuid(), category_id uuid references public.symptom_categories(id) on delete set null,
  slug text not null unique, name text not null, short_name text, description text, common_aliases text[] not null default '{}',
  default_tracking_type text not null default 'severity' check(default_tracking_type in ('severity','occurrence','duration','count')),
  supports_severity boolean not null default true, supports_duration boolean not null default true, supports_body_location boolean not null default false,
  is_active boolean not null default true, is_featured boolean not null default false, display_order integer not null default 0 check(display_order >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), check(char_length(btrim(name)) > 0), check(array_position(common_aliases,null) is null)
);
create table public.condition_symptoms (
  id uuid primary key default gen_random_uuid(), condition_id uuid not null references public.conditions(id) on delete cascade,
  symptom_id uuid not null references public.symptoms(id) on delete cascade, relevance_score integer not null default 50 check(relevance_score between 1 and 100),
  is_common boolean not null default false, is_primary boolean not null default false, display_order integer not null default 0 check(display_order >= 0),
  created_at timestamptz not null default now(), unique(condition_id,symptom_id)
);
create table public.user_symptoms (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  symptom_id uuid references public.symptoms(id) on delete restrict, custom_symptom_name text,
  custom_symptom_name_normalized text generated always as (lower(regexp_replace(btrim(custom_symptom_name),'[[:space:]]+',' ','g'))) stored,
  is_favorite boolean not null default false, is_active boolean not null default true,
  source text not null default 'manual' check(source in ('manual','condition_recommendation','history','custom')),
  last_logged_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id),
  check((symptom_id is not null and custom_symptom_name is null) or (symptom_id is null and custom_symptom_name is not null and char_length(btrim(custom_symptom_name)) between 2 and 120))
);
create table public.user_symptom_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  symptom_id uuid references public.symptoms(id) on delete restrict, custom_symptom_name text,
  started_at timestamptz not null, ended_at timestamptz, severity smallint check(severity between 1 and 10),
  occurrence_count integer check(occurrence_count > 0), resolved boolean, body_location text check(body_location is null or char_length(body_location) <= 120),
  notes text check(notes is null or char_length(notes) <= 2000),
  source text not null default 'my_health' check(source in ('quick_add','my_health','daily_checkin','import','experiment','other')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, unique(id,user_id),
  check((symptom_id is not null and custom_symptom_name is null) or (symptom_id is null and custom_symptom_name is not null and char_length(btrim(custom_symptom_name)) between 2 and 120)),
  check(ended_at is null or ended_at >= started_at)
);
create table public.symptom_event_conditions (
  id uuid primary key default gen_random_uuid(), symptom_event_id uuid not null references public.user_symptom_events(id) on delete cascade,
  user_condition_id uuid not null references public.user_conditions(id) on delete cascade, created_at timestamptz not null default now(),
  unique(symptom_event_id,user_condition_id)
);

create index symptoms_active_category_name_idx on public.symptoms(category_id,name) where is_active;
create index symptoms_name_idx on public.symptoms(lower(name));
create index symptoms_short_name_idx on public.symptoms(lower(short_name)) where short_name is not null;
create index condition_symptoms_condition_rank_idx on public.condition_symptoms(condition_id,is_primary desc,is_common desc,relevance_score desc);
create index condition_symptoms_symptom_idx on public.condition_symptoms(symptom_id);
create index user_symptoms_user_active_idx on public.user_symptoms(user_id,is_favorite desc,last_logged_at desc) where is_active;
create index user_symptoms_symptom_idx on public.user_symptoms(symptom_id) where symptom_id is not null;
create unique index user_symptoms_active_catalog_unique on public.user_symptoms(user_id,symptom_id) where symptom_id is not null and is_active;
create unique index user_symptoms_active_custom_unique on public.user_symptoms(user_id,custom_symptom_name_normalized) where custom_symptom_name is not null and is_active;
create index user_symptom_events_user_started_idx on public.user_symptom_events(user_id,started_at desc) where deleted_at is null;
create index user_symptom_events_symptom_idx on public.user_symptom_events(symptom_id) where symptom_id is not null;
create index user_symptom_events_status_idx on public.user_symptom_events(user_id,resolved,severity) where deleted_at is null;
create index symptom_event_conditions_event_idx on public.symptom_event_conditions(symptom_event_id);
create index symptom_event_conditions_condition_idx on public.symptom_event_conditions(user_condition_id);

create trigger symptom_categories_set_updated_at before update on public.symptom_categories for each row execute function public.axvital_planning_set_updated_at();
create trigger symptoms_set_updated_at before update on public.symptoms for each row execute function public.axvital_planning_set_updated_at();
create trigger user_symptoms_set_updated_at before update on public.user_symptoms for each row execute function public.axvital_planning_set_updated_at();
create trigger user_symptom_events_set_updated_at before update on public.user_symptom_events for each row execute function public.axvital_planning_set_updated_at();

alter table public.symptom_categories enable row level security; alter table public.symptoms enable row level security;
alter table public.condition_symptoms enable row level security; alter table public.user_symptoms enable row level security;
alter table public.user_symptom_events enable row level security; alter table public.symptom_event_conditions enable row level security;
create policy "Authenticated users read symptom categories" on public.symptom_categories for select to authenticated using(is_active);
create policy "Authenticated users read symptoms" on public.symptoms for select to authenticated using(is_active);
create policy "Authenticated users read condition symptom mappings" on public.condition_symptoms for select to authenticated using(true);
create policy "Users select own tracked symptoms" on public.user_symptoms for select to authenticated using((select auth.uid())=user_id);
create policy "Users insert own tracked symptoms" on public.user_symptoms for insert to authenticated with check((select auth.uid())=user_id);
create policy "Users update own tracked symptoms" on public.user_symptoms for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "Users delete own tracked symptoms" on public.user_symptoms for delete to authenticated using((select auth.uid())=user_id);
create policy "Users select own symptom events" on public.user_symptom_events for select to authenticated using((select auth.uid())=user_id);
create policy "Users insert own symptom events" on public.user_symptom_events for insert to authenticated with check((select auth.uid())=user_id);
create policy "Users update own symptom events" on public.user_symptom_events for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "Users delete own symptom events" on public.user_symptom_events for delete to authenticated using((select auth.uid())=user_id);
create policy "Users select own symptom condition links" on public.symptom_event_conditions for select to authenticated using(
  exists(select 1 from public.user_symptom_events e where e.id=symptom_event_id and e.user_id=(select auth.uid())) and
  exists(select 1 from public.user_conditions c where c.id=user_condition_id and c.user_id=(select auth.uid())));
create policy "Users insert own symptom condition links" on public.symptom_event_conditions for insert to authenticated with check(
  exists(select 1 from public.user_symptom_events e where e.id=symptom_event_id and e.user_id=(select auth.uid())) and
  exists(select 1 from public.user_conditions c where c.id=user_condition_id and c.user_id=(select auth.uid())));
create policy "Users delete own symptom condition links" on public.symptom_event_conditions for delete to authenticated using(
  exists(select 1 from public.user_symptom_events e where e.id=symptom_event_id and e.user_id=(select auth.uid())) and
  exists(select 1 from public.user_conditions c where c.id=user_condition_id and c.user_id=(select auth.uid())));

insert into public.symptom_categories(slug,name,description,display_order) values
('neurological','Neurological','Sensations and changes involving the nervous system.',10),('cognitive','Cognitive','Changes involving attention, memory, or thinking.',20),
('pain','Pain','Pain experiences across body areas.',30),('gastrointestinal','Gastrointestinal','Digestive and bowel symptoms.',40),
('respiratory','Respiratory','Breathing and airway symptoms.',50),('cardiovascular','Cardiovascular','Heart and circulation-related sensations.',60),
('dermatological','Dermatological','Skin-related symptoms.',70),('vision','Vision','Changes involving sight or the eyes.',80),
('hearing','Hearing','Changes involving hearing or the ears.',90),('musculoskeletal','Musculoskeletal','Muscle, joint, and movement symptoms.',100),
('sleep','Sleep','Sleep timing and quality experiences.',110),('mental-emotional','Mental and Emotional','Mood and emotional experiences.',120),
('genitourinary','Genitourinary','Urinary and related symptoms.',130),('reproductive-sexual-health','Reproductive and Sexual Health','Reproductive and sexual-health symptoms.',140),
('general-systemic','General and Systemic','Whole-body and general symptoms.',150),('other','Other','Symptoms not grouped elsewhere.',160) on conflict(slug) do nothing;

with seed(category_slug,slug,name,short_name,aliases,tracking,severity,duration,body,featured) as (values
('neurological','headache','Headache',null,array['head pain'],'severity',true,true,true,true),('neurological','migraine','Migraine',null,array['migraine attack'],'severity',true,true,false,true),
('neurological','dizziness','Dizziness',null,array['dizzy'],'severity',true,true,false,true),('neurological','vertigo','Vertigo',null,array['spinning sensation'],'severity',true,true,false,false),
('neurological','numbness','Numbness',null,array['loss of sensation'],'severity',true,true,true,true),('neurological','tingling','Tingling',null,array['pins and needles','paresthesia'],'severity',true,true,true,true),
('neurological','tremor','Tremor',null,array['shaking'],'severity',true,true,true,false),('neurological','balance-problems','Balance Problems',null,array['unsteadiness'],'severity',true,true,false,false),
('cognitive','brain-fog','Brain Fog',null,array['mental fog'],'severity',true,true,false,true),('cognitive','poor-concentration','Poor Concentration',null,array['difficulty concentrating'],'severity',true,true,false,true),
('cognitive','memory-difficulty','Memory Difficulty',null,array['forgetfulness'],'severity',true,true,false,false),('cognitive','confusion','Confusion',null,array['disorientation'],'severity',true,true,false,false),
('cognitive','word-finding-difficulty','Word-Finding Difficulty',null,array['trouble finding words'],'severity',true,true,false,false),('cognitive','slowed-thinking','Slowed Thinking',null,array['slow processing'],'severity',true,true,false,false),
('pain','general-pain','Pain',null,array['aching'],'severity',true,true,true,true),('pain','abdominal-pain','Abdominal Pain',null,array['stomach pain'],'severity',true,true,true,true),
('pain','back-pain','Back Pain',null,array['backache'],'severity',true,true,true,false),('pain','neck-pain','Neck Pain',null,array['neck ache'],'severity',true,true,true,false),
('pain','joint-pain','Joint Pain',null,array['arthralgia'],'severity',true,true,true,true),('pain','muscle-pain','Muscle Pain',null,array['myalgia'],'severity',true,true,true,true),
('pain','chest-discomfort','Chest Discomfort',null,array['chest pain'],'severity',true,true,true,false),('pain','pelvic-pain','Pelvic Pain',null,array['pelvic discomfort'],'severity',true,true,true,false),
('gastrointestinal','nausea','Nausea',null,array['upset stomach','queasiness'],'severity',true,true,false,true),('gastrointestinal','vomiting','Vomiting',null,array['throwing up'],'count',false,true,false,false),
('gastrointestinal','bloating','Bloating',null,array['abdominal bloating'],'severity',true,true,false,true),('gastrointestinal','gas','Gas',null,array['flatulence'],'severity',true,true,false,false),
('gastrointestinal','constipation','Constipation',null,array['difficulty passing stool'],'occurrence',true,true,false,true),('gastrointestinal','diarrhea','Diarrhea',null,array['loose stool'],'count',true,true,false,true),
('gastrointestinal','reflux','Reflux',null,array['heartburn','acid reflux'],'severity',true,true,false,false),('gastrointestinal','bowel-urgency','Bowel Urgency',null,array['urgency'],'count',true,true,false,false),
('gastrointestinal','loss-of-appetite','Loss of Appetite',null,array['reduced appetite'],'severity',true,true,false,false),('gastrointestinal','increased-appetite','Increased Appetite',null,array['excess hunger'],'severity',true,true,false,false),
('respiratory','cough','Cough',null,array['coughing'],'count',true,true,false,true),('respiratory','wheezing','Wheezing',null,array['wheeze'],'severity',true,true,false,false),
('respiratory','shortness-of-breath','Shortness of Breath','SOB',array['breathlessness'],'severity',true,true,false,true),('respiratory','congestion','Congestion',null,array['stuffy nose'],'severity',true,true,false,false),
('respiratory','sore-throat','Sore Throat',null,array['throat pain'],'severity',true,true,true,false),('respiratory','chest-tightness','Chest Tightness',null,array['tight chest'],'severity',true,true,false,false),
('cardiovascular','palpitations','Palpitations',null,array['heart racing','fluttering heart'],'severity',true,true,false,true),('cardiovascular','elevated-heart-rate','Elevated Heart Rate',null,array['rapid heart rate','tachycardia'],'duration',false,true,false,false),
('cardiovascular','lightheadedness','Lightheadedness',null,array['feeling faint'],'severity',true,true,false,false),('cardiovascular','exercise-intolerance','Exercise Intolerance',null,array['activity intolerance'],'severity',true,true,false,false),
('cardiovascular','fainting','Fainting',null,array['syncope'],'occurrence',false,false,false,false),('cardiovascular','swelling','Swelling',null,array['edema'],'severity',true,true,true,false),
('dermatological','rash','Rash',null,array['skin rash'],'severity',true,true,true,true),('dermatological','itching','Itching',null,array['itchy skin','pruritus'],'severity',true,true,true,true),
('dermatological','hives','Hives',null,array['urticaria'],'severity',true,true,true,false),('dermatological','dry-skin','Dry Skin',null,array['skin dryness'],'severity',true,true,true,false),
('dermatological','flushing','Flushing',null,array['skin flushing'],'severity',true,true,true,false),('dermatological','lesion','Lesion',null,array['skin lesion'],'count',true,true,true,false),
('dermatological','cold-sore','Cold Sore',null,array['fever blister'],'occurrence',true,true,true,true),('dermatological','genital-lesion','Genital Lesion',null,array['genital sore'],'count',true,true,true,false),
('dermatological','burning','Burning',null,array['burning skin','burning sensation'],'severity',true,true,true,false),('dermatological','skin-sensitivity','Skin Sensitivity',null,array['tender skin'],'severity',true,true,true,false),
('vision','blurred-vision','Blurred Vision',null,array['blurry vision'],'severity',true,true,false,true),('vision','double-vision','Double Vision',null,array['diplopia'],'severity',true,true,false,false),
('vision','vision-changes','Vision Changes',null,array['visual changes'],'severity',true,true,false,true),('vision','eye-pain','Eye Pain',null,array['ocular pain'],'severity',true,true,true,false),
('vision','light-sensitivity','Light Sensitivity',null,array['photophobia'],'severity',true,true,false,true),('vision','visual-aura','Visual Aura',null,array['migraine aura'],'duration',true,true,false,false),
('hearing','ringing-in-ears','Ringing in Ears','Tinnitus',array['tinnitus'],'severity',true,true,false,false),('hearing','hearing-changes','Hearing Changes',null,array['hearing difficulty'],'severity',true,true,false,false),
('hearing','sound-sensitivity','Sound Sensitivity',null,array['phonophobia'],'severity',true,true,false,true),('hearing','ear-pressure','Ear Pressure',null,array['fullness in ears'],'severity',true,true,true,false),
('hearing','ear-pain','Ear Pain',null,array['earache'],'severity',true,true,true,false),('hearing','muffled-hearing','Muffled Hearing',null,array['blocked hearing'],'severity',true,true,false,false),
('musculoskeletal','muscle-weakness','Muscle Weakness',null,array['weak muscles'],'severity',true,true,true,true),('musculoskeletal','stiffness','Stiffness',null,array['joint stiffness'],'severity',true,true,true,false),
('musculoskeletal','spasticity','Spasticity',null,array['muscle tightness'],'severity',true,true,true,false),('musculoskeletal','cramping','Cramping',null,array['muscle cramps'],'severity',true,true,true,false),
('musculoskeletal','limited-mobility','Limited Mobility',null,array['reduced mobility'],'severity',true,true,false,false),('musculoskeletal','muscle-twitching','Muscle Twitching',null,array['fasciculation'],'count',true,true,true,false),
('sleep','insomnia','Insomnia',null,array['sleeplessness'],'duration',true,true,false,true),('sleep','difficulty-falling-asleep','Difficulty Falling Asleep',null,array['sleep onset difficulty'],'duration',true,true,false,false),
('sleep','frequent-awakening','Frequent Awakening',null,array['waking often'],'count',false,true,false,true),('sleep','early-awakening','Early Awakening',null,array['waking too early'],'occurrence',false,false,false,false),
('sleep','restless-sleep','Restless Sleep',null,array['restless night'],'severity',true,true,false,false),('sleep','non-restorative-sleep','Non-Restorative Sleep',null,array['unrefreshing sleep'],'severity',true,true,false,true),
('sleep','snoring','Snoring',null,array['loud snoring'],'occurrence',false,true,false,false),('sleep','morning-headache','Morning Headache',null,array['headache on waking'],'severity',true,true,false,true),
('sleep','dry-mouth-on-waking','Dry Mouth on Waking',null,array['morning dry mouth'],'severity',true,true,false,false),
('mental-emotional','anxiety','Anxiety',null,array['anxiousness'],'severity',true,true,false,true),('mental-emotional','panic','Panic',null,array['panic feeling'],'severity',true,true,false,false),
('mental-emotional','low-mood','Low Mood',null,array['feeling down'],'severity',true,true,false,true),('mental-emotional','irritability','Irritability',null,array['irritable mood'],'severity',true,true,false,false),
('mental-emotional','stress','Stress',null,array['feeling stressed'],'severity',true,true,false,false),('mental-emotional','mood-swings','Mood Swings',null,array['mood changes'],'count',true,true,false,false),
('mental-emotional','lack-of-motivation','Lack of Motivation',null,array['low motivation'],'severity',true,true,false,false),
('genitourinary','urinary-urgency','Urinary Urgency',null,array['urgent urination'],'count',true,true,false,false),('genitourinary','frequent-urination','Frequent Urination',null,array['urinary frequency'],'count',false,true,false,false),
('genitourinary','painful-urination','Painful Urination',null,array['dysuria'],'severity',true,true,true,false),('genitourinary','bladder-pain','Bladder Pain',null,array['bladder discomfort'],'severity',true,true,true,false),
('genitourinary','urinary-leakage','Urinary Leakage',null,array['incontinence'],'count',false,true,false,false),('genitourinary','difficulty-urinating','Difficulty Urinating',null,array['urinary hesitancy'],'severity',true,true,false,false),
('reproductive-sexual-health','genital-burning','Genital Burning',null,array['burning genitals'],'severity',true,true,true,false),('reproductive-sexual-health','genital-itching','Genital Itching',null,array['genital itch'],'severity',true,true,true,false),
('reproductive-sexual-health','menstrual-cramps','Menstrual Cramps',null,array['period cramps'],'severity',true,true,true,false),('reproductive-sexual-health','pain-during-sex','Pain During Sex',null,array['dyspareunia'],'severity',true,true,true,false),
('reproductive-sexual-health','irregular-bleeding','Irregular Bleeding',null,array['spotting'],'occurrence',false,true,false,false),('reproductive-sexual-health','reduced-libido','Reduced Libido',null,array['low sex drive'],'severity',true,true,false,false),
('general-systemic','fatigue','Fatigue',null,array['tiredness'],'severity',true,true,false,true),('general-systemic','daytime-fatigue','Daytime Fatigue',null,array['daytime sleepiness'],'severity',true,true,false,true),
('general-systemic','low-energy','Low Energy',null,array['lack of energy'],'severity',true,true,false,false),('general-systemic','fever','Fever',null,array['elevated temperature'],'duration',true,true,false,true),
('general-systemic','chills','Chills',null,array['shivering'],'severity',true,true,false,false),('general-systemic','night-sweats','Night Sweats',null,array['sweating at night'],'occurrence',true,true,false,false),
('general-systemic','malaise','Malaise',null,array['feeling unwell'],'severity',true,true,false,false),('general-systemic','swollen-lymph-nodes','Swollen Lymph Nodes',null,array['swollen glands'],'severity',true,true,true,false)
)
insert into public.symptoms(category_id,slug,name,short_name,common_aliases,default_tracking_type,supports_severity,supports_duration,supports_body_location,is_featured)
select c.id,s.slug,s.name,s.short_name,s.aliases,s.tracking,s.severity,s.duration,s.body,s.featured from seed s join public.symptom_categories c on c.slug=s.category_slug on conflict(slug) do nothing;

with mappings(condition_slug,symptom_slug,score,common,primary_flag,ord) as (values
('multiple-sclerosis','fatigue',100,true,true,1),('multiple-sclerosis','brain-fog',90,true,true,2),('multiple-sclerosis','numbness',90,true,true,3),('multiple-sclerosis','tingling',90,true,true,4),('multiple-sclerosis','muscle-weakness',85,true,false,5),('multiple-sclerosis','vision-changes',80,true,false,6),('multiple-sclerosis','balance-problems',80,true,false,7),('multiple-sclerosis','dizziness',70,false,false,8),('multiple-sclerosis','spasticity',80,true,false,9),('multiple-sclerosis','general-pain',65,false,false,10),
('herpes-simplex-virus-type-1','cold-sore',100,true,true,1),('herpes-simplex-virus-type-1','tingling',85,true,false,2),('herpes-simplex-virus-type-1','burning',85,true,false,3),('herpes-simplex-virus-type-1','general-pain',70,false,false,4),('herpes-simplex-virus-type-1','itching',70,false,false,5),('herpes-simplex-virus-type-1','fever',50,false,false,6),('herpes-simplex-virus-type-1','swollen-lymph-nodes',55,false,false,7),('herpes-simplex-virus-type-1','fatigue',50,false,false,8),
('herpes-simplex-virus-type-2','genital-lesion',100,true,true,1),('herpes-simplex-virus-type-2','tingling',85,true,false,2),('herpes-simplex-virus-type-2','genital-burning',90,true,false,3),('herpes-simplex-virus-type-2','general-pain',70,false,false,4),('herpes-simplex-virus-type-2','genital-itching',75,false,false,5),('herpes-simplex-virus-type-2','fever',50,false,false,6),('herpes-simplex-virus-type-2','swollen-lymph-nodes',55,false,false,7),('herpes-simplex-virus-type-2','fatigue',50,false,false,8),
('irritable-bowel-syndrome','bloating',95,true,true,1),('irritable-bowel-syndrome','abdominal-pain',95,true,true,2),('irritable-bowel-syndrome','constipation',85,true,false,3),('irritable-bowel-syndrome','diarrhea',85,true,false,4),('irritable-bowel-syndrome','nausea',65,false,false,5),('irritable-bowel-syndrome','gas',75,true,false,6),('irritable-bowel-syndrome','bowel-urgency',75,true,false,7),('irritable-bowel-syndrome','fatigue',45,false,false,8),
('migraine-disorder','migraine',100,true,true,1),('migraine-disorder','headache',95,true,true,2),('migraine-disorder','nausea',85,true,false,3),('migraine-disorder','light-sensitivity',90,true,false,4),('migraine-disorder','sound-sensitivity',85,true,false,5),('migraine-disorder','vision-changes',75,false,false,6),('migraine-disorder','dizziness',65,false,false,7),('migraine-disorder','neck-pain',60,false,false,8),('migraine-disorder','brain-fog',55,false,false,9),
('sleep-apnea','daytime-fatigue',100,true,true,1),('sleep-apnea','morning-headache',85,true,false,2),('sleep-apnea','frequent-awakening',85,true,false,3),('sleep-apnea','poor-concentration',75,true,false,4),('sleep-apnea','dry-mouth-on-waking',70,true,false,5),('sleep-apnea','snoring',90,true,true,6)
)
insert into public.condition_symptoms(condition_id,symptom_id,relevance_score,is_common,is_primary,display_order)
select c.id,s.id,m.score,m.common,m.primary_flag,m.ord from mappings m join public.conditions c on c.slug=m.condition_slug join public.symptoms s on s.slug=m.symptom_slug on conflict(condition_id,symptom_id) do nothing;
