# Token & quota conservation policy

1. Prompt order: **goal → target files → acceptance criteria → constraints → permitted commands**. No full history recap.
2. Use `AGENTS.md` for always-on 10%-of-context essentials; only load a task-specific skill when task matches.
3. Send diffs, errors with relevant stack frames and file ranges; avoid entire terminal logs, screenshots of code, whole PR history or unrestricted repo pack.
4. Limit preliminary repo traversal: inspect directory tree and 1–3 files first; expand only on evidence of dependency.
5. Avoid restarting agents for the same task. Resuming agent reads `docs/ai/HANDOFF.md`, issue and relevant diff, not all sources.
6. Fast/Core/Deep routing by risk, **not** by wanting a long answer. No manual benchmark unless user later asks.
7. On failed attempt #2 with no new evidence, stop and hand off error summary + reproduction, rather than loop.
8. A single independent reviewer for impactful changes; formatting-only changes rely on CI.
9. Run local/relevant tests before asking another model to debug. Store test output summary, not full log.
10. Use Repomix optionally only for scoped code review; don't send compressed full repository by default, and never pack `.env`, credentials, user data, research archives, `node_modules` or build artifacts.

**Metric for future observation (optional; no benchmark):** count avoidable repeat prompts, failed cycles, file breadth, tool output and approximate quota indicator. Token economy never justifies skipping security/domain tests.
