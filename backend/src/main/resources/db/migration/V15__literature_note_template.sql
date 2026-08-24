-- V15: Add Background/Mechanism/Evidence/Questions Four-section paper note template
-- Product plan section 4 requires: UserReadcompletePaperafterOnekeyGeneratestructuredPaperNote

INSERT INTO note_template (name, scope, body, is_default, is_builtin, sort_order)
VALUES (
    'Four-section paper note',
    'paper',
    '# {{title}}

## Background(background)

What does this paper study? why important? 

## Mechanism(Mechanism)

What mechanism did authors propose? what evidence supports? 

## Evidence(evidence)

Key data and results. 

## Questions(question)

What unsolved problems remain? 

---

**Metadata**
- Author: {{authors}}
- Journal: {{journal}}
- Year: {{year}}
- DOI: {{doi}}

**Abstract**
{{abstract}}

**My Annotations**
{{annotations}}
',
    false,
    true,
    5
)
ON CONFLICT DO NOTHING;