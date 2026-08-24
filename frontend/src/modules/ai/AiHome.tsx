import { MessageSquare, Sparkles } from 'lucide-react';
import type { AiConversation } from '../../types';

/**
 * 空对话时的首页。
 *
 * 原来这里只有一行「开始一段科研对话。」，整块区域是空的 ——
 * 参考 Claude Code 的做法，把最近会话和几个常用起手式放出来，
 * 让人一进来就知道能干什么、能接着上次干什么。
 */

const STARTERS = [
  '把这批文献按方法学分类，并指出彼此的分歧点',
  '这篇论文的实验条件有哪些？逐条列出并标页码',
  '对比注入的两篇文献，它们的结论冲突在哪里',
  '基于我的笔记，帮我列一个综述提纲'
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
        <h2 className="ai2-home-title">科研对话</h2>
        <p className="ai2-home-sub">
          从右侧「文献库 / 知识库」点选要喂进去的内容，或直接提问。
        </p>

        <div className="ai2-home-section">
          <span className="ai2-home-label"><Sparkles size={12} />常用起手式</span>
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
            <span className="ai2-home-label"><MessageSquare size={12} />最近对话</span>
            <ul className="ai2-home-recents">
              {recents.map((conversation) => (
                <li key={conversation.id}>
                  <button type="button" className="ai2-home-recent" onClick={() => onSelect(conversation)}>
                    <MessageSquare size={13} />
                    <span className="truncate">{conversation.title || '未命名对话'}</span>
                    <small>{conversation.messageCount ?? 0} 条</small>
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
