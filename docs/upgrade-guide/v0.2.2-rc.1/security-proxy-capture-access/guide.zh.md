---
kind: upgrade-guide
description: "读取网安代理的捕获流量需要应用所有者身份。"
---

# 读取网安代理捕获流量需要所有者身份

[English](guide.md) | 中文

## 变更

受委派的 Remote 对端此前可通过 `securityProxy/list` 和 `securityProxy/detail` 读取捕获流量。现在两种方法均要求应用所有者身份。受委派对端仍可通过 `securityProxy/get` 查询代理状态。捕获 URL 会在存储前遮盖已识别的密钥查询字段。

## 迁移

1. 需要显示连接状态的委派客户端改用 `securityProxy/get`。需要读取捕获流量时，由应用所有者连接调用 `securityProxy/list` 和 `securityProxy/detail`。
2. 确认委派对端调用任一捕获读取方法时返回 `security-proxy/owner-required`，且所有者仍能打开捕获记录。
3. 按路径和非密钥字段匹配捕获 URL。确认原始请求仍能到达目标，且捕获记录已遮盖已知密钥值。
