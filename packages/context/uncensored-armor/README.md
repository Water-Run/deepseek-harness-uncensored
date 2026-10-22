# @deepseek-ai/dsh-uncensored-armor

The built-in armor prompt of this build. It mounts the operator's prompt as an ordinary system-prompt section (`uncensored:armor`) instead of injecting a file into built artifacts: the text enters the session log with every other section, replays from that log, and compacts like any other conversation content.

The section sorts ahead of `HARNESS_IDENTITY`, so the operating rules precede the guidance the harness adds afterwards.

## Configuration

```yaml
- id: uncensored-armor
  name: '@deepseek-ai/dsh-uncensored-armor'
  config:
    language: zh
```

| Field | Values | Default | Meaning |
|---|---|---|---|
| `language` | `zh`, `en`, `none` | `zh` | Which shipped armor text to mount; `none` mounts nothing |

`none` leaves the deployment's own persona sections (`personaPrefix` / `personaSuffix`) as the only prompt authorship.

## Model Experience

The armor is a fixed prefix of the system prompt: it is identical across turns, so it costs one cached prompt read and never changes mid-session. Its size is the dominant fixed prompt cost of this build; the text is registered with `interpolate: false`, so `{{` sequences in operator prose stay literal rather than raising an unknown-variable assembly error.

## Known Limitations and Deferred Work

- Only two shipped texts exist. A deployment that needs a third language adds an entry to `ARMOR_TEXT` and the `Config` union together.
