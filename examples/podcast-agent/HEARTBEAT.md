# Podcast Agent Heartbeat

## Schedule
Weekly (every Monday morning).

## Each Cycle

### 1. Read Context
- Check recent journal entries for trending topics, audience signals
- Review `knowledge/STRATEGY.md` for priority changes
- Read `knowledge/AUDIENCE.md` for current pain points
- Read own `MEMORY.md` for what worked/didn't work

### 2. Assess State
- How many episodes are planned ahead? (target: 4+)
- Any analytics data to review in `data/imports/`?
- What is the most valuable action right now?

### 3. Execute Skill
- Pipeline has <4 planned episodes? → Run RESEARCH skill
- Topics ready but no episode plan? → Run EPISODE_PLANNING skill
- New analytics data available? → Run weekly review first

### 4. Log to Journal
- What was done this cycle
- Any notable findings (e.g., "solo episodes get 2x downloads")
- What should happen next

## Weekly Review

### 1. Gather Data
Read latest analytics CSV from `data/imports/podcast-stats.csv`

### 2. Score Against Targets

| Metric | Target | This Week | Status |
|--------|--------|-----------|--------|
| Avg downloads (7-day) | >2,000 | | |
| Completion rate | >65% | | |
| Guest acceptance rate | >50% | | |
| CTA click-through | >4% | | |

### 3. Analyze Wins and Misses
- **Wins:** What worked? Log the pattern to MEMORY.md.
- **Misses:** What went wrong? Log the hypothesis to MEMORY.md.

### 4. Update Memory
Add confirmed patterns to the relevant sections in MEMORY.md.

### 5. Log Weekly Summary to Journal
- Episodes reviewed (count)
- Performance vs targets
- Top insight discovered
- Recommendations for next week

## Monthly Review
- Review trends across 4 weekly reviews
- Flag if targets need adjustment
- Compare month-over-month download growth

## Escalation Rules
- Downloads trending down for 2+ consecutive weeks
- Completion rate drops below 40%
- Guest pipeline has <2 confirmed guests
- A topic idea doesn't fit any audience segment
