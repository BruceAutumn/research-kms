import { useQuery } from '@tanstack/react-query';
import { apiUrl, getLlmSettings } from '../api/client';

/** AI 连接状态：由后端只读接口推导，不新增任何后端代码。 */
export type AiState = 'checking' | 'mock' | 'ready' | 'unset';

export function useLlmStatusQuery() {
  return useQuery({
    queryKey: ['llm/status'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/settings/llm/status'));
      if (!response.ok) {
        throw new Error(`LLM status failed: ${response.status}`);
      }
      return (await response.json()) as { mock: boolean };
    },
    staleTime: 15_000,
    retry: 1
  });
}

export function useLlmSettingsQuery() {
  return useQuery({
    queryKey: ['llm/settings'],
    queryFn: getLlmSettings,
    staleTime: 15_000,
    retry: 1
  });
}

/**
 * 三态 + 检查中：
 *  - mock:  MOCK_LLM=true（必须显式标注）
 *  - ready: 已配置 Provider（baseUrl + model + apiKey 齐全）
 *  - unset: 未配置（点击跳设置）
 */
export function useAiStatus(): AiState {
  const status = useLlmStatusQuery();
  const settings = useLlmSettingsQuery();

  if (status.isLoading || status.data === undefined) {
    return 'checking';
  }
  if (status.data.mock) {
    return 'mock';
  }
  if (settings.isLoading || settings.data === undefined) {
    return 'checking';
  }
  const s = settings.data;
  if (s.baseUrl && s.model && s.apiKey) {
    return 'ready';
  }
  return 'unset';
}
