-- 注册 deepseek-v4-pro。
--
-- Provider 侧本来就同时提供 flash 与 pro（GET /llm/providers/1/models/remote 返回两个），
-- 但 llm_model 表里只注册了 flash，所以模型选择器里根本没有 pro 可选。
-- context_window 与 flash 一致（128k）；capability='chat'。
INSERT INTO llm_model (provider_id, model_id, display_name, context_window,
                       supports_tools, supports_stream, is_default, enabled, capability)
SELECT p.id, 'deepseek-v4-pro', 'DeepSeek V4 Pro（更强，更慢）', 128000,
       true, true, false, true, 'chat'
FROM llm_provider p
WHERE p.name = 'deepseek-v4-flash'
ON CONFLICT (provider_id, model_id) DO NOTHING;

-- 顺手把 flash 的显示名改清楚，选择器里两个并排时才分得出来。
UPDATE llm_model SET display_name = 'DeepSeek V4 Flash（更快，更便宜）'
WHERE model_id = 'deepseek-v4-flash' AND display_name = 'deepseek 默认模型';
