# 金谷园饺子馆 AI Skill

![Version](https://img.shields.io/badge/version-0.3.1-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![MCP](https://img.shields.io/badge/protocol-MCP-purple) ![Transport](https://img.shields.io/badge/transport-Streamable%20HTTP-orange)

这是一个 AI Skill——安装后，你的 AI 助手就能查询金谷园饺子馆的信息：在哪吃、几点开门、怎么排队、能不能外卖、生饺子怎么煮、Wi-Fi 密码是什么。

快20年的饺子馆，现在有了自己的AI服务。

## 关于金谷园

北邮旁边的饺子馆。

| 项目 | 内容 |
|------|------|
| 餐厅名称 | 金谷园饺子馆 |
| 营业时间 | 10:00 - 22:00 |
| 北邮店 | 杏坛路文教产业园K座南2层 |
| 五道口店 | 五道口东源大厦4层 |

## 这个 Skill 能做什么

金谷园饺子馆的官方信息服务，包含 6 项能力：

| 能力 | 你可以问 |
|------|----------|
| 餐厅信息 | "金谷园在哪？""几点开门？" |
| 排队取号 | "怎么排队？""怎么取号？" |
| 外卖服务 | "能送外卖吗？""怎么点外卖？" |
| 生饺子打包 | "能打包吗？""生饺子怎么煮？" |
| 店内Wi-Fi | "Wi-Fi密码多少？" |
| 最新消息 | "有什么新活动？" |

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

当前版本：0.3.1

## License

[MIT](LICENSE)
