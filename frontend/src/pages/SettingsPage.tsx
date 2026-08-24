import { FormEvent, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Pencil, Plus, Save, Star, Trash2, X } from 'lucide-react';
import {
  createLlmModel,
  createLlmProvider,
  deleteLlmModel,
  deleteLlmProvider,
  getErrorMessage,
  listLlmModels,
  listLlmProviders,
  listRemoteLlmModels,
  setDefaultLlmModel,
  updateLlmModel,
  testLlmProvider,
  updateLlmProvider
} from '../api/client';
import StatusMessage from '../components/StatusMessage';
import type { LlmProvider } from '../types';

const PROVIDER_PRESETS = [
  { label: 'DeepSeek', kind: 'openai_compatible', baseUrl: 'https://api.deepseek.com' },
  { label: 'OpenAI', kind: 'openai_compatible', baseUrl: 'https://api.openai.com/v1' },
  { label: 'Anthropic（暂未支持）', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', disabled: true },
  { label: 'OpenRouter', kind: 'openai_compatible', baseUrl: 'https://openrouter.ai/api/v1' },
  { label: 'SiliconFlow', kind: 'openai_compatible', baseUrl: 'https://api.siliconflow.cn/v1' },
  { label: 'Kimi', kind: 'openai_compatible', baseUrl: '' },
  { label: 'Zhipu', kind: 'openai_compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { label: 'Ollama（暂未支持）', kind: 'ollama', baseUrl: 'http://localhost:11434', disabled: true },
  { label: 'LM Studio', kind: 'openai_compatible', baseUrl: 'http://localhost:1234/v1' },
  { label: 'Custom', kind: 'openai_compatible', baseUrl: '' }
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const providersQuery = useQuery({ queryKey: ['llm-providers'], queryFn: listLlmProviders });
  const modelsQuery = useQuery({ queryKey: ['llm-models'], queryFn: listLlmModels });
  const providers = providersQuery.data || [];
  const models = modelsQuery.data || [];
  const [presetIndex, setPresetIndex] = useState(0);
  const preset = PROVIDER_PRESETS[presetIndex];
  const [providerName, setProviderName] = useState(preset.label);
  const [kind, setKind] = useState(preset.kind);
  const [baseUrl, setBaseUrl] = useState(preset.baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [notes, setNotes] = useState('');
  const [editingProviderId, setEditingProviderId] = useState<number | null>(null);
  const [modelProviderId, setModelProviderId] = useState<number>();
  const [modelId, setModelId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [contextWindow, setContextWindow] = useState(128000);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  const groupedModels = useMemo(() => providers.map((provider) => ({
    provider,
    models: models.filter((model) => model.providerId === provider.id)
  })), [providers, models]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] }),
      queryClient.invalidateQueries({ queryKey: ['llm-models'] })
    ]);
  }

  function choosePreset(index: number) {
    const next = PROVIDER_PRESETS[index];
    if (next.disabled) return;
    setPresetIndex(index);
    setProviderName(next.label);
    setKind(next.kind);
    setBaseUrl(next.baseUrl);
  }

  function startEdit(provider: LlmProvider) {
    setEditingProviderId(provider.id);
    setProviderName(provider.name);
    setKind(provider.kind);
    setBaseUrl(provider.baseUrl);
    setApiKey('');
    setNotes(provider.notes || '');
    setError('');
    setInfo(`正在编辑 Provider：${provider.name}`);
  }

  function resetProviderForm() {
    const next = PROVIDER_PRESETS[0];
    setEditingProviderId(null);
    setPresetIndex(0);
    setProviderName(next.label);
    setKind(next.kind);
    setBaseUrl(next.baseUrl);
    setApiKey('');
    setNotes('');
  }

  async function saveProvider(event: FormEvent) {
    event.preventDefault();
    setError('');
    setInfo('');
    if (kind === 'anthropic' || kind === 'ollama') {
      setError('该协议暂未支持。');
      return;
    }
    const normalized = normalizeBaseUrl(baseUrl);
    const normalizedMessage = normalized !== baseUrl.trim() ? `Base URL 已规范化为：${normalized}` : '';
    setBaseUrl(normalized);
    try {
      const payload = { name: providerName, kind, baseUrl: normalized, apiKey: apiKey.trim() || undefined, notes };
      const provider = editingProviderId
        ? await updateLlmProvider(editingProviderId, payload)
        : await createLlmProvider(payload);
      setApiKey('');
      setModelProviderId(provider.id);
      setEditingProviderId(null);
      setInfo(`${normalizedMessage ? `${normalizedMessage}；` : ''}已保存 Provider：${provider.name}`);
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function runProviderTest(provider: LlmProvider) {
    setError('');
    setInfo('');
    const result = await testLlmProvider(provider.id);
    if (result.ok) {
      setInfo(`测试成功：HTTP ${result.upstreamStatus ?? '未知'} · ${result.latencyMs ?? 0}ms · 拉到 ${result.modelCount ?? 0} 个模型`);
    } else {
      setError(`测试失败：HTTP ${result.upstreamStatus ?? '无状态'} · ${result.error || '无响应体'}`);
    }
  }

  async function addModel(event: FormEvent) {
    event.preventDefault();
    if (!modelProviderId) return;
    setError('');
    setInfo('');
    try {
      await createLlmModel({
        providerId: modelProviderId,
        modelId,
        displayName: displayName || modelId,
        contextWindow,
        supportsTools: true,
        supportsStream: true,
        isDefault: models.length === 0
      });
      setModelId('');
      setDisplayName('');
      setInfo('已添加模型。');
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function fetchRemote(providerId: number) {
    setError('');
    setInfo('');
    try {
      const remote = await listRemoteLlmModels(providerId);
      setInfo(remote.length ? `拉取到 ${remote.length} 个模型，选择后可手动添加。` : '上游未返回模型列表。');
      if (remote[0]) {
        setModelProviderId(providerId);
        setModelId(remote[0].modelId);
        setDisplayName(remote[0].displayName);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="settings-models-page">
      <div className="settings-head"><h1>模型设置</h1><p>Providers 与 Models 是 AI Studio 的唯一模型来源。</p></div>
      <StatusMessage error={error} info={info} />
      <section className="settings-band">
        <h2>Providers</h2>
        <div className="settings-provider-grid">
          {providers.map((provider) => (
            <article
              className={`settings-provider-card ${editingProviderId === provider.id ? 'is-editing' : ''}`}
              key={provider.id}
              role="button"
              tabIndex={0}
              onClick={() => startEdit(provider)}
              onKeyDown={(event) => { if (event.key === 'Enter') startEdit(provider); }}
            >
              <div><b>{provider.name}</b><span>{labelKind(provider.kind)}</span></div>
              <p>{provider.baseUrl}</p>
              <small>{provider.keyMasked || '未配置 Key'} · {provider.modelCount} models{provider.notes ? ` · ${provider.notes}` : ''}</small>
              <div className="settings-card-actions">
                <button className="btn" onClick={(event) => { event.stopPropagation(); startEdit(provider); }}><Pencil size={14} />编辑</button>
                <button className="btn" onClick={(event) => { event.stopPropagation(); void runProviderTest(provider); }}><Check size={14} />测试</button>
                <button className="btn" disabled={provider.kind !== 'openai_compatible'} onClick={(event) => { event.stopPropagation(); void fetchRemote(provider.id); }}><Download size={14} />从上游拉取</button>
                <button className="btn btn-danger" onClick={async (event) => { event.stopPropagation(); await deleteLlmProvider(provider.id); await refresh(); }}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
        </div>
        <form className="settings-form settings-provider-form" onSubmit={saveProvider}>
          <label className="settings-field">
            <span>预设</span>
            <select value={presetIndex} onChange={(event) => choosePreset(Number(event.target.value))}>{PROVIDER_PRESETS.map((item, index) => <option key={item.label} value={index} disabled={item.disabled}>{item.label}</option>)}</select>
          </label>
          <label className="settings-field">
            <span>名称</span>
            <input value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="Provider name" />
          </label>
          <label className="settings-field">
            <span>协议类型</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="openai_compatible">openai_compatible</option>
              <option value="anthropic" disabled>anthropic（暂未支持）</option>
              <option value="ollama" disabled>ollama（暂未支持）</option>
              <option value="mock">mock</option>
            </select>
            <small>协议类型：openai_compatible = 走 `/chat/completions`；`anthropic` = 走 `/v1/messages`</small>
          </label>
          <label className="settings-field">
            <span>Base URL</span>
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="Base URL" />
            <small>Base URL：填到域名或版本段为止，不要带 `/chat/completions`，不要以斜杠结尾。例：`https://api.deepseek.com` 或 `https://api.openai.com/v1`</small>
          </label>
          <label className="settings-field">
            <span>API Key</span>
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={editingProviderId ? '留空 = 不修改' : 'API Key，留空可稍后填写'} />
            <small>API Key：只在本机加密存储，不上传</small>
          </label>
          <label className="settings-field">
            <span>备注</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="公司账号" />
            <small>备注：给自己看的，比如「公司账号」</small>
          </label>
          <div className="settings-form-actions">
            <button className="btn btn-primary" disabled={!providerName.trim() || !baseUrl.trim() || kind === 'anthropic' || kind === 'ollama'}>
              {editingProviderId ? <Save size={14} /> : <Plus size={14} />}{editingProviderId ? '保存 Provider' : '添加 Provider'}
            </button>
            {editingProviderId && <button type="button" className="btn" onClick={resetProviderForm}><X size={14} />取消编辑</button>}
          </div>
        </form>
      </section>
      <section className="settings-band">
        <h2>Models</h2>
        {groupedModels.map(({ provider, models }) => (
          <div className="settings-model-group" key={provider.id}>
            <h3>{provider.name}</h3>
            {models.map((model) => (
              <div className="settings-model-row" key={model.id}>
                <span><b>{model.displayName}</b><small>{model.modelId} · ctx {model.contextWindow || 'unknown'} · {model.supportsTools ? 'tools' : 'no tools'} · {model.supportsStream ? 'stream' : 'sync'}</small></span>
                {/* capability 决定 EmbeddingService 会选中哪个模型。此前没有这个入口，
                    EmbeddingService 只能抓默认聊天模型（DeepSeek），而它没有 /embeddings 端点 —— 这是回填 404 的直接原因。 */}
                <select
                  className="settings-capability-select"
                  title="模型用途：chat 用于对话，embedding 用于向量检索"
                  value={model.capability ?? 'chat'}
                  onChange={(event) => updateLlmModel(model.id, { capability: event.target.value as 'chat' | 'embedding' }).then(refresh)}
                >
                  <option value="chat">chat</option>
                  <option value="embedding">embedding</option>
                </select>
                <button className="icon-btn" title="设为默认" onClick={() => setDefaultLlmModel(model.id).then(refresh)}><Star size={15} className={model.isDefault ? 'is-on' : ''} /></button>
                <button className="icon-btn" title="删除" onClick={() => deleteLlmModel(model.id).then(refresh)}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        ))}
        <form className="settings-form" onSubmit={addModel}>
          <select value={modelProviderId ?? ''} onChange={(event) => setModelProviderId(Number(event.target.value) || undefined)}><option value="">选择 Provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select>
          <input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="model id" />
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="display name" />
          <input type="number" value={contextWindow} onChange={(event) => setContextWindow(Number(event.target.value) || 128000)} />
          <button className="btn btn-primary" disabled={!modelProviderId || !modelId.trim()}><Plus size={14} />手动添加</button>
        </form>
      </section>
    </div>
  );
}

function normalizeBaseUrl(value: string): string {
  let normalized = value.trim().replace(/\/+$/, '');
  while (/\/chat\/completions$/i.test(normalized)) {
    normalized = normalized.replace(/\/chat\/completions$/i, '').replace(/\/+$/, '');
  }
  return normalized;
}

function labelKind(kind: string): string {
  if (kind === 'anthropic' || kind === 'ollama') return `${kind} · 暂未支持`;
  return kind;
}
