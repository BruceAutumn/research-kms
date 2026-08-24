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
      <button className="btn btn-primary ai2-new" onClick={onNewChat}><Plus size={14} /> New Chat</button>
      <div className="ai2-side-section">
        <div className="ai2-side-title">Recent</div>
        {conversations.slice(0, 30).map((conversation) => (
          <div key={conversation.id} className={`ai2-side-item ${conversation.id === activeConversationId ? 'is-active' : ''}`}>
            <button className="ai2-side-row" onClick={() => onSelectConversation(conversation)}>
              <History size={14} />
              <span className="ai2-side-main">
                <b>{conversation.title || 'Unnamed Chat'}</b>
                <small>{conversation.messageCount} messages . {formatTime(conversation.updatedAt)}</small>
              </span>
            </button>
            <button className="icon-btn ai2-side-delete" title="Delete Chat" onClick={() => onDeleteConversation(conversation)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="ai2-settings" onClick={onSettings}><Settings size={15} /> Settings</button>
    </aside>
  );
}

function formatTime(value?: string): string {
  if (!value) return 'just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
