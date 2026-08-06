create table public.condition_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  description text,
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint condition_categories_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint condition_categories_name_not_blank check (char_length(btrim(name)) > 0)
);

create table public.conditions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.condition_categories(id) on delete set null,
  slug text not null unique,
  name text not null,
  short_name text,
  description text,
  common_aliases text[] not null default '{}',
  is_active boolean not null default true,
  is_featured boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conditions_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint conditions_name_not_blank check (char_length(btrim(name)) > 0),
  constraint conditions_short_name_not_blank check (short_name is null or char_length(btrim(short_name)) > 0),
  constraint conditions_aliases_not_empty check (array_position(common_aliases, null) is null)
);

create table public.user_conditions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  condition_id uuid references public.conditions(id) on delete restrict,
  custom_condition_name text,
  custom_condition_name_normalized text generated always as (
    lower(regexp_replace(btrim(custom_condition_name), '[[:space:]]+', ' ', 'g'))
  ) stored,
  status text not null default 'active',
  diagnosed_on date,
  diagnosed_year integer,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint user_conditions_user_identity unique (id, user_id),
  constraint user_conditions_source_exactly_one check (
    (condition_id is not null and custom_condition_name is null)
    or (condition_id is null and custom_condition_name is not null and char_length(btrim(custom_condition_name)) between 2 and 120)
  ),
  constraint user_conditions_status_valid check (status in ('active', 'monitoring', 'remission', 'resolved', 'archived')),
  constraint user_conditions_archive_consistent check ((status = 'archived') = (archived_at is not null)),
  constraint user_conditions_diagnosed_on_valid check (diagnosed_on is null or diagnosed_on >= date '1900-01-01'),
  constraint user_conditions_diagnosed_year_valid check (diagnosed_year is null or diagnosed_year between 1900 and 2100),
  constraint user_conditions_diagnosis_consistent check (
    diagnosed_on is null or diagnosed_year is null or diagnosed_year = extract(year from diagnosed_on)::integer
  ),
  constraint user_conditions_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint user_conditions_primary_not_archived check (not is_primary or archived_at is null)
);

create index condition_categories_active_order_idx
  on public.condition_categories (display_order, name) where is_active;
create index conditions_active_category_order_idx
  on public.conditions (category_id, display_order, name) where is_active;
create index conditions_name_search_idx on public.conditions (lower(name));
create index conditions_short_name_search_idx on public.conditions (lower(short_name)) where short_name is not null;
create index user_conditions_user_active_idx
  on public.user_conditions (user_id, is_primary desc, updated_at desc) where archived_at is null;
create index user_conditions_user_archived_idx
  on public.user_conditions (user_id, archived_at desc) where archived_at is not null;
create index user_conditions_condition_idx on public.user_conditions (condition_id) where condition_id is not null;

create unique index user_conditions_active_catalog_unique
  on public.user_conditions (user_id, condition_id)
  where condition_id is not null and archived_at is null;
create unique index user_conditions_active_custom_unique
  on public.user_conditions (user_id, custom_condition_name_normalized)
  where custom_condition_name is not null and archived_at is null;
create unique index user_conditions_one_primary_per_user
  on public.user_conditions (user_id)
  where is_primary and archived_at is null;

create trigger condition_categories_set_updated_at
before update on public.condition_categories
for each row execute function public.axvital_planning_set_updated_at();

create trigger conditions_set_updated_at
before update on public.conditions
for each row execute function public.axvital_planning_set_updated_at();

create trigger user_conditions_set_updated_at
before update on public.user_conditions
for each row execute function public.axvital_planning_set_updated_at();

alter table public.condition_categories enable row level security;
alter table public.conditions enable row level security;
alter table public.user_conditions enable row level security;

create policy "Authenticated users read active condition categories"
  on public.condition_categories for select to authenticated using (is_active);
create policy "Authenticated users read active conditions"
  on public.conditions for select to authenticated using (is_active);

create policy "Users select own conditions"
  on public.user_conditions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own conditions"
  on public.user_conditions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own conditions"
  on public.user_conditions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own conditions"
  on public.user_conditions for delete to authenticated using ((select auth.uid()) = user_id);

create function public.set_primary_user_condition(target_condition_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_conditions
    where id = target_condition_id
      and user_id = (select auth.uid())
      and archived_at is null
  ) then
    raise exception 'Condition not found';
  end if;

  update public.user_conditions
  set is_primary = false
  where user_id = (select auth.uid())
    and archived_at is null
    and is_primary;

  update public.user_conditions
  set is_primary = true
  where id = target_condition_id
    and user_id = (select auth.uid());
end;
$$;

grant execute on function public.set_primary_user_condition(uuid) to authenticated;

