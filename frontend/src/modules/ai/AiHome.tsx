import { MessageSquare, Sparkles } from 'lucide-react';
import type { AiConversation } from '../../types';

/**
 * Home on empty chat. 
 *
 * Originally only one line here"Start a research chat. ", Whole area is empty --
 * reference Claude Code approach,  RecentSessionandexpose common starters, 
 * Let people know what they can do on entry, Continue from last time. 
 */

const STARTERS = [
  'put thisBatchPaperBymethodology classify, and point out disagreements',
  'What are the experimental conditions? List per item with page numbers',
  'Compare two injected papers, theirConclusionConflictwherein',
  'based on myNote, help meColumnOnea review outline'
];

interface Props {
  conversations: AiConversation[];
  onSelect: (conversation: AiConversation) => void;
  onPrompt: (text: string) => void;
}

export default function AiHome({ conversations, onSelect, onPrompt }: Props) {
  const recents = conversations.slice(0, 6);
  return (
    <div className="ai2-home">
      <div className="ai2-home-inner">
        <h2 className="ai2-home-title">Research Chat</h2>
        <p className="ai2-home-sub">
          fromRight"Library / Vault"Pick content to feed, Or ask directly. 
        </p>

        <div className="ai2-home-section">
          <span className="ai2-home-label"><Sparkles size={12} />common starters</span>
          <div className="ai2-home-starters">
            {STARTERS.map((text) => (
              <button key={text} type="button" className="ai2-home-starter" onClick={() => onPrompt(text)}>
                {text}
              </button>
            ))}
          </div>
        </div>

        {recents.length > 0 && (
          <div className="ai2-home-section">
            <span className="ai2-home-label"><MessageSquare size={12} />Recent Chats</span>
            <ul className="ai2-home-recents">
              {recents.map((conversation) => (
                <li key={conversation.id}>
                  <button type="button" className="ai2-home-recent" onClick={() => onSelect(conversation)}>
                    <MessageSquare size={13} />
                    <span className="truncate">{conversation.title || 'Unnamed Chat'}</span>
                    <small>{conversation.messageCount ?? 0}  </small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
