package com.kms.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestClient;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

@Configuration
public class HttpClientConfig {
    @Bean
    public RestClient.Builder restClientBuilder() {
        return RestClient.builder();
    }

    /** Agent 运行专用线程池:SSE 长连接的后台执行。 */
    @Bean(destroyMethod = "shutdown")
    public ExecutorService agentExecutor() {
        return Executors.newFixedThreadPool(2, runnable -> {
            Thread thread = new Thread(runnable, "agent-run");
            thread.setDaemon(true);
            return thread;
        });
    }

    @Bean(name = "agentRunExecutor")
    public ThreadPoolTaskExecutor agentRunExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("agent-run-");
        executor.initialize();
        return executor;
    }

    @Bean(destroyMethod = "shutdown")
    public ScheduledExecutorService sseHeartbeatExecutor() {
        return Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "agent-sse-heartbeat");
            thread.setDaemon(true);
            return thread;
        });
    }
}
