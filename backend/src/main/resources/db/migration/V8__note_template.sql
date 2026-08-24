CREATE TABLE note_template (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(120)  NOT NULL,
    scope        VARCHAR(32)   NOT NULL DEFAULT 'paper',
    body         TEXT          NOT NULL,
    is_default   BOOLEAN       NOT NULL DEFAULT FALSE,
    is_builtin   BOOLEAN       NOT NULL DEFAULT FALSE,
    sort_order   INT           NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uk_note_template_name_scope ON note_template (name, scope);
CREATE INDEX idx_note_template_scope ON note_template (scope);
CREATE UNIQUE INDEX uk_note_template_default ON note_template (scope) WHERE is_default = TRUE;

INSERT INTO note_template (name, scope, body, is_default, is_builtin, sort_order) VALUES
('标准文献笔记', 'paper',
'---\ntype: paper-note\npaperId: {{paperId}}\nyear: {{year}}\ntags: []\n---\n\n# {{title}}\n\n## Bibliography\n\n- Authors: {{authors}}\n- Journal: {{journal}}\n- Year: {{year}}\n- DOI: {{doi}}\n\n## Abstract\n\n{{abstract}}\n\n## Metadata\n\n{{metadata_table}}\n\n## AI Extraction Review\n\n{{ai_extraction}}\n\n## My Annotations\n\n{{annotations}}\n\n## Summary\n\n## Methods\n\n## Results\n\n## My Thoughts\n',
TRUE, TRUE, 1),

('极简笔记', 'paper',
'# {{title}}\n\n> {{authors}} ({{year}})\n\n## 要点\n\n## 疑问\n',
FALSE, TRUE, 2),

('AI 辅助精读', 'paper',
'# {{title}}\n\n## 一句话总结\n\n{{ai:用一句话概括这篇论文的核心贡献，不超过 50 字}}\n\n## 研究问题\n\n{{ai:这篇论文试图解决什么问题？现有方法有什么不足？}}\n\n## 方法\n\n{{ai:简述本文提出的方法或策略，分点列出，不超过 200 字}}\n\n## 我的批注\n\n{{annotations}}\n\n## 我的思考\n',
FALSE, TRUE, 3),

('文献综述条目', 'paper',
'## {{title}} ({{year}})\n\n**作者**：{{authors}}\n**来源**：{{journal}}\n\n**方法**：\n\n**结论**：\n\n**与本综述的关系**：\n',
FALSE, TRUE, 4);