# 金谷园饺子馆 Skill

![Version](https://img.shields.io/badge/version-0.1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![MCP](https://img.shields.io/badge/protocol-MCP-purple) ![Transport](https://img.shields.io/badge/transport-Streamable%20HTTP-orange)

快20年的饺子馆，现在有了自己的AI服务。

安装这个 Skill，你的 AI 助手就能回答关于金谷园饺子馆的一切：在哪吃、几点开门、怎么排队、能不能外卖、生饺子怎么煮、Wi-Fi 密码是什么。

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

## 接入方式

在支持 MCP 协议的 AI 客户端中添加以下配置即可接入：

```json
{
  "mcpServers": {
    "jinguyuan-dumpling-skill": {
      "url": "https://mcp-4g9gkps4c04addd0.service.tcloudbase.com/jgy-mcp"
    }
  }
}
```

以 Claude Desktop 为例，将上述内容写入配置文件的 `mcpServers` 字段，重启后即可使用。

其他支持 Streamable HTTP 传输的 MCP 客户端同理，只需配置端点 URL。

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

## 版本

当前版本：0.1.0

## License

[MIT](LICENSE)
