-- Additive foundation. Existing health policies, catalog IDs and nutrition snapshots stay intact.
begin;

alter table public.health_events add column input_method text not null default 'manual'
  constraint health_events_input_method_check check (input_method in ('manual','voice','integration','import','system'));
comment on column public.health_events.input_method is 'Entry channel, independent of any future integration provider identifier.';

-- Locale-independent comparison key; deliberately preserve punctuation, accents and display names.
create function public.axvital_normalize_food_name(value text)
returns text language sql immutable strict parallel safe set search_path='' as $$
  select btrim(regexp_replace(translate(value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), E'[ \t\n\r\f\013]+', ' ', 'g'), ' ');
$$;
revoke all on function public.axvital_normalize_food_name(text) from public, anon;
grant execute on function public.axvital_normalize_food_name(text) to authenticated, service_role;

-- Names are not unique identities: brands/preparations can legitimately share names.
alter table public.foods add column normalized_name text
  generated always as (public.axvital_normalize_food_name(name)) stored;
alter table public.foods alter column normalized_name set not null;
create index foods_normalized_name_idx on public.foods(normalized_name);

create table public.food_aliases (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  alias text not null check (public.axvital_normalize_food_name(alias) <> ''),
  normalized_alias text generated always as (public.axvital_normalize_food_name(alias)) stored not null,
  created_at timestamptz not null default now(),
  unique(food_id, normalized_alias)
);
-- Ambiguous aliases across different foods remain representable; future resolution must handle them.
create index food_aliases_lookup_idx on public.food_aliases(normalized_alias);
create table public.food_category_map (
  food_id uuid not null references public.foods(id) on delete cascade,
  category_id uuid not null references public.food_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(food_id, category_id)
);
create index food_category_map_category_idx on public.food_category_map(category_id, food_id);

alter table public.food_aliases enable row level security;
alter table public.food_category_map enable row level security;
revoke all on public.food_aliases, public.food_category_map from public, anon, authenticated;
grant select on public.food_aliases, public.food_category_map to authenticated;
grant all on public.food_aliases, public.food_category_map to service_role;
create policy food_aliases_read on public.food_aliases for select to authenticated
  using (exists(select 1 from public.foods f where f.id=food_id and f.is_active));
create policy food_category_map_read on public.food_category_map for select to authenticated
  using (exists(select 1 from public.foods f where f.id=food_id and f.is_active)
    and exists(select 1 from public.food_categories c where c.id=category_id and c.is_active));
-- Existing catalogs already have read-only policies. Remove possible default write grants too.
revoke insert, update, delete on public.foods, public.food_categories from public, anon, authenticated;

-- Keep established fruits/oils-fats slugs rather than create synonymous categories.
insert into public.food_categories(slug,name,display_order) values
  ('beef','Beef',160),('pork','Pork',170),('poultry','Poultry',180),
  ('fish','Fish',190),('shellfish','Shellfish',200),('eggs','Eggs',30),
  ('dairy','Dairy',20),('vegetables','Vegetables',70),('fruits','Fruits',60),
  ('legumes','Legumes',80),('grains','Grains',40),('nuts','Nuts',210),
  ('seeds','Seeds',220),('oils-fats','Oils and Fats',100),
  ('added_sugar','Added Sugar',230),('artificial_sweetener','Artificial Sweetener',240),
  ('processed_meat','Processed Meat',250),('beverages','Beverages',120),('condiments','Condiments',140)
on conflict(slug) do nothing;

-- Copy existing explicit reference data only; do not infer food classifications.
insert into public.food_aliases(food_id,alias)
select f.id,a.alias from public.foods f cross join lateral unnest(f.common_aliases) a(alias)
where public.axvital_normalize_food_name(a.alias) <> ''
on conflict(food_id,normalized_alias) do nothing;
insert into public.food_category_map(food_id,category_id)
select id,category_id from public.foods where category_id is not null
on conflict do nothing;
commit;
