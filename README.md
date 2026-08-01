# 金谷园饺子馆 Skill

![Version](https://img.shields.io/github/v/tag/JinGuYuan/jinguyuan-dumpling-skill?label=version&color=blue&sort=semver) ![License](https://img.shields.io/badge/license-MIT-green) ![API](https://img.shields.io/badge/api-REST-orange) ![CLI](https://img.shields.io/badge/cli-jgy.cjs%20single--file-purple)

这是一个 AI Skill——安装后，你的 AI 助手就能帮你查金谷园在哪、几点开门、这会儿排不排队、几点去更稳，也能查推荐菜、外卖和生饺子打包怎么煮；需要时，还能帮你在线排队取号。

开了快二十年的饺子馆，有了自己的AI服务。


## 关于金谷园

北邮旁边的饺子馆。官网：[jinguyuan.cloud](https://jinguyuan.cloud)

| 项目 | 内容 |
|------|------|
| 餐厅名称 | 金谷园饺子馆 |
| 营业时间 | 10:00 - 22:00（以实际查询为准） |
| 北邮店 | 杏坛路文教产业园K座南2层 |
| 五道口店 | 五道口东源大厦4层 |

## 这个 Skill 能做什么

金谷园饺子馆的官方信息服务，可以查店、查活动、查推荐菜，也能处理到店自取和排队取号这些具体场景：

| 能力 | 你可以问 |
|------|----------|
| 餐厅信息 | "金谷园在哪？""几点开门？""能外卖吗？""Wi-Fi 密码？" |
| 推荐菜 | "有什么好吃的？""今天吃什么""招牌菜" |
| **到店自取** | "帮我来份饺子""提前点餐到店取" |
| 排队信息&建议 | "这会儿排队吗？""晚上七点去用排么？""几点去不用排？" |
| **排队取号** | "帮我排个队""取消排队""排队进度" |
| 生饺子打包 | "能打包吗？""生饺子怎么煮？" |
| 最新消息 | "有什么新活动？" |

## 在线排队取号

本 Skill 内置了基于**美团排队**的真实动作，AI 助手可以帮你取号、查本人订单和取消排队。

**支持的操作：**

| 操作 | 说明 | 你可以说 |
|------|------|----------|
| 查询排队状态 | 查看当前等待桌数和排队压力 | "金谷园现在排队情况怎么样？" |
| 查询餐段事实 | 查询已经发生的午市/晚市实际观测 | "今天中午几点开始排？" |
| 查询餐段建议 | 参考前一天和上周同日，给未来餐段建议 | "明天中午几点去比较稳？" |
| 取号 | 选择桌型和人数，在线取号 | "帮我在北邮店排个队，2个人" |
| 查询进度 | 查看当前排队号、前方等待桌数 | "我前面还有几桌？" |
| 取消排队 | 取消已有的排队订单 | "取消排队" |

**使用流程：**

1. 告诉 AI 助手你要在北邮店排队
2. AI 查询可选桌型，跟你确认桌型和人数
3. 确认后自动取号，返回排队号和等待信息
4. 随时可查进度或取消

首次使用需完成美团账号授权（AI 助手会引导你完成）。

## 运行环境

支持 Windows、macOS 和 Linux，需要 Node.js 18 或更高版本，无需 npm 安装。

## 安装

直接拷贝下面这句话发给你的 AI 助手：

> 安装 https://gitee.com/JinGuYuan/jinguyuan-dumpling-skill

Agent 会自动克隆仓库并安装到对应的 Skill 目录。

## 关于金谷园 MCP

金谷园同时提供独立的 MCP 服务。若只需要查询店铺、菜品和排队信息，可以不安装 Skill，直接接入金谷园 MCP；在线取号、本人进度和取消排队等本地授权能力仍需安装 Skill。

| 项目 | 内容 |
|------|------|
| 接入点 | `https://mcp.jinguyuan.cloud` |
| 协议 | Model Context Protocol（MCP） |
| 传输方式 | Streamable HTTP |

## 发布平台

- GitHub：https://github.com/JinGuYuan/jinguyuan-dumpling-skill
- Gitee：https://gitee.com/JinGuYuan/jinguyuan-dumpling-skill

## 版本

版本号见顶部徽章，以 [`skill.json`](./skill.json) 为准。

## License

[MIT](LICENSE)
