package com.kms.ai;

import com.kms.ai.dto.ModelConfigDto;
import com.kms.ai.dto.ModelConfigRequest;
import com.kms.ai.dto.SettingsDto;
import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class SettingsService {
    private final ModelConfigRepository modelRepository;
    private final ApiKeyCipher apiKeyCipher;

    public SettingsService(ModelConfigRepository modelRepository, ApiKeyCipher apiKeyCipher) {
        this.modelRepository = modelRepository;
        this.apiKeyCipher = apiKeyCipher;
    }

    @Transactional
    public ModelConfig getOrCreateDefaultModel() {
        return modelRepository.findFirstByUserIdAndDefaultModelTrue(CurrentUser.ID)
                .or(() -> modelRepository.findFirstByUserIdOrderByIdAsc(CurrentUser.ID))
                .orElseGet(() -> {
                    ModelConfig model = new ModelConfig();
                    model.setUserId(CurrentUser.ID);
                    model.setName("默认模型");
                    model.setProvider("OpenAI Compatible");
                    model.setBaseUrl("");
                    model.setModelName("unknown");
                    model.setTemperature(0.2);
                    model.setMaxTokens(4096);
                    model.setContextWindow(128000);
                    model.setDefaultModel(true);
                    return modelRepository.save(model);
                });
    }

    @Transactional(readOnly = true)
    public ModelConfig resolveModel(Long modelConfigId) {
        if (modelConfigId == null) {
            return getOrCreateDefaultModel();
        }
        return modelRepository.findByIdAndUserId(modelConfigId, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Model config not found."));
    }

    public String decryptApiKey(ModelConfig model) {
        if (model == null) return null;
        if (model.getApiKeyEnc() != null && !model.getApiKeyEnc().isBlank()) {
            return apiKeyCipher.decrypt(model.getApiKeyEnc());
        }
        // Startup migrator clears plaintext. This fallback supports rows created before the runner executes in tests.
        return model.getApiKey();
    }

    public SettingsDto getMasked() {
        ModelConfig model = getOrCreateDefaultModel();
        return new SettingsDto(
                model.getProvider(),
                model.getBaseUrl(),
                model.getModelName(),
                maskApiKey(decryptApiKey(model))
        );
    }

    @Transactional
    public SettingsDto update(SettingsDto request) {
        ModelConfig model = getOrCreateDefaultModel();
        if (request.provider() != null) model.setProvider(request.provider());
        if (request.baseUrl() != null) model.setBaseUrl(request.baseUrl());
        if (request.model() != null) model.setModelName(request.model());
        if (request.apiKey() != null && !request.apiKey().isBlank() && !request.apiKey().contains("****") && !request.apiKey().contains("••••")) {
            model.setApiKeyEnc(apiKeyCipher.encrypt(request.apiKey()));
            model.setApiKey(null);
        }
        modelRepository.save(model);
        return getMasked();
    }

    @Transactional(readOnly = true)
    public List<ModelConfigDto> listModels() {
        return modelRepository.findByUserIdOrderByDefaultModelDescUpdatedAtDescIdDesc(CurrentUser.ID).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public ModelConfigDto getModel(Long id) {
        return toDto(modelRepository.findByIdAndUserId(id, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Model config not found.")));
    }

    @Transactional
    public ModelConfigDto createModel(ModelConfigRequest request) {
        ModelConfig model = new ModelConfig();
        model.setUserId(CurrentUser.ID);
        applyRequest(model, request, true);
        boolean makeDefault = Boolean.TRUE.equals(request.getIsDefault())
                || modelRepository.findByUserIdOrderByDefaultModelDescUpdatedAtDescIdDesc(CurrentUser.ID).isEmpty();
        if (makeDefault) {
            modelRepository.clearDefault(CurrentUser.ID);
            model.setDefaultModel(true);
        }
        return toDto(modelRepository.save(model));
    }

    @Transactional
    public ModelConfigDto updateModel(Long id, ModelConfigRequest request) {
        ModelConfig model = modelRepository.findByIdAndUserId(id, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Model config not found."));
        applyRequest(model, request, false);
        if (Boolean.TRUE.equals(request.getIsDefault())) {
            modelRepository.clearDefault(CurrentUser.ID);
            model.setDefaultModel(true);
        }
        return toDto(modelRepository.save(model));
    }

    @Transactional
    public ModelConfigDto setDefault(Long id) {
        ModelConfig model = modelRepository.findByIdAndUserId(id, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Model config not found."));
        modelRepository.clearDefault(CurrentUser.ID);
        model.setDefaultModel(true);
        return toDto(modelRepository.save(model));
    }

    @Transactional
    public void deleteModel(Long id) {
        ModelConfig model = modelRepository.findByIdAndUserId(id, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Model config not found."));
        if (model.isDefaultModel()) {
            throw new ApiException(HttpStatus.CONFLICT, "默认 Model 不能删除，请先设置其他默认模型。");
        }
        modelRepository.delete(model);
    }

    private void applyRequest(ModelConfig model, ModelConfigRequest request, boolean creating) {
        if (request.getName() != null || creating) model.setName(nonBlank(request.getName(), "未命名模型"));
        if (request.getProvider() != null || creating) model.setProvider(nonBlank(request.getProvider(), "OpenAI Compatible"));
        if (request.getBaseUrl() != null) model.setBaseUrl(request.getBaseUrl().trim());
        if (request.getModelName() != null || creating) model.setModelName(nonBlank(request.getModelName(), "unknown"));
        if (request.getTemperature() != null) model.setTemperature(clamp(request.getTemperature(), 0.0, 2.0));
        if (request.getMaxTokens() != null) model.setMaxTokens(Math.max(1, request.getMaxTokens()));
        if (request.getContextWindow() != null) model.setContextWindow(Math.max(1024, request.getContextWindow()));
        if (request.getEmbeddingModel() != null) model.setEmbeddingModel(blankToNull(request.getEmbeddingModel()));
        if (request.getApiKey() != null && !request.getApiKey().isBlank()) {
            model.setApiKeyEnc(apiKeyCipher.encrypt(request.getApiKey()));
            model.setApiKey(null);
        }
    }

    public ModelConfigDto toDto(ModelConfig model) {
        String apiKey = decryptApiKey(model);
        return new ModelConfigDto(
                model.getId(),
                model.getName(),
                model.getProvider(),
                model.getBaseUrl(),
                maskApiKey(apiKey),
                apiKey != null && !apiKey.isBlank(),
                model.getModelName(),
                model.getTemperature(),
                model.getMaxTokens(),
                model.getContextWindow(),
                model.getEmbeddingModel(),
                model.isDefaultModel(),
                model.getCreatedAt(),
                model.getUpdatedAt()
        );
    }

    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) return "";
        String tail = apiKey.length() <= 4 ? apiKey : apiKey.substring(apiKey.length() - 4);
        return "sk-••••••••" + tail;
    }

    private String nonBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private Double clamp(Double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
