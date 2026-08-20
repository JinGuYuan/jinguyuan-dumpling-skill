# 排队类回答合同

排队相关查询返回体带结构化字段。Agent **优先读这些字段**，不要只读中文自然语言说明。

## 字段

| 字段 | 含义 |
|------|------|
| `mainScenario` | 主场景（如 `currentQueueStatus` / `plannedVisitQueueReference` / `businessHours` / `queueActionBoundary` / `queuePeriodFacts` / `queuePeriodAdvice` / `askVisitTime`）。据此定回答骨架。 |
| `atoms` | 语义原子（如 `partySizeTarget` / `tableTypeTarget` / `plannedVisitReference` / `beforeOpen` / `afterClose`）。 |
| `answerTarget` | 应优先回答的数据位置，例如 `{ type: 'matchedQueueTarget', field: '…等待桌数' }` 或 `{ type: 'plannedVisitReference', field: '历史参考.selectedReference' }`。 |
| `replyPolicy` | `requiredPoints`（必答）、`forbiddenPoints`（禁答）、`followUpQuestion`、`nextSuggestedQuestion`、`linkRequired`。 |
| `当前排队状态.门店[].数据是否新鲜` | 当前快照能否作为实时事实。只有 `true` 才能回答当前等待桌数；`false` 时只说明 `最近采集时间` 和当前状态无法确认，`最后一次记录` 仅供回看。 |
| `selectedReference` | 计划到店历史参考中应优先说的那一条；**上周同日优先于前一天**。一句话建议读它；不要把前一天和上周同日加权 / 平均 / 取最保守后说成唯一结论。表格可两条都展示。 |
| `_agent_instruction` | 给 Agent 的内部指令，**不要原样展示给用户**。 |

## 协议摘要

`queue/query` 和 MCP `get_queue_info` 使用同一份 `queue-status.v2` 机器字段。Skill 只需把这些字段当作事实边界，不需要在客户端复制营业日历：

- `schemaVersion`：协议版本。
- `businessDate` / `timeZone`：北京时间业务日期和时区。
- `businessHours`：官方营业时间边界；它不是到店建议，也不代表线上取号已经开放。
- `specialDay`：立冬、冬至等特殊日期；普通日为 `null`。
- `status`：`fresh`、`stale`、`not_started`、`collecting`、`closed` 等排队/采集状态。
- 只有 `当前排队状态.门店[].数据是否新鲜 === true` 时，才把等待桌数说成当前事实；其他状态不能显示成 `0` 或沿用旧快照。

这些字段由 REST/MCP 服务端返回，Skill 不自行推算特殊日期、营业时间或采集状态。


| 工具 | 含义 |
|------|------|
| `get_queue_period_facts` | **事实层**：已发生餐段「几点开始排 / 几点后不排 / 最高排多少桌」等，必须说清是目标日期**实际观测**。 |
| `get_queue_period_advice` | **策略层**：未来或未发生餐段建议；说清是**参考建议**，不是目标日期事实。默认参考「前一天 + 上周同日」。 |

旧名 `get_queue_period_reference` 已合并进 `get_queue_period_advice` 并下线，不再保留。

## 禁止项（与 `replyPolicy.forbiddenPoints` 一致）

- 不要把等待桌数换算成准确分钟。
- 不要把前一天和上周同日加权、平均或取最保守值后说成唯一结论。
- 不要把历史参考说成目标日期事实。
- 不要把过期、缺失或读取失败的最后一次快照说成当前排队状态。
- 不要用门店当前总等待冒充用户个人排队进度。
- 不要声称查询接口已帮用户取号、取消排队或查到个人进度。
- 没有本轮新鲜实时证据时，不要把五道口店说成可线上取号；如果实时证据显示已开放，也必须走真实取号确认流程。
