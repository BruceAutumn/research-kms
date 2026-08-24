package com.kms.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Prevents the current local-first, single-tenant backend from being exposed as
 * a public SaaS by changing only a hostname. Remove this guard only after the
 * multi-tenant identity, authorization and storage checklist is implemented.
 */
@Component
public class DeploymentSafetyGuard implements ApplicationRunner {
    private final String deploymentMode;

    public DeploymentSafetyGuard(@Value("${app.deployment-mode:local}") String deploymentMode) {
        this.deploymentMode = deploymentMode == null ? "local" : deploymentMode.trim();
    }

    @Override
    public void run(ApplicationArguments args) {
        if ("public".equalsIgnoreCase(deploymentMode)) {
            throw new IllegalStateException(
                    "Public deployment is blocked: Research KMS is still single-tenant. " +
                    "Complete authentication, object-level authorization, tenant-scoped Vault/PDF storage, " +
                    "per-user LLM providers and account deletion/export before enabling public mode."
            );
        }
    }
}
