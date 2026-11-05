from __future__ import annotations

import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from terics.connectors import browser as browser_module
from terics.connectors.browser import ConnectorBrowserWorker

ROOT = Path(__file__).resolve().parents[2]
HTML = (ROOT / "fixtures" / "html" / "qingguo_list_sample.xls").read_bytes()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(HTML)))
        self.end_headers()
        self.wfile.write(HTML)

    def log_message(self, format: str, *args: object) -> None:
        pass


@pytest.fixture()
def sis_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        thread.join(timeout=5)


def wait_for_message(worker: ConnectorBrowserWorker, kind: str, timeout: float = 20.0) -> dict[str, object]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            message = worker.messages.get(timeout=0.5)
        except Exception:
            continue
        if message.get("type") == kind:
            return message
        if message.get("type") == "error":
            raise AssertionError(message.get("message"))
    raise AssertionError(f"timed out waiting for {kind}")


def test_connector_browser_worker_and_profile_clear(tmp_path, monkeypatch, sis_server) -> None:
    profile = tmp_path / "browser-profile"
    monkeypatch.setattr(browser_module, "default_browser_profile_dir", lambda: profile)
    worker = ConnectorBrowserWorker(profile_dir=profile, headless=True)
    try:
        worker.open_sis(sis_server)
        wait_for_message(worker, "status")
        worker.extract(
            {
                "termName": "2026 秋季",
                "semesterStart": "2026-08-31",
                "teachingWeeks": 20,
                "timezone": "Asia/Shanghai",
            }
        )
        result = wait_for_message(worker, "result")
        data = result["data"]  # type: ignore[index]
        timetable = data["timetable"]  # type: ignore[index]
        assert timetable["schemaVersion"] == "2.0"
        assert len(timetable["courses"]) > 0
        worker.clear_login_data()
        wait_for_message(worker, "status")
        assert not profile.exists()
    finally:
        worker.close()


def test_playwright_persistent_profile_retains_and_clears_storage(tmp_path, sis_server) -> None:
    profile = tmp_path / "profile"
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(str(profile), headless=True)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(sis_server)
        page.evaluate("localStorage.setItem('tericsSessionProbe', 'kept')")
        context.close()
        context = playwright.chromium.launch_persistent_context(str(profile), headless=True)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(sis_server)
        assert page.evaluate("localStorage.getItem('tericsSessionProbe')") == "kept"
        context.close()
    import shutil

    shutil.rmtree(profile)
    assert not profile.exists()
