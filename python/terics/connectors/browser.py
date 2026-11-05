from __future__ import annotations

import os
import queue
import shutil
import threading
from pathlib import Path
from typing import Any

from ..connectors.registry import connector_runtime_path


def default_browser_profile_dir() -> Path:
    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "terics" / "browser-profile"
    return Path.home() / ".local" / "share" / "terics" / "browser-profile"


def _assert_safe_profile_path(profile_dir: Path) -> None:
    expected_root = default_browser_profile_dir().parent.resolve()
    resolved = profile_dir.resolve()
    if expected_root != resolved and expected_root not in resolved.parents:
        raise ValueError("拒绝清理非 terics 默认目录以外的浏览器配置")


class ConnectorBrowserWorker:
    """Owns a Playwright browser in a background thread and a private profile."""

    def __init__(self, profile_dir: Path | None = None, headless: bool = False) -> None:
        self.profile_dir = (profile_dir or default_browser_profile_dir()).resolve()
        self.headless = headless
        self.messages: queue.Queue[dict[str, Any]] = queue.Queue()
        self._commands: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="terics-playwright", daemon=True)
        self._thread.start()

    def open_sis(self, entry_url: str) -> None:
        self.start()
        self._commands.put(("open", {"entry_url": entry_url}))

    def extract(self, semester: dict[str, Any], preferred_adapter_id: str | None = None) -> None:
        self.start()
        self._commands.put(
            (
                "extract",
                {
                    "semester": semester,
                    "preferred_adapter_id": preferred_adapter_id,
                },
            )
        )

    def clear_login_data(self) -> None:
        self.start()
        self._commands.put(("clear", {}))

    def close(self) -> None:
        if self._thread and self._thread.is_alive():
            self._commands.put(("close", {}))

    def _run(self) -> None:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.messages.put({"type": "error", "message": "未安装 Playwright。请执行 python -m pip install -r requirements.txt"})
            return

        context = None
        page = None
        runtime_source = connector_runtime_path()
        with sync_playwright() as playwright:
            while True:
                action, payload = self._commands.get()
                try:
                    if action == "open":
                        if context is None:
                            self.profile_dir.mkdir(parents=True, exist_ok=True)
                            context = playwright.chromium.launch_persistent_context(
                                str(self.profile_dir),
                                headless=self.headless,
                                locale="zh-CN",
                                timezone_id="Asia/Shanghai",
                                viewport={"width": 1360, "height": 900},
                            )
                            page = context.pages[0] if context.pages else context.new_page()
                        if page is None or page.is_closed():
                            page = context.new_page()
                        page.goto(str(payload["entry_url"]), wait_until="domcontentloaded", timeout=60_000)
                        self.messages.put(
                            {
                                "type": "status",
                                "state": "login_required",
                                "message": "浏览器已打开。请在独立浏览器中手动登录并进入“我的课表”。",
                            }
                        )
                    elif action == "extract":
                        if context is None or page is None or page.is_closed():
                            raise RuntimeError("请先打开教务浏览器并完成登录")
                        if not runtime_source.exists():
                            raise RuntimeError("Connector runtime 缺失。请运行 npm run build:connectors 后重试")
                        self.messages.put({"type": "status", "state": "extracting", "message": "正在通过本地 Connector 读取课表…"})
                        page.evaluate(runtime_source.read_text(encoding="utf-8"))
                        result = page.evaluate(
                            """({semester, preferredAdapterId}) =>
                              window.__tericsConnectorRuntime.extract(semester, preferredAdapterId || undefined)""",
                            {
                                "semester": payload["semester"],
                                "preferredAdapterId": payload.get("preferred_adapter_id"),
                            },
                        )
                        self.messages.put({"type": "result", "data": result})
                    elif action == "clear":
                        if context is not None:
                            context.close()
                            context = None
                            page = None
                        _assert_safe_profile_path(self.profile_dir)
                        if self.profile_dir.exists():
                            shutil.rmtree(self.profile_dir)
                        self.messages.put(
                            {
                                "type": "status",
                                "state": "cleared",
                                "message": "独立浏览器登录状态和本地页面数据已清除。",
                            }
                        )
                    elif action == "close":
                        if context is not None:
                            context.close()
                        self.messages.put({"type": "status", "state": "closed", "message": "浏览器已关闭。"})
                        return
                except Exception as exc:  # noqa: BLE001 - worker must report, not crash the queue
                    message = str(exc)
                    if "Executable doesn't exist" in message or "playwright install" in message:
                        message += "\n\n请执行：python -m playwright install chromium"
                    self.messages.put({"type": "error", "message": message})
