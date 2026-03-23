# New Agent Bootstrap

Step-by-step guide to creating a new agent from the standard template.

## Step 1: Copy the Template

```bash
cp -r agents/standard-agent agents/[your-agent-name]
```

Use lowercase, hyphen-separated names: `podcast`, `newsletter`, `customer-support`.

## Step 2: Define the Mission (AGENT.md)

Open `agents/[your-agent-name]/AGENT.md` and fill in:

1. **Mission** — one sentence. What does this agent optimize for?
2. **Goals & KPIs** — what are the 2-4 measurable numbers this agent moves?
3. **Non-goals** — what does this agent explicitly NOT do?

Ask yourself: "If this agent did nothing else, what 2-3 metrics would prove it's working?"

### Example (Newsletter Agent):
```
Mission: Grow newsletter subscribers and maintain high open rates.

| Goal | KPI | Baseline | Target |
|------|-----|----------|--------|
| Grow subscribers | Net new subs/week | +20 | +100 |
| Maintain engagement | Open rate | 35% | >45% |
| Drive conversions | Click-through rate | 2% | >5% |
```

## Step 3: Define Skills

For each goal, ask: "What capability does the agent need to move this metric?"

1. Create one .md file per skill in `skills/`
2. Copy from `skills/_SKILL_TEMPLATE.md`
3. Map each skill to a goal
4. Define the step-by-step process

Rule: If a skill doesn't serve a goal, delete it. If a goal has no skill, create one.

## Step 4: Define the Heartbeat (HEARTBEAT.md)

1. **Schedule** — how often should this agent run?
2. **Daily cycle** — what does it do each time?
3. **Weekly review** — how does it measure results and learn?
4. **Decision tree** — which skill runs based on pipeline state?

Keep it simple. Start with one skill per cycle. Don't over-engineer.

## Step 5: Set Up Data Flow

1. **data/imports/** — what data does the human need to provide? Create a HOW_TO_EXPORT.md.
2. **outputs/** — where does the agent write? Create subfolders if needed.
3. **scripts/** — any automation scripts? Make them executable (`chmod +x`).

## Step 6: Define Rules (RULES.md)

1. What CAN this agent do?
2. What CANNOT it do?
3. When does it hand off to human?
4. When does it hand off to orchestrator?
5. How does it read/write shared knowledge?

## Step 7: Register the Agent

Add a row to `AGENT_REGISTRY.md`:

```
| [Name] | agents/[name]/ | [Goals] | [Skills] | [Heartbeat] | Active |
```

## Step 8: First Run

1. Trigger the daily cycle manually
2. Verify it reads context, picks a skill, produces output, logs to journal
3. Check that MEMORY.md is empty (it should be — no learnings yet)
4. Run the weekly review after the first week of data

## Step 9: Verify

Run through AGENT_CREATION_CHECKLIST.md to confirm everything is in place.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Too many goals | Max 4. If you need more, it's two agents. |
| Skills don't map to goals | Delete the skill or add the goal. |
| Heartbeat too frequent | Start weekly, move to daily only if needed. |
| MEMORY.md pre-filled with assumptions | Keep it empty. Memory is earned from real data. |
| No weekly review | Without review, the agent never learns. This is the most important part. |
| Agent writes to knowledge/ files | Never. Propose changes to the human. |
