# Frida 退出问题的版本对照

用户恢复 Goal 并要求继续推进到可发布。本次只对照现有两个自建目标场景，没有扩大完整回归范围。当前已安装及已发布版本仍为 2026.11.17.4，Frida 保持 17.23.2；候选原生包未写入安装目录或项目锁文件。

## 已确认的事实

[17.25.1](https://frida.re/news/2026/11/01/frida-17-25-1-released/) 修复 Windows 进程退出期间注入模块的处理，[17.26.4](https://frida.re/news/2026/11/16/frida-17-26-4-released/)另修模块注册表及 CRT 查找死锁。这些是选择候选的依据，不等于已经证明本机故障根因。

两个候选均通过原暂停目标场景，未留下目标进程；附加场景的功能断言和目标退出码 0 也通过，但移除私有测试目录时稳定出现 EBUSY。原 17.23.2 附加对照通过。增加有限删除重试、等待下一事件循环均未解决，相关尝试已撤回，没有延长退出断言或忽略清理失败。

发生清理失败时，Windows Restart Manager 未报告该目标文件占用者；同时观测到 Node 测试进程仍列有目标 ProcessWrap。该信息不足以归因于病毒扫描、Frida 或 Node，也不证明释放全部完成。当前不能将候选升级记为通过。所有测试只操作自建夹具，没有附加用户进程。

## 持久修正与下一步

夹具初始化或行为断言失败后，后续清理错误现在以 AggregateError 保留两者，避免覆盖原始失败。临时诊断输出、私有路径、重试次数和事件循环等待均已撤回。失败证据保留，不把单个成功场景替代整组验收。

Frida 更新仍为发布验收中的未决项。下一步需要定位目录句柄的持有者或取得上游对应修复；其他独立发布工作继续推进，不重复同一组无信息增量的测试。

材料位于 `%USERPROFILE%/DSHU-Deliveries/20261117/frida-runtime-update/`。`windows-old-binding-control.log` 是旧版本附加对照；`windows-candidate.log`、`windows-17.25.1.log` 是候选结果；`windows-native-lock-holder.log`、`windows-live-cleanup-processes.log` 是清理时观测。17.26.4 Windows 官方资产 SHA-256 为 `732c34ff3b86d0fa5769c00192b4b95ab6c90378e92ecdd0952ffeac54c57861`，17.25.1 为 `32f53639e55d9b492ad7b6c22fa889da4817a4a921e6593759d6c7c0b57a37d1`，均与 GitHub 发布摘要一致。
