package com.kms.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS 白名单。
 *
 * 原来写死 5173 两个 origin，踩过一次很难查的坑：Vite 发现 5173 被占用会静默回退到 5174，
 * 此后浏览器里**所有写操作**（新建标注、保存笔记、AI 对话）全部 403 "Invalid CORS request"，
 * 而**所有读操作照常**——因为同源 GET 浏览器不发 Origin 头，Spring 当非 CORS 请求放行；
 * 同源 POST/PUT/PATCH 却会带 Origin，于是撞上白名单。
 * 表现出来就是「页面看着好好的，一操作就失败」，且后端日志里什么都没有。
 *
 * 改用 allowedOriginPatterns 的端口通配，让 dev server 落在哪个端口都能用。
 * 生产环境可用 app.cors.allowed-origin-patterns 覆盖成具体域名。
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
