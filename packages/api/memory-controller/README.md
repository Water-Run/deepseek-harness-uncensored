# 记忆管理 Remote

`ctx.remote.memory` 命名空间的 Host 端：管理页的读取、带版本校验的写入，以及作用域目录。读取对调用者开放；写入要求应用所有者，避免远端主体改变所有后续对话能看到的内容。

## 方法

- `describe()`：返回实际生效的检索上限、已注册工作区，以及记录中出现过的模式 ID。
- `list(request)`：按范围、类型、状态和文本过滤，按更新时间倒序返回。
- `create(request)`：保存一条记录，来源记为管理页用户输入且已确认。
- `update(request)`：带 `expectedVersion` 的编辑；版本不一致时返回 `memory/conflict`，客户端保留用户输入并提示重试。
- `setStatus(request)`：启用或禁用，同样校验版本。
- `deleteRecord(request)`：永久删除并返回是否确有记录被删除。该 Remote 名称避开框架保留的 `remove` 方法；服务内部方法仍为 `remove`。

## 错误

`memory/conflict` 携带记录 ID 与两个版本；`memory/not-found` 携带请求的记录 ID；`memory/invalid` 与 `memory/unavailable` 携带原因。非所有者调用写入返回 `remote-access/denied`。

## Known Limitations and Deferred Work

- 只提供上述管理方法，不含批量导入、导出或历史版本浏览。
- 删除不做墓碑记录；已删除记录不会出现在后续检索中，但旧 Session 日志中的内容保持原样。
- 页面通过 `api/remotes` 装配；单独挂载本包不会产生任何客户端界面。
