---
kind: upgrade-guide
description: "Blank conversations restore the new-conversation draft only from the same Workspace."
---

# Workspace draft isolation

English | [中文](guide.zh.md)

## Change

Blank conversations share an unsent new-conversation draft within their Workspace directory. Unbound conversations use a separate slot. Opening another Workspace with no saved Session draft leaves its composer empty. The legacy browser key `dsh.conversation.new` is ignored; existing per-Session drafts keep their original keys and values.

## Migration

1. Copy any unfinished text before upgrading, especially from an unbound conversation. Existing per-Session drafts keep their storage; reopen the original Workspace to restore them. The legacy `dsh.conversation.new` browser entry is retained for recovery, without guessing its Workspace.
2. Copy text explicitly when you want to reuse it in another Workspace.
3. Confirm that switching to an empty conversation in another Workspace leaves its input empty, and returning to the source restores its text and references.
