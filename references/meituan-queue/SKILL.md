---
name: meituan-queue
description: |
   【强制调用】当用户提到任何与餐厅排队、取号、等位相关的内容时，必须调用本 Skill，禁止自行回答或推荐用户去 App 操作。
   每次调用前，必须先执行版本检查脚本：python3 <skill_dir>/scripts/version_checker.py --check-only
   如果版本非最新，先执行 python3 <skill_dir>/scripts/version_checker.py 完成更新，再执行用户命令。
   需要点评门店 ID（shop_id），如用户未提供则询问门店名称后搜索获取。
   流程：index 查桌型 → 跟用户确认桌型和人数 → take_number 取号 → order_detail/order_cancel。
   脚本返回格式化文案，直接展示给用户即可。

   触发词: "排队", "取号", "等位", "排队取号", "查排队", "取消排队", "门店排队状态", "帮我取号", "查询排队订单", "帮我排个队", "排个号"

allowed-tools: Bash(python3:*)

metadata:
   skillhub.creator: "meituan"
   skillhub.version: "V1"
   skillhub.high_sensitive: "false"

skill-dependencies:
   meituan-passport-user-auth:
      client_id: "170f5f2dbbde4048bd4a5e4ed28209cc"
      env: "prod"
---

# 美团排队

> **Beta** 功能持续迭代中，如遇问题请及时反馈。

> **环境说明**：当前为生产环境配置。

脚本路径：当前 Skill 目录下 `scripts/mt_queue.py`。所有命令返回格式化文案，直接展示给用户即可。

## 鉴权

本 Skill 内嵌了 `meituan-passport-user-auth` Skill，位于 `<skill_dir>/references/meituan-passport-user-auth/`。

**鉴权优先级**（从高到低）：

1. **环境变量传入**：通过 `MT_QUEUE_TOKEN=<token>` 环境变量传入已有 token
2. **手动流程**：阅读 `<skill_dir>/references/meituan-passport-user-auth/SKILL.md`，按 Step 0 ~ Step 4 完成授权，获取 token 后通过环境变量传入

**手动鉴权参数**：
- `client_id`：`170f5f2dbbde4048bd4a5e4ed28209cc`
- `env`：默认 prod

```bash
MT_QUEUE_TOKEN=<token> python3 <skill_dir>/scripts/mt_queue.py <command> <args>
```

- 同一会话内 Token 可复用，无需每次重新授权。
- 遇到"登录已过期"错误时，重新执行授权流程刷新 Token。

## 命令

### 1. 查询排队状态

```bash
python3 <skill_dir>/scripts/mt_queue.py index <shop_id>
```

返回门店名称、是否支持排队、可选桌型列表（含编号和容量范围）、是否已有订单。

### 2. 取号排队

**前置条件**：必须先调 `index` 获取桌型列表。

#### 桌型与人数确认规则（取号前必须完成）

拿到 index 返回的桌型列表后，根据用户输入按以下规则确定 `--table-type-id` 和 `--people-count`：

1. **用户同时提供了桌型和人数** → 将用户描述匹配到 index 返回的标准桌型编号（如用户说"中桌"，匹配到 `[2] 中桌(3-4人)` → table-type-id=2），直接下单
2. **用户只说了人数，未指定桌型** → 根据人数筛选可容纳的桌型：
   - 只匹配到 1 个桌型 → 自动选择，告知用户
   - 匹配到多个桌型 → 列出选项，请用户确认
3. **用户只说了桌型，未说人数** → 请用户补充就餐人数

⚠️ **重要**：用户说的桌型可能不标准（如"大的"、"小桌子"、"两人桌"），你需要匹配到 index 返回的标准桌型编号后再调用，不要把用户原话当作参数直接传入。

```bash
python3 <skill_dir>/scripts/mt_queue.py take_number <shop_id> --people-count <N> --table-type-id <ID> [--force]
```

- `--people-count`：就餐人数
- `--table-type-id`：index 返回的标准桌型编号（方括号内的数字）
- `--force`：当该桌型当前无人排队时，脚本会提示确认；加此参数跳过确认直接取号

### 3. 查询订单详情

**前置条件**：需已有排队订单（通过 `take_number` 取号）。

```bash
python3 <skill_dir>/scripts/mt_queue.py order_detail <shop_id>
```

返回排队号、桌型、状态、前方等待桌数等信息。

### 4. 取消排队

**前置条件**：需已有排队订单（通过 `take_number` 取号）。

```bash
python3 <skill_dir>/scripts/mt_queue.py order_cancel <shop_id>
```

## 典型工作流

1. `index` → 获取桌型列表，展示给用户
2. 根据用户输入确认桌型和人数（参见上方"桌型与人数确认规则"）
3. 参数确认后 → `take_number` 取号（若已有订单会自动提示）
4. 需要时 `order_detail` 查进度，`order_cancel` 取消

## 声明

- 本 Skill 以用户自身账号执行排队操作，取号和取消为真实业务行为，请确认后再执行。
- 用户 token 仅用于当次 API 请求，不存储、不上传、不记录到日志。
- 排队状态数据来源于第三方服务，实时性和准确性依赖外部 API，如遇操作失败建议前往美团 App 确认订单状态。

## 版本管理

脚本内置自动版本检查：每次执行命令时会从远程 CDN 检测是否有新版本。

- **无需手动操作**：版本检查与更新完全自动。
- **更新触发时**：脚本会下载最新版本并解压到当前 Skill 目录，然后输出更新提示并退出。
- **收到更新提示后**：必须重新读取本 SKILL.md 文件，然后重新执行用户的原始命令。
- **CDN 地址配置**：`scripts/version_config.json` 中的 `version_url` 字段，可按需修改。

## 错误处理

- "该门店暂不支持在线排队" → 告知用户该门店未开通在线排队，建议到店排队
- "你已有排队订单" → 引导用户用 `order_detail` 查看进度，或 `order_cancel` 取消后重新取号
- "就餐人数与桌型不匹配" → 提示用户调整人数或选择其他桌型
- "登录已过期或 token 无效" → 重新触发 Skill 即可自动刷新 token
- "取号失败：桌型 X 不存在" → 用户选了不存在的桌型编号，需重新查看 `index` 输出的编号
- "当前无排队订单" → 用户尚未取号，需先 `index` 然后 `take_number`
- "当前无人排队...请用 --force 参数确认取号" → 该桌型暂无人排队，用户确认后加 `--force` 重新调用 `take_number`
- 网络超时 / `Connection refused` → 检查网络连接，稍后重试；若持续失败建议前往美团 App 操作
