# [Agent Name] Heartbeat

## Schedule
<!-- How often does this agent run? -->
<!-- Example: "Daily (once per day, morning preferred)." -->

## Each Cycle

### 1. Read Context
- Check recent journal entries for relevant signals
- Review `knowledge/STRATEGY.md` for priority changes
- Read own `MEMORY.md` for learnings from past cycles

### 2. Assess State
- What is the current pipeline status?
- What is the most valuable action right now?
- Which skill should run this cycle?

### 3. Execute Skill
<!-- Define the decision tree for which skill to run. -->
<!-- Example: -->
<!-- - Pipeline empty? → Run RESEARCH skill -->
<!-- - Topics ready but no titles? → Run TITLE skill -->
<!-- - Everything covered? → Review performance and update MEMORY.md -->

### 4. Log to Journal
- What was done this cycle
- Any notable findings
- What should happen next

## Weekly Review
<!-- Define the weekly review process. Run before the daily cycle. -->
<!-- This is where the agent learns from results. -->

### 1. Gather Data
<!-- How does the agent get performance data? -->
<!-- Example: "Read latest CSV export from data/imports/" -->

### 2. Score Against Targets
<!-- Compare results to the targets in AGENT.md -->
<!-- | Metric | Target | This Week | Status | -->

### 3. Analyze Wins and Misses
- **Wins:** What worked? Log the pattern to MEMORY.md.
- **Misses:** What went wrong? Log the hypothesis to MEMORY.md.

### 4. Update Memory
Add confirmed patterns to the relevant sections in MEMORY.md.

### 5. Log Weekly Summary to Journal
- Items reviewed (count)
- Performance vs targets
- Top insight discovered
- Recommendations for next week

## Monthly Review
- Review trends across 4 weekly reviews
- Flag if targets need adjustment
- Compare month-over-month progress

## Escalation Rules
<!-- When should this agent stop and hand off to the human or orchestrator? -->
- KPIs trending down for 2+ consecutive weeks
- A task doesn't fit any existing skill
- A decision requires strategic judgment
- Something feels off but the agent can't diagnose why

## Rules
- Always read journal before acting
- One skill per cycle unless there's a strong reason to combine
- If unsure what to do, default to research
- Never run a skill that doesn't serve a goal in AGENT.md
