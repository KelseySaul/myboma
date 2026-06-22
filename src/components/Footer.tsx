import { tenantConfig } from '../config/tenant';

export default function Footer() {
  return (
    <footer className="hidden sm:block py-16 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-900">
      <div className="container mx-auto px-4 text-center">
        <div className="flex items-center justify-center gap-3 mb-6 group cursor-pointer">
          <div className="flex h-10 w-10 items-center justify-center transition-transform hover:scale-110 active:scale-95 group cursor-pointer">
            <img src={tenantConfig.logoUrl} alt={tenantConfig.appName} className="h-8 w-8 object-contain rounded-xl animate-logo-reveal" width="32" height="32" />
          </div>
          <span className="text-2xl font-black tracking-tighter text-zinc-900 dark:text-white uppercase">
            {tenantConfig.appName}
          </span>
        </div>
        <div className="max-w-md mx-auto space-y-4">
          <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium leading-relaxed">
            Revolutionizing the Kenyan property market with premium, high-density management tools. 
            © {new Date().getFullYear()} {tenantConfig.appName}. All rights reserved.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-bold text-zinc-500" aria-label="Legal">
            <a className="transition-colors hover:text-indigo-600" href="/terms">Terms and Conditions</a>
            <a className="transition-colors hover:text-indigo-600" href="/privacy">Privacy Policy</a>
            <a className="transition-colors hover:text-indigo-600" href="/#unsubscribe">Unsubscribe</a>
          </nav>
          <div className="pt-6 border-t border-zinc-50 dark:border-zinc-900/50">
            <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
              Crafted by
              <a 
                href="https://inkwell-sandy.vercel.app/#home" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:text-blue-700 transition-colors underline decoration-blue-600/20 underline-offset-4"
              >
                Inkwellcode
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
