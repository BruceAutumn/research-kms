import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  desc?: string;
  children?: ReactNode;
}

/** 规范空状态：一句说明 + 一个动作按钮。 */
export default function EmptyState({ title, desc, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
