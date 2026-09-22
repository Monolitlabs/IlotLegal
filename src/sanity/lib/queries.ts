import { groq } from 'next-sanity'

/**
 * GROQ projections rename camelCase Sanity fields → snake_case to preserve
 * existing TS types in src/lib/db/types.ts and avoid touching consumers.
 * Localized fields fall back to EN.
 */

const CATEGORY_PROJECTION = groq`
  "id": _id,
  "slug": slug.current,
  "name": coalesce(name.en, ""),
  "tagline": coalesce(tagline.en, null),
  "icon_name": iconName,
  "image_url": coverImage.asset->url,
  "color_accent": accentColor,
  "sort_order": sortOrder,
  "coming_soon": coalesce(comingSoon, false),
  "is_active": isActive,
  "created_at": _createdAt
`

const SUB_CATEGORY_PROJECTION = groq`
  "id": _id,
  "category_id": category._ref,
  "slug": slug.current,
  "name": coalesce(name.en, ""),
  "sort_order": sortOrder,
  "is_active": isActive
`

const SERVICE_PROJECTION = groq`
  "id": _id,
  "category_id": category._ref,
  "sub_category_id": subCategory._ref,
  "slug": slug.current,
  "name": coalesce(name.en, ""),
  "description": coalesce(description.en, null),
  "target_client": coalesce(targetClient.en, null),
  "key_deliverables": coalesce(keyDeliverables.en, null),
  "estimated_timeline": coalesce(estimatedTimeline.en, null),
  "real_time_work": coalesce(realTimeWork.en, null),
  "note": coalesce(note.en, null),
  "whatsapp_message": coalesce(whatsappMessage.en, null),
  "price": coalesce(price, null),
  "required_docs_url": coalesce(requiredDocsUrl, null),
  "meta_title": coalesce(seo.metaTitle.en, null),
  "meta_description": coalesce(seo.metaDescription.en, null),
  "sort_order": sortOrder,
  "is_active": isActive,
  "created_at": _createdAt,
  "updated_at": _updatedAt
`

const SERVICE_WITH_CATEGORY_PROJECTION = groq`
  "id": _id,
  "category_id": category._ref,
  "sub_category_id": subCategory._ref,
  "slug": slug.current,
  "name": coalesce(name.en, ""),
  "description": coalesce(description.en, null),
  "target_client": coalesce(targetClient.en, null),
  "key_deliverables": coalesce(keyDeliverables.en, null),
  "estimated_timeline": coalesce(estimatedTimeline.en, null),
  "real_time_work": coalesce(realTimeWork.en, null),
  "note": coalesce(note.en, null),
  "whatsapp_message": coalesce(whatsappMessage.en, null),
  "price": coalesce(price, null),
  "required_docs_url": coalesce(requiredDocsUrl, null),
  "meta_title": coalesce(seo.metaTitle.en, null),
  "meta_description": coalesce(seo.metaDescription.en, null),
  "sort_order": sortOrder,
  "is_active": isActive,
  "created_at": _createdAt,
  "updated_at": _updatedAt,
  "category": {
    "slug": category->slug.current,
    "name": coalesce(category->name.en, ""),
    "color_accent": category->accentColor,
    "image_url": category->coverImage.asset->url
  },
  "sub_category": select(
    defined(subCategory) => {
      "slug": subCategory->slug.current,
      "name": coalesce(subCategory->name.en, "")
    },
    null
  ),
  "last_verified_at": lastVerifiedAt,
  "recent_updates": *[
    _type == "update" &&
    isActive == true &&
    ^._id in affectedServices[]._ref
  ] | order(publishedAt desc) [0..2] {
    "id": _id,
    "slug": slug.current,
    "title": coalesce(title.en, ""),
    "summary": coalesce(summary.en, null),
    "severity": coalesce(severity, "info"),
    "effective_date": effectiveDate,
    "published_at": publishedAt,
    "source_url": sourceUrl
  }
`

export const categoriesQuery = groq`
  *[_type == "category" && isActive == true] | order(sortOrder asc) {
    ${CATEGORY_PROJECTION}
  }
`

export const categoryBySlugQuery = groq`
  *[_type == "category" && slug.current == $slug && isActive == true][0] {
    ${CATEGORY_PROJECTION},
    "sub_categories": *[_type == "subCategory" && category._ref == ^._id && isActive == true] | order(sortOrder asc) {
      ${SUB_CATEGORY_PROJECTION},
      "services": *[_type == "service" && subCategory._ref == ^._id && isActive == true] | order(sortOrder asc) {
        ${SERVICE_PROJECTION}
      }
    }
  }
`

export const categoriesWithNavQuery = groq`
  *[_type == "category" && isActive == true] | order(sortOrder asc) {
    ${CATEGORY_PROJECTION},
    "sub_categories": *[_type == "subCategory" && category._ref == ^._id && isActive == true] | order(sortOrder asc) {
      ${SUB_CATEGORY_PROJECTION},
      "services": *[_type == "service" && subCategory._ref == ^._id && isActive == true] | order(sortOrder asc) {
        "id": _id,
        "slug": slug.current,
        "name": coalesce(name.en, ""),
        "sub_category_id": subCategory._ref,
        "category_id": category._ref,
        "sort_order": sortOrder,
        "is_active": isActive
      }
    }
  }
`

export const allCategorySlugsQuery = groq`
  *[_type == "category" && isActive == true].slug.current
`

