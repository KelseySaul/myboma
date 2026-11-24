import { tenantConfig } from '../config/tenant';

export default function Footer() {
  return (
    <footer className="hidden sm:block py-6 px-6 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 shrink-0 mt-auto w-full">
      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2.5">
          <img src={tenantConfig.logoUrl} alt={tenantConfig.appName} className="h-5 w-5 object-contain rounded" width="20" height="20" />
          <span className="font-semibold text-slate-900 dark:text-white">
            {tenantConfig.appName} OS
          </span>
          <span>·</span>
          <span>© {new Date().getFullYear()} All rights reserved.</span>
        </div>
        <nav className="flex items-center gap-4 text-xs" aria-label="Legal">
          <a className="transition-colors hover:text-slate-900 dark:hover:text-white font-medium" href="/terms">Terms</a>
          <a className="transition-colors hover:text-slate-900 dark:hover:text-white font-medium" href="/privacy">Privacy</a>
          <a className="transition-colors hover:text-slate-900 dark:hover:text-white font-medium" href="/#unsubscribe">Unsubscribe</a>
        </nav>
      </div>
    </footer>
  );
}
