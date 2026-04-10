#!/usr/bin/env python3
"""
美团排队 CLI - 轻量级排队操作脚本（零外部依赖）
支持查询排队状态、取号、查询订单、取消订单
输出格式化文案，LLM 可直接展示给用户。
"""
from __future__ import annotations

import sys
import os
import json
import argparse
import re
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BASE_URL = "https://m.dianping.com/queue/mdp/ajax/"
CHANNEL_MT = 2  # 美团 App
TIMEOUT = 30
TRACE_HEADERS = ("M-TraceId", "X-Trace-Id", "traceid")

STATUS_MAP = {1: "取号中", 2: "排队中", 4: "已取消", 5: "已就餐", 6: "已过号", 7: "取号失败"}


class QueueAPIError(Exception):
    """排队 API 请求失败（网络异常、鉴权失败等），用于替代 sys.exit 控制流。"""
    pass


# ---------------------------------------------------------------------------
# API Client (stdlib only: urllib)
# ---------------------------------------------------------------------------
class QueueClient:
    """Minimal HTTP client for Meituan queue API using stdlib urllib."""

    def __init__(self, token: str):
        self.base_url = BASE_URL
        self.headers = {
            "User-Agent": "MeituanQueue-Skill/2.0",
            "Accept": "application/json",
            "enterchannel": str(CHANNEL_MT),
            "token": token,
        }

    def _url(self, endpoint: str) -> str:
        return self.base_url + endpoint.lstrip("/")

    @staticmethod
    def _extract_trace(resp_headers) -> str | None:
        for h in TRACE_HEADERS:
            val = resp_headers.get(h)
            if val:
                return val
        return None

    def _do_request(self, url: str, data: bytes | None = None) -> dict:
        """Send request and return parsed JSON with optional _traceid."""
        req = urllib.request.Request(url, data=data, headers=self.headers)
        if data is not None:
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = resp.read().decode("utf-8")
                try:
                    body = json.loads(raw)
                except (json.JSONDecodeError, ValueError):
                    raise QueueAPIError(
                        f"服务端返回异常响应（非 JSON），请稍后重试。\n"
                        f"响应内容：{raw[:200]}"
                    )
                trace = self._extract_trace(resp.headers)
                if trace and isinstance(body, dict):
                    body["_traceid"] = trace
                # 业务级鉴权错误（HTTP 200 但业务码表示未登录/无权限）
                if isinstance(body, dict) and body.get("code") in (302, 401, 403):
                    msg = "登录已过期，重新运行命令即可自动刷新授权。"
                    if trace:
                        msg += f"\n（traceId: {trace}）"
                    raise QueueAPIError(msg)
                return body
        except QueueAPIError:
            raise
        except urllib.error.HTTPError as e:
            trace = self._extract_trace(e.headers) if e.headers else None
            # Token 过期/无效 — 输出友好提示
            if e.code in (401, 403):
                msg = "登录已过期，重新运行命令即可自动刷新授权。"
                if trace:
                    msg += f"\n（traceId: {trace}）"
                raise QueueAPIError(msg)
            # 其他 HTTP 错误
            error = {"error": f"HTTP {e.code}", "message": e.reason}
            if trace:
                error["traceid"] = trace
            try:
                error["body"] = json.loads(e.read().decode("utf-8"))
            except Exception:
                pass
            raise QueueAPIError(json.dumps(error, ensure_ascii=False))
        except urllib.error.URLError as e:
            raise QueueAPIError(json.dumps({"error": str(e.reason)}, ensure_ascii=False))
        except (TimeoutError, OSError) as e:
            if isinstance(e, TimeoutError) or "timed out" in str(e):
                raise QueueAPIError(f"请求超时（{TIMEOUT}秒），请检查网络后重试。")
            else:
                raise QueueAPIError(f"网络异常：{e}")

    def get(self, endpoint: str, params: dict = None) -> dict:
        url = self._url(endpoint)
        if params:
            url += "?" + urllib.parse.urlencode(params)
        return self._do_request(url)

    def post(self, endpoint: str, data: dict = None) -> dict:
        url = self._url(endpoint)
        body = urllib.parse.urlencode(data or {}).encode("utf-8")
        return self._do_request(url, data=body)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_capacity(desc: str) -> tuple[int | None, int | None]:
    """解析 '1-2人' 格式的桌型容量，返回 (min, max)。解析失败返回 (None, None)。"""
    m = re.match(r"(\d+)-(\d+)", desc)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.match(r"(\d+)", desc)
    if m:
        n = int(m.group(1))
        return n, n
    return None, None


