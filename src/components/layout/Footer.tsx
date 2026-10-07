import Link from 'next/link'
import Image from 'next/image'
import { Instagram, Facebook, Linkedin, MapPin } from 'lucide-react'

const SERVICES = [
  { href: '/visa', label: 'Visa & Immigration' },
  { href: '/legal', label: 'Legal & Contracts' },
  { href: '/company-setup', label: 'Company Setup' },
  { href: '/insurance', label: 'Insurance' },
  { href: '/property', label: 'Property Advisory' },
  { href: '/hr-payroll', label: 'HR & Payroll' },
  { href: '/accounting-tax', label: 'Accounting & Tax' },
]

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/privacy', label: 'Privacy Policy' },
]

const SOCIALS = [
  { Icon: Instagram, label: 'Instagram', href: 'https://www.instagram.com/ilotlegal/' },
  { Icon: Facebook, label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61565301002621' },
  { Icon: Linkedin, label: 'LinkedIn', href: 'https://www.linkedin.com/in/ilot-legal-4ab844423/' },
]

const OFFICES = [
  'Jl. Petitenget No.882 X, Kerobokan, Kabupaten Badung, Bali 80361',
]

export function Footer() {
  return (
    <footer className="bg-dark text-white pt-16 pb-8">
      <div className="container-site px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div>
            <Image
              src="/logos/Ilot-Logo-Light.svg"
              alt="Ilot"
              width={140}
              height={47}
              className="h-11 w-auto mb-3"
            />
            <p className="text-muted text-sm leading-relaxed">
              Clear Legal Support. Confident Decisions.
            </p>

            {/* Social icons */}
            <div className="flex items-center gap-3 mt-5">
              {SOCIALS.map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/40 transition-colors"
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                </a>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-4">
              Services
            </h3>
            <ul className="space-y-2">
              {SERVICES.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-4">
              Legal
            </h3>
            <ul className="space-y-2">
              {LEGAL_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Offices */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-4">
              Office
            </h3>
            <ul className="space-y-4">
              {OFFICES.map((address) => (
                <li key={address} className="flex gap-2.5 text-sm text-gray-400 leading-relaxed">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" strokeWidth={1.75} />
                  <span>{address}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 text-xs text-muted flex flex-col md:flex-row justify-between gap-2">
          <span>© {new Date().getFullYear()} Ilot. All rights reserved.</span>
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
            <span>Indonesia · English</span>
            <span>
              Website built by{' '}
              <a
                href="https://monolitlabs.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-gray-300 hover:text-white underline underline-offset-2 decoration-white/30 hover:decoration-white transition-colors"
              >
                Monolit Labs
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
