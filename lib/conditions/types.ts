export type ConditionStatus = "active" | "monitoring" | "remission" | "resolved" | "archived";

export type ConditionCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_order: number;
};

export type CatalogCondition = {
  id: string;
  category_id: string | null;
  slug: string;
  name: string;
  short_name: string | null;
  description: string | null;
  common_aliases: string[];
  is_featured: boolean;
  display_order: number;
  category?: Pick<ConditionCategory, "slug" | "name"> | null;
};

export type UserCondition = {
  id: string;
  user_id: string;
  condition_id: string | null;
  custom_condition_name: string | null;
  custom_condition_name_normalized: string | null;
  status: ConditionStatus;
  diagnosed_on: string | null;
  diagnosed_year: number | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  condition?: CatalogCondition | null;
};

export type ConditionInput = {
  conditionId?: string | null;
  customName?: string | null;
  status: Exclude<ConditionStatus, "archived">;
  diagnosedOn?: string | null;
  diagnosedYear?: number | null;
  isPrimary?: boolean;
  notes?: string | null;
};
