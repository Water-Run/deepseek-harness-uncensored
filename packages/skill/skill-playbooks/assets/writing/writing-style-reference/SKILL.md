---
description: "Collect reference style samples, extract an explicit style card, and write new prose in that voice without copying text. Covers user-supplied samples, author imitation, and pastiche discipline."
whenToUse: "The user asks to match a writing style, supplies sample passages, or wants a project-specific voice held across chapters."
---

# Style reference workflow

## 1. Collect the corpus

Sources, in order of reliability:

1. Passages the user wrote and wants extended.
2. Passages the user supplied as targets ("write like this").
3. Public-domain or licensed text the user is allowed to use as reference.

Store each sample under `story/style/<name>/sample-N.md` with source and date. Never blend two incompatible samples without asking which one wins.

## 2. Extract a style card

Describe the style in operational terms, not adjectives. A style card has six axes:

| Axis | Questions |
| --- | --- |
| Diction | Register (plain, literary, pulp, technical), concreteness, archaism, profanity, jargon |
| Syntax | Sentence length distribution, clause nesting, fragments, parallelism, punctuation habits |
| Rhythm | Paragraph length, beat frequency, where the pauses fall |
| Imagery | Source domains (weather, machinery, domestic, religious), density, whether metaphors are sustained or glancing |
| Dialogue | Beat style, tag frequency, interruption, dialect rendering, subtext density |
| Structure | Scene length, time handling, transitions, chapter openings and endings |

Add two or three **signature moves** — the specific habits a reader would recognize (e.g. "ends paragraphs on a concrete noun", "uses 'and' as the primary connector", "never names an emotion").

A card looks like this:

```markdown
# Style: NAME
## Diction
Plain Anglo-Saxon vocabulary; almost no Latinate abstraction. Profanity sparing.
## Syntax
Mean 14 words. Frequent two-word fragments at emotional peaks. Semicolons absent.
## Rhythm
Paragraphs of 3–5 sentences; one-line paragraph after each turn.
## Imagery
Domestic and bodily; one metaphor per page, never extended.
## Dialogue
Unattributed where possible; beats carry tone; characters answer questions with questions.
## Structure
Scenes open mid-action, close on an image. No chapter epigraphs.
## Signature moves
- Ends scenes on an object, not a statement.
- Uses "and" to chain clauses instead of commas.
- Withholds names until the third mention.
```

Template: `references/style-card.md`.

## 3. Apply the card

- Draft with the card visible; check each paragraph against the axes.
- Imitate *constraints*, not sentences. If a phrase from the sample appears in your draft, rewrite it.
- Write a 300-word calibration sample and compare side by side with the source. Adjust the axis that is off, not the whole voice.
- Keep a "voice check" list of the three signature moves and verify each chapter contains at least two.

## 4. Pastiche versus plagiarism

- Pastiche borrows technique. Plagiarism borrows text. A style card is technique.
- Do not reproduce more than a short quoted phrase from a copyrighted sample; never reproduce a paragraph.
- Do not copy a living author's distinctive sentences or a work's plot. Match register and rhythm, not content.
- If the user asks for an exact continuation of a copyrighted text, write in a compatible voice and say plainly what was matched.

## 5. Multiple styles in one project

- One style per POV or per document type; write the mapping in `story/bible/style.md`.
- Switching style is a deliberate effect: mark the boundary with a scene or chapter break.
- If two narrators share a style, differentiate them by attention and diction, not by punctuation quirks alone.

## 6. Failure modes

| Failure | Repair |
| --- | --- |
| Caricature | Reduce the most visible habit by half |
| Flat imitation | Add the signature moves, not just vocabulary |
| Inconsistent register | Re-read the calibration sample mid-chapter |
| Accidental copy | Diff n-grams of 6+ words against the sample |
| Style overwhelms story | Cut one flourish per page |
