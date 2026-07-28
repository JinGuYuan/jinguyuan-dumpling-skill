# 真实排队动作参考

本文仅用于在线取号、查本人排队订单和取消本人排队。门店当前总排队、历史事实、到店建议和取号渠道咨询仍调用 MCP，不启动授权。

## 命令

需要 Node.js 18 或更高版本，无需安装依赖。每次以实际帮助输出为准：

```bash
node <skill_dir>/scripts/jgy.cjs queue --help
node <skill_dir>/scripts/jgy.cjs queue index <shopId>
node <skill_dir>/scripts/jgy.cjs queue take-number <shopId> --people-count <N> --table-type-id <ID> --confirm
node <skill_dir>/scripts/jgy.cjs queue order-detail <shopId>
node <skill_dir>/scripts/jgy.cjs queue order-cancel <shopId> --confirm
node <skill_dir>/scripts/jgy.cjs queue auth-start
node <skill_dir>/scripts/jgy.cjs queue auth-status
node <skill_dir>/scripts/jgy.cjs queue auth-poll --background [--qr-image-path <path>]
node <skill_dir>/scripts/jgy.cjs queue logout
```

**发起授权用 `auth-start`**：一条命令拿到授权链接 + 二维码 + 后台轮询，与业务命令触发的授权流程完全一致。**不要**单独跑 `auth-poll --background` 来发起授权——它只启动后台监听，不生成链接和二维码。

Agent 对话中**不要**使用阻塞式 `auth-poll` / `auth-poll --wait`（会长时间占住 Terminal，用户看不到授权链接与二维码）。`AUTH_REQUIRED` 时后台通常已在轮询，展示后用 **`auth-status`** 短查即可。

CLI 在 stdout 输出单个 JSON 对象：`{ ok, code, message, data? }`。不要把内部命令名或返回码原样告诉用户，除非排查 MCP/CLI 合同确实需要。

## 门店

| 门店 | `shopId` | 真实动作约束 |
|---|---:|---|
| 北邮总店 | `4211342` | 可查桌型、取号、查本人订单、取消 |
| 五道口店 | `1756895741` | 通常以到店取号为主；只有本轮 MCP 新鲜快照或 `index 1756895741` 明确显示 `supportQueue: true` 时，才可说明当天开放并继续取号确认流程 |

用户未说门店时先追问，不猜 `shopId`。

`AUTH_SUCCESS` 本身不包含门店。若本轮只是 `auth-start` / “只授权”，只报告授权成功后结束，不追问下一步，也不从记忆、旧任务或其他 Skill 推断门店。仅当授权由本轮明确业务命令触发时，才恢复该原命令；合法门店只采用上表映射或该原命令已有的 `shopId`。

## 桌型与确认

1. 取号前先运行 `index`，只使用其 `data.tables[]` 返回的 `tableTypeId`、`tableTypeName`和 `capacity`。
2. 用户同时说人数和桌型时，将自然语言桌型匹配到返回的标准桌型；不把“大的”“两人桌”等原话当作 ID。
3. 只说人数时，按 `capacity.min/max` 筛选：唯一匹配可作为建议，多个匹配列出后请用户选择。只说桌型时，追问就餐人数。
4. 在运行 `take-number` 前，明确复述门店、人数和标准桌型，必须取得用户对本次真实取号的明确确认，再带 **`--confirm`** 执行。没有 `--confirm` 时 CLI 返回 `CONFIRM_REQUIRED`，**不会**取号。
5. 在运行 `order-cancel` 前，先用 `order-detail` 说清待取消的订单，必须取得用户明确确认后，再执行 `order-cancel <shopId> --confirm`。

之前对话中的宽泛意向不等于本次动作确认。**授权成功也不等于确认取号或取消**——授权成功后应重新展示桌型/订单并再问一句「确认取号/取消吗？」，用户答应后再带 `--confirm`。

## 授权状态

`AUTH_REQUIRED` 可能是新授权流程，也可能是业务缓存 Token 过期后仍未拿到新授权链接；不能假定其 `data` 一定包含 `authLink`。

收到 `AUTH_REQUIRED` 后：**阶段 A 内联图 + 链接** → **阶段 B `auth-status`**。后台用 `~/.jinguyuan/auth-poll-current.json` 指向本次 run 的独立状态文件；Agent 只需调用 `auth-status`，不要自行读取或改写状态。

