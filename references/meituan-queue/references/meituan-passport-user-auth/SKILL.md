---
name: meituan-passport-user-auth
description: 美团 Passport 用户授权登录 Skill。通过 mt-passport CLI 获取授权链接，展示给用户完成确认后轮询拿到鉴权凭证（登录态 Token）。当用户需要通过美团授权获取 Token、Agent 自动登录美团时使用。触发词：美团授权登录、获取授权码、获取 token、token 授权、meituan passport auth、passport auth、passport 登录、触发登录、触发美团登录、美团用户登录授权、美团登录、重新授权、强制刷新 token。

metadata:
  skillhub.creator: "suntiansheng"
  skillhub.updater: "suntiansheng"
  skillhub.version: "V10"
  skillhub.source: "FRIDAY Skillhub"
  skillhub.skill_id: "22364"
  skillhub.high_sensitive: "false"
---

# 美团 Passport 用户授权登录

## 执行流程

### Step 0：安装 `mt-passport` CLI

**会话前置，每次会话只执行一次。** 后续步骤遇到 `command not found` 时再重新执行。

LLM 执行本步骤时，将 `<SKILL_DIR>` 替换为本 SKILL.md 文件所在的目录绝对路径：

```bash
command -v npm &>/dev/null || { echo "❌ 未找到 npm，请先安装 Node.js（>=18）：https://nodejs.org"; exit 1; }
TGZ="<SKILL_DIR>/scripts/"*.tgz
PKG_VER=$(tar -xOf $TGZ package/package.json 2>/dev/null | grep '"version"' | sed 's/.*"version": *"//;s/".*//')
LOCAL_VER=$(mt-passport --version 2>/dev/null)
if [ "$PKG_VER" = "$LOCAL_VER" ]; then
  echo "✅ mt-passport 已就绪（$LOCAL_VER）"
else
  npm install -g $TGZ && echo "✅ mt-passport 安装成功（$PKG_VER）" || echo "❌ 安装失败，请重试"
fi
```

---

### Step 1：确认参数

**STOP — 必须先确认以下三项，再执行后续步骤。**

**1. client_id（必填）**

按以下优先级查找，找到即用，不再追问：

1. 调用方 Skill 的 `skill-dependencies.meituan-passport-user-auth.client_id`
2. 环境变量 `MT_PASSPORT_CLIENT_ID`
3. 用户在对话中明确提供的值

以上均无时，**STOP**，向用户索要：

```
请提供您的 client_id，才能继续发起授权。
```

**2. 环境（默认 prod）**

按以下优先级确定环境，找到即用：

1. 调用方 Skill 的 `skill-dependencies.meituan-passport-user-auth.env` 字段
2. 环境变量 `MT_PASSPORT_ENV`
3. 用户在对话中明确说「测试环境」「test」
4. 以上均无：默认 `prod`，无需询问用户

**环境一致性约束（必须）：** 确定环境后，`client_id` 必须与环境匹配，禁止 test 环境使用 prod 的 `client_id`，反之亦然。若发现不一致，**STOP**，告知用户：

```
❌ 环境与 client_id 不匹配：当前环境为 <env>，但 client_id 可能属于另一环境，请确认后重试。
```

**3. 是否强制重新授权（默认否）**

用户明确说「重新授权」「强制刷新」「忽略缓存」时，添加 `--force` 参数。

**4. 泳道地址（可选）**

用户明确说「泳道」「自定义地址」或提供了具体 URL 时，添加 `--base_url <url>` 参数（优先级高于 `--env`）。

---

### Step 2：运行授权登录脚本

**首先尝试从缓存获取 Token（未使用 `--force` 时执行）：**

```bash
mt-passport gettoken --client_id <client_id> [--env test]
```

根据退出码判断：

- 退出码 `0`，输出 Token 字符串：缓存命中，按调用场景处理：
  - **直接调用**（用户主动触发）：流程结束，只输出 `✅ 您已完成过授权。`
  - **被依赖调用**（外部 Skill 通过 `skill-dependencies` 触发）：取出 Token，继续执行占位符注入，**不输出任何提示，不终止流程**
- 退出码 `1`（无缓存）：继续执行下方 `auth` 命令

**发起授权流程：**

```bash
mt-passport auth --client_id <client_id> [--env test] [--force] [--base_url <url>]
```

根据脚本输出判断分支：

- 输出 `Token: <token>`：缓存命中且有效，按调用场景处理（同上）
- 输出 `AUTH_LINK: <url>`：需要用户授权，**立即执行 Step 3**
- 输出 `❌`：**STOP**，从脚本输出中提取 `code=xxx`，按本文末尾错误码表告知用户后终止，不执行 Step 3/4
- 其他输出（如异常堆栈）：**STOP**，告知用户脚本异常，请检查 Node.js 版本或联系管理员

---

### Step 3：展示链接（输出后立即执行 Step 4，不等待用户任何回复）

根据是否携带 `--force` 参数，向用户输出不同提示：

