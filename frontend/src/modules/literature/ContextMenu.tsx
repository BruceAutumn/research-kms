import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children?: MenuItem[];
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

interface ContextMenuProps {
  menu: MenuState | null;
  onClose: () => void;
}

/** Module-wide context menu(withTwosub levelMenu).  */
export default function ContextMenu({ menu, onClose }: ContextMenuProps) {
  const [submenu, setSubmenu] = useState<{ index: number; items: MenuItem[]; anchor: 'left' | 'right' } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    setSubmenu(null);
    const close = (event: MouseEvent) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  // Prevent menu overflow viewport
  const width = 200;
  const height = Math.min(menu.items.length * 26 + 12, 360);
  const x = Math.min(menu.x, window.innerWidth - width - 8);
  const y = Math.min(menu.y, window.innerHeight - height - 8);

  const run = (item: MenuItem) => {
    onClose();
    item.onClick?.();
  };

  const renderItems = (items: MenuItem[], parentIndex: string) =>
    items.map((item, index) => (
      <button
        key={`${parentIndex}-${index}`}
        type="button"
        className={`ctx-item ${item.danger ? 'is-danger' : ''}`}
        disabled={item.disabled}
        onClick={() => run(item)}
        onMouseEnter={() => {
          setSubmenu(item.children && item.children.length > 0 ? { index, items: item.children, anchor: 'right' } : null);
        }}
      >
        <span className="ctx-item-icon">{item.icon}</span>
        <span className="ctx-item-label">{item.label}</span>
        {item.children && item.children.length > 0 && <ChevronRight size={12} className="ctx-item-arrow" aria-hidden="true" />}
      </button>
    ));

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y, width }} role="menu">
      {renderItems(menu.items, 'root')}
      {submenu && (
        <div
          className="ctx-menu ctx-submenu"
          style={{
            left: submenu.anchor === 'right' ? width - 4 : -width + 4,
            top: 4 + submenu.index * 26,
            width
          }}
          role="menu"
        >
          {renderItems(submenu.items, `sub-${submenu.index}`)}
        </div>
      )}
    </div>
  );
}
