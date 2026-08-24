package com.kms.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS Whitelist. 
 *
 * Originally hardcoded 5173 two origin, steppedOnehard toQuerypitfall: Vite discover 5173 occupied silently fall back to 5174, 
 * after browserin**all write ops**(New Annotation, Save Note, AI Chat)All 403 "Invalid CORS request", 
 * And**allReadop as usual**--same source GET browser not send Origin head, Spring when not CORS Request allow; 
 * same source POST/PUT/PATCH but will bring Origin, thus hitWhitelist. 
 * Tableappears as"Page looks fine, Oneop thenFailed", andBackendloginnothing. 
 *
 * switch to allowedOriginPatterns  Portwildcard, let dev server Works on any port. 
 * productionAvailable app.cors.allowed-origin-patterns Override with concrete domain. 
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final String[] allowedOriginPatterns;

    public CorsConfig(@Value("${app.cors.allowed-origin-patterns:http://localhost:[*],http://127.0.0.1:[*]}") String patterns) {
        this.allowedOriginPatterns = patterns.split("\\s*,\\s*");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(allowedOriginPatterns)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }
}
