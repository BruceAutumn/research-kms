-- register deepseek-v4-pro. 
--
-- Provider side already provides flash and pro(GET /llm/providers/1/models/remote Backtwo), 
-- But llm_model Table only registered flash, So model picker has no pro Optional. 
-- context_window and flash Consistent(128k); capability='chat'. 
INSERT INTO llm_model (provider_id, model_id, display_name, context_window,
                       supports_tools, supports_stream, is_default, enabled, capability)
SELECT p.id, 'deepseek-v4-pro', 'DeepSeek V4 Pro(stronger, slower)', 128000,
       true, true, false, true, 'chat'
FROM llm_provider p
WHERE p.name = 'deepseek-v4-flash'
ON CONFLICT (provider_id, model_id) DO NOTHING;

-- also put flash  Display name clarified, Only distinguishable side by side. 
UPDATE llm_model SET display_name = 'DeepSeek V4 Flash(faster, cheaper)'
WHERE model_id = 'deepseek-v4-flash' AND display_name = 'deepseek Default Model';
