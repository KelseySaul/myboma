import { UserProfile } from '../App';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faSignOutAlt, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';

interface ImpersonationBannerProps {
  target: UserProfile;
  onExit: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  landlord: 'text-blue-300',
  tenant:   'text-emerald-300',
  hunter:   'text-purple-300',
  admin:    'text-rose-300',
};

export default function ImpersonationBanner({ target, onExit }: ImpersonationBannerProps) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] box-border flex items-center justify-between gap-4 px-4 py-2.5
        bg-amber-950/95 backdrop-blur-md border-b border-amber-700/60
        shadow-[0_4px_30px_rgba(245,158,11,0.25)]"
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        paddingTop: 'var(--sat)',
        minHeight: 'var(--impersonation-height)',
        boxSizing: 'border-box',
      }}
    >
      {/* Pulsing indicator */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex-shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 flex" />
          <span className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping opacity-75" />
        </div>

        <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-200">
            Impersonating
          </span>
          <span className="text-sm font-black text-white truncate">
            {target.displayName}
          </span>
          <span className="text-[11px] font-medium text-amber-400/80 truncate hidden sm:block">
            {target.email}
          </span>
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg bg-white/10 ${ROLE_COLORS[target.role] ?? 'text-zinc-300'}`}>
            {target.role}
          </span>
        </div>
      </div>

      {/* Warning + Exit */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="hidden md:flex items-center gap-1.5 text-amber-400/70 text-[10px] font-bold uppercase tracking-widest">
          <FontAwesomeIcon icon={faExclamationTriangle} className="h-3 w-3" />
          Admin view — RLS reflects your session
        </div>

        <button
          onClick={onExit}
          className="flex items-center gap-2 px-4 py-1.5 rounded-xl
            bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40
            text-white text-xs font-black uppercase tracking-widest
            transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <FontAwesomeIcon icon={faSignOutAlt} className="h-3.5 w-3.5" />
          Exit
        </button>
      </div>
    </div>
  );
}