**首次授权**（未使用 `--force`）：

> 请点击以下链接，在美团授权页中点击「确认授权」：
>
> 👉 [点击授权](<url>)
>
> 完成授权后我会自动继续。授权链接有效期 10 分钟，请尽快完成。

**强制重新授权**（使用了 `--force`）：

> 您的授权需要刷新，请点击以下链接重新授权，在美团授权页中点击「确认授权」：
>
> 👉 [点击重新授权](<url>)
>
> 完成授权后我会自动继续。授权链接有效期 10 分钟，请尽快完成。

---

### Step 4：轮询等待授权

```bash
mt-passport auth --client_id <client_id> --poll [--env test] [--base_url <url>]
```

脚本执行完毕后，**必须先检查退出码，再解析输出内容，不要输出多余内容**：

**成功**（退出码 `0` 且输出包含 `Token: <token>`）：

向用户输出：
```
✅ 授权成功。
```

并通过以下命令取出 Token 供后续使用：
```bash
TOKEN=$(mt-passport gettoken --client_id <client_id> [--env test])
```

Token 存储在 `~/.xiaomei-workspace/mt_passport_auth.json`，也可通过环境变量 `MT_PASSPORT_AUTH_FILE` 自定义路径。后续 HTTP 请求将 Token 放入请求头或参数中（具体字段由接入方约定）。

**被依赖时的占位符注入（由 LLM 执行）：**

若本 Skill 由外部 Skill 通过 `skill-dependencies` 触发，授权成功后由 **LLM 在生成下一条命令时直接将 `${passport_token}` 内联替换为实际 Token 字符串**，再交由 Bash 工具执行。替换规则详见「跨 Skill 协作规范 → 占位符替换规则」。

**失败**（退出码非 `0`，输出包含 `❌`）：

从脚本错误输出中提取 `code=xxx`，按下表告知用户：

| code | 告知用户的内容 |
|---|---|
| `400` | ❌ 授权配置有误，client_id 未注册，请联系管理员。 |
| `401` | ❌ 美团账号登录态已失效，请重新登录后再试。 |
| `101144` | ❌ 授权被风控拦截，请稍后重试。 |
| `101267` | ❌ 授权凭证状态异常，请重新发起授权（从 Step 2 开始）。 |
| `101269` | ❌ 授权凭证校验失败，请重新发起授权（从 Step 2 开始）。 |
| `101368` | ❌ 您已取消授权，如需继续请重新发起（从 Step 2 开始）。 |
| `1001` | ❌ 网络异常，获取授权码失败，请检查网络后重试。 |
| `1002` | ❌ 授权码接口返回异常，请重试。 |
| `1003` | ❌ 授权超时，请重新发起授权（从 Step 2 开始）。 |
| `1004` | ❌ 未找到授权会话，请从 Step 1 重新开始。 |
| 其他 | ❌ 授权失败，请重试。（原始错误：`<脚本输出>`） |

> `101000`（SERVER_BUSY）脚本自动重试直到超时，不会直接返回给用户。

---

## 跨 Skill 协作规范

本节面向**依赖本 Skill 的外部 Skill**，是跨 Skill 身份协作的统一契约，具有**最高优先级**。外部 Skill 的自定义逻辑与本节冲突时，以本节为准。

### 适用范围

- 适用于所有在 `skill-dependencies.meituan-passport-user-auth` 下声明依赖的 Skill。
- 本节定义占位符语义、Token 获取触发规则、注入方式、缓存、安全和错误处理规则。

### 占位符触发规则

- 外部 Skill 的命令模板中出现 `${passport_token}` 时，触发本 Skill 的完整授权流程（Step 0 → Step 4）。
- 未出现占位符时跳过，不发起任何授权调用。
- 触发时机：先生成业务命令模板（保留占位符），用户确认执行后再触发取票，取到后替换占位符再执行（**延迟触发**）。

**`passport_token_placeholder` 字段说明：**

外部 Skill 在 `skill-dependencies` 中声明 `passport_token_placeholder: ${passport_token}`，作用是**向平台和 LLM 显式登记"我使用了哪个占位符"**，使平台能在加载 Skill 时提前感知依赖关系，LLM 在读取 Skill 配置时也能明确知道需要触发取票流程。

- **必填**：必须与命令模板中实际使用的占位符字面量一致，固定值为 `${passport_token}`。
- 若缺少此字段：平台可能无法提前识别依赖，LLM 仍可通过扫描命令模板中的占位符字面量触发授权，但不保证所有平台实现都支持此降级行为，**建议始终声明**。

### client_id 与 env 来源规则

**client_id** 按以下优先级依次查找，找到即用，不再向用户追问：

1. 外部 Skill 的 `skill-dependencies.meituan-passport-user-auth.client_id` 字段
2. 环境变量 `MT_PASSPORT_CLIENT_ID`
3. 以上均无：**STOP**，向用户索要 `client_id`

**env** 按以下优先级依次查找：

