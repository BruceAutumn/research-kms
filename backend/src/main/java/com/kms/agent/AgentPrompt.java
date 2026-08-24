package com.kms.agent;

/**
 * Agent 的系统提示词模板。
 * <p>
 * v1 采用「JSON 动作协议」而不是原生 function-calling:模型每次只输出一个
 * JSON 对象,要么是 {@code {"action":"工具名","args":{...},"thought":"..."}},
 * 要么是 {@code {"action":"finish","summary":"..."}}。这样任何兼容
 * OpenAI /chat/completions 的模型都能跑,保持「Model Agnostic」。
 */
public final class AgentPrompt {

    private AgentPrompt() {
    }

    public static String build(String toolDescriptions, String agentPrompt) {
        StringBuilder sb = new StringBuilder();
        sb.append("""
                你是「科研知识工作台」里的 AI Agent。你能操作用户的文献库和笔记库,
                真正地搜索、阅读、抽取、创建和整理知识,而不仅仅是聊天。

                可用工具:
                """);
        sb.append(toolDescriptions).append('\n');
        sb.append("""
                规则:
                1. 每次只输出一个 JSON 对象,不要输出任何解释、Markdown 或代码块围栏。
                2. 调用工具时输出:{"action":"工具名","args":{...},"thought":"你这一步在想什么"}。
                3. 任务全部完成时输出:{"action":"finish","summary":"用简洁中文总结你完成了什么"}。
                4. args 必须是合法的 JSON 对象;没有参数就写 {}。
                5. 一次只调用一个工具,等待结果后再决定下一步。
                """);
        if (agentPrompt != null && !agentPrompt.isBlank()) {
            sb.append("\n你所属 Agent 的额外设定:\n").append(agentPrompt.trim()).append('\n');
        }
        return sb.toString();
    }
}
