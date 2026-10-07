import type { Metadata } from 'next'
import { Mail, MapPin, Clock } from 'lucide-react'
import { WhatsAppCTA } from '@/components/ui/WhatsAppCTA'
import { ContactForm } from '@/components/contact/ContactForm'
import { RevealGroup, RevealItem } from '@/components/ui/Reveal'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Ilot for a free consultation.',
}

const CONTACT_EMAIL = 'hello@ilotlegal.com'
const OFFICE_ADDRESS = 'Jl. Petitenget No.882 X, Kerobokan, Kabupaten Badung, Bali 80361'
// Official Google Maps listing (share link from the client) — opens the Maps app on mobile.
const OFFICE_MAPS_LINK = 'https://maps.app.goo.gl/G2B184m9pJCWUZRT6'
// Embed pinned to the exact business listing (not a street-address geocode),
// so only the office is marked on the map.
const OFFICE_PLACE_QUERY = 'ILOT PROPERTY BALI - Head Office, Gg. Sri Kahyangan, Tibubeneng'
const MAP_EMBED_SRC = `https://www.google.com/maps?q=${encodeURIComponent(OFFICE_PLACE_QUERY)}&output=embed`

const CHANNELS = [
  {
    Icon: Mail,
    label: 'Email us',
    value: CONTACT_EMAIL,
    href: `mailto:${CONTACT_EMAIL}`,
  },
  {
    Icon: MapPin,
    label: 'Visit our office',
    value: OFFICE_ADDRESS,
    href: OFFICE_MAPS_LINK,
  },
  {
    Icon: Clock,
    label: 'Response time',
    value: 'Within one business day',
  },
] as const

export default function ContactPage() {
  return (
    <div className="section-padding">
      <div className="container-site max-w-6xl">
        <RevealGroup className="grid items-start gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          {/* Left — heading + contact channels */}
          <div>
            <RevealItem>
              <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
                Get in touch
              </h1>
            </RevealItem>
            <RevealItem>
              <p className="mb-10 text-lg leading-relaxed text-muted">
                Tell us what you need. We&apos;ll respond within one business day
                and guide you from there.
              </p>
            </RevealItem>

            <ul className="mb-10 space-y-6">
              {CHANNELS.map(({ Icon, label, value, ...rest }) => (
                <RevealItem as="li" key={label}>
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15">
                      <Icon className="h-5 w-5 text-foreground" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{label}</p>
                      {'href' in rest ? (
                        <a
                          href={rest.href}
                          target={rest.href.startsWith('http') ? '_blank' : undefined}
                          rel={rest.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                          className="text-sm leading-relaxed text-muted transition-colors duration-200 hover:text-foreground"
                        >
                          {value}
                        </a>
                      ) : (
                        <p className="text-sm leading-relaxed text-muted">{value}</p>
                      )}
                    </div>
                  </div>
                </RevealItem>
              ))}
            </ul>

            <RevealItem>
              <div className="rounded-card bg-dark p-6 sm:p-8">
                <p className="mb-1 font-bold text-white">Prefer to chat instantly?</p>
                <p className="mb-5 text-sm leading-relaxed text-gray-400">
                  Message us on WhatsApp and we&apos;ll pick up the conversation right away.
                </p>
                <WhatsAppCTA label="Start on WhatsApp" className="w-fit" />
              </div>
            </RevealItem>
          </div>

          {/* Right — form */}
          <RevealItem>
            <ContactForm />
          </RevealItem>
        </RevealGroup>

        {/* Map */}
        <RevealGroup className="mt-16 md:mt-24">
          <RevealItem>
            <h2 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
              Find us in Canggu
            </h2>
            <p className="mb-8 text-muted">{OFFICE_ADDRESS}</p>
          </RevealItem>
          <RevealItem>
            <div className="overflow-hidden rounded-card border border-black/10 bg-surface">
              <iframe
                src={MAP_EMBED_SRC}
                title={`Map showing the Ilot office at ${OFFICE_ADDRESS}`}
                className="h-[320px] w-full md:h-[440px]"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </RevealItem>
        </RevealGroup>
      </div>
    </div>
  )
}
