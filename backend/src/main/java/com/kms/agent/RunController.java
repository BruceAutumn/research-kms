package com.kms.agent;

import com.kms.agent.dto.RunAgentRequest;
import com.kms.agent.dto.RunDtos;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/runs")
public class RunController {
    private final AgentRunService runService;

    public RunController(AgentRunService runService) {
        this.runService = runService;
    }

    @PostMapping
    public RunDtos.RunCreateResponse create(@RequestBody RunAgentRequest request) {
        return new RunDtos.RunCreateResponse(runService.create(request));
    }

    @GetMapping(value = "/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> stream(@PathVariable Long id) {
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .cacheControl(CacheControl.noCache())
                .header("X-Accel-Buffering", "no")
                .body(runService.stream(id));
    }

    @PostMapping("/{id}/permission")
    public Map<String, Object> permission(@PathVariable Long id, @RequestBody RunDtos.PermissionRequest request) {
        return runService.permission(id, request);
    }

    @PostMapping("/{id}/cancel")
    public void cancel(@PathVariable Long id) {
        runService.cancel(id);
    }

    @GetMapping
    public List<RunDtos.RunDto> history(@RequestParam(defaultValue = "false") boolean includeSteps) {
        return runService.history(includeSteps);
    }

    @GetMapping("/{id}")
    public RunDtos.RunDto detail(@PathVariable Long id) {
        return runService.detail(id);
    }

    @DeleteMapping
    public Map<String, Object> deleteHistory(@RequestParam(required = false) String status,
                                             @RequestParam(required = false) LocalDate before) {
        return runService.deleteHistory(status, before);
    }
}
