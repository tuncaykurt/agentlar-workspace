# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Agent Workspace

Multi-agent system powered by markdown files and Claude Code. No code, no database — everything is markdown.

## Quick Navigation

| Agent | Path | Purpose |
|-------|------|---------|
| Standard Template | `agents/standard-agent/` | Copy this to create any new agent |

## Key Directories

- `knowledge/` — Static reference (brand voice, strategy, audience profiles). Agents read-only.
- `journal/` — Living shared memory (events, decisions, learnings). Agents write here.
- `templates/` — Reusable document formats
- `orchestrator/` — Cross-agent coordination layer
- `examples/` — Example agents to learn from (e.g. `examples/podcast-agent/`)

## Agent Structure

Every agent folder under `agents/` must contain:

| File | Purpose |
|------|---------|
| `AGENT.md` | Mission, goals/KPIs, skills list, input/output contracts, hard boundaries |
| `HEARTBEAT.md` | Cron schedule, cycle steps (read → assess → execute → log), escalation rules |
| `MEMORY.md` | Agent-local learnings. Starts empty — filled from real data only, never assumptions. |
| `RULES.md` | CAN/CANNOT lists, handoff rules (human / orchestrator / journal) |
| `skills/` | One `.md` file per skill, each mapped to a goal |

Optional but common:
- `data/imports/` — Human-provided data drops (CSV, URLs, etc.)
- `outputs/` — Dated agent outputs
- `scripts/` — Automation scripts (must be idempotent)

## Key Files

- `AGENT_REGISTRY.md` — Master list of all agents; update when creating or retiring an agent
- `CONVENTIONS.md` — Naming rules and structure requirements
- `NEW_AGENT_BOOTSTRAP.md` — Step-by-step guide to create a new agent
- `AGENT_CREATION_CHECKLIST.md` — Verification checklist before activating an agent

## Creating a New Agent

```bash
cp -r agents/standard-agent agents/[your-agent-name]
```

Then follow `NEW_AGENT_BOOTSTRAP.md`. Key steps:
1. Fill in `AGENT.md` — mission (one sentence), 2–4 KPIs with baselines and targets
2. Create skills — one `.md` per skill in `skills/`, each mapped to a goal in AGENT.md
3. Define `HEARTBEAT.md` — schedule, decision tree, weekly review process
4. Define `RULES.md` — boundaries and handoff conditions
5. Register in `AGENT_REGISTRY.md`

## Architecture: Four Pillars

1. **Goals** — Every agent has 2–4 measurable KPIs. No KPI = no agent.
2. **Skills** — Each skill serves exactly one goal. Skills with no goal are deleted.
3. **Heartbeat** — Agents run on a schedule (daily/weekly), not just when prompted. Each cycle: read context → assess → run skill → log.
4. **Shared Journal** — Agents never communicate directly. They write to `journal/` and read from it. This is the shared memory layer.

## Agent Cycle (every heartbeat)

```
1. Read: journal/ + knowledge/ + own MEMORY.md
2. Assess: what's the most valuable action? which skill runs?
3. Execute: run one skill (rarely two)
4. Log: write to journal/, update MEMORY.md, save output to outputs/
```

## Conventions

- Agent folders: `agents/lowercase-hyphen-separated/`
- Output files: `YYYY-MM-DD_agent-name_description.md`
- Journal entries: `YYYY-MM-DD_HHMM.md`
- Never overwrite output files — always create a new dated file
- Never write to `knowledge/` directly — propose changes to the human via journal

## Orchestrator

The orchestrator (`orchestrator/`) is a lightweight human-facing coordinator:
- Routes tasks from the human to the right agent
- Flags when a new agent is needed or KPIs are declining across agents
- Does NOT run on a heartbeat; does NOT do specialist work; does NOT make strategic decisions

## Common Mistakes to Avoid

- Pre-filling `MEMORY.md` — it must start empty and fill from real data only
- Agents writing to `knowledge/` — never; propose changes through the journal instead
- Skills that don't map to a goal — delete them
- More than 4 goals per agent — split into two agents instead
- Skipping the weekly review — this is how agents learn and improve
