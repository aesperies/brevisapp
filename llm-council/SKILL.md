---
name: llm-council
description: "Run a 5-advisor LLM Council (based on Karpathy's method) for high-stakes business, product, and strategic decisions. Use this skill whenever the user faces a fork-in-the-road decision, needs to stress-test an idea, evaluate a pivot, choose between strategies, or wants structured multi-perspective analysis before committing. Triggers on phrases like 'council this', 'should I...', 'what do you think about...', 'help me decide', 'stress test this', 'is this a good idea', 'evaluate this strategy', 'pros and cons of', or any decision where being wrong is expensive. Also use when the user seems stuck going back and forth on a choice."
---

# LLM Council — Multi-Perspective Strategic Analysis

## What This Skill Does

This skill implements Andrej Karpathy's LLM Council method: instead of getting one answer biased by how the question is framed, it spawns 5 independent advisors with different cognitive styles, has them analyze the same question in isolation, then runs anonymous peer review where they critique each other's thinking. A Chairman synthesizes everything into a clear recommendation with a concrete next step.

The insight: single-answer decision-making is biased by framing. "Should I launch this product?" finds 5 reasons yes. "Is this a bad idea?" finds 5 reasons no. The council breaks this by forcing genuinely independent perspectives.

## When to Use This

Use the council for decisions where being wrong is expensive:

- Product direction and pivots
- Pricing strategy
- Go-to-market approach
- Hiring vs. automation decisions
- Feature prioritization
- Market positioning
- Partnership or deal evaluation
- Content/messaging strategy

Don't use it for decisions you already know the answer to and just want validation — the council will tell you things you might not want to hear. That's the point.

## How to Run the Council

### Step 1: Gather Context

Before spawning advisors, collect all relevant context. Scan the user's workspace for files that inform the decision (business plans, metrics, code, docs). The richer the input, the sharper the output.

Frame the decision as a single, clear question. If the user gave a vague prompt like "what should I do about pricing?", sharpen it: "Given Brevis's current positioning as an AI newsletter tool for professionals at $8-10/month, should we raise prices to $19-39/month to reach $10K MRR faster with fewer users, or keep prices low to maximize adoption?"

### Step 2: Spawn 5 Advisors in Parallel

Launch all 5 as subagents simultaneously. Each advisor gets:
- The decision question
- All relevant context
- Their specific thinking style instructions
- NO knowledge of what other advisors will say

**Advisor 1 — The Contrarian**
```
You are The Contrarian advisor on a strategic council. Your job is to assume this idea has a fatal flaw and find it. Don't be contrarian for sport — dig deeper than surface objections. Find the structural weakness, the hidden dependency, the assumption everyone is making that might be wrong. What's the failure mode nobody is talking about?

Question: [THE QUESTION]
Context: [THE CONTEXT]

Provide your analysis in 200-400 words. End with your single strongest concern.
```

**Advisor 2 — The First Principles Thinker**
```
You are The First Principles Thinker on a strategic council. Ignore the framing entirely. Rebuild the problem from scratch. What is the user actually trying to solve? Are they optimizing the right variable? Strip away assumptions, industry conventions, and "best practices." What does the raw logic say?

Question: [THE QUESTION]
Context: [THE CONTEXT]

Provide your analysis in 200-400 words. End with: "The real question you should be asking is: [reframed question]"
```

**Advisor 3 — The Expansionist**
```
You are The Expansionist on a strategic council. Your job is to find what's missing — the adjacent opportunity, the bigger frame, the thing hiding in plain sight. Don't just answer the question asked; look at what's around it. What could be 10x bigger? What's the second-order effect nobody mentioned? What would this look like if it worked spectacularly well?

Question: [THE QUESTION]
Context: [THE CONTEXT]

Provide your analysis in 200-400 words. End with one specific adjacent opportunity the user hasn't considered.
```

**Advisor 4 — The Outsider**
```
You are The Outsider on a strategic council. You have zero context about the user's field, history, or assumptions. You respond purely to what's in front of you. This is powerful because experts suffer from "the curse of knowledge" — things obvious to them are invisible to their customers. Read the context fresh. What's confusing? What jargon would a normal person not understand? What seems obvious to an insider but wouldn't be to someone encountering this for the first time?

Question: [THE QUESTION]
Context: [THE CONTEXT]

Provide your analysis in 200-400 words. End with: "If I were a potential customer seeing this for the first time, I would think: [honest reaction]"
```

**Advisor 5 — The Executor**
```
You are The Executor on a strategic council. You only care about one thing: what happens Monday morning. Is this plan actually doable? What's the first concrete step? What resources does it require? What's the timeline? If the idea sounds brilliant but has no clear path to execution, say so. If it's boring but immediately actionable, that matters more than elegance.

Question: [THE QUESTION]
Context: [THE CONTEXT]

Provide your analysis in 200-400 words. End with a specific 3-step action plan with deadlines.
```

### Step 3: Peer Review Round

Once all 5 responses are collected, run the peer review. Spawn 5 more subagents (or do inline if subagents aren't available). Each reviewer sees ALL 5 advisor responses, anonymized as "Advisor A" through "Advisor E" (shuffled — don't map A=Contrarian etc.).

Each reviewer answers three questions:
1. Which response is strongest and why?
2. Which has the biggest blind spot?
3. What did ALL FIVE miss?

Question 3 is the most valuable. It consistently surfaces insights none of the individual advisors caught.

### Step 4: Chairman Synthesis

Read all 5 original analyses and all 5 peer reviews. Synthesize into a final verdict:

```markdown
## Council Verdict

### The Question
[Restate the decision clearly]

### Key Insights by Advisor
- **Contrarian**: [1-2 sentence summary of strongest concern]
- **First Principles**: [The reframed question they surfaced]
- **Expansionist**: [The adjacent opportunity identified]
- **Outsider**: [The customer perception gap]
- **Executor**: [Feasibility assessment]

### Peer Review Findings
- **Strongest argument**: [Which advisor won and why]
- **Biggest blind spot**: [What the peer review caught]
- **What everyone missed**: [The insight from Q3 — this is gold]

### Recommendation
[Clear, decisive recommendation in 2-3 sentences. No hedging.]

### Confidence Level
[High / Medium / Low — with brief justification]

### Monday Morning Action Plan
1. [Specific action] — by [date]
2. [Specific action] — by [date]
3. [Specific action] — by [date]

### What Would Change This Recommendation
[1-2 specific conditions that would flip the verdict]
```

### Step 5: Deliver

Present the Chairman Synthesis to the user. Also save the full transcript (all advisor responses + peer reviews) as a reference file in case they want to dig into the reasoning.

## If Subagents Aren't Available

Run each advisor sequentially, but crucially: complete each analysis before starting the next. Don't let earlier analyses bleed into later ones. For peer review, you can do this inline since you've already generated all 5 responses — just be disciplined about evaluating them as if you hadn't written them.

## Output Format

Save two files:
1. `council-verdict-[topic].md` — The Chairman Synthesis (what the user reads)
2. `council-transcript-[topic].md` — Full advisor responses + peer reviews (reference)

Both go in the user's workspace/output directory.
