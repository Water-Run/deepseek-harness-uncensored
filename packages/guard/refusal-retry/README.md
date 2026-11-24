# @deepseek-ai/dsh-refusal-retry

A turn-level guard. When a turn is about to stop on a final answer that opens with a refusal, the guard continues the same turn with the next configured arm instead of letting the refusal stand as the answer.

It reads the last `assistant/message` of the session, classifies it, and — for a refusal that issued no tool call — appends `refusal/retry` and steers a labelled continuation through `agent.steer`. The turn therefore keeps one identity: no extra turn boundary, no second user prompt in the transcript.

## Configuration

```yaml
- id: refusal-retry
  name: '@deepseek-ai/dsh-refusal-retry'
  config:
    arms: [1]
    maxPerTurn: 2
    maxPerSession: 6
```

| Field | Default | Meaning |
|---|---|---|
| `arms` | `[1]` | Arm order to escalate through. `1` restates delivery, `2` puts the work in a fiction frame, `3` continues from the artifact the refused answer stopped short of. An empty list disables the guard. |
| `maxPerTurn` | `2` | Continuations allowed before the turn is allowed to end. |
| `maxPerSession` | `6` | Continuations allowed across the whole session. |

## Classification

| Verdict | Condition | Guard action |
|---|---|---|
| `delivered` | no refusal opening, or the answer issued a tool call | none |
| `refused` | refusal opening and the answer is shorter than 500 characters | continue the turn |
| `partial_refused` | refusal opening but the answer still carries adjacent content | none (audit only) |
| `empty_after_retry` | the answer is empty | none (audit only) |

A refusal opening is matched in the first 220 characters of the answer, in either shipped language. Reasoning blocks are ignored: only visible text counts.

## Model Experience

Each continuation is one extra request in the same turn, so it inherits the request prefix the turn already cached; the added cost is the continuation message plus the answer it produces. The guard never fires on an answer that called tools, so tool-driven work pays nothing. `refusal/retry` carries the turn, arm, verdict and refused-answer length, which keeps the extra spend attributable per turn.

## Known Limitations and Deferred Work

- The classifier is a pattern match on the answer's head. A refusal phrased in an unexpected idiom, or one that starts after a long preamble, is not detected and not retried.
- An answer that both refuses and calls a tool counts as delivered; the guard does not try to judge the tool call's intent.
- The guard does not retry provider-level refusals (`stop_reason: refusal`); those never produce an answer to classify.
- `partial_refused` and `empty_after_retry` are recorded but not retried, matching the community edition's 1.7.20 labels.
