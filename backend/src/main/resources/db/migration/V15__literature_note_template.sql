-- V15: 添加 Background/Mechanism/Evidence/Questions 四段式文献笔记模板
-- 产品方案第四节要求：用户读完论文后一键生成结构化文献笔记

INSERT INTO note_template (name, scope, body, is_default, is_builtin, sort_order)
VALUES (
    '四段式文献笔记',
    'paper',
    '# {{title}}

## Background（背景）

这篇论文研究了什么？为什么重要？

## Mechanism（机理）

作者提出了什么机理？有哪些证据支持？

## Evidence（证据）

关键数据和实验结果。

## Questions（问题）

这篇论文有哪些未解决的问题？

---

**元数据**
- 作者：{{authors}}
- 期刊：{{journal}}
- 年份：{{year}}
- DOI：{{doi}}

**摘要**
{{abstract}}

**我的标注**
{{annotations}}
',
    false,
    true,
    5
)
ON CONFLICT DO NOTHING;