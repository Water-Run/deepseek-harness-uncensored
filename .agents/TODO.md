# 开发进展与待办

更新：2026-10-24 · 最近代码节点：53506223fb

**主要通用功能和四个模式已落地；完整交付还缺保护后端，以及部分真实使用和桌面验收。**

## 一眼看进度

| 模块 | 当前情况 | 主要剩余 |
| --- | --- | --- |
| 独立版本与品牌 | v0.1.0、独立身份/数据目录、黑化图标已有 | 桌面并存、图标缓存、安装升级验收 |
| 对话、旁问、随问 | /side 接续主线、/btw 单次回答、删除与进行中入口已有 | 旁问边界场景、删除后重启实测 |
| 设置与外观 | 五分组、日出日落、模式色、动画、统一下拉已有 | 全页面、窄窗口与屏幕边缘巡检 |
| 余额与额度 | 15 秒刷新、数字滚动、六档限制、暂停续跑已有 | 真实模型跑完整的超限→恢复流程 |
| 四个模式 | 缺省→网安→逆向→写作；手册、案件与写作资料已有 | 资料与记忆联动、写作效果回归；外部逆向引擎需另行接入 |
| 网安代理 | 独立代理、流量查看、未启用提醒已有 | 当前覆盖网页抓取和遵守代理设置的一次性命令；保护联动未完成 |
| 跨对话记忆 | 保存、检索、范围隔离、管理已有 | 来源失效标记、自动提炼与摘要 |
| 输入建议 | 默认关闭、灰字、Tab 填入已有 | 三种输入场景的完整验证与成本测量 |
| 关于与更新 | 来源版本、GitHub 更新检测与分级提醒已有 | 真实下载安装、签名及旧发布路径清理 |
| **生产与域名保护** | **真实执行后端未接入，当前不可用** | 境内域名、正则规则、生产/测试服务器及数据库保护 |

## 还要开发什么

| 工作 | 编号 | 完成后应达到 |
| --- | --- | --- |
| **实现真实保护后端** | [09.01–09.11](requirements/development-checklist.md#group-09) | 工具执行前真正拦截，并支持生产保护等级与测试例外 |
| 接通模式功能 | [04.05.7](requirements/development-checklist.md#group-04)、[10.05–10.06](requirements/development-checklist.md#group-10) | 代理遵守目标保护，案件资料能与记忆联动 |
| 补齐记忆功能 | [13.03](requirements/development-checklist.md#group-13) | 标记已失效来源；自动提炼/摘要有独立开关与额度接线 |
| 清理工程与发布遗留 | [15.06](requirements/development-checklist.md#group-15)、[16.03–16.04、16.07–16.08](requirements/development-checklist.md#group-16)、[17.02、17.06](requirements/development-checklist.md#group-17) | 更新路径、文档、许可、仓库流程和质量检查一致 |

## 已有实现，还要验证什么

| 验收范围 | 编号 | 重点 |
| --- | --- | --- |
| 旁问与删除 | [03.07、03.13](requirements/development-checklist.md#group-03) | 窄屏、无主会话、长上下文；删除后重启 |
| 额度恢复 | [08.07](requirements/development-checklist.md#group-08) | 真实模型超限、等待/手动恢复、原任务续跑 |
| 写作与输入建议 | [12.05](requirements/development-checklist.md#group-12)、[14.02–14.04](requirements/development-checklist.md#group-14) | 续写/文风/长文一致性；主线、旁问、随问及预测费用 |
| 视觉与交互 | [01.03–01.07](requirements/development-checklist.md#group-01)、[04.06、04.11](requirements/development-checklist.md#group-04)、[06](requirements/development-checklist.md#group-06)、[07.07](requirements/development-checklist.md#group-07) | 四模式、深浅主题、小窗口、图标与悬浮卡边缘 |
| 模式与保护确认 | [05.06、05.08、05.10](requirements/development-checklist.md#group-05) | 真实保护开启分支、旧模式残留与能力回归 |
| 运行稳定性 | [17.03](requirements/development-checklist.md#group-17) | 重载、重建和关闭时，确认会话与插件资源是否正确释放 |
| 桌面与并存 | [02.02、02.04–02.06、02.09](requirements/development-checklist.md#group-02)、[17.07](requirements/development-checklist.md#group-17) | 登录/数据隔离、启动重启、安装升级；当前暂不打包安装 |
| 最终总验收 | [00.08](requirements/development-checklist.md#group-00)、[17.01、17.04–17.08](requirements/development-checklist.md#group-17) | 对照原始截图，补跨平台和回放验证，逐项核销 |

## 最近已收尾

- 声明输入：淡色剩余提示、蓝色进度、红色错误，全半角等价。
- 样式：替换全部原生下拉框，补齐思考状态等模式色，修复窄屏设置和记忆弹窗裁切。
- 后端：修复额度续跑、输入预测与接口装配；记忆管理读写限应用所有者。
- 检查：完整构建、相关回归、本地化及持久化兼容性校验已有通过记录；全量质量检查仍见 17.06。

## 分派与查阅

可直接指定原编号，例如“做 09”“验收 08.07”“修 06.08”。Grok、Claude、DS 已结束编辑，当前由 Codex 统一整合。

- [完整编号清单](requirements/development-checklist.md)：所有需求、勾选状态和验收条件；编号全部保留。
- [交接记录](HANDOFF.md)：提交、测试、截图位置与技术细节。
- [原始请求](requirements/original-dsh-requests.md)：最初 32 条消息；后续截图见完整清单末尾。

**当前约束：**仅 main，中文提交并推送；不打包、不安装、不发布。新对话默认缺省，软件保留中英，公开说明集中在 README。

维护时先更新编号清单，再同步本页；验证过程写入交接记录。本页只保留当前进展和剩余工作。
