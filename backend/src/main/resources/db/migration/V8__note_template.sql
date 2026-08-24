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
('Standard Paper Note', 'paper',
'---\ntype: paper-note\npaperId: {{paperId}}\nyear: {{year}}\ntags: []\n---\n\n# {{title}}\n\n## Bibliography\n\n- Authors: {{authors}}\n- Journal: {{journal}}\n- Year: {{year}}\n- DOI: {{doi}}\n\n## Abstract\n\n{{abstract}}\n\n## Metadata\n\n{{metadata_table}}\n\n## AI Extraction Review\n\n{{ai_extraction}}\n\n## My Annotations\n\n{{annotations}}\n\n## Summary\n\n## Methods\n\n## Results\n\n## My Thoughts\n',
TRUE, TRUE, 1),

('Minimal Note', 'paper',
'# {{title}}\n\n> {{authors}} ({{year}})\n\n## Key Points\n\n## doubt\n',
FALSE, TRUE, 2),

('AI Assisted Close Reading', 'paper',
'# {{title}}\n\n## Onesentence summary\n\n{{ai:useOnesentence summaryThis paper Corecontribute, not exceed 50 char}}\n\n## research question\n\n{{ai:What problem does this paper solve? What are the shortcomings of existing methods? }}\n\n## method\n\n{{ai:Briefly describe the proposed method, List by points, not exceed 200 char}}\n\n## My Annotations\n\n{{annotations}}\n\n## my thinking\n',
FALSE, TRUE, 3),

('Review Entry', 'paper',
'## {{title}} ({{year}})\n\n**Author**: {{authors}}\n**Source**: {{journal}}\n\n**method**: \n\n**Conclusion**: \n\n**Relation to this review**: \n',
FALSE, TRUE, 4);