insert into public.condition_categories (slug, name, description, display_order)
values
  ('neurological', 'Neurological', 'Conditions involving the brain, spinal cord, and nerves.', 10),
  ('autoimmune-inflammatory', 'Autoimmune and Inflammatory', 'Conditions involving immune or inflammatory processes.', 20),
  ('gastrointestinal', 'Gastrointestinal', 'Conditions involving digestion and the gastrointestinal system.', 30),
  ('cardiovascular', 'Cardiovascular', 'Conditions involving the heart and blood vessels.', 40),
  ('respiratory', 'Respiratory', 'Conditions involving breathing and the respiratory system.', 50),
  ('dermatological', 'Dermatological', 'Conditions involving the skin.', 60),
  ('endocrine-metabolic', 'Endocrine and Metabolic', 'Conditions involving hormones and metabolism.', 70),
  ('musculoskeletal', 'Musculoskeletal', 'Conditions involving muscles, bones, and joints.', 80),
  ('infectious', 'Infectious', 'Conditions associated with infectious agents or their longer-term effects.', 90),
  ('reproductive-sexual-health', 'Reproductive and Sexual Health', 'Conditions involving reproductive and sexual health.', 100),
  ('mental-behavioral-health', 'Mental and Behavioral Health', 'Conditions involving mental and behavioral health.', 110),
  ('sleep', 'Sleep', 'Conditions involving sleep quality, timing, or breathing during sleep.', 120),
  ('allergy-immunology', 'Allergy and Immunology', 'Conditions involving allergic or immune responses.', 130),
  ('pain-disorders', 'Pain Disorders', 'Conditions primarily characterized by persistent or recurring pain.', 140),
  ('other', 'Other', 'Conditions that do not fit another catalog category.', 150)
on conflict (slug) do nothing;

