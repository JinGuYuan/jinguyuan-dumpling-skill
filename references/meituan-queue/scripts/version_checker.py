#!/usr/bin/env python3
"""
Skill 版本管理 — 自动检查更新并下载最新版本（零外部依赖）

配置文件：与本脚本同目录下的 version_config.json
  {
    "version_url": "https://s3plus-shon.meituan.net/paidui/skill/version.json",
    "current_version": "V1"
  }
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import zipfile
import urllib.request
import urllib.error
from pathlib import Path

# Config 文件与本脚本同目录
CONFIG_FILE = Path(__file__).parent / "version_config.json"

TIMEOUT_VERSION = 5   # 版本检查超时（秒），不影响正常使用
TIMEOUT_DOWNLOAD = 120  # 下载超时（秒）


# ---------------------------------------------------------------------------
# Config I/O
# ---------------------------------------------------------------------------
def _load_config() -> dict:
    if not CONFIG_FILE.exists():
        return {}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_config(config: dict) -> None:
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.write("\n")
    except OSError:
        pass  # 写入失败不阻断主流程


# ---------------------------------------------------------------------------
# Version comparison
# ---------------------------------------------------------------------------
def _is_up_to_date(current: str, latest: str) -> bool:
    """当前版本与远程最新版本一致则返回 True，否则需要更新。"""
    return current.strip() == latest.strip()


# ---------------------------------------------------------------------------
# Remote version fetch
# ---------------------------------------------------------------------------
def _fetch_version_info(version_url: str) -> dict | None:
    """从 CDN 获取版本信息 JSON。失败返回 None。"""
    try:
        req = urllib.request.Request(
            version_url,
            headers={"User-Agent": "MeituanQueue-VersionChecker/1.0"},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_VERSION) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Download and extract
# ---------------------------------------------------------------------------
def _find_zip_root_prefix(zf: zipfile.ZipFile) -> str:
    """检测 zip 内是否有统一根目录前缀（如 meituan-queue-V1/）。"""
    names = zf.namelist()
    if not names:
        return ""
    # 取第一个路径的顶层目录
    first = names[0]
    if "/" not in first:
        return ""
    candidate = first.split("/")[0] + "/"
    # 检查是否所有文件都在这个目录下
    if all(n.startswith(candidate) for n in names):
        return candidate
    return ""


def _download_and_extract(download_url: str, skill_dir: Path) -> bool:
    """下载 zip 并解压到 skill 目录。成功返回 True。"""
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".zip", prefix="skill_update_")
        os.close(fd)

        req = urllib.request.Request(
            download_url,
            headers={"User-Agent": "MeituanQueue-VersionChecker/1.0"},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_DOWNLOAD) as resp:
            with open(tmp_path, "wb") as f:
                f.write(resp.read())

        with zipfile.ZipFile(tmp_path, "r") as zf:
            prefix = _find_zip_root_prefix(zf)
            resolved_root = skill_dir.resolve()
            if prefix:
                # zip 内有根目录包裹，剥离后解压
                for member in zf.infolist():
                    if member.filename == prefix or not member.filename.startswith(prefix):
                        continue
                    # 去掉前缀
                    member.filename = member.filename[len(prefix):]
                    if not member.filename:
                        continue
                    # 防止路径穿越（Zip Slip）
                    target = (skill_dir / member.filename).resolve()
                    if not str(target).startswith(str(resolved_root)):
                        continue
                    zf.extract(member, skill_dir)
            else:
                # 校验所有成员路径安全后再解压
                for member in zf.infolist():
                    target = (skill_dir / member.filename).resolve()
                    if not str(target).startswith(str(resolved_root)):
                        continue
                    zf.extract(member, skill_dir)

        return True
    except Exception as e:
        print(f"[版本更新] 下载或解压失败：{e}", file=sys.stderr)
        return False
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def check_and_update(skill_dir: Path | None = None) -> tuple[bool, str]:
    """
    检查版本并按需更新。

    Args:
        skill_dir: Skill 根目录（包含 SKILL.md 的目录）。
                   默认为本脚本的上级目录（scripts/ 的父目录）。

    Returns:
        (updated, message)
        - updated=True 且 message 非空时，调用方应将 message 输出给用户/模型，
          并提示模型重新加载 SKILL.md。
        - updated=False 表示无需更新或更新失败，正常继续。
    """
    if skill_dir is None:
        skill_dir = Path(__file__).resolve().parent.parent

    config = _load_config()
    version_url = config.get("version_url")
    current_version = config.get("current_version", "0.0.0")

    if not version_url:
        return False, ""

    # 1. 获取远程版本信息
    version_info = _fetch_version_info(version_url)
    if not version_info:
        return False, ""

    latest = version_info.get("latest", "")
    if not latest:
        return False, ""

    # 2. 比较版本
    if _is_up_to_date(current_version, latest):
        return False, ""

    # 3. 获取下载信息
    version_detail = version_info.get("versions", {}).get(latest, {})
    download_url = version_detail.get("download_url")
    changelog = version_detail.get("changelog", "")

    if not download_url:
        return False, ""

    print(
        f"[版本更新] 发现新版本 {latest}（当前 {current_version}），正在下载更新...",
        file=sys.stderr,
    )

    # 4. 保存当前配置（CDN URL），防止 zip 解压覆盖
    saved_version_url = version_url

    # 5. 下载并解压
    if not _download_and_extract(download_url, skill_dir):
        return False, ""

    # 6. 更新本地版本号（恢复 CDN URL 以防被 zip 覆盖）
    new_config = _load_config()
    new_config["version_url"] = saved_version_url
    new_config["current_version"] = latest
    _save_config(new_config)

    # 7. 构建更新消息
    msg_lines = [
        f"[版本更新] Skill 已从 {current_version} 更新到 {latest}。",
    ]
    if changelog:
        msg_lines.append(f"更新内容：{changelog}")
    msg_lines.append(
        f"Skill 目录 {skill_dir} 中的文件已更新，请重新加载 SKILL.md 以获取最新指令。"
    )

    print(f"[版本更新] 更新完成：{current_version} -> {latest}", file=sys.stderr)

    return True, "\n".join(msg_lines)


# ---------------------------------------------------------------------------
# CLI: 支持独立调用
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Skill 版本检查与更新")
    parser.add_argument(
        "--skill-dir",
        default=None,
        help="Skill 根目录（默认：本脚本上级目录）",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="仅检查版本，不执行更新",
    )
    args = parser.parse_args()

    sd = Path(args.skill_dir) if args.skill_dir else None

    if args.check_only:
        config = _load_config()
        version_url = config.get("version_url")
        current = config.get("current_version", "0.0.0")
        print(f"当前版本：{current}")
        if version_url:
            info = _fetch_version_info(version_url)
            if info:
                latest = info.get("latest", "未知")
                print(f"最新版本：{latest}")
                if not _is_up_to_date(current, latest):
                    print("状态：有新版本可用")
                else:
                    print("状态：已是最新")
            else:
                print("状态：无法获取远程版本信息")
        else:
            print("状态：未配置 version_url")
    else:
        updated, message = check_and_update(sd)
        if updated:
            print(message)
        else:
            print("已是最新版本，无需更新。")
