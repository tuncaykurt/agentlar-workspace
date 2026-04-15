# Skill: Research

## Purpose
Find high-potential podcast topics that will maximize downloads and listener retention.

## Serves Goals
- Grow downloads (finding topics people actively search for)
- Retain listeners (finding topics with depth for high completion rates)

## Inputs
- `knowledge/AUDIENCE.md` — listener pain points and language
- `knowledge/STRATEGY.md` — current business priorities
- `journal/` — recent trends and audience signals
- `MEMORY.md` — what topics worked/didn't work before
- `data/imports/` — analytics from past episodes (if available)

## Process
1. Read audience pain points from `knowledge/AUDIENCE.md`
2. Review past episode performance in `data/imports/` to identify patterns
3. Check `MEMORY.md` for proven and failed topic patterns
4. Research trending topics in the niche (using web search if available)
5. Generate 5-7 topic candidates
6. Score each topic on three criteria:
   - **Demand** (1-10): Are people actively looking for this?
   - **Depth** (1-10): Is there enough substance for a full episode?
   - **Fit** (1-10): Does this align with our strategy and audience?
7. Rank topics by combined score
8. For each top topic, write: title idea, one-sentence hook, target audience segment, estimated episode format (solo/interview/panel)

## Outputs
- `outputs/YYYY-MM-DD_podcast_research.md` — ranked topic list with scoring and rationale

## Quality Bar
- Every topic must answer: "why this, why now, why us?"
- At least one topic should be contrarian or unexpected
- At least one topic should be a "proven format remix" (take what worked, apply to new angle)
- No topic without a clear audience segment match

## Tools
- Web search (for trend research)
- Analytics CSV from `data/imports/` (for past performance)

## Integration
- Feeds into EPISODE_PLANNING skill — top topics become episode plans
- Findings logged to journal for other agents to use
