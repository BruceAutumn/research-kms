import { useRef, useState } from 'react';
import { Brain, ClipboardList, Globe, MessageSquare, Paperclip, Plus, Send, Square, Wrench, X } from 'lucide-react';
import ModelPicker from './ModelPicker';
import type { LlmModel, AiAttachment } from '../../types';
import { uploadAiAttachment } from '../../api/client';

type Effort = 'low' | 'medium' | 'high';

interface Props {
  mode: 'chat' | 'plan' | 'work';
  value: string;
  running: boolean;
  models: LlmModel[];
  modelId?: number;
  disabled?: boolean;
  thinking: boolean;
  webSearch: boolean;
  effort: Effort;
  attachments: AiAttachment[];
  onMode: (mode: 'chat' | 'plan' | 'work') => void;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onModel: (id?: number) => void;
  onManageModels: () => void;
  onAddContext: () => void;
  onThinkingChange: (v: boolean) => void;
  onWebSearchChange: (v: boolean) => void;
  onEffortChange: (e: Effort) => void;
  onAttachmentsChange: (a: AiAttachment[]) => void;
  onRemoveAttachment: (attachment: AiAttachment) => void;
}

export default function Composer({
  mode, value, running, models, modelId, disabled,
  thinking, webSearch, effort, attachments,
  onMode, onChange, onSend, onStop, onModel, onManageModels, onAddContext,
  onThinkingChange, onWebSearchChange, onEffortChange, onAttachmentsChange,
  onRemoveAttachment
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: AiAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const result = await uploadAiAttachment(files[i]);
        uploaded.push(result);
      }
      onAttachmentsChange([...attachments, ...uploaded]);
    } catch {
      // ignore
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="ai2-composer">
      {attachments.length > 0 && (
        <div className="ai2-attach-list">
          {attachments.map((att, i) => (
            <span key={i} className="ai2-attach-chip">
              <Paperclip size={11} />
              <span className="ai2-attach-name">{att.name}</span>
              <button type="button" className="ai2-attach-remove" disabled={running} onClick={() => onRemoveAttachment(att)}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!running) onSend();
          }
        }}
        placeholder={mode === 'chat' ? '问一个科研问题…' : mode === 'plan' ? '描述目标；AI 只分析和规划，不执行写入…' : '让 Agent 执行一个工作流…'}
      />
      <div className="ai2-composer-bar">
        <button className="icon-btn" title="添加上下文" onClick={onAddContext}><Plus size={16} /></button>
        <button className="icon-btn" title="上传文件" onClick={() => fileInputRef.current?.click()} disabled={uploading || running || mode === 'work'}>
          <Paperclip size={15} />
        </button>
        <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.markdown,.json,.csv,.pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleFileSelect} />
        <div className="ai2-segment">
          <button className={mode === 'chat' ? 'is-active' : ''} onClick={() => onMode('chat')}><MessageSquare size={14} />Chat</button>
          <button className={mode === 'plan' ? 'is-active' : ''} onClick={() => onMode('plan')}><ClipboardList size={14} />Plan</button>
          <button className={mode === 'work' ? 'is-active' : ''} onClick={() => onMode('work')}><Wrench size={14} />Agent</button>
        </div>
        <button
          className={`icon-btn ${thinking ? 'is-active' : ''}`}
          title="深度思考"
          onClick={() => onThinkingChange(!thinking)}
        >
          <Brain size={15} />
        </button>
        <button
          className={`icon-btn ${webSearch ? 'is-active' : ''}`}
          title="联网搜索"
          onClick={() => onWebSearchChange(!webSearch)}
        >
          <Globe size={15} />
        </button>
        <button
          className="icon-btn ai2-effort-btn"
          title="推理力度"
          onClick={() => setShowSettings((v) => !v)}
        >
          <span className="ai2-effort-label">{effort === 'low' ? 'Low' : effort === 'high' ? 'High' : 'Med'}</span>
        </button>
        {showSettings && (
          <div className="ai2-effort-popover">
            <div className="ai2-effort-popover-title">推理力度</div>
            <div className="ai2-effort-options">
              {(['low', 'medium', 'high'] as Effort[]).map((e) => (
                <button
                  key={e}
                  className={`ai2-effort-option ${effort === e ? 'is-active' : ''}`}
                  onClick={() => { onEffortChange(e); setShowSettings(false); }}
                >
                  {e === 'low' ? 'Low' : e === 'medium' ? 'Medium' : 'High'}
                </button>
              ))}
            </div>
          </div>
        )}
        <ModelPicker models={models} value={modelId} onChange={onModel} onManage={onManageModels} />
        <button className="btn btn-primary ai2-send" disabled={disabled || !value.trim()} onClick={running ? onStop : onSend}>
          {running ? <Square size={14} /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
