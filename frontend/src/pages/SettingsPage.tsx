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
  { label: 'OpenAI', kind: 'openai_compatible', baseUrl: 'https://api.openai.com/v1' },
  { label: 'Anthropic(Not supported yet)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', disabled: true },
  { label: 'OpenRouter', kind: 'openai_compatible', baseUrl: 'https://openrouter.ai/api/v1' },
  { label: 'SiliconFlow', kind: 'openai_compatible', baseUrl: 'https://api.siliconflow.cn/v1' },
  { label: 'Kimi', kind: 'openai_compatible', baseUrl: '' },
  { label: 'Zhipu', kind: 'openai_compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { label: 'Ollama(Not supported yet)', kind: 'ollama', baseUrl: 'http://localhost:11434', disabled: true },
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
    setInfo(`Editing Provider: ${provider.name}`);
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
      setError('This protocol is not supported yet. ');
      return;
    }
    const normalized = normalizeBaseUrl(baseUrl);
    const normalizedMessage = normalized !== baseUrl.trim() ? `Base URL alreadyStandardturn into: ${normalized}` : '';
    setBaseUrl(normalized);
    try {
      const payload = { name: providerName, kind, baseUrl: normalized, apiKey: apiKey.trim() || undefined, notes };
      const provider = editingProviderId
        ? await updateLlmProvider(editingProviderId, payload)
        : await createLlmProvider(payload);
      setApiKey('');
      setModelProviderId(provider.id);
      setEditingProviderId(null);
      setInfo(`${normalizedMessage ? `${normalizedMessage}; ` : ''}Saved Provider: ${provider.name}`);
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
      setInfo(`testSuccess: HTTP ${result.upstreamStatus ?? 'Unknown'} . ${result.latencyMs ?? 0}ms . pull to ${result.modelCount ?? 0} models`);
    } else {
      setError(`testFailed: HTTP ${result.upstreamStatus ?? 'Stateless'} . ${result.error || 'No Response Body'}`);
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
      setInfo('Added Models. ');
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
      setInfo(remote.length ? `pulled ${remote.length} models, Manual add after select. ` : 'Upstream returned no model list. ');
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
      <div className="settings-head"><h1>Model Settings</h1><p>Providers and Models is AI Studio uniqueOneModelSource. </p></div>
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
              <small>{provider.keyMasked || 'Not Configured Key'} . {provider.modelCount} models{provider.notes ? ` . ${provider.notes}` : ''}</small>
              <div className="settings-card-actions">
                <button className="btn" onClick={(event) => { event.stopPropagation(); startEdit(provider); }}><Pencil size={14} />Edit</button>
                <button className="btn" onClick={(event) => { event.stopPropagation(); void runProviderTest(provider); }}><Check size={14} />test</button>
                <button className="btn" disabled={provider.kind !== 'openai_compatible'} onClick={(event) => { event.stopPropagation(); void fetchRemote(provider.id); }}><Download size={14} />pull from upstream</button>
                <button className="btn btn-danger" onClick={async (event) => { event.stopPropagation(); await deleteLlmProvider(provider.id); await refresh(); }}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
        </div>
        <form className="settings-form settings-provider-form" onSubmit={saveProvider}>
          <label className="settings-field">
            <span>Preset</span>
            <select value={presetIndex} onChange={(event) => choosePreset(Number(event.target.value))}>{PROVIDER_PRESETS.map((item, index) => <option key={item.label} value={index} disabled={item.disabled}>{item.label}</option>)}</select>
          </label>
          <label className="settings-field">
            <span>Name</span>
            <input value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="Provider name" />
          </label>
          <label className="settings-field">
            <span>Protocol Type</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="openai_compatible">openai_compatible</option>
              <option value="anthropic" disabled>anthropic(Not supported yet)</option>
              <option value="ollama" disabled>ollama(Not supported yet)</option>
              <option value="mock">mock</option>
            </select>
            <small>Protocol Type: openai_compatible = go `/chat/completions`; `anthropic` = go `/v1/messages`</small>
          </label>
          <label className="settings-field">
            <span>Base URL</span>
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="Base URL" />
            <small>Base URL: fill toDomainor versionSegmentuntil, Do not include `/chat/completions`, Do not end with slash. Example: `https://api.deepseek.com` or `https://api.openai.com/v1`</small>
          </label>
          <label className="settings-field">
            <span>API Key</span>
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={editingProviderId ? 'keepEmpty = notModify' : 'API Key, keepEmptyCanfill later'} />
            <small>API Key: Encrypted on local machine only, notUpload</small>
          </label>
          <label className="settings-field">
            <span>remark</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="company account" />
            <small>remark: for self, thanLike"company account"</small>
          </label>
          <div className="settings-form-actions">
            <button className="btn btn-primary" disabled={!providerName.trim() || !baseUrl.trim() || kind === 'anthropic' || kind === 'ollama'}>
              {editingProviderId ? <Save size={14} /> : <Plus size={14} />}{editingProviderId ? 'Save Provider' : 'Add Provider'}
            </button>
            {editingProviderId && <button type="button" className="btn" onClick={resetProviderForm}><X size={14} />Cancel Edit</button>}
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
                <span><b>{model.displayName}</b><small>{model.modelId} . ctx {model.contextWindow || 'unknown'} . {model.supportsTools ? 'tools' : 'no tools'} . {model.supportsStream ? 'stream' : 'sync'}</small></span>
                {/* capability decide EmbeddingService Which model will be selected. before no such entry, 
                    EmbeddingService Can only grab default chat model(DeepSeek), But it does not /embeddings Endpoint -- this is backfill 404 directOriginalbecause.  */}
                <select
                  className="settings-capability-select"
                  title="Model Purpose: chat used forChat, embedding used forVector Search"
                  value={model.capability ?? 'chat'}
                  onChange={(event) => updateLlmModel(model.id, { capability: event.target.value as 'chat' | 'embedding' }).then(refresh)}
                >
                  <option value="chat">chat</option>
                  <option value="embedding">embedding</option>
                </select>
                <button className="icon-btn" title="Set as Default" onClick={() => setDefaultLlmModel(model.id).then(refresh)}><Star size={15} className={model.isDefault ? 'is-on' : ''} /></button>
                <button className="icon-btn" title="Delete" onClick={() => deleteLlmModel(model.id).then(refresh)}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        ))}
        <form className="settings-form" onSubmit={addModel}>
          <select value={modelProviderId ?? ''} onChange={(event) => setModelProviderId(Number(event.target.value) || undefined)}><option value="">Select Provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select>
          <input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="model id" />
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="display name" />
          <input type="number" value={contextWindow} onChange={(event) => setContextWindow(Number(event.target.value) || 128000)} />
          <button className="btn btn-primary" disabled={!modelProviderId || !modelId.trim()}><Plus size={14} />Manual Add</button>
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
  if (kind === 'anthropic' || kind === 'ollama') return `${kind} . Not supported yet`;
  return kind;
}
