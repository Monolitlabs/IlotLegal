export interface Category {
  id: string
  slug: string
  name: string
  tagline: string | null
  icon_name: string | null
  image_url: string | null
  color_accent: string | null
  sort_order: number
  coming_soon: boolean
  is_active: boolean
  created_at: string
}

export interface SubCategory {
  id: string
  category_id: string
  slug: string
  name: string
  sort_order: number
  is_active: boolean
}

export interface Service {
  id: string
  category_id: string
  sub_category_id: string | null
  slug: string
  name: string
  description: string | null
  target_client: string | null
  key_deliverables: string | null
  estimated_timeline: string | null
  real_time_work: string | null
  note: string | null
  whatsapp_message: string | null
  price: string | null
  required_docs_url: string | null
  meta_title: string | null
  meta_description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// Enriched types used in pages
export interface ServiceWithCategory extends Service {
  category: Pick<Category, 'slug' | 'name' | 'color_accent' | 'image_url'>
  sub_category: Pick<SubCategory, 'slug' | 'name'> | null
  last_verified_at: string | null
  recent_updates: UpdateRef[]
}

export interface SubCategoryWithServices extends SubCategory {
  services: Service[]
}

export interface CategoryWithSubCategories extends Category {
  sub_categories: SubCategoryWithServices[]
}

export interface Author {
  id: string
  name: string
  role: string | null
  photo_url: string | null
  bio: string | null
  linkedin_url: string | null
}

export interface Post {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  cover_image_alt: string | null
  category_slug: string
  category_name: string
  category_accent: string | null
  author: Author | null
  published_at: string
  featured: boolean
  is_active: boolean
  updated_at: string
}

export interface PostWithDetails extends Post {
  body_en: unknown[] | null   // Portable Text blocks — EN
  body_id: unknown[] | null   // Portable Text blocks — ID
  meta_title: string | null
  meta_description: string | null
  /** True when an editor hand-picked the services below, rather than the category fallback. */
  has_curated_services: boolean
  related_services: Array<{
    slug: string
    name: string
    description: string | null
    category_slug: string
  }>
}

/** Minimal shape used inside ServiceWithCategory.recent_updates and UpdatesBanner */
export interface UpdateRef {
  id: string
  slug: string
  title: string
  summary: string | null
  severity: 'info' | 'warning' | 'critical'
  effective_date: string | null
  published_at: string
  source_url: string | null
}

export interface Update extends UpdateRef {
  affected_services: Array<{ slug: string; name: string; category_slug: string }>
  is_active: boolean
  updated_at: string
}

export interface UpdateWithBody extends Update {
  body_en: unknown[] | null
  body_id: unknown[] | null
}