export const serviceBySlugQuery = groq`
  *[_type == "service" && slug.current == $slug && isActive == true][0] {
    ${SERVICE_WITH_CATEGORY_PROJECTION}
  }
`

export const allServiceSlugsQuery = groq`
  *[_type == "service" && isActive == true] {
    "slug": slug.current,
    "category": category->slug.current
  }
`

export const servicesByCategoryQuery = groq`
  *[_type == "service" && category->slug.current == $categorySlug && isActive == true]
    | order(sortOrder asc) {
      ${SERVICE_WITH_CATEGORY_PROJECTION}
    }
`

export const relatedServicesQuery = groq`
  *[_type == "service" && subCategory._ref == $subCategoryId && slug.current != $excludeSlug && isActive == true]
    | order(sortOrder asc) [0...$limit] {
      ${SERVICE_PROJECTION}
    }
`

export const featuredServicesQuery = groq`
  *[_type == "service" && slug.current in $slugs && isActive == true] {
    ${SERVICE_PROJECTION},
    "category": {
      "slug": category->slug.current,
      "name": coalesce(category->name.en, "")
    }
  }
`

// ─── Blog queries ─────────────────────────────────────────────────────────

const AUTHOR_PROJECTION = groq`
  "id": _id,
  "name": name,
  "role": role,
  "photo_url": photo.asset->url,
  "bio": coalesce(bio.en, null),
  "linkedin_url": linkedinUrl
`

const POST_PROJECTION = groq`
  "id": _id,
  "slug": slug.current,
  "title": coalesce(title.en, ""),
  "excerpt": coalesce(excerpt.en, null),
  "cover_image_url": coverImage.asset->url,
  "cover_image_alt": coalesce(coverImage.alt.en, null),
  "category_slug": category->slug.current,
  "category_name": coalesce(category->name.en, ""),
  "category_accent": category->accentColor,
  "author": select(
    defined(author) => author->{${AUTHOR_PROJECTION}},
    null
  ),
  "published_at": publishedAt,
  "featured": coalesce(featured, false),
  "is_active": coalesce(isActive, true),
  "updated_at": _updatedAt
`

export const postsQuery = groq`
  *[
    _type == "post" &&
    isActive == true &&
    publishedAt <= now()
  ] | order(publishedAt desc) {
    ${POST_PROJECTION}
  }
`

export const featuredPostQuery = groq`
  *[
    _type == "post" &&
    isActive == true &&
    publishedAt <= now() &&
    featured == true
  ] | order(publishedAt desc) [0] {
    ${POST_PROJECTION}
  }
`

export const postBySlugQuery = groq`
  *[
    _type == "post" &&
    slug.current == $slug &&
    isActive == true
  ] [0] {
    ${POST_PROJECTION},
    "body_en": body.en,
    "body_id": body.id,
    "meta_title": coalesce(seo.metaTitle.en, null),
    "meta_description": coalesce(seo.metaDescription.en, null),
    "has_curated_services": coalesce(count(relatedServices) > 0, false),
    "related_services": select(
      // Manual picks win. Filter on the referenced doc via @-> so that editor
      // drag order survives — dereferencing first and filtering after loses it.
      // count() rather than coalesce(): an emptied array leaves [], not null.
      count(relatedServices) > 0 => relatedServices[@->isActive == true]->{
        "slug": slug.current,
        "name": coalesce(name.en, ""),
        "description": coalesce(description.en, null),
        "category_slug": category->slug.current
      },
      *[
        _type == "service" &&
        category._ref == ^.category._ref &&
        isActive == true
      ] | order(sortOrder asc) [0..2] {
        "slug": slug.current,
        "name": coalesce(name.en, ""),
        "description": coalesce(description.en, null),
        "category_slug": category->slug.current
      }
    )
  }
`

export const allPostSlugsQuery = groq`
  *[
    _type == "post" &&
    isActive == true &&
    publishedAt <= now()
  ].slug.current
`

export const latestPostsByCategoryQuery = groq`
  *[
    _type == "post" &&
    isActive == true &&
    publishedAt <= now() &&
    category->slug.current == $categorySlug
  ] | order(publishedAt desc) [0..$limit] {
    ${POST_PROJECTION}
  }
`

// ─── Update queries ────────────────────────────────────────────────────────

const UPDATE_PROJECTION = groq`
  "id": _id,
  "slug": slug.current,
  "title": coalesce(title.en, ""),
  "summary": coalesce(summary.en, null),
  "severity": coalesce(severity, "info"),
  "effective_date": effectiveDate,
  "published_at": publishedAt,
  "source_url": sourceUrl,
  "affected_services": affectedServices[]->{
    "slug": slug.current,
    "name": coalesce(name.en, ""),
    "category_slug": category->slug.current
  },
  "is_active": coalesce(isActive, true),
  "updated_at": _updatedAt
`

export const updatesQuery = groq`
  *[_type == "update" && isActive == true] | order(publishedAt desc) {
    ${UPDATE_PROJECTION}
  }
`

export const updateBySlugQuery = groq`
  *[_type == "update" && slug.current == $slug && isActive == true][0] {
    ${UPDATE_PROJECTION},
    "body_en": body.en,
    "body_id": body.id
  }
`

export const allUpdateSlugsQuery = groq`
  *[_type == "update" && isActive == true].slug.current
`
