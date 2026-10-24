---
description: "Keep a long project consistent: the story bible on disk, canon rules, character sheets, timeline, naming, POV and style sheets, plus the audit that catches drift before the reader does."
whenToUse: "A project spans multiple chapters or sessions, or the user reports contradictions, name drift, or forgotten threads."
---

# Continuity and the story bible

Memory in a long project lives in files, not in the transcript. Read the bible before writing; update it after.

## Folder layout

```
<workspace>/story/
  bible/
    premise.md        # one page: premise, theme, tone, genre promises
    characters.md     # per character: wants, wounds, voice, relationships, arc
    world.md          # rules, geography, institutions, technology, costs
    timeline.md       # dated events, causal order, travel times
    canon.md          # hard facts and promises the story cannot break
    style.md          # POV, tense, diction, formatting conventions
    threads.md        # open questions, planted clues, payoffs owed
  chapters/
    ch01.md
  notes/
    research.md
```

Use `writing-continuity/references/story-bible.md` as the starting skeleton; copy it into the workspace and fill it in.

## Canon discipline

- **User's newest statement wins.** When the user contradicts an earlier fact, update the bible immediately and treat the new version as canon. Do not argue with the author about their own world.
- **Record the change, not just the value.** `canon.md` keeps a short "changed on request" note so a later contradiction is traceable.
- **Hard facts vs. soft facts.** Hard: names, deaths, physical rules, timeline anchors. Soft: habits, descriptions, minor geography. Protect hard facts first.
- **Unreliable narration is not license.** A character can be wrong; the world cannot contradict itself without the story noticing.

## Character sheet minimum

```markdown
### NAME
- Role:
- Want (external):
- Need (internal):
- Wound:
- Voice: diction, sentence length, verbal habits, what they refuse to say
- Body: age, build, distinctive physical habits
- Relationships: who they trust, who they fear, who they owe
- Arc: start state → pressure → end state
- Secrets: what the reader does not know yet
```

## Timeline

- Anchor every scene to a day or a relative marker ("three days after the funeral").
- Track travel time and injury recovery; these are the two most common silent contradictions.
- Keep a causal chain, not just dates: event → consequence → next event.
- When two scenes conflict, prefer the one the reader has already seen and repair the other.

## Naming

- Maintain a name list with pronunciation and roles. Avoid names that start with the same letter in the same scene.
- Titles, ranks, and forms of address are canon; a character who becomes "Mr. Hale" mid-book needs a reason.
- Place names follow one naming logic per culture; note the logic in `world.md`.

## Style sheet

- POV and tense per chapter type.
- Dialogue punctuation and formatting (dashes, ellipses, italics for thought).
- Chapter heading format, scene-break marker, front/back matter.
- Spelling variant (US/UK) and unit system.
- Explicit-content level and how it is signaled, if the project signals it.

## Continuity audit

Run before delivering a chapter and before a long gap:

1. Read `canon.md`, `threads.md`, and the previous chapter's last page.
2. List every proper noun in the new chapter; check each against the bible.
3. Check timeline arithmetic and physical continuity (weather, injuries, objects carried).
4. Check that planted threads are either advanced or deliberately parked.
5. Check voice: would the previous chapter's narrator write this sentence?
6. Update the bible with everything new.

## Handing off to a new session

Write a `story/notes/session.md` with: current chapter, last scene's end state, open threads, next intended beat, and any canon changes from this session. That file is the first thing to read next time.
