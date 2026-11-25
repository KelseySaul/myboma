import { Capacitor } from '@capacitor/core';
import { Mail } from 'lucide-react';
import { tenantConfig } from '../config/tenant';

interface FooterProps {
  /** 'public' is the full marketing footer for logged-out pages; 'app' is the slim bar inside the dashboard. */
  variant?: 'public' | 'app';
}

export default function Footer({ variant = 'app' }: FooterProps) {
  const year = new Date().getFullYear();

  if (variant === 'app') {
    return (
      <footer className="hidden sm:block py-6 px-6 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 shrink-0 mt-auto w-full">
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2.5">
            <img src={tenantConfig.logoUrl} alt={tenantConfig.appName} className="h-5 w-5 object-contain rounded" width="20" height="20" />
            <span className="font-brand text-xl font-semibold leading-none text-slate-900 dark:text-white">{tenantConfig.appName}</span>
            <span>·</span>
            <span>© {year} All rights reserved.</span>
          </div>
          <nav className="flex items-center gap-4 text-xs" aria-label="Legal">
            <a className="transition-colors hover:text-slate-900 dark:hover:text-white font-medium" href="/terms">Terms</a>
            <a className="transition-colors hover:text-slate-900 dark:hover:text-white font-medium" href="/privacy">Privacy</a>
          </nav>
        </div>
      </footer>
    );
  }

  // The native app's logged-out screen is just the listings; no marketing footer there.
  if (Capacitor.isNativePlatform()) return null;

  const columns = [
    {
      title: 'Explore',
      links: [
        { label: 'Find a house', href: '/#homes' },
        { label: 'For landlords', href: '/#landlords' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy policy', href: '/privacy' },
        { label: 'Terms of use', href: '/terms' },
      ],
    },
  ];

  return (
    <footer className="relative isolate mt-auto w-full overflow-hidden bg-[#120926] text-white">
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-cover bg-center opacity-50"
        style={{ backgroundImage: "url('/hero/hero-1.webp')" }}
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0D061D] via-[#1B0E38]/90 to-[#120926]/70" />

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6 sm:pt-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <div className="flex items-center gap-3">
              <img src={tenantConfig.logoUrl} alt="" className="h-9 w-9 object-contain brightness-0 invert" width="36" height="36" />
              <span className="font-brand text-3xl font-semibold leading-none tracking-tight">{tenantConfig.appName}</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-zinc-400">
              Find a home, or manage your rentals and collect rent on M-Pesa. Built in Kenya.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{column.title}</h2>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <a className="text-sm text-zinc-300 transition hover:text-white" href={link.href}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Contact</h2>
            <a
              href={`mailto:${tenantConfig.supportEmail}`}
              className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-white"
            >
              <Mail className="h-4 w-4" />
              {tenantConfig.supportEmail}
            </a>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {tenantConfig.appName}. All rights reserved.</p>
          <p>
            Designed by{' '}
            <a href="https://kelseysaul.dev" target="_blank" rel="noopener" className="font-medium text-zinc-300 transition hover:text-white">
              Kelsey Saul (kelseysaul.dev)
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
