import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  desc?: string;
  children?: ReactNode;
}

/** Standard Empty State: Onesentence explanation + An action button.  */
export default function EmptyState({ title, desc, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
