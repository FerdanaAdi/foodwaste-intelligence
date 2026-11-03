# FWI AI model routing v1.0 — **provisional**

Role assignment saves context and coordination; it is **not a proven performance ranking**. Model identifiers/effort controls must match the live account selector; if they differ, use the **role**, not a hallucinated model name. Respect quota and data permissions.

| Task | Default role/environment | Effort | Independent reviewer (when risk warrants) |
|---|---|---|---|
| Requirements/task breakdown | ChatGPT or Gemini Antigravity analysis | Normal; High if architecture ambiguity | Human owner |
| Data model, events, measurements, backend | Codex core engineer (e.g. GPT-6.1 Sol if available) | Medium; High for critical domain | GLM-5.3 or Antigravity deep model |
| UI and accessible forms | Antigravity feature engineer (e.g. Claude Sonnet 5.5 if available) | Default/Medium | Codex for API-contract issues |
| Small edits | Copilot Student inline or fast model (e.g. Gemini 3.8 Flash / GPT-6 Luna) | Fast/Low | Local tests |
| KPI, security, migration, complex debug | Codex deep (e.g. GPT-6 Astra) **or** Antigravity deep (e.g. Gemini 4 Argon / Claude Opus 5.5) | High, only when justified | Different-family independent review + human |
| Code review | GLM-5.3 | Available/default | PR CI, human |
| Routine docs and fixture scaffolding | GLM-5.3-Flash | Fast | Diff check |
| OSS audit | Codex or other agent loading `fwi-oss-audit` skill | Normal | Human license decision |

## Routing decision, without benchmarking
- If editing 1–2 isolated files, known acceptance criteria, low risk: **Fast**.
- If modifying several modules, database/API, normal debugging: **Core**.
- If data lineage, double count, safety, regulated data, security or migration: **Core High / Deep** with independent evidence-based review.
- One implementer, one reviewer only if material risk; avoid duplicate full implementations.
- Escalate only with concrete test failure or documented blocker. Stop repeated speculation after two ineffective tries.

**No automated routing/integration is installed by this Markdown file.** It is a human/agent decision policy.
