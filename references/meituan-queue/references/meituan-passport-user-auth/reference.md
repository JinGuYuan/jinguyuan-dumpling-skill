# 参考文档

## 参数说明

`mt-passport` 支持以下参数：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--client_id` | 必填 | 已注册的 client_id，两阶段均需传入 |
| `--env` | `prod` | `test` 或 `prod`，两阶段均需传入 |
| `--base_url` | - | 自定义地址，优先级高于 `--env`（适用于泳道），两阶段均需传入 |
| `--timeout` | `600` | 轮询最大等待秒数 |
| `--interval` | `3` | 轮询间隔秒数 |
| `--force` | - | 强制重新授权，忽略本地缓存 |
| `--poll` | - | 第二阶段：轮询等待已发起的授权完成 |

## Token 缓存

| 项目 | 说明 |
|---|---|
| 默认路径 | `~/.xiaomei-workspace/mt_passport_auth.json` |
| 自定义路径 | 环境变量 `MT_PASSPORT_AUTH_FILE` |
| 文件权限 | `0600`（仅当前用户可读写） |
| 存储格式 | 按 `client_id@env` 分 key，多账号/多环境互不干扰 |

## 子命令说明

`mt-passport` 支持以下子命令：

| 子命令 | 说明 |
|---|---|
| `auth` | 两阶段登录：无 `--poll` 时检查缓存/生成链接；加 `--poll` 时轮询等待授权 |
| `status` | 查看本地缓存状态（不调远程接口） |
| `logout` | 清除本地缓存 Token |
| `gettoken` | 直接输出缓存的 Token 字符串（无缓存时退出码 1） |

```bash
# 安装/更新（每次执行，确保最新版本）
npm install -g @mtuser/mt-passport@latest --registry=http://r.npm.sankuai.com --save-exact --force

# 发起授权（第一阶段）
mt-passport auth --client_id <CLIENT_ID> [--env test|prod] [--force]

# 轮询等待授权完成（第二阶段）
mt-passport auth --client_id <CLIENT_ID> --poll [--env test|prod] [--base_url <url>]

# 获取缓存 Token 字符串
TOKEN=$(mt-passport gettoken --client_id <CLIENT_ID> [--env test|prod])

# 查看缓存状态
mt-passport status --client_id <CLIENT_ID> [--env test|prod]

# 退出登录
mt-passport logout --client_id <CLIENT_ID> [--env test|prod]
```

## 后端业务错误码

| code | 枚举名 | 含义 | 脚本行为 |
|---|---|---|---|
| `400` | `PARAM_ERROR` | client_id 未注册或配置缺失 | 终止 |
| `401` | `C_USER_TOKEN_LOGIN_FAIL` | 原始 Token 无效（用户侧登录态失效） | 终止 |
| `101000` | `SERVER_BUSY` / `DEFAULT` | 服务繁忙或内部异常 | 自动重试直到超时 |
| `101144` | `C_USER_HAS_RISK` | 风控拒绝授权 | 终止 |
| `101267` | `C_USER_TICKET_ERR` | 票据状态异常 | 终止 |
| `101269` | `C_USER_TICKET_INFO_ERR` | authCode/clientId 不匹配或 PKCE 签名错误 | 终止 |
| `101368` | `C_USER_AUTH_CANCEL` | 用户取消授权 | 终止 |

## authStatus 状态值（轮询 /check 时）

| 值 | 含义 | 脚本行为 |
|---|---|---|
| `1` (INIT) | 等待用户在授权页确认 | 继续轮询 |
| `2` (CANCEL) | 用户取消授权（数据路径） | 终止，退出码 4 |
| `3` (RISK_DENY) | 风控拒绝（数据路径） | 终止，退出码 5 |
| `4` (CONFIRMED) | 已确认，token 非空则成功；token 为空时继续等待（衍生 token 生成中） | 成功或继续等待 |

## 环境地址

| 环境 | 地址 |
|---|---|
| 测试环境 | `https://passport.wpt.test.sankuai.com`（或使用 `--base_url` 自定义泳道地址） |
| 线上环境 | `https://passport.meituan.com` |

