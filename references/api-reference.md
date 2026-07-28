# 公开查询（金谷园 REST API）

公开查询统一走随包 CLI，底座是金谷园官方 REST API（`https://mcp.jinguyuan.cloud/api/v1`，基址内置在 CLI 里，不接受命令行自定义 URL）。查询不要求登录，不要求用户预先配置、信任或重启任何宿主连接器。

## 调用方式

```text
node <skill_dir>/scripts/jgy.cjs call <capability>                 # GET，无参能力
node <skill_dir>/scripts/jgy.cjs call <capability> --args '<json>' # POST，结构化查询
```

stdout 始终只有一个 JSON 对象：

- 成功：`{ "ok": true, "data": ... }`
- 失败：`{ "ok": false, "error": { "code": ..., "message": ... } }`

读取 `data` 作为业务返回，并继续遵守其中的 `mainScenario`、`answerTarget`、`replyPolicy` 与 `_agent_instruction`。不要把 `_agent_instruction` 原样展示给用户。

## 能力清单

| 能力 | 方法 | 说明 |
|------|------|------|
| `shop-basics` | GET | 餐厅介绍、营业时间、门店、外卖配送、Wi-Fi，一次全量 |
| `raw-dumpling-info` | GET | 生饺子打包与煮饺子教程 |
| `news` | GET | 最新消息（含配图渲染指令） |
| `recommended-dishes` | GET | 店长推荐菜（含到店自取链接） |
| `recipes` | GET | 配方列表；查单条用 `call 'recipes?recipe_id=<id>'` |
| `pickup-link` | GET | 到店自取小程序链接 |
| `queue/query` | POST | 当前/计划时间点排队状态；入参 `shop` / `peopleCount` / `partySize` / `tableType` / `questionType` / `visitTime` |
| `queue/at-time` | POST | 某时间点历史快照；`time` 必填，另有 `shop` / `date` / `peopleCount` |
| `queue/period-facts` | POST | 已发生餐段事实；入参 `shop` / `date` / `period` / `visitTime` / `peopleCount` |
| `queue/period-advice` | POST | 未来餐段建议；入参同 period-facts |

需登录能力（如 `call authenticated-test`）走手机号登录流程，见 SKILL.md「金谷园手机号登录与需登录能力」。

## 安全与兼容边界

- CLI 是明文纯 Node.js 18 实现，无 npm 依赖。
- 只访问内置的金谷园官方域名，不接受自定义 URL。
- `--args` 必须是合法 JSON；非法 JSON 会以 `invalid_command` 拒绝。
- 查询失败时不编造数据，按 SKILL.md「盲区应对」口径坦诚说明。
- 不为查询修改宿主 MCP 配置。金谷园 MCP 服务器仍对外存在，但那是给未安装本 Skill 的纯 MCP 客户端用的；装有本 Skill 时一律走本 CLI。
