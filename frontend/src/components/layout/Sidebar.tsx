import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, Users, Home, FileText, Euro, BarChart3, LogOut, Receipt,
  UserCheck, Settings, UserCog, Contact, BellRing, CalendarClock, FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/api';
import { Rolle } from '@/types';

type NavItem = { to: string; icon: React.ComponentType<{ className?: string }>; label: string; rollen?: Rolle[] };

const NICHT_KOSTENBUCHER: Rolle[] = ['ADMIN', 'VOLLZUGRIFF', 'VERWALTER', 'VERTRAGSVERWALTER'];
const ADMIN_ONLY: Rolle[] = ['ADMIN'];

const navItems: NavItem[] = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/kontakte', icon: Contact, label: 'Kontakte', rollen: NICHT_KOSTENBUCHER },
  { to: '/eigentuemer', icon: UserCheck, label: 'Eigentümer', rollen: NICHT_KOSTENBUCHER },
  { to: '/mietobjekte', icon: Building2, label: 'Mietobjekte' },
  { to: '/mieter', icon: Users, label: 'Mieter', rollen: NICHT_KOSTENBUCHER },
  { to: '/mietvertraege', icon: FileText, label: 'Mietverträge', rollen: NICHT_KOSTENBUCHER },
  { to: '/forderungen', icon: BellRing, label: 'Forderungen', rollen: NICHT_KOSTENBUCHER },
  { to: '/fristen', icon: CalendarClock, label: 'Fristen' },
  { to: '/dokumente', icon: FolderOpen, label: 'Dokumente' },
  { to: '/kosten', icon: Euro, label: 'Kosten' },
  { to: '/nebenkosten', icon: Receipt, label: 'Nebenkostenabr.', rollen: NICHT_KOSTENBUCHER },
];

const adminItems: NavItem[] = [
  { to: '/einstellungen/benutzer', icon: UserCog, label: 'Benutzerverwaltung', rollen: ADMIN_ONLY },
  { to: '/einstellungen/system', icon: Settings, label: 'Einstellungen', rollen: ADMIN_ONLY },
];

export function Sidebar() {
  const { logout, benutzer } = useAuthStore();
  const rolle = benutzer?.rolle as Rolle | undefined;

  const { data: fristen } = useQuery({
    queryKey: ['fristen', 'OFFEN'],
    queryFn: () => api.fristen.list().then((r) => r.data),
    staleTime: 60_000,
  });
  const fristenRot = fristen?.filter((f) => f.ampel === 'ROT').length ?? 0;

  const isVisible = (item: NavItem) => {
    if (!item.rollen) return true;
    return rolle ? item.rollen.includes(rolle) : false;
  };

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-slate-900 text-white">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-700">
        <Home className="h-6 w-6 text-blue-400" />
        <span className="font-bold text-lg">Mietverwaltung</span>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems.filter(isVisible).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
              )
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
            {to === '/fristen' && fristenRot > 0 && (
              <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold">
                {fristenRot}
              </span>
            )}
          </NavLink>
        ))}

        {rolle === 'ADMIN' && (
          <>
            <div className="pt-3 pb-1 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Administration
            </div>
            {adminItems.filter(isVisible).map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                  )
                }
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-slate-700 p-4">
        {benutzer && (
          <div className="px-3 py-1 mb-2 text-xs text-slate-400 truncate">{benutzer.name}</div>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Abmelden
        </button>
      </div>
    </aside>
  );
}
