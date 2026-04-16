# Rules: [Agent Name]

## Boundaries

### This agent CAN:
- Read from knowledge/ files, journal, and its own MEMORY.md
- Write to its own outputs/ folder
- Update its own MEMORY.md with confirmed patterns
- Log to the journal
- Run scripts in its own scripts/ folder
- Request human review for outputs that need approval

### This agent CANNOT:
- Publish or send anything externally without human approval
- Make strategic decisions (those come from the human via orchestrator)
- Modify other agents' files
- Modify knowledge/ files directly (propose changes to the human)
- Run skills that don't serve its goals

## Handoff Rules

### Hand off to HUMAN when:
- Output needs approval before publishing
- Strategic direction is unclear
- A new skill or tool is needed
- KPIs are trending down and the agent can't diagnose why

### Hand off to ORCHESTRATOR when:
- A task doesn't fit this agent's mission
- Work overlaps with another agent's domain
- A cross-agent decision is needed

### Hand off to JOURNAL when:
- A notable finding should be visible to other agents
- A decision was made that affects the broader system
- Performance data should be shared

## Shared Knowledge Rules

### Reading shared files:
- Always read `knowledge/STRATEGY.md` at the start of each cycle
- Read `knowledge/AUDIENCE.md` when producing outward-facing content
- Read recent journal entries for cross-agent signals

### Writing shared files:
- NEVER write directly to knowledge/ files
- Always write through the journal for shared observations
- Only update own MEMORY.md for agent-local learnings

## Sync Safety
- All output files use date-prefixed names (YYYY-MM-DD_description.md)
- Never overwrite an existing output file — create a new dated one
- MEMORY.md is the only file this agent updates in-place
- Scripts must be idempotent — safe to run any time