1. 外部 Skill 的 `skill-dependencies.meituan-passport-user-auth.env` 字段
2. 环境变量 `MT_PASSPORT_ENV`
3. 以上均无：默认 `prod`

**环境一致性约束（必须）：** `client_id` 与 `env` 必须属于同一环境，禁止混用。若两者来源不同（如 `client_id` 来自依赖配置、`env` 来自环境变量），需确认一致后再执行，不一致则报错终止。

### 占位符替换规则

**执行主体是 LLM，不是 shell。** 替换发生在 LLM 生成最终命令的阶段，流程如下：

1. 执行授权流程，取出 Token 字符串：
   ```bash
   TOKEN=$(mt-passport gettoken --client_id <client_id> [--env test])
   ```
2. **替换前必须校验 Token 非空**。若为空，报错终止，提示重新发起授权，不得继续执行：
   ```
   ❌ Token 获取失败（gettoken 返回空），请重新发起授权。
   ```
3. LLM 将外部 Skill 命令模板中**所有** `${passport_token}` 字面量替换为实际 Token，生成最终命令后交由 Bash 工具执行。

**多处占位符规则：**

- 同一条命令中多个 `${passport_token}` → 全部替换为同一个 Token，只取一次。
- 多条命令各含 `${passport_token}` → 同会话同缓存键共用同一个 Token，不重复授权。
- 占位符出现在注释中（如 `# token: ${passport_token}`）→ **不替换**，注释行跳过。

**防止 shell 提前展开：**

`${passport_token}` 与 bash 变量语法相同，命令模板中必须用**单引号**包裹含占位符的字符串，防止 shell 在 LLM 替换前将其展开为空：

```bash
# ✅ 正确：单引号，shell 不展开
curl -H 'token: ${passport_token}' https://your-api/endpoint

# ❌ 错误：双引号，shell 会将 ${passport_token} 展开为空字符串
curl -H "token: ${passport_token}" https://your-api/endpoint
```

LLM 在替换时，将单引号内的 `${passport_token}` 字面量替换为实际 Token 后，生成的最终命令中该位置已是真实值，无需再保留单引号保护。

### 会话级缓存

同一会话内，`client_id + env` 相同时可复用已获取的 Token，无需重新发起授权。

- **缓存键格式**：`<client_id>@<env>`，例如 `abc123@prod`
- **命中判断**：直接执行 `mt-passport gettoken --client_id <client_id> [--env test]`，退出码 `0` 即命中，退出码 `1` 即未命中
- **缓存存储位置**：`~/.xiaomei-workspace/mt_passport_auth.json`（可通过 `MT_PASSPORT_AUTH_FILE` 自定义）
- **有效期**：以缓存文件中的过期时间为准，CLI 自动判断；会话结束后不得继续使用

### 错误处理（必须）

| 错误场景 | 处理行为 |
|---|---|
| `client_id` 未声明且无环境变量 | 报错终止，提示用户提供 `client_id` |
| `env` 与 `client_id` 来源不一致 | 报错终止，提示环境与凭据不匹配 |
| `mt-passport auth` 返回非 0 | 报错终止，按错误码表告知用户 |
| `mt-passport gettoken` 返回空 | 报错终止，输出 `❌ Token 获取失败（gettoken 返回空），请重新发起授权。`，不得继续注入 |
| Token 替换后命令执行失败 | 报错终止，输出原始错误，不重试授权 |

### 最小执行顺序

1. 先生成业务命令（允许保留 `${passport_token}` 占位符）。
2. 用户确认执行后，按优先级解析 `client_id` 和 `env`，校验两者环境一致。
3. 执行授权流程，提取 Token，校验非空。
4. 替换命令中所有 `${passport_token}`，执行替换后的命令。
5. 同会话同缓存键（`client_id@env`）的后续请求复用缓存，跳过步骤 3。

### 依赖声明示例

外部 Skill 在 frontmatter 中按如下格式声明依赖：

```yaml
---
name: your-skill-name
skill-dependencies:
  meituan-passport-user-auth:
    passport_token_placeholder: ${passport_token}  # 必填，向平台登记占位符，固定值
    client_id: your_client_id                      # 必填，已在 Passport 注册的 client_id
    env: prod                                      # 可选，prod（默认）或 test
    prompt: 用于调用 XXX 接口的用户授权 Token        # 可选，描述 Token 用途
---
```

在命令模板中使用占位符（**必须单引号**，防止 shell 提前展开）：

```bash
curl -H 'token: ${passport_token}' https://your-api/endpoint
```

---

## 安全约束

- Token 仅可用于后续 HTTP 请求的请求头或参数中，**严禁输出到回复正文、日志或任何用户可见位置**。
- 缓存 Token 仅在当前会话有效，会话结束后不得继续使用。

## 参考资料

详见 [reference.md](reference.md)：参数说明、Token 缓存、子命令（auth/status/logout/gettoken）、后端枚举错误码、authStatus 状态值、环境地址。
