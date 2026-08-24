package com.kms.agent;

import com.kms.agent.dto.WorkflowDtos;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/workflows")
public class WorkflowController {
    private final WorkflowService service;
    public WorkflowController(WorkflowService service){this.service=service;}
    @GetMapping public List<WorkflowDtos.WorkflowDto> list(){return service.list();}
    @PostMapping public WorkflowDtos.WorkflowDto create(@RequestBody WorkflowDtos.WorkflowRequest request){return service.create(request);}
    @PatchMapping("/{id}") public WorkflowDtos.WorkflowDto update(@PathVariable Long id, @RequestBody WorkflowDtos.WorkflowRequest request){return service.update(id, request);}
    @DeleteMapping("/{id}") public void delete(@PathVariable Long id){service.delete(id);}
    @PatchMapping("/{id}/steps") public WorkflowDtos.WorkflowDto updateSteps(@PathVariable Long id, @RequestBody List<WorkflowDtos.WorkflowStepRequest> steps){return service.updateSteps(id, steps);}
}
