import { History, Plus, Settings, Trash2 } from 'lucide-react';
import type { AiConversation } from '../../types';

interface Props {
  conversations: AiConversation[];
  activeConversationId?: number;
  onSelectConversation: (conversation: AiConversation) => void;
  onDeleteConversation: (conversation: AiConversation) => void;
  onNewChat: () => void;
  onSettings: () => void;
}

export default function AgentSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
  onSettings
}: Props) {
  return (
    <aside className="ai2-sidebar">
      <button className="btn btn-primary ai2-new" onClick={onNewChat}><Plus size={14} /> 新建对话</button>
      <div className="ai2-side-section">
        <div className="ai2-side-title">最近</div>
        {conversations.slice(0, 30).map((conversation) => (
          <div key={conversation.id} className={`ai2-side-item ${conversation.id === activeConversationId ? 'is-active' : ''}`}>
            <button className="ai2-side-row" onClick={() => onSelectConversation(conversation)}>
              <History size={14} />
              <span className="ai2-side-main">
                <b>{conversation.title || '未命名对话'}</b>
                <small>{conversation.messageCount} 条消息 · {formatTime(conversation.updatedAt)}</small>
              </span>
            </button>
            <button className="icon-btn ai2-side-delete" title="删除会话" onClick={() => onDeleteConversation(conversation)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="ai2-settings" onClick={onSettings}><Settings size={15} /> 设置</button>
    </aside>
  );
}

function formatTime(value?: string): string {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
