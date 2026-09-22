import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

interface RelatedService {
  slug: string
  name: string
  description: string | null
  category_slug: string
}

interface Props {
  services: RelatedService[]
  categoryName: string
  /** Editor hand-picked these services — they may cross categories, so drop the category wording. */
  isCurated?: boolean
}

export function RelatedServices({ services, categoryName, isCurated }: Props) {
  if (!services.length) return null

  return (
    <aside className="rounded-card bg-surface p-8 not-prose">
      <h3 className="text-lg font-semibold text-foreground mb-1">
        Related Services
      </h3>
      <p className="text-sm text-muted mb-6">
        {isCurated ? 'Services from Ilot' : `Expert ${categoryName} services from Ilot`}
      </p>
      <ul className="flex flex-col gap-4">
        {services.map((svc) => (
          <li key={svc.slug}>
            <Link
              href={`/${svc.category_slug}/${svc.slug}`}
              className="group flex items-start justify-between gap-4 p-4 rounded-xl bg-background hover:bg-accent/5 transition-colors"
            >
              <div>
                <p className="font-medium text-foreground text-sm group-hover:text-accent transition-colors">
                  {svc.name}
                </p>
                {svc.description && (
                  <p className="text-xs text-muted mt-1 line-clamp-1">
                    {svc.description}
                  </p>
                )}
              </div>
              <ArrowRight className="w-4 h-4 text-muted shrink-0 mt-0.5 group-hover:text-accent transition-colors" />
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
