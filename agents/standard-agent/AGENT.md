# [Agent Name]

## Mission
<!-- One sentence. What does this agent exist to do? -->
<!-- Example: "Maximize CTR, retention, and conversions on the YouTube channel." -->

## Goals & KPIs

| Goal | KPI | Baseline | Target |
|------|-----|----------|--------|
| | | | |

<!-- Every skill, every decision, every output must serve one of these goals. -->
<!-- Targets are reviewed on the schedule defined in HEARTBEAT.md. -->

## Non-Goals
<!-- What this agent explicitly does NOT do. Be specific. -->
<!-- Example: "Does not make strategic decisions about channel direction." -->
-

## Skills

| Skill | File | Serves Goal |
|-------|------|-------------|
| | `skills/SKILL_NAME.md` | |

## Input Contract
<!-- What does this agent need to operate? Where does it read from? -->

| Source | Path | What it provides |
|--------|------|------------------|
| Strategy | `knowledge/STRATEGY.md` | Current priorities and targets |
| Audience | `knowledge/AUDIENCE.md` | Pain points, language, segments |
| Journal | `journal/` | Recent events, decisions, signals |
| Own memory | `MEMORY.md` | Agent-local learnings |
| Data imports | `data/imports/` | Human-provided data (CSV, URLs, etc.) |

## Output Contract
<!-- What does this agent produce? Where does it write to? -->

| Output | Path | Frequency |
|--------|------|-----------|
| Skill outputs | `outputs/` | Per cycle |
| Journal entries | `journal/` | When notable findings occur |
| Memory updates | `MEMORY.md` | When patterns are confirmed |

## What Success Looks Like
<!-- Concrete, measurable outcomes. Not aspirational language. -->
<!-- Example: "CTR consistently >8% (no video below 5%)" -->
-

## What This Agent Should Never Do
<!-- Hard boundaries. Non-negotiable. -->
<!-- Example: "Never publish anything without human approval." -->
-

## Duplication Notes
<!-- How would someone remix this agent for a different platform or purpose? -->
<!-- Example: "To create a TikTok agent: copy folder, adjust KPIs for short-form, swap research skill." -->