1. **有 `authLink`**
   - **图**：`data.authRunId` 标识本次授权；`data.qrImagePath` = **绝对路径**（文件直接在工作区根目录，形如 `jinguyuan-auth-qr-<authRunId>.png`，非隐藏、无子目录）；可选 `qrImagePathRelative`。**不要**用 `~/.jinguyuan`，也不要猜固定文件名。
   - **阶段 A（对齐 V1）**：
     1. 有图时：`Read` 绝对路径 PNG，并在主气泡正文写 `![美团授权二维码](<绝对路径>)`（推荐直接贴 `userReplyMarkdown`）。
     2. ⚠️ 仅 Read / 仅附件侧栏 / 步骤卡「已展示」**不算**——用户扫不到码。
     3. **链接必含**（可点 + 明文 URL）；云端主通道是 https。
   - **阶段 B**：告知用户授权后稍候；宿主若未自动继续，用户可回复“已授权”。收到回复后执行 `auth-status`，再继续原任务。部分宿主能自动续跑，部分不能，禁止说“无需回复”或保证一定自动通知；禁止 `auth-poll --wait`。
2. **无 `authLink`**：`logout` 后仅成功才重跑。

Token：`~/.jinguyuan/passport-auth.json`（与二维码目录分离）。不展示 Token。

## 返回码与处理

| `code` | Agent 处理 |
|---|---|
| `HELP` | 读取当前命令和 Node.js 要求 |
| `QUEUE_INDEX` | 展示门店是否支持排队、桌型容量、等待桌数和已有订单；等待桌数不换算成准确分钟 |
| `QUEUE_NUMBER_TAKEN` | 明确告知取号成功，转述排队号、桌型和订单状态 |
| `CONFIRM_REQUIRED` | 缺用户确认或未带 `--confirm`：复述门店/人数/桌型（或待取消订单），请用户明确确认后再执行带 `--confirm` 的命令；**不要**静默重试原命令 |
| `QUEUE_ORDER_DETAIL` | 只将本人订单数据作为个人进度，不用门店总排队替代 |
| `QUEUE_CANCELLED` | 明确告知已取消的订单 |
| `AUTH_REQUIRED` | 主气泡展示链接/图；说明若未自动继续可回复“已授权”，收到回复后用 `auth-status` |
| `AUTH_POLL_STARTED` | 后台轮询已启动；继续展示（若未展示）并用 `auth-status` |
| `AUTH_PENDING` / `AUTH_SUCCESS` | pending 则稍后重查；仅本轮明确业务命令触发授权时才续跑，单独授权成功后直接结束 |
| `AUTH_STATUS_NONE` | 无后台记录；用 `auth-start` 重新触发授权 |
| `AUTH_CANCELLED` / `AUTH_RISK_DENIED` / `AUTH_TIMEOUT` | 终止授权，说明原因；不执行原业务命令 |
| `QUEUE_ORDER_EXISTS` | 说明已有订单，可先查本人进度；不重复取号 |
| `QUEUE_ORDER_NOT_FOUND` | 说明当前没有本人排队订单 |
| `QUEUE_UNSUPPORTED` / `QUEUE_NOT_NEEDED` | 说明门店不支持在线排队或当前无需排队，不强行取号 |
| `TABLE_NOT_FOUND` / `TABLE_CAPACITY_MISMATCH` | 使用返回的桌型列表重新选择，或请用户调整人数/桌型 |
| `INVALID_ARGUMENTS` | 重读 `--help`，修正参数；不重试原样错误命令 |
| `UNSUPPORTED_NODE_VERSION` | 说明需要 Node.js 18+ |
| `PASSPORT_FAILED` / `QR_CLEANUP_FAILED` | 说明授权服务或二维码清理失败，不暴露内部输出 |
| `HTTP_ERROR` / `INVALID_RESPONSE` / `REQUEST_TIMEOUT` / `NETWORK_ERROR` | 告知外部服务或网络异常，可稍后重试；有 `traceId` 时可用于排查 |
| `QUEUE_INDEX_FAILED` / `QUEUE_CREATE_FAILED` / `QUEUE_ORDER_DETAIL_FAILED` / `QUEUE_CANCEL_FAILED` / `QUEUE_API_ERROR` / `CLI_FAILED` | 按 `message` 说明操作未完成；取号/取消结果不明时，先用 `order-detail` 或美团 App 核实，不盲目重复动作 |
| `LOGOUT_SUCCESS` | 说明已清除本地授权 |

## 退出码

| 退出码 | 含义 |
|---:|---|
| `0` | `ok: true` |
| `2` | `AUTH_REQUIRED` 或 `AUTH_PENDING`，需继续授权 |
| `1` | 其他失败 |