# ---------------------------------------------------------------------------
# Shared: format order detail into text
# ---------------------------------------------------------------------------
def _format_order_detail(d: dict, shop_id: int) -> str:
    """Format a QueueOrderInfoVO dict into human-readable text."""
    shop_name = d.get("shopName") or f"门店{shop_id}"
    num = d.get("tableNumDesc") or "—"
    table_name = d.get("tableTypeName") or "未知"
    people = d.get("peopleCount") or "?"
    status_code = d.get("queueOrderStatus", 0)
    status = STATUS_MAP.get(status_code, f"未知({status_code})")
    wait_table_num = d.get("queueWaitTableNum", 0)
    will_wait = d.get("willWaitTime") or -1
    will_wait_desc = d.get("willWaitTimeDesc") or ""

    lines = [
        f"【{shop_name}】排队订单",
        f"排队号：{num}",
        f"桌型：{table_name}（{people}人）",
        f"状态：{status}",
    ]

    lines.append(f"前方等待：{wait_table_num}桌")

    if will_wait > 0 and will_wait_desc:
        lines.append(f"预计等待：约{will_wait_desc}分钟")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_index(client: QueueClient, shop_id: int) -> str:
    """查询门店排队首页，返回格式化文案。"""
    resp = client.get("queueIndexV2", params={"dpShopId": shop_id})
    if resp.get("code") is not None and resp.get("code") != 200:
        err = resp.get("errMsg") or f"请求失败（code={resp.get('code')}）"
        return f"查询排队状态失败：{err}"
    data = resp.get("data") or {}
    shop = data.get("queueIndexShopVO") or {}

    shop_name = shop.get("shopName") or f"门店{shop_id}"
    support = shop.get("supportQueue", False)
    table_infos = shop.get("queueTableInfos") or []
    orders = data.get("userQueueOrders") or []

    lines = [f"【{shop_name}】"]

    # 优先检查已有订单（即使门店显示不支持排队，用户可能已取号）
    if orders:
        latest = orders[0]
        tableNumDesc = latest.get("tableNumDesc") or ""
        lines.append(f"你已有排队订单（{tableNumDesc}），无需重复取号。可用 order_detail 查看详情。")
        return "\n".join(lines)

    if not support:
        lines.append("该门店暂不支持在线排队。")
        return "\n".join(lines)

    # 桌型列表
    if table_infos:
        lines.append("")
        lines.append("可选桌型：")
        for t in table_infos:
            tid = t.get("tableTypeId", "?")
            name = t.get("tableTypeName", "未知")
            cap = t.get("tableCapacityDesc", "")
            wait = t.get("waitCount", 0)
            wait_desc = f"排{wait}桌" if wait > 0 else "无需等待"
            lines.append(f"  [{tid}] {name}({cap}) — {wait_desc}")
    else:
        lines.append("当前无可用桌型。")
        return "\n".join(lines)

    lines.append("")
    lines.append("请选择桌型编号（方括号中的数字）和就餐人数进行取号。")

    return "\n".join(lines)


