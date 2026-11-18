---
kind: upgrade-guide
description: "Workspace file subscriptions coalesce pending change notifications and start observing once the target resolves."
---

# Workspace file change subscriptions

English | [中文](guide.zh.md)

## Change

`workspaceFiles.changes` previously queued observations separately, including observations collected before the target resolved. It now retains one pending refresh for the resolved target. A burst can produce one `change` frame with the current metadata. The subscription still sends `ready` after the native watcher starts.

The built-in preview retains a bounded set of pending notices while reading metadata. Reconnection refreshes the current state. When a new canonical path binds and its notice may have been evicted, preview reads the metadata again.

## Migration

1. After `workspaceFiles.changes` yields `ready`, call `workspaceFiles.stat` for the initial state. This covers changes that occurred before the watch target resolved. The built-in file preview already reads metadata this way.
2. Treat each `change` frame as a refresh of the current metadata. If a consumer counted frames to count writes, use an operation log owned by the writer for that count.
3. Write to a watched file several times before pulling the next frame and confirm the consumer refreshes to the final file state.
