package com.kms.llm.model;

import com.kms.ai.dto.ModelConfigDto;
import com.kms.ai.dto.ModelConfigRequest;
import com.kms.common.ApiException;
import com.kms.llm.dto.LlmModelDto;
import com.kms.llm.dto.LlmModelRequest;
import com.kms.llm.provider.LlmProvider;
import com.kms.llm.provider.LlmProviderRepository;
import com.kms.llm.provider.LlmProviderService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class LlmModelService {
    private final LlmModelRepository modelRepository;
    private final LlmProviderRepository providerRepository;
    private final LlmProviderService providerService;

    public LlmModelService(LlmModelRepository modelRepository, LlmProviderRepository providerRepository,
                           LlmProviderService providerService) {
        this.modelRepository = modelRepository;
        this.providerRepository = providerRepository;
        this.providerService = providerService;
    }

    @Transactional(readOnly = true)
    public List<LlmModelDto> list() {
        return modelRepository.findAllWithProvider().stream().map(this::toDto).toList();
    }

    public static final String CAPABILITY_CHAT = "chat";
    public static final String CAPABILITY_EMBEDDING = "embedding";

    @Transactional(readOnly = true)
    public LlmModel resolve(Long id) {
        if (id == null) {
            // fallbackMustlimit to capability=chat, else will put embedding Model grabbed as chat model. 
            return modelRepository.findFirstByDefaultModelTrueAndEnabledTrue()
                    .or(() -> modelRepository.findFirstByCapabilityAndEnabledTrueOrderByIdAsc(CAPABILITY_CHAT))
                    .orElseThrow(() -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "No enabled LLM model configured."));
        }
        return modelRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "LLM model not found."));
    }

    /**
     * parse embedding Model. no such entry before -- EmbeddingService Call resolve(null) got
     * Default Chat Model(DeepSeek), And DeepSeek no /embeddings Endpoint, this is backfill 404 directOriginalbecause. 
     */
    @Transactional(readOnly = true)
    public LlmModel resolveEmbedding(Long id) {
        if (id != null) {
            LlmModel model = resolve(id);
            if (!CAPABILITY_EMBEDDING.equalsIgnoreCase(model.getCapability())) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "Model " + model.getDisplayName() + "   capability is " + model.getCapability() + ", cannot be used for embedding. ");
            }
            return model;
        }
        return modelRepository.findFirstByCapabilityAndEnabledTrueOrderByIdAsc(CAPABILITY_EMBEDDING)
                .orElseThrow(() -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                        "noEnabled  embedding Model. Please at /settings/models put somemodelsmark as capability=embedding(Built-in by default on host Ollama bge-m3). "));
    }

    @Transactional(readOnly = true)
    public List<LlmModel> listEmbeddingModels() {
        return modelRepository.findByCapabilityAndEnabledTrueOrderByIdAsc(CAPABILITY_EMBEDDING);
    }

    @Transactional(readOnly = true)
    public Long resolveId(Long id) {
        return resolve(id).getId();
    }

    @Transactional(readOnly = true)
    public Long resolveIdForLegacyModelConfig(Long legacyModelConfigId) {
        if (legacyModelConfigId == null) return resolveId(null);
        return modelRepository.findByLegacyModelConfigId(legacyModelConfigId)
                .map(LlmModel::getId)
                .orElseGet(() -> resolveId(null));
    }

    @Transactional(readOnly = true)
    public Long resolveCompatibleId(Long id) {
        if (id == null) return resolveId(null);
        if (modelRepository.existsById(id)) return id;
        return resolveIdForLegacyModelConfig(id);
    }

    @Transactional
    public LlmModelDto create(LlmModelRequest request) {
        LlmProvider provider = providerRepository.findById(request.getProviderId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Provider not found."));
        LlmModel model = new LlmModel();
        model.setProviderId(provider.getId());
        apply(model, request, true);
        if (Boolean.TRUE.equals(request.getIsDefault()) || modelRepository.findAll().isEmpty()) {
            modelRepository.clearDefault();
            model.setDefaultModel(true);
        }
        return toDto(modelRepository.save(model));
    }

    @Transactional
    public LlmModelDto update(Long id, LlmModelRequest request) {
        LlmModel model = resolve(id);
        apply(model, request, false);
        if (Boolean.TRUE.equals(request.getIsDefault())) {
            modelRepository.clearDefault();
            model.setDefaultModel(true);
        }
        return toDto(modelRepository.save(model));
    }

    @Transactional
    public void delete(Long id) {
        LlmModel model = resolve(id);
        if (model.isDefaultModel()) {
            throw new ApiException(HttpStatus.CONFLICT, "Default model cannot be deleted.");
        }
        modelRepository.delete(model);
    }

    @Transactional
    public LlmModelDto setDefault(Long id) {
        LlmModel model = resolve(id);
        modelRepository.clearDefault();
        model.setDefaultModel(true);
        model.setEnabled(true);
        return toDto(modelRepository.save(model));
    }

    @Transactional
    public ModelConfigDto createLegacy(ModelConfigRequest request) {
        LlmProvider provider = providerRepository.findByNameIgnoreCase(nonBlank(request.getProvider(), "OpenAI Compatible"))
                .orElseGet(() -> {
                    com.kms.llm.dto.LlmProviderRequest providerRequest = new com.kms.llm.dto.LlmProviderRequest();
                    providerRequest.setName(nonBlank(request.getProvider(), "OpenAI Compatible"));
                    providerRequest.setKind("openai_compatible");
                    providerRequest.setBaseUrl(request.getBaseUrl());
                    providerRequest.setApiKey(request.getApiKey());
                    Long id = providerService.create(providerRequest).id();
                    return providerRepository.findById(id).orElseThrow();
                });
        LlmModelRequest modelRequest = new LlmModelRequest();
        modelRequest.setProviderId(provider.getId());
        modelRequest.setModelId(nonBlank(request.getModelName(), "unknown"));
        modelRequest.setDisplayName(nonBlank(request.getName(), request.getModelName()));
        modelRequest.setContextWindow(request.getContextWindow());
        modelRequest.setSupportsStream(true);
        modelRequest.setSupportsTools(true);
        modelRequest.setIsDefault(request.getIsDefault());
        return toLegacyDto(create(modelRequest));
    }

    @Transactional(readOnly = true)
    public ModelConfigDto getLegacyDefault() {
        return toLegacyDto(toDto(resolve(null)));
    }

    private void apply(LlmModel model, LlmModelRequest request, boolean creating) {
        if (request.getProviderId() != null) {
            providerRepository.findById(request.getProviderId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Provider not found."));
            model.setProviderId(request.getProviderId());
        }
        if (request.getModelId() != null || creating) model.setModelId(nonBlank(request.getModelId(), "unknown"));
        if (request.getDisplayName() != null || creating) model.setDisplayName(nonBlank(request.getDisplayName(), model.getModelId()));
        if (request.getContextWindow() != null) model.setContextWindow(Math.max(1024, request.getContextWindow()));
        if (request.getSupportsTools() != null) model.setSupportsTools(request.getSupportsTools());
        if (request.getSupportsStream() != null) model.setSupportsStream(request.getSupportsStream());
        if (request.getEnabled() != null) model.setEnabled(request.getEnabled());
        if (request.getCapability() != null) {
            String capability = request.getCapability().trim().toLowerCase();
            if (!CAPABILITY_CHAT.equals(capability) && !CAPABILITY_EMBEDDING.equals(capability)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "capability only chat or embedding, received: " + request.getCapability());
            }
            model.setCapability(capability);
        }
    }

    public LlmModelDto toDto(LlmModel model) {
        LlmProvider provider = model.getProvider() == null
                ? providerRepository.findById(model.getProviderId()).orElse(null)
                : model.getProvider();
        return new LlmModelDto(model.getId(), model.getProviderId(),
                provider == null ? "" : provider.getName(),
                provider == null ? "" : provider.getKind(),
                model.getModelId(), model.getDisplayName(), model.getContextWindow(),
                model.isSupportsTools(), model.isSupportsStream(), model.isDefaultModel(), model.isEnabled(),
                model.getCapability(), model.getCreatedAt());
    }

    public ModelConfigDto toLegacyDto(LlmModelDto model) {
        return new ModelConfigDto(model.id(), model.displayName(), model.providerName(), "", "",
                true, model.modelId(), 0.2, 4096, model.contextWindow(), null,
                model.isDefault(), model.createdAt(), null);
    }

    private String nonBlank(String value, String fallback) {
        return value == null || value.isBlank() ? (fallback == null || fallback.isBlank() ? "unknown" : fallback.trim()) : value.trim();
    }
}