def cmd_take_number(
    client: QueueClient, shop_id: int, people_count: int, table_type_id: int,
    *, force: bool = False,
) -> str:
    """取号排队，成功后自动查询订单详情返回完整信息。"""

    # Step 1: fetch index to get tableTypeName & phone
    index_resp = client.get("queueIndexV2", params={"dpShopId": shop_id})
    if index_resp.get("code") is not None and index_resp.get("code") != 200:
        err = index_resp.get("errMsg") or f"请求失败（code={index_resp.get('code')}）"
        return f"取号失败：{err}"
    data = index_resp.get("data") or {}

    # Step 1.1: check for existing order (duplicate protection)
    orders = data.get("userQueueOrders") or []
    if orders:
        latest = orders[0]
        view_id = latest.get("queueOrderViewId") or ""
        tableNumDesc = latest.get("tableNumDesc") or ""
        return (
            f"你已有排队订单（{tableNumDesc}），无需重复取号。\n"
            f"可用 order_detail 查看详情，或 order_cancel 取消后重新取号。"
        )

    queue_state = data.get("queueIndexShopVO") or {}
    table_infos = queue_state.get("queueTableInfos") or []
    matched_info = None
    for info in table_infos:
        if info.get("tableTypeId") == table_type_id:
            matched_info = info
            break

    if matched_info is None:
        available = ", ".join(
            f"[{t.get('tableTypeId')}]{t.get('tableTypeName', '')}"
            for t in table_infos
        )
        return f"取号失败：桌型 {table_type_id} 不存在。可用桌型：{available or '无'}"

    table_type_name = matched_info.get("tableTypeName", "")

    # Step 1.2: validate people_count against table capacity
    cap_desc = matched_info.get("tableCapacityDesc", "")
    cap_min, cap_max = _parse_capacity(cap_desc)
    if cap_min is not None and cap_max is not None:
        if people_count < cap_min or people_count > cap_max:
            return (
                f"就餐人数 {people_count} 与桌型 {table_type_name}({cap_desc}) 不匹配。\n"
                f"该桌型适合 {cap_min}-{cap_max} 人，请调整人数或选择其他桌型。"
            )

    # Step 1.3: check if queue is needed (waitCount=0 means no queue)
    wait_count = matched_info.get("waitCount", 0)
    if wait_count == 0 and not force:
        shop_name = queue_state.get("shopName") or f"门店{shop_id}"
        return (
            f"【{shop_name}】{table_type_name}({cap_desc}) 当前无人排队，但排队情况可能随时变化。\n"
            f"如需确保位置，建议仍然取号。请用 --force 参数确认取号。"
        )

    phone = data.get("phone", "")

    # Step 2: create order
    order_data = {
        "dpShopId": shop_id,
        "peopleCount": people_count,
        "tableTypeId": table_type_id,
        "tableTypeName": table_type_name,
    }
    if phone:
        order_data["phone"] = phone

    resp = client.post("queue", data=order_data)

    if resp.get("code") != 200 or not resp.get("data"):
        err = resp.get("errMsg") or "未知错误"
        return f"取号失败：{err}"

    order_id = resp["data"].get("queueOrderViewId", "")
    if not order_id:
        return "取号失败：未获取到订单号。"

    # Step 3: poll order detail (backend may need time to finalize)
    # 注意：取号已成功，轮询失败不应阻断流程
    detail = None
    for attempt in range(3):
        if attempt > 0:
            time.sleep(1)
        try:
            detail_resp = client.get("queueOrderDetail", params={"queueOrderViewId": order_id})
        except QueueAPIError:
            # 网络异常，但取号已成功，不应中断
            break
        if detail_resp.get("code") == 200 and detail_resp.get("data"):
            d = detail_resp["data"]
            status = d.get("queueOrderStatus", 0)
            # status 1 = TAKING (still processing), keep polling
            if status != 1:
                detail = d
                break
            detail = d  # keep last result even if still TAKING

    if detail:
        return "取号成功！\n\n" + _format_order_detail(detail, shop_id)
    else:
        # Fallback: detail not available yet, show basic info
        return (
            f"取号成功！\n"
            f"桌型：{table_type_name}（{people_count}人）\n"
            f"订单号：{order_id}\n"
            f"排队详情正在生成中，稍后可用 order_detail 查看。"
        )


