import { Settings } from 'lucide-react';
import type { LlmModel } from '../../types';

interface Props {
  models: LlmModel[];
  value?: number;
  onChange: (id?: number) => void;
  onManage: () => void;
}

export default function ModelPicker({ models, value, onChange, onManage }: Props) {
  return (
    <div className="ai2-model-picker">
      <select value={value ?? ''} onChange={(event) => onChange(Number(event.target.value) || undefined)} disabled={models.length === 0}>
        <option value="">{models.length === 0 ? '未配置模型' : '默认模型'}</option>
        {models.filter((model) => model.enabled).map((model) => (
          <option key={model.id} value={model.id}>{model.providerName} · {model.displayName || model.modelId}</option>
        ))}
      </select>
      <button className="icon-btn" title="管理模型" onClick={onManage}><Settings size={15} /></button>
    </div>
  );
}
