#!/usr/bin/env python3
"""Offline configuration sanity check; NOT an application security test."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
required=["AGENTS.md",".agents/rules/fwi-core.md",".agents/skills/fwi-domain/SKILL.md",".agents/skills/fwi-ui/SKILL.md",".agents/skills/fwi-review/SKILL.md",".agents/skills/fwi-oss-audit/SKILL.md","docs/ai/AI_MODEL_ROUTING.md","docs/ai/HANDOFF.md","repomix.config.json"]
missing=[p for p in required if not (root/p).is_file()]
config=json.loads((root/'repomix.config.json').read_text(encoding='utf-8'))
if missing:raise SystemExit('Missing files: '+', '.join(missing))
if not config.get('security',{}).get('enableSecurityCheck'):raise SystemExit('Repomix security check must be on')
for p in [root/'AGENTS.md',root/'docs/ai/CONTEXT.md']:
 t=p.read_text(encoding='utf-8').lower()
 assert 'synthetic' in t, f'{p.name}: missing synthetic-data policy'
print(f'PASS: {len(required)} required kit files present; JSON valid; guardrails present.')