def _get_latest_order_view_id(client: QueueClient, shop_id: int) -> tuple[str | None, str | None]:
    """Helper: fetch index_v2 and extract the latest orderViewId."""
    index_resp = client.get("queueIndexV2", params={"dpShopId": shop_id})
    if index_resp.get("code") is not None and index_resp.get("code") != 200:
        err = index_resp.get("errMsg") or f"请求失败（code={index_resp.get('code')}）"
        return f"查询订单失败：{err}", None
    data = index_resp.get("data") or {}
    orders = data.get("userQueueOrders") or []

    if not orders:
        return "当前无排队订单。", None

    latest = orders[0]
    order_view_id = (
        latest.get("queueOrderViewId")
        or ""
    )

    if not order_view_id:
        return "当前无排队订单。", None

    return None, order_view_id


def cmd_order_detail(client: QueueClient, shop_id: int) -> str:
    """查询最新排队订单详情，返回格式化文案。"""
    err, order_view_id = _get_latest_order_view_id(client, shop_id)
    if err:
        return err

    resp = client.get("queueOrderDetail", params={"queueOrderViewId": order_view_id})
    if resp.get("code") is not None and resp.get("code") != 200:
        err = resp.get("errMsg") or f"请求失败（code={resp.get('code')}）"
        return f"查询订单详情失败：{err}"
    d = resp.get("data") or {}

    if not d:
        return "查询订单详情失败。"

    return _format_order_detail(d, shop_id)


def cmd_order_cancel(client: QueueClient, shop_id: int) -> str:
    """取消最新排队订单，返回格式化文案。"""
    err, order_view_id = _get_latest_order_view_id(client, shop_id)
    if err:
        return err

    resp = client.post("cancelQueue", data={"queueOrderViewId": order_view_id})

    if resp.get("code") == 200:
        return "排队已取消。"
    else:
        err_msg = resp.get("errMsg") or "未知错误"
        return f"取消失败：{err_msg}"


# ---------------------------------------------------------------------------
# Auto Auth: QR code login flow
# ---------------------------------------------------------------------------
def _detect_env() -> str | None:
    """Detect environment from BASE_URL. Returns 'test' or None (prod default)."""
    if "51ping" in BASE_URL:
        return "test"
    return None  # sankuai.com / m.dianping.com = prod


def _get_qr_matrix(data: str):
    """Generate QR code matrix. Returns list of list of bool, or None."""
    # Try segno (pure Python, zero C dependency)
    try:
        import segno
        qr = segno.make(data)
        return [list(row) for row in qr.matrix]
    except ImportError:
        pass
    # Try qrcode library
    try:
        import qrcode
        qr = qrcode.QRCode(border=1, box_size=1)
        qr.add_data(data)
        qr.make(fit=True)
        return qr.get_matrix()
    except ImportError:
        pass
    return None


def _qr_to_terminal(matrix) -> str:
    """Render QR matrix as Unicode terminal art using half-block characters."""
    lines = []
    rows = len(matrix)
    for r in range(0, rows, 2):
        line = ""
        for c in range(len(matrix[0])):
            top = matrix[r][c]
            bot = matrix[r + 1][c] if r + 1 < rows else False
            if top and bot:
                line += "█"
            elif top and not bot:
                line += "▀"
            elif not top and bot:
                line += "▄"
            else:
                line += " "
        lines.append(line)
    return "\n".join(lines)


def _qr_to_svg(matrix, module_size: int = 8) -> str:
    """Render QR matrix as SVG string."""
    size = len(matrix[0]) * module_size
    rects = []
    for r, row in enumerate(matrix):
        for c, cell in enumerate(row):
            if cell:
                x, y = c * module_size, r * module_size
                rects.append(f'<rect x="{x}" y="{y}" width="{module_size}" height="{module_size}"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}">\n'
        f'<rect width="{size}" height="{size}" fill="white"/>\n'
        + "\n".join(rects)
        + "\n</svg>"
    )


def _save_qr_png(data: str, path: str, scale: int = 8) -> bool:
    """Generate and save QR code as PNG. Returns True on success."""
    try:
        import segno
        qr = segno.make(data)
        qr.save(path, scale=scale, border=1)
        return True
    except ImportError:
        pass
    try:
        import qrcode
        img = qrcode.make(data)
        img.save(path)
        return True
    except Exception:
        # ImportError(qrcode 缺失)、OSError(写入失败)、
        # AttributeError/ImportError(Pillow 缺失导致 save 失败)
        pass
    return False


