# Agent Creation Checklist

Use this after creating a new agent to verify it's complete and ready.

## Before Activation

### AGENT.md
- [ ] Mission is one sentence, specific, and measurable
- [ ] Goals table has at least 2 KPIs with baselines and targets
- [ ] Non-goals are explicitly listed (what this agent does NOT do)
- [ ] At least one skill is defined and mapped to a goal
- [ ] Input contract lists all data sources the agent reads from
- [ ] Output contract lists all outputs the agent produces
- [ ] "What Success Looks Like" has concrete numbers, not aspirational language
- [ ] "What This Agent Should Never Do" has at least 3 hard boundaries

### HEARTBEAT.md
- [ ] Schedule is defined (daily, weekly, or custom)
- [ ] Daily cycle has read-context, assess, execute, log steps
- [ ] Weekly review has data-gathering, scoring, analysis, memory-update steps
- [ ] Escalation rules are defined (when does the agent hand off to human?)
- [ ] Decision tree for which skill to run each cycle is documented

### MEMORY.md
- [ ] Sections match the agent's domain (not just generic "What Works")
- [ ] No pre-filled content — memory is earned, not assumed

### RULES.md
- [ ] "CAN do" and "CANNOT do" lists are defined
- [ ] Handoff rules exist for human, orchestrator, and journal
- [ ] Shared knowledge read/write rules are clear

### Skills
- [ ] Each skill has its own .md file in skills/
- [ ] Each skill maps to at least one goal in AGENT.md
- [ ] Each skill has a defined process (numbered steps)
- [ ] Each skill has a quality bar
- [ ] No skill exists that doesn't serve a goal

### Data & Scripts
- [ ] data/imports/ folder exists with instructions for human data drops
- [ ] outputs/ folder exists
- [ ] Any required scripts are in scripts/ and are executable

### Registration
- [ ] Agent is registered in AGENT_REGISTRY.md
- [ ] Agent is listed with goals, skills, heartbeat frequency, and status

## After First Week

- [ ] First daily cycle completed successfully
- [ ] First weekly review completed
- [ ] MEMORY.md has at least one entry
- [ ] Outputs are being generated in the correct folder
