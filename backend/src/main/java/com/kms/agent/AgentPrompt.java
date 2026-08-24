package com.kms.agent;

/**
 * Agent systemPromptTemplate. 
 * <p>
 * v1 adopt"JSON Action Protocol"Instead of native function-calling:Model outputs one at a time
 * JSON Toobject,either {@code {"action":"Tool Name","args":{...},"thought":"..."}},
 * either {@code {"action":"finish","summary":"..."}}. thus anyCompat
 * OpenAI /chat/completions  Modelall can run,Keep"Model Agnostic". 
 */
public final class AgentPrompt {

    private AgentPrompt() {
    }

    public static String build(String toolDescriptions, String agentPrompt) {
        StringBuilder sb = new StringBuilder();
        sb.append("""
                You are"Research Knowledge Workbench"in  AI Agent. You can operate user library and notes,
                really search, Reading, extract, Create and organize knowledge,Not just chat. 

                Available Tools:
                """);
        sb.append(toolDescriptions).append('\n');
        sb.append("""
                rule:
                1. Output one at a time JSON Toobject,Do not output any explanation, Markdown Or code fence. 
                2. Output on tool call:{"action":"Tool Name","args":{...},"thought":"What are you thinking in this step"}. 
                3. Output when all tasks done:{"action":"finish","summary":"use conciseChinesesummarize youDonedone what"}. 
                4. args Must be legal JSON Toobject;no param then write {}. 
                5. Oneeach onlyCallOne Tool,Wait for result then decide next. 
                """);
        if (agentPrompt != null && !agentPrompt.isBlank()) {
            sb.append("\nYou belong to Agent extra setting:\n").append(agentPrompt.trim()).append('\n');
        }
        return sb.toString();
    }
}