def _render_auth_qr(auth_link: str) -> list[str]:
    """Render auth QR code when available and always show the original auth link.

    Returns list of temp file paths created (for cleanup after auth).
    """
    import tempfile

    temp_files: list[str] = []
    is_terminal = sys.stdout.isatty()
    matrix = _get_qr_matrix(auth_link)

    if is_terminal:
        # === 终端模式 ===
        if matrix:
            print("请使用美团 App 扫码授权：\n")
            terminal_qr = _qr_to_terminal(matrix)
            print(f"{terminal_qr}\n")
            print(f"或打开链接完成授权：{auth_link}\n")

            # 附加导出 PNG/SVG 文件（失败不阻断授权流程）
            try:
                fd, png_path = tempfile.mkstemp(suffix=".png", prefix="auth_qr_")
                os.close(fd)
                if _save_qr_png(auth_link, png_path):
                    print(f"二维码图片已保存: {png_path}")
                    temp_files.append(png_path)
            except OSError:
                pass

            try:
                svg = _qr_to_svg(matrix)
                fd, svg_path = tempfile.mkstemp(suffix=".svg", prefix="auth_qr_")
                os.close(fd)
                with open(svg_path, "w") as f:
                    f.write(svg)
                print(f"二维码 SVG 已保存: {svg_path}")
                temp_files.append(svg_path)
            except OSError:
                pass
            print()
        else:
            # 无法生成二维码，显示链接
            print("需要去美团 App 进行账号登录授权。")
            print(f"请复制链接在手机浏览器中打开：{auth_link}\n")
    else:
        # === 聊天/Agent 模式 ===
        qr_shown = False
        if matrix:
            try:
                fd, png_path = tempfile.mkstemp(suffix=".png", prefix="auth_qr_")
                os.close(fd)
                if _save_qr_png(auth_link, png_path):
                    print("请使用美团 App 扫码授权：\n")
                    print(f"![扫码授权]({png_path})\n")
                    temp_files.append(png_path)
                    qr_shown = True
            except OSError:
                pass

        if not qr_shown:
            # 无法生成二维码，显示友好文案
            print(
                f"需要去美团 App 进行账号登录授权，"
                f"如果是在手机上操作，请 [点击这里]({auth_link}) 去授权。"
                f"如果不是在手机上操作，请复制链接（{auth_link}），"
                f"在手机的浏览器中复制地址并打开。\n"
            )

    print(flush=True)
    return temp_files


def _cleanup_temp_files(paths: list[str]) -> None:
    """清理临时文件，失败静默忽略。"""
    for p in paths:
        try:
            os.unlink(p)
        except OSError:
            pass


def _auto_auth() -> str | None:
    """Auto auth: try cached token → trigger auth → poll → return token."""
    import subprocess
    import shutil

    if not shutil.which("mt-passport"):
        return None

    env = _detect_env()

    # Step 1: try cached token
    cmd = ["mt-passport", "gettoken"]
    if env:
        cmd.extend(["--env", env])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except subprocess.TimeoutExpired:
        pass

    # Step 2: trigger auth → get AUTH_LINK
    cmd = ["mt-passport", "auth"]
    if env:
        cmd.extend(["--env", env])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    except subprocess.TimeoutExpired:
        print("授权请求超时。", file=sys.stderr)
        return None

    auth_link = None
    for line in result.stdout.strip().split("\n"):
        if line.startswith("AUTH_LINK:"):
            auth_link = line.split("AUTH_LINK:", 1)[1].strip()
            break

    if not auth_link:
        print("授权失败：未获取到授权链接。", file=sys.stderr)
        return None

    # Step 3: render QR code (terminal + SVG + PNG + raw link)
    qr_temp_files = _render_auth_qr(auth_link)
    print("等待授权中...", file=sys.stderr)

    # Step 4: poll for authorization
    cmd = ["mt-passport", "auth", "--poll"]
    if env:
        cmd.extend(["--env", env])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        print("授权超时（3分钟），请重试。", file=sys.stderr)
        return None

    if result.returncode != 0:
        _cleanup_temp_files(qr_temp_files)
        detail = result.stderr.strip()[:300] if result.stderr else ""
        msg = "授权失败，请重试。"
        if detail:
            msg += f"\n详情：{detail}"
        print(msg, file=sys.stderr)
        return None

    # Step 5: get token
    cmd = ["mt-passport", "gettoken"]
    if env:
        cmd.extend(["--env", env])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    except subprocess.TimeoutExpired:
        print("获取 token 超时。", file=sys.stderr)
        return None
    if result.returncode == 0 and result.stdout.strip():
        _cleanup_temp_files(qr_temp_files)
        print("授权成功！\n", file=sys.stderr)
        return result.stdout.strip()

    _cleanup_temp_files(qr_temp_files)
    return None


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------
ENV_TOKEN_KEY = "MT_QUEUE_TOKEN"


