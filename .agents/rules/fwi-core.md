---
description: Minimal FWI project rule, applies to all FWI development tasks.
---
# FWI Antigravity core rule
Follow root `AGENTS.md`; do not duplicate whole research docs in the chat. FWI is an independent analytics prototype for MBG/SPPG and must use synthetic data until authorized otherwise.

For each task: (a) load only the relevant skill under `.agents/skills/`, (b) work in an isolated branch/worktree, (c) keep the change small, (d) provide test evidence, and (e) update a short handoff. Do not silently change domain definitions, KPI activation statuses, the selected stack, or government API permissions.

Prefer file paths and diffs over full-file dumps. Do not run unrestricted repository indexing, install dependencies, or use external MCP tools without user approval. Verify that this rules file is actually loaded by the installed Antigravity version.