with seed(category_slug, slug, name, short_name, aliases, description, featured, display_order) as (
  values
  ('neurological','multiple-sclerosis','Multiple Sclerosis','MS',array['multiple sclerosis','ms'],'A chronic condition affecting the central nervous system.',true,10),
  ('neurological','migraine-disorder','Migraine Disorder','Migraine',array['migraine','migraines'],'A neurological condition associated with recurring migraine attacks.',true,20),
  ('neurological','epilepsy','Epilepsy',null,array['seizure disorder'],'A neurological condition associated with recurrent unprovoked seizures.',false,30),
  ('neurological','parkinsons-disease','Parkinson''s Disease','PD',array['parkinson disease','parkinsons'],'A progressive neurological movement condition.',false,40),
  ('neurological','peripheral-neuropathy','Peripheral Neuropathy',null,array['neuropathy'],'A condition involving nerves outside the brain and spinal cord.',false,50),
  ('neurological','post-concussion-syndrome','Post-Concussion Syndrome','PCS',array['persistent post-concussive symptoms'],'Persistent symptoms following a concussion.',false,60),
  ('autoimmune-inflammatory','rheumatoid-arthritis','Rheumatoid Arthritis','RA',array['rheumatoid arthritis'],'An inflammatory autoimmune condition that commonly affects joints.',true,10),
  ('autoimmune-inflammatory','systemic-lupus-erythematosus','Systemic Lupus Erythematosus','Lupus',array['sle','lupus'],'An autoimmune condition that can affect multiple body systems.',false,20),
  ('autoimmune-inflammatory','psoriasis','Psoriasis',null,array['plaque psoriasis'],'An immune-mediated condition commonly affecting the skin.',false,30),
  ('autoimmune-inflammatory','psoriatic-arthritis','Psoriatic Arthritis','PsA',array['psoriatic arthritis'],'An inflammatory arthritis associated with psoriasis.',false,40),
  ('autoimmune-inflammatory','crohns-disease','Crohn''s Disease',null,array['crohn disease','crohns'],'An inflammatory bowel disease that can affect the digestive tract.',true,50),
  ('autoimmune-inflammatory','ulcerative-colitis','Ulcerative Colitis','UC',array['ulcerative colitis'],'An inflammatory bowel disease affecting the colon and rectum.',true,60),
  ('autoimmune-inflammatory','celiac-disease','Celiac Disease',null,array['coeliac disease','celiac sprue'],'An immune-mediated condition triggered by gluten.',false,70),
  ('autoimmune-inflammatory','hashimotos-thyroiditis','Hashimoto''s Thyroiditis',null,array['hashimoto disease','hashimotos'],'An autoimmune condition affecting the thyroid gland.',false,80),
  ('gastrointestinal','irritable-bowel-syndrome','Irritable Bowel Syndrome','IBS',array['irritable bowel','ibs'],'A gastrointestinal condition associated with recurring bowel symptoms.',true,10),
  ('gastrointestinal','gastroesophageal-reflux-disease','Gastroesophageal Reflux Disease','GERD',array['acid reflux','gord','gerd'],'A condition involving recurring reflux of stomach contents.',true,20),
  ('gastrointestinal','gastroparesis','Gastroparesis',null,array['delayed gastric emptying'],'A condition involving delayed movement of food from the stomach.',false,30),
  ('gastrointestinal','chronic-constipation','Chronic Constipation',null,array['constipation'],'Persistent difficulty with bowel movements.',false,40),
  ('gastrointestinal','diverticular-disease','Diverticular Disease',null,array['diverticulosis','diverticulitis'],'A condition involving pouches that form in the colon wall.',false,50),
  ('cardiovascular','hypertension','Hypertension','High blood pressure',array['high blood pressure','htn'],'A condition involving persistently elevated blood pressure.',true,10),
  ('cardiovascular','atrial-fibrillation','Atrial Fibrillation','AFib',array['afib','a-fib'],'An irregular heart rhythm originating in the upper heart chambers.',false,20),
  ('cardiovascular','postural-orthostatic-tachycardia-syndrome','Postural Orthostatic Tachycardia Syndrome','POTS',array['postural tachycardia syndrome','pots'],'A condition involving an excessive heart-rate increase after standing.',true,30),
  ('cardiovascular','high-cholesterol','High Cholesterol','Hyperlipidemia',array['hypercholesterolemia','hyperlipidemia'],'A condition involving elevated levels of cholesterol or other blood lipids.',false,40),
  ('cardiovascular','coronary-artery-disease','Coronary Artery Disease','CAD',array['coronary heart disease'],'A condition involving narrowed or blocked coronary arteries.',false,50),
  ('respiratory','asthma','Asthma',null,array['bronchial asthma'],'A chronic condition involving airway inflammation and narrowing.',true,10),
  ('respiratory','chronic-obstructive-pulmonary-disease','Chronic Obstructive Pulmonary Disease','COPD',array['copd','emphysema','chronic bronchitis'],'A chronic lung condition associated with limited airflow.',false,20),
  ('respiratory','sleep-apnea','Sleep Apnea',null,array['sleep apnoea'],'A sleep-related breathing condition involving repeated breathing interruptions.',true,30),
  ('dermatological','eczema','Eczema','Atopic dermatitis',array['atopic dermatitis'],'An inflammatory skin condition associated with dry or irritated skin.',true,10),
  ('dermatological','rosacea','Rosacea',null,array['acne rosacea'],'A chronic skin condition commonly affecting the face.',false,20),
  ('dermatological','hidradenitis-suppurativa','Hidradenitis Suppurativa','HS',array['hidradenitis','acne inversa'],'A chronic inflammatory skin condition involving recurring nodules or abscesses.',false,30),
  ('dermatological','chronic-urticaria','Chronic Urticaria','Chronic hives',array['chronic hives','urticaria'],'A condition involving recurring hives lasting six weeks or longer.',false,40),
  ('endocrine-metabolic','type-1-diabetes','Type 1 Diabetes','T1D',array['type one diabetes','t1dm'],'A condition in which the body produces little or no insulin.',true,10),
  ('endocrine-metabolic','type-2-diabetes','Type 2 Diabetes','T2D',array['type two diabetes','t2dm'],'A metabolic condition affecting how the body uses insulin and glucose.',true,20),
  ('endocrine-metabolic','prediabetes','Prediabetes',null,array['borderline diabetes'],'A metabolic state involving blood glucose above the usual range but below the diabetes range.',false,30),
  ('endocrine-metabolic','hypothyroidism','Hypothyroidism','Underactive thyroid',array['underactive thyroid'],'A condition in which the thyroid produces insufficient thyroid hormone.',false,40),
  ('endocrine-metabolic','hyperthyroidism','Hyperthyroidism','Overactive thyroid',array['overactive thyroid'],'A condition in which the thyroid produces excess thyroid hormone.',false,50),
  ('endocrine-metabolic','polycystic-ovary-syndrome','Polycystic Ovary Syndrome','PCOS',array['polycystic ovarian syndrome','pcos'],'A hormonal and metabolic condition affecting ovarian function.',true,60),
  ('musculoskeletal','osteoarthritis','Osteoarthritis','OA',array['degenerative joint disease'],'A joint condition involving changes to cartilage and surrounding tissues.',false,10),
  ('musculoskeletal','temporomandibular-joint-disorder','Temporomandibular Joint Disorder','TMJ disorder',array['tmd','tmj'],'A group of conditions affecting the jaw joint and related muscles.',false,20),
  ('musculoskeletal','ankylosing-spondylitis','Ankylosing Spondylitis','AS',array['axial spondyloarthritis'],'An inflammatory condition primarily affecting the spine and sacroiliac joints.',false,30),
  ('infectious','herpes-simplex-virus-type-1','Herpes Simplex Virus Type 1','HSV-1',array['hsv1','oral herpes','herpes simplex 1','herpes'],'A common viral condition caused by herpes simplex virus type 1.',true,10),
  ('infectious','herpes-simplex-virus-type-2','Herpes Simplex Virus Type 2','HSV-2',array['hsv2','genital herpes','herpes simplex 2','herpes'],'A common viral condition caused by herpes simplex virus type 2.',true,20),
  ('infectious','long-covid','Long COVID','Post-COVID condition',array['post-covid syndrome','pasc','long haul covid'],'Persistent or recurring health effects following COVID-19.',true,30),
  ('reproductive-sexual-health','endometriosis','Endometriosis',null,array['endometriosis'],'A condition involving tissue similar to the uterine lining outside the uterus.',true,10),
  ('reproductive-sexual-health','premenstrual-dysphoric-disorder','Premenstrual Dysphoric Disorder','PMDD',array['pmdd'],'A severe cyclical condition associated with the premenstrual phase.',false,20),
  ('reproductive-sexual-health','erectile-dysfunction','Erectile Dysfunction','ED',array['erectile dysfunction'],'A condition involving persistent difficulty achieving or maintaining an erection.',false,30),
  ('mental-behavioral-health','anxiety-disorder','Anxiety Disorder',null,array['anxiety'],'A category of conditions involving persistent or excessive anxiety.',true,10),
  ('mental-behavioral-health','major-depressive-disorder','Major Depressive Disorder','MDD',array['major depression','clinical depression'],'A mood condition involving persistent depressive episodes.',true,20),
  ('mental-behavioral-health','attention-deficit-hyperactivity-disorder','Attention-Deficit/Hyperactivity Disorder','ADHD',array['attention deficit disorder','add','adhd'],'A neurodevelopmental condition affecting attention, activity, or impulse regulation.',true,30),
  ('mental-behavioral-health','panic-disorder','Panic Disorder',null,array['panic attacks'],'An anxiety condition involving recurring unexpected panic attacks.',false,40),
  ('mental-behavioral-health','post-traumatic-stress-disorder','Post-Traumatic Stress Disorder','PTSD',array['post traumatic stress','ptsd'],'A condition that may develop after exposure to traumatic events.',false,50),
  ('mental-behavioral-health','bipolar-disorder','Bipolar Disorder',null,array['bipolar affective disorder'],'A mood condition involving episodes of depression and elevated mood.',false,60),
  ('sleep','insomnia-disorder','Insomnia Disorder','Insomnia',array['chronic insomnia'],'A sleep condition involving persistent difficulty sleeping.',true,10),
  ('sleep','restless-legs-syndrome','Restless Legs Syndrome','RLS',array['willis-ekbom disease'],'A condition involving an urge to move the legs, often during rest.',false,20),
  ('allergy-immunology','seasonal-allergies','Seasonal Allergies','Allergic rhinitis',array['hay fever','pollen allergy','allergic rhinitis'],'An allergic condition triggered by seasonal environmental allergens.',true,10),
  ('allergy-immunology','food-allergy','Food Allergy',null,array['food allergies'],'An immune response to one or more food proteins.',false,20),
  ('allergy-immunology','mast-cell-activation-syndrome','Mast Cell Activation Syndrome','MCAS',array['mast cell activation','mcas'],'A condition involving recurring symptoms associated with mast-cell mediator release.',true,30),
  ('pain-disorders','fibromyalgia','Fibromyalgia',null,array['fibromyalgia syndrome'],'A chronic condition associated with widespread pain and other symptoms.',true,10),
  ('pain-disorders','chronic-back-pain','Chronic Back Pain',null,array['persistent back pain'],'Back pain that persists or recurs over an extended period.',false,20),
  ('pain-disorders','myalgic-encephalomyelitis-chronic-fatigue-syndrome','Myalgic Encephalomyelitis/Chronic Fatigue Syndrome','ME/CFS',array['chronic fatigue syndrome','cfs','me cfs'],'A chronic multisystem condition associated with activity intolerance and other symptoms.',true,30),
  ('pain-disorders','complex-regional-pain-syndrome','Complex Regional Pain Syndrome','CRPS',array['reflex sympathetic dystrophy','crps'],'A chronic pain condition usually affecting a limb after injury or another event.',false,40),
  ('pain-disorders','chronic-tension-type-headache','Chronic Tension-Type Headache',null,array['tension headache'],'A headache condition involving frequent tension-type headaches.',false,50)
)
insert into public.conditions
  (category_id, slug, name, short_name, common_aliases, description, is_featured, display_order)
select c.id, s.slug, s.name, s.short_name, s.aliases, s.description, s.featured, s.display_order
from seed s
join public.condition_categories c on c.slug = s.category_slug
on conflict (slug) do nothing;