def _check_version_update() -> None:
    """检查 Skill 版本更新。如果有更新则输出提示并退出，让模型重新加载 SKILL.md。"""
    try:
        from version_checker import check_and_update
    except ImportError:
        return
    skill_dir = Path(__file__).resolve().parent.parent
    try:
        updated, message = check_and_update(skill_dir)
    except Exception:
        return  # 版本检查失败不阻断正常功能
    if updated:
        print(message)
        sys.exit(0)


def main():
    # 版本检查：每次调用前自动检测更新
    _check_version_update()

    parser = argparse.ArgumentParser(
        description="美团排队 — 查询排队状态、取号、查单、取消",
        epilog="""命令说明:
  index          查询门店排队状态和可选桌型
  take_number    取号排队（需指定 --people-count 和 --table-type-id）
  order_detail   查询当前排队订单详情
  order_cancel   取消当前排队订单

示例:
  %(prog)s index 12345
  %(prog)s take_number 12345 --people-count 2 --table-type-id 1
  %(prog)s order_detail 12345
  %(prog)s order_cancel 12345

鉴权:
  通过环境变量 MT_QUEUE_TOKEN 传入 token（推荐），或使用 --token 参数。
  token 也可由 Skill 的 skill-dependencies 自动注入。
""",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "action",
        choices=["index", "take_number", "order_detail", "order_cancel"],
        help="操作类型（index / take_number / order_detail / order_cancel）",
    )
    parser.add_argument(
        "shop_id",
        type=int,
        help="点评门店 ID（从大众点评 URL 获取）",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="登录 token（可选，优先读取环境变量 MT_QUEUE_TOKEN。"
             "注意：命令行参数对同机用户可见，推荐使用环境变量）",
    )
    parser.add_argument("--people-count", type=int, help="就餐人数（take_number 必填）")
    parser.add_argument(
        "--table-type-id", type=int,
        help="桌型 ID（take_number 必填，从 index 返回结果获取）",
    )
    parser.add_argument(
        "--force", action="store_true", default=False,
        help="跳过无人排队确认，直接取号",
    )

    args = parser.parse_args()

    # Token: --token > env MT_QUEUE_TOKEN > auto-auth
    token = args.token or os.environ.get(ENV_TOKEN_KEY)
    if not token and not os.environ.get("MT_QUEUE_NO_AUTO_AUTH"):
        token = _auto_auth()
    if not token:
        parser.error(
            f"缺少 token。请通过环境变量 {ENV_TOKEN_KEY} 传入，或确认 Skill 目录下包含内嵌的 meituan-passport-user-auth。"
        )

    client = QueueClient(token=token)

    try:
        if args.action == "index":
            result = cmd_index(client, args.shop_id)

        elif args.action == "take_number":
            if args.people_count is None or args.table_type_id is None:
                parser.error("take_number requires --people-count and --table-type-id")
            result = cmd_take_number(
                client, args.shop_id, args.people_count, args.table_type_id,
                force=args.force,
            )

        elif args.action == "order_detail":
            result = cmd_order_detail(client, args.shop_id)

        elif args.action == "order_cancel":
            result = cmd_order_cancel(client, args.shop_id)

        else:
            parser.error(f"Unknown action: {args.action}")
            return
    except QueueAPIError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    print(result)


if __name__ == "__main__":
    main()
