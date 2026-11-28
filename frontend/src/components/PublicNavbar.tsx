import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Menu, Search, X } from 'lucide-react';
import { tenantConfig } from '../config/tenant';
import SiteSearch from './search/SiteSearch';

export const SHOW_SAVED_EVENT = 'myboma:show-saved';

interface PublicNavbarProps {
  onLoginClick: () => void;
  /** True when the page starts with the dark photo hero, so the bar starts see-through with white text. */
  overHero?: boolean;
}

const LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

/** Floating glass navigation for logged-out pages. */
export default function PublicNavbar({ onLoginClick, overHero = false }: PublicNavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const previousScrollTop = useRef(0);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const onScroll = () => {
      const currentTop = Math.max(window.scrollY, 0);
      const difference = currentTop - previousScrollTop.current;
      setScrolled(currentTop > 24);
      if (currentTop < 24) {
        setVisible(true);
        previousScrollTop.current = currentTop;
      } else if (Math.abs(difference) >= 8) {
        setVisible(difference < 0);
        previousScrollTop.current = currentTop;
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen || searchOpen) setVisible(true);
  }, [mobileMenuOpen, searchOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dark = overHero && !scrolled;
  const path = window.location.pathname;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 px-3 transition-transform duration-200 ease-out sm:px-6 ${visible ? 'translate-y-0' : '-translate-y-[calc(100%+1rem)]'}`}
      style={{ paddingTop: isNative ? 'calc(var(--sat) + 0.75rem)' : '0.75rem' }}
    >
      <div className="relative mx-auto max-w-7xl">
        <nav
          aria-label="Main"
          className={`flex h-14 items-center justify-between rounded-2xl border px-3 backdrop-blur-md sm:backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300 sm:px-4 ${
            dark
              ? 'border-white/20 bg-black/30 text-white shadow-[0_12px_36px_rgba(0,0,0,0.22)]'
              : 'border-zinc-200/80 bg-white/90 text-zinc-950 shadow-[0_8px_24px_rgba(15,23,42,0.06)]'
          }`}
        >
          <a href="/" className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
            <img src={tenantConfig.logoUrl} alt="" className={`h-8 w-8 object-contain transition-[filter] duration-300 ${dark ? 'brightness-0 invert' : ''}`} width="32" height="32" />
            <span className="font-brand text-2xl font-semibold leading-none tracking-tight sm:text-3xl">{tenantConfig.appName}</span>
          </a>

          <div className="hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              aria-label="Search homes"
              onClick={() => {
                setMobileMenuOpen(false);
                setSearchOpen(true);
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                dark ? 'text-white hover:bg-white/15' : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950'
              }`}
            >
              <Search className="h-4 w-4" />
            </button>
            {LINKS.map((link) => {
              const active = path === link.href;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-lg px-2.5 py-2 text-sm font-medium transition-colors sm:px-3 ${
                    dark
                      ? active ? 'text-white' : 'text-white/75 hover:text-white'
                      : active ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-950'
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
            <button
              type="button"
              onClick={onLoginClick}
              className={`ml-1 h-9 rounded-xl px-4 text-sm font-semibold transition ${
                dark
                  ? 'bg-white text-zinc-950 hover:bg-zinc-100'
                  : 'bg-[#5B21B6] text-white hover:bg-[#4C1D95]'
              }`}
            >
              Sign in
            </button>
          </div>

          <div className="flex items-center gap-1 sm:hidden">
            <button
              type="button"
              aria-label="Search homes"
              onClick={() => {
                setMobileMenuOpen(false);
                setSearchOpen(true);
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                dark ? 'text-white hover:bg-white/15' : 'text-zinc-800 hover:bg-zinc-100'
              }`}
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition sm:hidden ${
                dark ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200/80'
              }`}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div
            className={`absolute inset-x-0 top-[calc(100%+0.5rem)] rounded-2xl border p-2.5 shadow-xl backdrop-blur-2xl sm:hidden ${
              dark
                ? 'border-white/20 bg-zinc-950/90 text-white shadow-black/30'
                : 'border-zinc-200/90 bg-white/95 text-zinc-950 shadow-zinc-900/10'
            }`}
          >
            <div className="space-y-0.5">
              {LINKS.map((link) => {
                const active = path === link.href;
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                      dark
                        ? active ? 'bg-white/12 text-white' : 'text-white/80 hover:bg-white/10'
                        : active ? 'bg-zinc-100 text-zinc-950 font-semibold' : 'text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {link.label}
                  </a>
                );
              })}
            </div>
            <div className={`mt-2 border-t pt-2 ${dark ? 'border-white/10' : 'border-zinc-100'}`}>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLoginClick();
                }}
                className={`h-10 w-full rounded-xl text-sm font-semibold transition ${
                  dark ? 'bg-white text-zinc-950' : 'bg-[#5B21B6] text-white hover:bg-[#4C1D95]'
                }`}
              >
                Sign in
              </button>
            </div>
          </div>
        )}
      </div>
      <SiteSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
