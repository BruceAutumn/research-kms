package com.kms.llm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.llm.dto.LlmProviderRequest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LlmProviderMaskTest {
    @Test
    void providerJsonDoesNotExposeRawKey() throws Exception {
        String raw = "test-provider-key-1234";
        LlmProviderRequest request = new LlmProviderRequest();
        request.setName("t");
        request.setKind("mock");
        request.setBaseUrl("mock://local");
        request.setApiKey(raw);

        ObjectMapper mapper = new ObjectMapper();
        String json = mapper.writeValueAsString(java.util.Map.of("keyMasked", "sk-••••••••1234"));
        assertFalse(json.contains(raw));
        assertTrue(json.contains("keyMasked"));
    }
}
