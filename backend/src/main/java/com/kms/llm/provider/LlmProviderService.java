package com.kms.llm.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.kms.ai.ApiKeyCipher;
import com.kms.common.ApiException;
import com.kms.llm.dto.LlmProviderDto;
import com.kms.llm.dto.LlmProviderRequest;
import com.kms.llm.dto.LlmProviderTestResult;
import com.kms.llm.dto.RemoteModelDto;
import com.kms.llm.model.LlmModelRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class LlmProviderService {
    private final LlmProviderRepository providerRepository;
    private final LlmModelRepository modelRepository;
    private final ApiKeyCipher apiKeyCipher;
    private final RestClient.Builder restClientBuilder;

    public LlmProviderService(LlmProviderRepository providerRepository, LlmModelRepository modelRepository,
                              ApiKeyCipher apiKeyCipher, RestClient.Builder restClientBuilder) {
        this.providerRepository = providerRepository;
        this.modelRepository = modelRepository;
        this.apiKeyCipher = apiKeyCipher;
        this.restClientBuilder = restClientBuilder;
    }

    @Transactional(readOnly = true)
    public List<LlmProviderDto> list() {
        return providerRepository.findAllByOrderByNameAsc().stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public LlmProvider get(Long id) {
        return providerRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Provider not found."));
    }

    @Transactional
    public LlmProviderDto create(LlmProviderRequest request) {
        String name = nonBlank(request.getName(), "Provider");
        providerRepository.findByNameIgnoreCase(name).ifPresent(existing -> {
            throw new ApiException(HttpStatus.CONFLICT, "Provider name already exists.");
        });
        LlmProvider provider = new LlmProvider();
        provider.setName(name);
        provider.setKind(normalizeKind(request.getKind()));
        provider.setBaseUrl(normalizeBaseUrl(nonBlank(request.getBaseUrl(), defaultBaseUrl(provider.getKind()))));
        provider.setEnabled(request.getEnabled() == null || request.getEnabled());
        provider.setExtraHeaders(request.getExtraHeaders() == null ? Map.of() : request.getExtraHeaders());
        provider.setNotes(normalizeOptionalText(request.getNotes()));
        if (request.getApiKey() != null && !request.getApiKey().isBlank()) {
            provider.setApiKeyEncrypted(apiKeyCipher.encrypt(request.getApiKey()));
        }
        return toDto(providerRepository.save(provider));
    }

    @Transactional
    public LlmProviderDto update(Long id, LlmProviderRequest request) {
        LlmProvider provider = get(id);
        if (request.getName() != null && !request.getName().isBlank()) {
            String name = request.getName().trim();
            providerRepository.findByNameIgnoreCase(name).ifPresent(existing -> {
                if (!Objects.equals(existing.getId(), provider.getId())) {
                    throw new ApiException(HttpStatus.CONFLICT, "Provider name already exists.");
                }
            });
            provider.setName(name);
        }
        if (request.getKind() != null) provider.setKind(normalizeKind(request.getKind()));
        if (request.getBaseUrl() != null) provider.setBaseUrl(normalizeBaseUrl(nonBlank(request.getBaseUrl(), defaultBaseUrl(provider.getKind()))));
        if (request.getExtraHeaders() != null) provider.setExtraHeaders(request.getExtraHeaders());
        if (request.getNotes() != null) provider.setNotes(normalizeOptionalText(request.getNotes()));
        if (request.getEnabled() != null) provider.setEnabled(request.getEnabled());
        if (request.getApiKey() != null && !request.getApiKey().isBlank()) {
            provider.setApiKeyEncrypted(apiKeyCipher.encrypt(request.getApiKey()));
        }
        return toDto(providerRepository.save(provider));
    }

    @Transactional
    public void delete(Long id) {
        long refs = modelRepository.countByProviderId(id);
        if (refs > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "Provider is referenced by models.", Map.of("models", refs));
        }
        providerRepository.delete(get(id));
    }

    @Transactional(readOnly = true)
    public LlmProviderTestResult test(Long id) {
        LlmProvider provider = get(id);
        Instant started = Instant.now();
        if ("mock".equals(provider.getKind())) {
            return LlmProviderTestResult.ok(Duration.between(started, Instant.now()).toMillis(), 200, (int) modelRepository.countByProviderId(id));
        }
        if (!"openai_compatible".equals(provider.getKind())) {
            return LlmProviderTestResult.fail(Duration.between(started, Instant.now()).toMillis(), 501, "NOT_IMPLEMENTED: This protocol not supported yet. ");
        }
        try {
            RestClient.RequestHeadersSpec<?> spec = restClientBuilder.build()
                    .get()
                    .uri(stripTrailingSlash(provider.getBaseUrl()) + "/models")
                    .accept(MediaType.APPLICATION_JSON);
            String apiKey = decryptApiKey(provider);
            if (apiKey != null && !apiKey.isBlank()) {
                spec = spec.header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey);
            }
            var response = spec.retrieve().toEntity(JsonNode.class);
            return LlmProviderTestResult.ok(
                    Duration.between(started, Instant.now()).toMillis(),
                    response.getStatusCode().value(),
                    countRemoteModels(response.getBody())
            );
        } catch (RestClientResponseException ex) {
            return LlmProviderTestResult.fail(Duration.between(started, Instant.now()).toMillis(), ex.getStatusCode().value(), sanitizeAndTruncate(ex.getResponseBodyAsString()));
        } catch (Exception ex) {
            return LlmProviderTestResult.fail(Duration.between(started, Instant.now()).toMillis(), null, sanitizeAndTruncate(ex.getMessage()));
        }
    }

    @Transactional(readOnly = true)
    public List<RemoteModelDto> remoteModels(Long id) {
        LlmProvider provider = get(id);
        if (!"openai_compatible".equals(provider.getKind())) {
            throw new ApiException(HttpStatus.NOT_IMPLEMENTED, "Remote model discovery is not supported for this provider kind.");
        }
        try {
            RestClient.RequestHeadersSpec<?> spec = restClientBuilder.build()
                    .get()
                    .uri(stripTrailingSlash(provider.getBaseUrl()) + "/models")
                    .accept(MediaType.APPLICATION_JSON);
            String apiKey = decryptApiKey(provider);
            if (apiKey != null && !apiKey.isBlank()) spec = spec.header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey);
            JsonNode root = spec.retrieve().body(JsonNode.class);
            JsonNode data = root == null ? null : root.path("data");
            if (data == null || !data.isArray()) return List.of();
            return java.util.stream.StreamSupport.stream(data.spliterator(), false)
                    .map(node -> node.path("id").asText(""))
                    .filter(value -> !value.isBlank())
                    .map(value -> new RemoteModelDto(value, value))
                    .toList();
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.NOT_IMPLEMENTED, "Remote model discovery failed; add models manually.");
        }
    }

    public String decryptApiKey(LlmProvider provider) {
        return provider == null ? null : apiKeyCipher.decrypt(provider.getApiKeyEncrypted());
    }

    public LlmProviderDto toDto(LlmProvider provider) {
        String apiKey = decryptApiKey(provider);
        return new LlmProviderDto(provider.getId(), provider.getName(), provider.getKind(), provider.getBaseUrl(),
                maskApiKey(apiKey), apiKey != null && !apiKey.isBlank(), provider.getExtraHeaders(),
                provider.getNotes(), provider.isEnabled(), modelRepository.countByProviderId(provider.getId()),
                provider.getCreatedAt(), provider.getUpdatedAt());
    }

    public String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) return "";
        String tail = apiKey.length() <= 4 ? apiKey : apiKey.substring(apiKey.length() - 4);
        return "sk-********" + tail;
    }

    private String normalizeKind(String kind) {
        String value = kind == null || kind.isBlank() ? "openai_compatible" : kind.trim().toLowerCase();
        return switch (value) {
            case "anthropic", "ollama", "mock", "openai_compatible" -> value;
            default -> "openai_compatible";
        };
    }

    private String defaultBaseUrl(String kind) {
        return switch (kind) {
            case "anthropic" -> "https://api.anthropic.com/v1";
            case "ollama" -> "http://localhost:11434";
            case "mock" -> "mock://local";
            default -> "https://api.openai.com/v1";
        };
    }

    private String nonBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String stripTrailingSlash(String value) {
        return value == null ? "" : value.replaceAll("/+$", "");
    }

    private String normalizeBaseUrl(String value) {
        String normalized = stripTrailingSlash(value == null ? "" : value.trim());
        while (normalized.toLowerCase().endsWith("/chat/completions")) {
            normalized = normalized.substring(0, normalized.length() - "/chat/completions".length());
            normalized = stripTrailingSlash(normalized);
        }
        return normalized;
    }

    private String normalizeOptionalText(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private int countRemoteModels(JsonNode root) {
        JsonNode data = root == null ? null : root.path("data");
        return data != null && data.isArray() ? data.size() : 0;
    }

    private String sanitizeAndTruncate(String value) {
        if (value == null) return "";
        String sanitized = value.replaceAll("sk-[A-Za-z0-9_\\-]{8,}", "sk-[REDACTED]")
                .replaceAll("(?i)bearer\\s+[A-Za-z0-9._\\-]{12,}", "Bearer [REDACTED]");
        return sanitized.length() <= 200 ? sanitized : sanitized.substring(0, 200);
    }
}
