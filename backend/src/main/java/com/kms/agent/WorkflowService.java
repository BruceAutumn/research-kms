package com.kms.agent;

import com.kms.agent.dto.WorkflowDtos;
import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class WorkflowService {
    private final WorkflowRepository workflowRepository;
    private final WorkflowStepRepository stepRepository;
    public WorkflowService(WorkflowRepository workflowRepository, WorkflowStepRepository stepRepository) { this.workflowRepository=workflowRepository; this.stepRepository=stepRepository; }
    public List<WorkflowDtos.WorkflowDto> list(){ return workflowRepository.findByUserIdOrderByUpdatedAtDescIdDesc(CurrentUser.ID).stream().map(w->toDto(w,true)).toList(); }
    @Transactional public WorkflowDtos.WorkflowDto create(WorkflowDtos.WorkflowRequest req){ Workflow w=new Workflow(); w.setUserId(CurrentUser.ID); w.setName(req.name==null||req.name.isBlank()?"Unnamed Workflow":req.name.trim()); w.setDescription(req.description); Workflow saved=workflowRepository.save(w); replaceSteps(saved.getId(), req.steps); return toDto(saved,true); }
    @Transactional public WorkflowDtos.WorkflowDto update(Long id, WorkflowDtos.WorkflowRequest req){ Workflow w=find(id); if(req.name!=null) w.setName(req.name); if(req.description!=null) w.setDescription(req.description); Workflow saved=workflowRepository.save(w); if(req.steps!=null) replaceSteps(id, req.steps); return toDto(saved,true); }
    @Transactional public WorkflowDtos.WorkflowDto updateSteps(Long id, List<WorkflowDtos.WorkflowStepRequest> steps){ find(id); replaceSteps(id, steps); return toDto(find(id), true); }
    @Transactional public void delete(Long id){ workflowRepository.delete(find(id)); }
    private Workflow find(Long id){ return workflowRepository.findByIdAndUserId(id, CurrentUser.ID).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Workflow not found.")); }
    private void replaceSteps(Long workflowId, List<WorkflowDtos.WorkflowStepRequest> steps){ if(steps==null)return; stepRepository.deleteByWorkflowId(workflowId); int i=1; for(var req: steps){ WorkflowStep s=new WorkflowStep(); s.setWorkflowId(workflowId); s.setStepOrder(req.stepOrder==null?i:req.stepOrder); s.setToolName(req.toolName); s.setPrompt(req.prompt); s.setInputMapping(req.inputMapping); s.setOutputKey(req.outputKey); s.setCondition(req.condition); s.setRetryPolicy(req.retryPolicy); s.setEnabled(req.enabled==null||req.enabled); stepRepository.save(s); i++; } }
    private WorkflowDtos.WorkflowDto toDto(Workflow w, boolean includeSteps){ List<WorkflowDtos.WorkflowStepDto> steps=includeSteps?stepRepository.findByWorkflowIdOrderByStepOrderAsc(w.getId()).stream().map(this::toStepDto).toList():List.of(); return new WorkflowDtos.WorkflowDto(w.getId(), w.getName(), w.getDescription(), w.getCreatedAt(), w.getUpdatedAt(), steps); }
    private WorkflowDtos.WorkflowStepDto toStepDto(WorkflowStep s){ return new WorkflowDtos.WorkflowStepDto(s.getId(), s.getWorkflowId(), s.getStepOrder(), s.getToolName(), s.getPrompt(), s.getInputMapping(), s.getOutputKey(), s.getCondition(), s.getRetryPolicy(), s.isEnabled()); }
}
