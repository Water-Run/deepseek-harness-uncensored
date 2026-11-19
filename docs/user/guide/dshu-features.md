---
description: "Look up DSHU features by their controls, including deletion, forking, workspaces, side questions, quick questions, balance, limits, defaults, and recovery."
---

# DSHU feature reference

English | [中文](dshu-features.zh.md)

## Summary

Find each feature by its entry point and see what it does to your data. This reference describes the current source. For an installed build, check the version and commit in About and consult the [development checklist](../../../.agents/TODO.md) for delivery and acceptance records. For initial setup and workflows, see the [DSHU user guide](dshu.md).

## Table of contents

- [Conversations and workspaces](#sessions)
- [Side questions, quick questions, and the composer](#composer)
- [Balance, fees, and limits](#usage)
- [Modes, materials, tools, and memory](#modes-tools)
- [Settings, data, and recovery](#settings-data)

<a id="sessions"></a>
## Conversations and workspaces

| Feature | Entry point and behavior |
| --- | --- |
| Create a conversation and pick a workspace | Use New Session in the sidebar. Select an existing workspace, add a directory, or work without a workspace. Search the workspace picker by name or path. |
| Search and filter | Use the search and filter controls near the Workspaces heading. The list can hide archived conversations, show all, or show only archived conversations. Follow the shortcuts displayed in the interface. |
| Rename and copy the ID | Right-click the conversation row or open its ellipsis menu. You can assign a title and copy the full ID to identify the conversation. |
| Pin and drag | Pinned conversations appear first. Drag ordinary conversations within their group to reorder them. Dropping across the pinned boundary shows feedback. Manual and recent-activity sorting are separate. |
| Archive and undo | Choose Archive in the conversation menu. With work running, the UI asks whether to stop it. Use the archive filter to find and unarchive the conversation. |
| **Delete a conversation** | Choose Delete conversation and confirm Stop and delete. Related work stops before the app permanently removes the conversation and its owned side questions, quick questions, and delegated conversations. Independent forks and workspace files are kept. Follow the dialog to retry a failure. |
| Fork from a conversation or message | The conversation menu starts from the latest completed turn. The message action creates an independent conversation at the selected point. If you switch away during creation, open the branch from the notification. |
| Remove a workspace | Use the workspace menu. Removing the group leaves its conversations under Ungrouped. Use the collapse control by the group name to hide its rows. |
| Active tasks | Sidebar statuses distinguish waiting for approval, plan review, and an answer. The desktop menu for running sessions can locate an active task. See the [scheduled tasks guide](schedule.md) for scheduled work. |

Before deleting, check the selected title and the warning about related conversations. Use Archive when you want to hide a conversation and reopen it later. Cross-conversation memory has its own management controls. See [deletion and forking behavior](../../../packages/api/session-controller/README.md).

<a id="composer"></a>
## Side questions, quick questions, and the composer

| Feature | Entry point and behavior |
| --- | --- |
| Open a side question | Use the conversation header button, Side question on the right start page, or send `/side`. Send `/side question` to open it and send the question together. |
| Side-question context | Each question sees completed progress from the main conversation and keeps its own exchange. The main conversation can consult the side question when needed. |
| Side-question attachments | Add images through the side composer. Image understanding depends on support in the selected model. |
| Clear a side question | Send `/clear` inside the side question. Closing keeps its history by default. General settings can clear it on close. |
| Quick question | Send `/btw question` in the main composer. The brief reply appears in that conversation with no new ordinary sidebar conversation. |
| References and attachments | Type `/` for available commands and `@` for file or conversation references. Use the add button to attach a file. |
| Send during work | The composer remains available during a run. Adjust the busy-send behavior in General settings or use Stop in the current conversation. |
| Input prediction | Enabled by default. The main, side, and quick composers predict their drafts separately. Press Tab to insert a suggestion, then decide whether to send it. Prediction uses the model and can incur charges. |
| Right-side tools | Open workspace files, a terminal, or a side question from the right start page. More tools displays available entries from the active configuration. Follow the displayed shortcuts. |

<a id="usage"></a>
## Balance, fees, and limits

| Feature | Entry point and behavior |
| --- | --- |
| Account balance | Open Settings → Budget or the sidebar balance card. Live balance and local history are available. Sampling defaults to 15 seconds with a 3-second minimum setting. You can also refresh immediately. |
| Inspect a time point | Hover, tap, or focus the chart and use the arrow keys to read a sample time and amount. A vertical dashed line shows an increase. A horizontal dashed line shortens a long flat interval. |
| Conversation cost | Click the amount beneath the composer to expand the estimated cost and its chart. Account balance and conversation cost have separate displays. |
| Spending windows | Each of the six windows has independent enable, amount, and reset controls. All start off. The 5-hour and 7-day windows appear first, with the others expandable. |
| Inspect limit use | Open the footer limit indicator for the progress of each enabled window. Adjust, disable, or reset a window in Budget settings. |
| Pause and resume | On exhaustion, the banner shows the reason, available recovery time, and shortcuts. Automatic resume starts off. When enabled, paused tasks can continue when budget becomes available. |

Resetting local statistics affects limit calculations. Follow the corresponding records for provider charges, top-ups, grants, and balance changes. See the [cost and limits guide](dshu.md#spending).

<a id="modes-tools"></a>
## Modes, materials, tools, and memory

| Feature | Entry point and behavior |
| --- | --- |
| Choose and identify a mode | Choose Default, Security, Reverse Engineering, or Writing before the first send. Existing conversations are locked by default. Settings can allow an idle conversation to switch. The title marker and sidebar stripe show the mode. |
| Mode guides and configuration | Use Settings → Modes to read documentation, see examples, or change configuration. In Writing, subsequent requests use the selected style references and settings. |
| Optional protection and audits | Security settings show the independent proxy, its reminder, and optional execution-protection coverage. Protection starts off. Settings show the enabled providers and redacted audit records. |
| Bundled REA and plugins | Check the REA connection and individual engine status in Reverse Engineering settings. Browse, search, and manage plugins in Settings. For engine setup and platform requirements, see [tool integration](dshu.md#tools). |
| Cross-conversation memory | Use memory management to find, edit, disable, or remove scoped records. Automatic extraction starts off. |

<a id="settings-data"></a>
## Settings, data, and recovery

| Feature | Entry point and behavior |
| --- | --- |
| Work steps and usage | General settings configure step expansion, collapse timing, and usage detail. New configurations expand steps, collapse them on the next message, and show detailed usage. |
| Official API log option | Session Log upload in General applies only to the official model API. New configurations enable it; existing settings take precedence. |
| Appearance | Choose light, dark, system, or sunrise and sunset. Each mode has its own accent color to identify the current task. |
| About and versions | About shows WaterRun, DSHU and DSH versions, build information, source, and the REA origin. Check both the version and commit for multiple builds on one day. |
| Backup and uninstall | DSHU uses `~/.dsh-uncensored` for its own data by default. Keep a backup before updating and select the appropriate data-retention or cleanup option when uninstalling. See [data, updates, and recovery](dshu.md#data). |

For initial setup, return to the [user guide](dshu.md). See the [first-release handoff](../../../.agents/requirements/windows-x64-first-release.md) for candidate acceptance and publication.
