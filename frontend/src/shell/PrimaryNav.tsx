import { NavLink } from 'react-router-dom';
import { Home, BookOpen, Bot, FolderTree, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useShell } from './ShellContext';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/literature', label: 'Paper', icon: BookOpen },
  { to: '/ai', label: 'AI', icon: Bot },
  { to: '/vault', label: 'Vault', icon: FolderTree }
];

export default function PrimaryNav() {
  const { openSettings } = useShell();

  return (
    <aside className="primary-nav" aria-label="Top Navigation">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
            title={item.label}
          >
            <Icon size={18} className="nav-item-icon" aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}

      <div className="nav-spacer" />

      <button type="button" className="nav-item" title="Settings" onClick={() => openSettings()}>
        <Settings size={18} className="nav-item-icon" aria-hidden="true" />
        <span>Settings</span>
      </button>
    </aside>
  );
}
