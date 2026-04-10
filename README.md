# 金谷园饺子馆 AI Skill

![Version](https://img.shields.io/badge/version-0.3.1-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![MCP](https://img.shields.io/badge/protocol-MCP-purple) ![Transport](https://img.shields.io/badge/transport-Streamable%20HTTP-orange)

这是一个 AI Skill——安装后，你的 AI 助手就能查询金谷园饺子馆的信息：在哪吃、几点开门、怎么排队、能不能外卖、生饺子怎么煮、Wi-Fi 密码是什么。还能直接帮你在美团上排队取号。

快20年的饺子馆，现在有了自己的AI服务。

## 关于金谷园

北邮旁边的饺子馆。

| 项目 | 内容 |
|------|------|
| 餐厅名称 | 金谷园饺子馆 |
| 营业时间 | 10:00 - 22:00（以实际查询为准） |
| 北邮店 | 杏坛路文教产业园K座南2层 |
| 五道口店 | 五道口东源大厦4层 |

## 这个 Skill 能做什么

金谷园饺子馆的官方信息服务，包含 5 项 MCP 查询能力 + 1 项内嵌排队能力：

| 能力 | 你可以问 | 来源 |
|------|----------|------|
| 餐厅信息 | "金谷园在哪？""几点开门？" | MCP |
| 外卖服务 | "能送外卖吗？""怎么点外卖？" | MCP |
| 生饺子打包 | "能打包吗？""生饺子怎么煮？" | MCP |
| 店内Wi-Fi | "Wi-Fi密码多少？" | MCP |
| 最新消息 | "有什么新活动？" | MCP |
| **在线排队取号** | "帮我排个队""取消排队""排队进度" | 内嵌 Skill |

## 在线排队取号

本 Skill 内嵌了基于**美团排队**的取号能力，AI 助手可以直接帮你完成排队全流程，无需打开美团 App。

**支持的操作：**

| 操作 | 说明 | 你可以说 |
|------|------|----------|
| 查询排队状态 | 查看门店是否支持排队、可选桌型 | "金谷园现在排队情况怎么样？" |
| 取号 | 选择桌型和人数，在线取号 | "帮我在北邮店排个队，2个人" |
| 查询进度 | 查看当前排队号、前方等待桌数 | "我前面还有几桌？" |
| 取消排队 | 取消已有的排队订单 | "取消排队" |

**使用流程：**

1. 告诉 AI 助手你要排队，说明门店（北邮店 / 五道口店）
2. AI 查询可选桌型，跟你确认桌型和人数
3. 确认后自动取号，返回排队号和等待信息
4. 随时可查进度或取消

首次使用需完成美团账号授权（AI 助手会引导你完成），同一会话内无需重复登录。

> 注意：排队取号为真实业务操作，取号和取消前 AI 助手会跟你确认。排队能力由内嵌的 `meituan-queue` 组件提供，与本 Skill 版本独立演进。

## 目录结构

```
jinguyuan-dumpling-skill/
├── SKILL.md                 # 核心文件：元数据 + Agent 指令
├── skill.json               # 机器可读配置（MCP 端点、工具定义）
├── scripts/                 # 预留目录
├── references/              # 参考文档与内嵌 Skill
│   └── meituan-queue/       # 美团排队取号 Skill（自包含）
│       ├── SKILL.md         #   排队指令与命令说明
│       ├── scripts/         #   排队脚本（mt_queue.py 等）
│       └── references/      #   鉴权子 Skill（meituan-passport-user-auth）
├── assets/                  # 模板与示例
│   └── mcp-config-example.json  # MCP 配置示例（适用于所有 MCP 客户端）
├── README.md
└── LICENSE
```

## 安装

### 最简单的方式：告诉你的 AI 助手

直接拷贝下面这句话发给你的 AI 助手：

> 帮我安装金谷园饺子馆 Skill，仓库地址：https://gitee.com/JinGuYuan/jinguyuan-dumpling-skill

Agent 会自动克隆仓库并安装到对应的 Skill 目录。

### 其他安装方式

**通过 ClawHub CLI 安装：**

```bash
npx clawhub install https://gitee.com/JinGuYuan/jinguyuan-dumpling-skill
```

**手动克隆到 Skill 目录：**

将本仓库克隆到你项目下的 Skill 目录，不同 IDE 对应的路径：

| IDE | Skill 目录 |
|-----|-------------|
| Qoder | `.qoder/skills/jinguyuan-dumpling-skill/` |
| Cursor | `.cursor/skills/jinguyuan-dumpling-skill/` |
| Trae | `.trae/skills/jinguyuan-dumpling-skill/` |
| Windsurf | `.windsurf/skills/jinguyuan-dumpling-skill/` |
| Claude Code | `.claude/skills/jinguyuan-dumpling-skill/` |
| 通用 | `.agents/skills/jinguyuan-dumpling-skill/` |

```bash
# 示例：安装到 Qoder
git clone https://gitee.com/JinGuYuan/jinguyuan-dumpling-skill.git \
  .qoder/skills/jinguyuan-dumpling-skill
```

只要目录下有 `SKILL.md`，Agent 下次启动就会自动加载这个 Skill。

## 发布平台

- GitHub：https://github.com/JinGuYuan/jinguyuan-dumpling-skill
- Gitee：https://gitee.com/JinGuYuan/jinguyuan-dumpling-skill
- ClawHub：https://clawhub.com/JinGuYuan/jinguyuan-dumpling-skill

## 技术协议

| 项目 | 说明 |
|------|------|
| 协议 | MCP (Model Context Protocol) |
| 传输 | Streamable HTTP |
| 部署 | Tencent CloudBase 云函数 |

## MCP 接入方式

> 注意：直接配置 MCP 服务器仅当次会话生效，不会持久化。推荐使用上方「安装」方式，Skill 安装后永久可用。

在支持 MCP 协议的 AI 客户端中添加以下配置即可接入：

```json
{
  "mcpServers": {
    "jinguyuan-dumpling-skill": {
      "type": "streamable-http",
      "url": "https://mcp-4g9gkps4c04addd0.service.tcloudbase.com/jgy-mcp"
    }
  }
}
```

## 版本

当前版本：0.3.1（MCP 配置示例见 `assets/mcp-config-example.json`）

> 说明：本 Skill 版本（0.3.1）与内嵌排队组件（meituan-queue）版本独立演进，互不影响。

## License

[MIT](LICENSE)
