import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  Phone,
  Wrench,
  Settings,
  ChevronLeft,
  ChevronRight,
  Mic2,
  Code2,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/calls', label: 'Calls', icon: Phone },
  { to: '/conversations', label: 'Conversations', icon: MessageSquare },
  { to: '/tools', label: 'Tools', icon: Wrench },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/dev', label: 'Developer', icon: Code2 },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r bg-sidebar transition-all duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      {/* Header — h-14 matches app header */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Mic2 className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="truncate text-sm font-semibold text-sidebar-foreground">CeliyoVoice</span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    collapsed && 'justify-center px-2',
                  )
                }
                title={collapsed ? label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-[4.5rem] z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {/* Current path indicator for dev */}
      {!collapsed && (
        <div className="border-t border-sidebar-border p-3">
          <p className="truncate text-xs text-muted-foreground">{location.pathname}</p>
        </div>
      )}
    </aside>
  );
}
