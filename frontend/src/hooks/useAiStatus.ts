import { useQuery } from '@tanstack/react-query';
import { getLlmSettings } from '../api/client';

/** AI connection status: byBackendonlyReadAPI derive, notAddedanyBackendCode.  */
export type AiState = 'checking' | 'mock' | 'ready' | 'unset';

export function useLlmStatusQuery() {
  return useQuery({
    queryKey: ['llm/status'],
    queryFn: async () => {
      const response = await fetch('/api/settings/llm/status');
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
 * Three State + Checking: 
 *  - mock:  MOCK_LLM=true(Must explicitly mark)
 *  - ready: Configured Provider(baseUrl + model + apiKey complete)
 *  - unset: Not Configured(Click to Settings)
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
