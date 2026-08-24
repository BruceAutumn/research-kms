# Research KMS -- AI Native personal research knowledge system

> Fusion Zotero + AI Agent + Obsidian, OnesystemsDone"Literature Management -> AI Deep Chat -> Knowledge precipitation"Full Closed Loop. 
>
> Core Philosophy: **Data does not die in PDF in, AI Answer does not die in chat box, Notes do not die in folders--Flow among three. **

## Quick Start

### Environment Requirements

- Java 17+, Node.js 18+, PostgreSQL 16+(need pgvector Extension), Maven 3.9+

### 1. Start Database

```bash
docker run -d --name kms-postgres \
  -e POSTGRES_DB=kms -e POSTGRES_USER=kms -e POSTGRES_PASSWORD=kms \
  -p 5432:5432 pgvector/pgvector:pg16
```

### 2. Start Backend

```bash
cd backend && mvn spring-boot:run    # http://localhost:8080
```

### 3. Start Frontend

```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
```

### 4. Config LLM

open `http://localhost:5173/settings/models`, Config Provider(OpenAI / DeepSeek / Anthropic / Ollama). 

---

## System Architecture

```
browser (React 18 SPA)
  |-- Literature Module  (Library -- Zotero)
  |-- AI Studio Module   (AI Chat -- ChatGPT + Claude Code)
  |-- Vault Module       (Vault -- Obsidian)
  `-- Home Module
        |
  API Client (axios) + SSE Client
        | HTTP / SSE
Spring Boot 3.3.5 (port 8080)
  Paper | AI | Agent | Note | Vault | Search | LLM
        |
PostgreSQL 16 + pgvector (Vector Search)
```

---

## Three modules and data loop

| Module | Benchmark | Core Capability |
|------|------|---------|
| Literature | Zotero | PDFUpload/Reading/Annotation/AIAbstract/Semantic Search |
| AI Studio | ChatGPT+Claude Code | Streaming Chat/Deep Thinking/web search/AgentWorkflow |
| Vault | Obsidian | MarkdownEdit/WikiLink/Graph/Single ColumnObsidianstyle |

**Data Flow**: Paper->AI(Auto inject full-text context)->Vault(Save as Note)->AI(Inject as context)->Global Search(Ctrl+KCross-type)

---

## Tech Stack

**Backend**: Spring Boot 3.3.5 / JPA / PostgreSQL+pgvector / Flyway / PDFBox

**Frontend**: React 18 / TypeScript / Vite / TanStack Query / CodeMirror 6 / pdf.js / Cytoscape / KaTeX

---

## Project Structure

```
research-kms/
|-- backend/                          # Spring Boot Backend (218 Java File)
|   |-- pom.xml
|   `-- src/main/
|       |-- java/com/kms/
|       |   |-- paper/                # Paper Management
|       |   |-- literature/           # Paper Collection/Annotation/extract
|       |   |-- ai/                   # AIChat/LLMConfig/StreamingSSE
|       |   |-- agent/                # AgentWorkflow + 20+Tool
|       |   |-- llm/                  # LLMClient Abstraction(OpenAI/DeepSeek/Claude/Ollama)
|       |   |-- note/                 # Note Management/Template
|       |   |-- vault/                # VaultFile System/Graph
|       |   `-- search/               # Semantic/Mixed/Global Search
|       `-- resources/
|           |-- application.yml
|           `-- db/migration/         # Flyway V1-V16
|-- frontend/                         # React Frontend (73 TS/TSX File)
|   |-- package.json
|   `-- src/
|       |-- api/                      # API + SSE Client
|       |-- components/               # common component(Layout/PDF/Markdown)
|       |-- shell/                    # Command Palette/Navigation/Settings
|       `-- modules/                  # 4Major module
|           |-- LiteratureModule.tsx
|           |-- AiStudioModule.tsx
|           `-- VaultModule.tsx
|-- Research_KMS_Full-stack development workflow.docx  # Detailed development workflow doc
`-- README.md
```

---

## AI Core Feature

### Deep Thinking

after enable LLM Output `<thinking>Reasoning Process</thinking>finalAnswer`, Frontend parses and foldable. 

### Streaming Chat (SSE)

```
event: token  -> data: {"delta":"you"}     # Per token Push
event: done   -> data: {"conversationId":30}
```

### Reasoning Effort

| level | maxTokens | effect |
|------|-----------|------|
| Low | 2048 | Concise and to the point |
| Medium | 4096 | Standard Reply |
| High | 8192 | Detailed full analysis |

### Semantic Search

User Question -> embedding Vectorize -> pgvector Cosine Similarity -> most relevantParagraphInjectContext

---

## Development Commands

```bash
# Backend
cd backend
mvn spring-boot:run          # Dev Server
mvn compile                  # compile
mvn test                     # test

# Frontend
cd frontend
npm run dev                  # Vite HMR
npx tsc --noEmit             # type checkQuery
npm run build                # Production Build
```

---

## deploy

```bash
# Backend
cd backend && mvn clean package -DskipTests
java -jar target/research-kms-1.0.0.jar

# Frontend
cd frontend && npm run build
# dist/ Deploy to Nginx or Spring Boot static
```

### Env Var

| variable | explain | Default Value |
|------|------|--------|
| `SPRING_DATASOURCE_URL` | Database | `jdbc:postgresql://localhost:5432/kms` |
| `KMS_VAULT_ROOT` | Vault Root Dir | `~/ResearchVault` |
| `MOCK_LLM` | Mock LLM | `false` |

---

## License

MIT
