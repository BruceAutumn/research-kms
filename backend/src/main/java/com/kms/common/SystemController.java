package com.kms.common;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system")
public class SystemController {
    private final String version;
    private final boolean mockLlm;
    private final Flyway flyway;

    public SystemController(@Value("${kms.version:0.0.1-SNAPSHOT}") String version,
                            @Value("${app.llm.mock:false}") boolean mockLlm,
                            Flyway flyway) {
        this.version = version;
        this.mockLlm = mockLlm;
        this.flyway = flyway;
    }

    @GetMapping("/about")
    public SystemAboutDto about() {
        MigrationInfo current = flyway.info().current();
        String flywayVersion = current == null || current.getVersion() == null ? "none" : current.getVersion().getVersion();
        return new SystemAboutDto(version, "UP", flywayVersion, mockLlm);
    }
}
