from __future__ import annotations

import copy
import json
import tkinter as tk
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog, ttk

from .connectors.browser import ConnectorBrowserWorker
from .connectors.registry import SchoolProfile, list_schools
from .course import build_events
from .dates import monday_of_iso
from .errors import TericsParseError
from .google.auth import GoogleOAuthNotConfiguredError, authenticate, clear_google_credentials, oauth_configured
from .google.calendar_sync import GoogleApiCalendarClient, execute_sync_plan, plan_google_sync
from .ics import generate_ics, generate_ics_v2, suggested_file_name, suggested_ics_v2_file_name
from .models import (
    APP_VERSION,
    DEFAULT_PERIODS,
    TIMEZONE,
    BuildResult,
    CalendarEvent,
    ParseResult,
    PeriodTime,
    SemesterConfig,
)
from .parsers import parse_timetable_file
from .timetable_v2 import build_v2_events, parse_terics_json, validate_timetable_v2

INK = "#111410"
INK_SOFT = "#353A32"
PAPER = "#F2F0E7"
PAPER_2 = "#E7E5DA"
PANEL = "#F8F6EF"
LINE = "#BBB9AD"
MUTED = "#73776D"
ACCENT = "#FF5A1F"
SIGNAL = "#B9F34A"
DANGER = "#C92814"
SUCCESS = "#2F7D32"
WARNING = "#B86C00"
ROOM_BLUE = "#556B73"
MONO = ("Cascadia Mono", 9)
MONO_SMALL = ("Cascadia Mono", 8)
SANS = ("Segoe UI", 10)
SANS_SMALL = ("Segoe UI", 9)
SERIF = ("Georgia", 25)


class TericsApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(f"terics {APP_VERSION} — 高校课表转 ICS")
        self.root.geometry("1280x950")
        self.root.minsize(1040, 760)
        self.root.configure(bg=PAPER)

        self.parsed: ParseResult | None = None
        self.timetable_v2: dict[str, object] | None = None
        self.v2_build = None
        self.source_path: Path | None = None
        self.config = self._default_config()
        self.build: BuildResult | None = None
        self.browser_worker: ConnectorBrowserWorker | None = None
        self.school_profiles: dict[str, SchoolProfile] = {}
        self.google_last_result = "未同步"
        self.selected_week = 1
        self.week_button_map: dict[int, tk.Button] = {}

        self.vars = {
            "title": tk.StringVar(value=self.config.title),
            "start": tk.StringVar(value=self.config.semester_start),
            "teaching_weeks": tk.StringVar(value="20"),
            "alarm": tk.StringVar(value=str(self.config.alarm_minutes)),
        }
        self.period_vars: list[tuple[tk.StringVar, tk.StringVar]] = []
        self.conflict_ack = tk.BooleanVar(value=False)

        self._configure_style()
        self._build_layout()
        self._render_periods()
        self._set_step(0)
        self._set_status("idle", "等待文件")
        self._set_export_enabled(False)
        self.root.bind("<Control-o>", lambda _event: self.choose_file())
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(250, self._poll_browser_messages)

    def _default_config(self) -> SemesterConfig:
        today = date.today()
        anchor = date(today.year, 9, 1) if today.month >= 7 else date(today.year, 3, 1)
        monday = anchor - timedelta(days=anchor.weekday())
        season = "秋季" if today.month >= 7 else "春季"
        return SemesterConfig(
            title=f"{today.year} {season}课表",
            semester_start=monday.isoformat(),
            timezone=TIMEZONE,
            periods=[replace(period) for period in DEFAULT_PERIODS],
            alarm_minutes=10,
        )

    def _configure_style(self) -> None:
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure(".", font=SANS, background=PANEL, foreground=INK)
        style.configure("Treeview", background="#FFFDF6", fieldbackground="#FFFDF6", rowheight=25, font=SANS_SMALL)
        style.configure(
            "Treeview.Heading",
            background=PAPER_2,
            foreground=INK_SOFT,
            font=MONO_SMALL,
            relief="flat",
            padding=(6, 5),
        )
        style.map("Treeview", background=[("selected", "#FFE8D9")], foreground=[("selected", INK)])
        style.configure("TCombobox", fieldbackground="#FFFDF6", background="#FFFDF6", arrowcolor=INK)
        style.configure("TPanedwindow", background=PAPER)

    def _card(self, parent: tk.Misc) -> tk.Frame:
        return tk.Frame(parent, bg=PANEL, highlightbackground=LINE, highlightthickness=1)

    def _eyebrow(self, parent: tk.Misc, text: str, row: int, column: int = 0) -> tk.Label:
        label = tk.Label(parent, text=text, bg=PANEL, fg=ACCENT, font=MONO_SMALL, anchor="w")
        label.grid(row=row, column=column, sticky="w")
        return label

    def _build_layout(self) -> None:
        self.root.grid_rowconfigure(1, weight=1)
        self.root.grid_columnconfigure(0, weight=1)
        self._build_header()
        content = tk.Frame(self.root, bg=PAPER)
        content.grid(row=1, column=0, sticky="nsew")
        content.grid_rowconfigure(0, weight=1)
        content.grid_columnconfigure(1, weight=1)
        content.grid_columnconfigure(2, minsize=300)
        self._build_rail(content)
        self._build_center(content)
        self._build_export(content)

    def _build_header(self) -> None:
        header = tk.Frame(self.root, bg=INK, height=54)
        header.grid(row=0, column=0, sticky="ew")
        header.grid_propagate(False)
        header.grid_columnconfigure(1, weight=1)
        logo = tk.Label(header, text="≡ TERICS", bg=INK, fg=PAPER, font=("Cascadia Mono", 15, "bold"))
        logo.grid(row=0, column=0, padx=(18, 8), pady=12, sticky="w")
        version = tk.Label(header, text=f"v{APP_VERSION}", bg=INK, fg=SIGNAL, font=MONO_SMALL, padx=7, pady=2)
        version.configure(highlightbackground="#465039", highlightthickness=1)
        version.grid(row=0, column=1, sticky="w")
        center = tk.Label(header, text="UNIVERSITY TIMETABLE  →  ICALENDAR", bg=INK, fg="#A8AEA2", font=MONO_SMALL)
        center.grid(row=0, column=2)
        local = tk.Label(header, text="●  LOCAL / 0 UPLOAD", bg=INK, fg=SIGNAL, font=MONO_SMALL, padx=18)
        local.grid(row=0, column=3, sticky="e")
    def _build_rail(self, parent: tk.Frame) -> None:
        rail = tk.Frame(parent, bg=PAPER, width=205, highlightbackground=LINE, highlightthickness=1)
        rail.grid(row=0, column=0, sticky="nsw")
        rail.grid_propagate(False)
        rail.grid_columnconfigure(0, weight=1)
        tk.Label(rail, text="CONVERSION MANIFEST", bg=PAPER, fg=MUTED, font=MONO_SMALL).grid(
            row=0, column=0, padx=18, pady=(22, 14), sticky="w"
        )
        self.step_labels: list[tk.Label] = []
        for index, text in enumerate(["选择文件", "自动识别", "确认时间", "预览课程", "导出 ICS"]):
            label = tk.Label(
                rail,
                text=f"{index + 1:02d}   {text}",
                bg=PAPER,
                fg=MUTED,
                font=SANS,
                anchor="w",
                padx=18,
                pady=11,
                highlightbackground=LINE,
                highlightthickness=1,
            )
            label.grid(row=index + 1, column=0, sticky="ew")
            self.step_labels.append(label)

        privacy = tk.Frame(rail, bg=PAPER)
        privacy.grid(row=7, column=0, sticky="ew", padx=18, pady=(26, 0))
        tk.Label(privacy, text="PRIVACY CONTROL", bg=PAPER, fg=MUTED, font=MONO_SMALL, anchor="w").pack(fill="x")
        tk.Label(
            privacy,
            text="课表只在当前电脑内解析。没有后端、账号、Cookie 或上传请求。",
            bg=PAPER,
            fg=INK_SOFT,
            font=SANS_SMALL,
            justify="left",
            wraplength=165,
            anchor="w",
        ).pack(fill="x", pady=(8, 10))
        tk.Label(privacy, text="LOCAL ONLY  ██████████  100%", bg=PAPER, fg=SUCCESS, font=("Cascadia Mono", 7)).pack(anchor="w")

        matrix = tk.Frame(rail, bg=PAPER)
        matrix.grid(row=8, column=0, sticky="ew", padx=18, pady=(24, 0))
        tk.Label(matrix, text="FORMAT MATRIX", bg=PAPER, fg=MUTED, font=MONO_SMALL).pack(fill="x", pady=(0, 5))
        for name, status, color in [
            ("CSV", "VERIFIED", SUCCESS),
            ("HTML 表格", "VERIFIED", SUCCESS),
            ("XLSX", "VERIFIED", SUCCESS),
            ("旧版二进制 XLS", "N/A", MUTED),
        ]:
            row = tk.Frame(matrix, bg=PAPER)
            row.pack(fill="x", pady=3)
            tk.Label(row, text=name, bg=PAPER, fg=INK_SOFT, font=("Cascadia Mono", 7)).pack(side="left")
            tk.Label(row, text=status, bg=PAPER, fg=color, font=("Cascadia Mono", 7)).pack(side="right")
        tk.Label(rail, text="RFC 5545          Asia/Shanghai", bg=PAPER, fg=MUTED, font=("Cascadia Mono", 7)).grid(
            row=10, column=0, sticky="sw", padx=18, pady=18
        )
        rail.grid_rowconfigure(10, weight=1)

    def _build_center(self, parent: tk.Frame) -> None:
        center = tk.Frame(parent, bg=PAPER)
        center.grid(row=0, column=1, sticky="nsew", padx=14, pady=14)
        center.grid_columnconfigure(0, weight=1)
        center.grid_rowconfigure(0, weight=1)

        self.center_canvas = tk.Canvas(center, bg=PAPER, highlightthickness=0, bd=0)
        scrollbar = ttk.Scrollbar(center, orient="vertical", command=self.center_canvas.yview)
        self.center_canvas.configure(yscrollcommand=scrollbar.set)
        self.center_canvas.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")

        content = tk.Frame(self.center_canvas, bg=PAPER)
        window_id = self.center_canvas.create_window((0, 0), window=content, anchor="nw")
        content.grid_columnconfigure(0, weight=1)
        content.bind(
            "<Configure>",
            lambda _event: self.center_canvas.configure(scrollregion=self.center_canvas.bbox("all")),
        )
        self.center_canvas.bind(
            "<Configure>",
            lambda event: self.center_canvas.itemconfigure(window_id, width=event.width),
        )

        setup = self._card(content)
        setup.grid(row=0, column=0, sticky="ew")
        setup.grid_columnconfigure(1, weight=1)
        self._build_ingest(setup)
        self._build_settings(setup)
        preview = self._card(content)
        preview.grid(row=1, column=0, sticky="ew", pady=(12, 0))
        preview.grid_columnconfigure(0, weight=1)
        self._build_preview(preview)

    def _build_ingest(self, card: tk.Frame) -> None:
        self._eyebrow(card, "01 / INGEST", 0)
        self.status_label = tk.Label(card, text="", bg=PAPER_2, fg=MUTED, font=MONO_SMALL, padx=10, pady=5)
        self.status_label.grid(row=0, column=1, padx=18, pady=(12, 0), sticky="e")
        tk.Label(card, text="把课表变成日历事件", bg=PANEL, fg=INK, font=SERIF, anchor="w").grid(
            row=1, column=0, columnspan=2, sticky="w", padx=18
        )
        actions = tk.Frame(card, bg=PANEL)
        actions.grid(row=2, column=0, columnspan=2, sticky="ew", padx=18, pady=(12, 0))
        actions.grid_columnconfigure(2, weight=1)
        tk.Button(
            actions, text="选择课表文件", command=self.choose_file, bg=INK, fg=PAPER,
            activebackground=INK_SOFT, activeforeground=PAPER, font=("Segoe UI", 10, "bold"),
            relief="flat", padx=16, pady=8, cursor="hand2",
        ).grid(row=0, column=0, rowspan=2, sticky="w")
        tk.Button(
            actions, text="载入 CSV 样例", command=lambda: self.load_sample("csv"), bg=PAPER_2, fg=INK_SOFT,
            activebackground="#DDDACD", font=MONO_SMALL, relief="flat", padx=10, pady=7, cursor="hand2",
        ).grid(row=0, column=1, padx=(8, 4), sticky="w")
        tk.Button(
            actions, text="载入 v2 样例", command=lambda: self.load_sample("v2"), bg=PAPER_2, fg=INK_SOFT,
            activebackground="#DDDACD", font=MONO_SMALL, relief="flat", padx=10, pady=7, cursor="hand2",
        ).grid(row=1, column=1, padx=(8, 14), sticky="w")
        self.file_label = tk.Label(actions, text="HTML / CSV / XLSX / .terics.json · 最大 10 MiB", bg=PANEL, fg=MUTED, font=SANS_SMALL, anchor="w")
        self.file_label.grid(row=0, column=2, sticky="w")
        self.file_meta = tk.Label(
            actions,
            text="按文件内容识别，不依赖扩展名",
            bg=PANEL,
            fg=MUTED,
            font=("Cascadia Mono", 7),
            anchor="w",
        )
        self.file_meta.grid(row=1, column=2, sticky="w")

        browser_bar = tk.Frame(actions, bg=PANEL)
        browser_bar.grid(row=2, column=0, columnspan=3, sticky="ew", pady=(9, 0))
        tk.Label(browser_bar, text="直连教务", bg=PANEL, fg=MUTED, font=("Cascadia Mono", 8)).pack(side="left")
        self.school_profiles = {f"{school.name} · {school.status}": school for school in list_schools()}
        self.school_select = ttk.Combobox(
            browser_bar,
            values=list(self.school_profiles),
            state="readonly",
            width=27,
            font=("Segoe UI", 9),
        )
        self.school_select.pack(side="left", padx=(8, 8))
        if self.school_select["values"]:
            self.school_select.current(0)
        self.open_sis_button = tk.Button(
            browser_bar,
            text="打开教务浏览器",
            command=self.open_sis_browser,
            bg=INK_SOFT,
            fg=PAPER,
            activebackground=INK,
            activeforeground=PAPER,
            font=("Segoe UI", 8, "bold"),
            relief="flat",
            padx=10,
            pady=5,
            cursor="hand2",
        )
        self.open_sis_button.pack(side="left")
        self.extract_sis_button = tk.Button(
            browser_bar,
            text="从浏览器提取",
            command=self.extract_from_sis_browser,
            bg=PAPER_2,
            fg=INK_SOFT,
            activebackground="#DDDACD",
            font=("Segoe UI", 8),
            relief="flat",
            padx=10,
            pady=5,
            state="disabled",
            cursor="arrow",
        )
        self.extract_sis_button.pack(side="left", padx=(7, 0))
        self.clear_sis_button = tk.Button(
            browser_bar,
            text="清除登录状态",
            command=self.clear_sis_login,
            bg=PANEL,
            fg=MUTED,
            activebackground=PANEL,
            font=("Segoe UI", 8),
            relief="flat",
            padx=6,
            pady=5,
            cursor="hand2",
        )
        self.clear_sis_button.pack(side="left", padx=(6, 0))
        self.browser_status_label = tk.Label(
            browser_bar,
            text="不读取日常浏览器资料",
            bg=PANEL,
            fg=MUTED,
            font=("Cascadia Mono", 7),
            anchor="e",
        )
        self.browser_status_label.pack(side="right", fill="x", expand=True)

        self.issue_label = tk.Label(
            card, text="", bg="#FFF8ED", fg=WARNING, font=SANS_SMALL, justify="left",
            anchor="w", wraplength=700, padx=10, pady=7,
        )
        self.issue_label.grid(row=3, column=0, columnspan=2, sticky="ew", padx=18, pady=(10, 14))
        self.issue_label.grid_remove()

    def _build_settings(self, card: tk.Frame) -> None:
        tk.Frame(card, bg=LINE, height=1).grid(row=4, column=0, columnspan=2, sticky="ew", padx=18, pady=(0, 14))
        self._eyebrow(card, "02 / CALIBRATE", 5)
        tk.Label(card, text="确认学期与节次", bg=PANEL, fg=INK, font=("Georgia", 20), anchor="w").grid(
            row=6, column=0, sticky="w", padx=18, pady=(1, 10)
        )
        tk.Label(card, text="修改后点击应用重新计算", bg=PANEL, fg=MUTED, font=MONO_SMALL).grid(
            row=5, column=1, rowspan=2, padx=18, sticky="e"
        )
        fields = tk.Frame(card, bg=PANEL)
        fields.grid(row=7, column=0, columnspan=2, sticky="ew", padx=18)
        for index in range(4):
            fields.grid_columnconfigure(index, weight=1 if index != 0 else 2)
        self._labeled_entry(fields, "日历名称", self.vars["title"], 0, 0, span=2)
        self._labeled_entry(fields, "第 1 周周一", self.vars["start"], 0, 2)
        self._labeled_entry(fields, "时区", tk.StringVar(value=TIMEZONE), 0, 3, readonly=True)
        tk.Label(fields, text="课前提醒", bg=PANEL, fg=MUTED, font=("Cascadia Mono", 8), anchor="w").grid(
            row=2, column=0, sticky="w", pady=(8, 2)
        )
        ttk.Combobox(fields, textvariable=self.vars["alarm"], values=("0", "5", "10", "15", "30"), state="readonly", width=8).grid(
            row=3, column=0, sticky="w", padx=(0, 10)
        )
        self.monday_hint = tk.Label(fields, text="选择其他日期会自动对齐到周一", bg=PANEL, fg=MUTED, font=("Segoe UI", 8), anchor="w")
        self.monday_hint.grid(row=3, column=2, columnspan=2, sticky="w", padx=(8, 0))

        period_head = tk.Frame(card, bg=PANEL)
        period_head.grid(row=8, column=0, columnspan=2, sticky="ew", padx=18, pady=(14, 5))
        period_head.grid_columnconfigure(0, weight=1)
        tk.Label(period_head, text="节次时间", bg=PANEL, fg=INK_SOFT, font=("Cascadia Mono", 9, "bold")).grid(row=0, column=0, sticky="w")
        tk.Label(period_head, text="多节连堂使用首节开始与末节结束。", bg=PANEL, fg=MUTED, font=("Segoe UI", 8)).grid(row=1, column=0, sticky="w")
        tk.Button(
            period_head, text="应用时间并重新预览", command=self.apply_settings, bg=INK_SOFT, fg=PAPER,
            activebackground=INK, activeforeground=PAPER, font=("Segoe UI", 9, "bold"),
            relief="flat", padx=12, pady=6, cursor="hand2",
        ).grid(row=0, column=1, rowspan=2, sticky="e")
        self.period_frame = tk.Frame(card, bg=PANEL)
        self.period_frame.grid(row=9, column=0, columnspan=2, sticky="ew", padx=18, pady=(0, 14))
        for column in range(3):
            self.period_frame.grid_columnconfigure(column, weight=1)

    def _labeled_entry(
        self, parent: tk.Frame, label: str, variable: tk.StringVar, row: int, column: int,
        span: int = 1, readonly: bool = False,
    ) -> None:
        tk.Label(parent, text=label, bg=PANEL, fg=MUTED, font=("Cascadia Mono", 8), anchor="w").grid(
            row=row, column=column, columnspan=span, sticky="w", pady=(2, 2)
        )
        tk.Entry(
            parent, textvariable=variable, bg=PAPER_2 if readonly else "#FFFDF6",
            fg=MUTED if readonly else INK, relief="flat", highlightbackground=LINE,
            highlightcolor=ACCENT, highlightthickness=1, font=("Cascadia Mono", 10),
            state="readonly" if readonly else "normal",
        ).grid(row=row + 1, column=column, columnspan=span, sticky="ew", padx=(0, 10), ipady=6)

    def _render_periods(self) -> None:
        for child in self.period_frame.winfo_children():
            child.destroy()
        self.period_vars.clear()
        for index, period in enumerate(self.config.periods):
            row, column = divmod(index, 3)
            cell = tk.Frame(self.period_frame, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
            cell.grid(row=row, column=column, sticky="ew", padx=(0 if column == 0 else 4, 0 if column == 2 else 4), pady=2)
            cell.grid_columnconfigure(1, weight=1)
            cell.grid_columnconfigure(3, weight=1)
            tk.Label(cell, text=f"{period.index:02d}", bg=PANEL, fg=MUTED, font=("Cascadia Mono", 8), width=3).grid(row=0, column=0, padx=3, pady=4)
            start = tk.StringVar(value=period.start)
            end = tk.StringVar(value=period.end)
            self.period_vars.append((start, end))
            for clock_var, clock_column in ((start, 1), (end, 3)):
                tk.Entry(
                    cell, textvariable=clock_var, width=7, justify="center", bg="#FFFDF6", fg=INK,
                    relief="flat", highlightbackground=LINE, highlightcolor=ACCENT,
                    highlightthickness=1, font=("Cascadia Mono", 8),
                ).grid(row=0, column=clock_column, sticky="ew", padx=3, pady=4)
            tk.Label(cell, text="–", bg=PANEL, fg=MUTED, font=("Cascadia Mono", 8)).grid(row=0, column=2)
    def _build_preview(self, card: tk.Frame) -> None:
        self._eyebrow(card, "03 / TIMETABLE", 0)
        tk.Label(card, text="教学周课表", bg=PANEL, fg=INK, font=("Georgia", 20), anchor="w").grid(
            row=1, column=0, sticky="w", padx=18, pady=(1, 10)
        )
        metrics = tk.Frame(card, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        metrics.grid(row=2, column=0, sticky="ew", padx=18, pady=(0, 9))
        for index, (label, key) in enumerate([("EVENTS", "events"), ("DATE RANGE", "range"), ("CONFLICTS", "conflicts"), ("WEEKS", "weeks")]):
            metrics.grid_columnconfigure(index, weight=1)
            cell = tk.Frame(metrics, bg=PANEL)
            cell.grid(row=0, column=index, sticky="ew", padx=9, pady=6)
            tk.Label(cell, text=label, bg=PANEL, fg=MUTED, font=("Cascadia Mono", 7), anchor="w").pack(fill="x")
            value = tk.Label(cell, text="—", bg=PANEL, fg=INK, font=("Cascadia Mono", 9), anchor="w")
            value.pack(fill="x")
            setattr(self, f"{key}_label", value)

        week_wrap = tk.Frame(card, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        week_wrap.grid(row=3, column=0, sticky="ew", padx=18, pady=(0, 8))
        week_head = tk.Frame(week_wrap, bg=PAPER_2)
        week_head.pack(fill="x")
        tk.Label(
            week_head, text="TEACHING WEEKS", bg=PAPER_2, fg=MUTED,
            font=("Cascadia Mono", 7), anchor="w",
        ).pack(side="left", padx=8, pady=5)
        self.week_label = tk.Label(
            week_head, text="等待课表", bg=PAPER_2, fg=INK_SOFT,
            font=("Segoe UI", 9), anchor="e",
        )
        self.week_label.pack(side="right", padx=8, pady=5)
        self.week_buttons_frame = tk.Frame(week_wrap, bg=PANEL)
        self.week_buttons_frame.pack(fill="x")

        board = tk.Frame(card, bg="#FFFDF6", highlightbackground=LINE, highlightthickness=1)
        board.grid(row=4, column=0, sticky="ew", padx=18, pady=(0, 7))
        board.grid_columnconfigure(0, weight=1)
        self.timetable_canvas = tk.Canvas(
            board, bg="#FFFDF6", height=190, highlightthickness=0,
            xscrollincrement=24,
        )
        canvas_scroll = ttk.Scrollbar(board, orient="horizontal", command=self.timetable_canvas.xview)
        self.timetable_canvas.configure(xscrollcommand=canvas_scroll.set)
        self.timetable_canvas.grid(row=0, column=0, sticky="ew")
        canvas_scroll.grid(row=1, column=0, sticky="ew")
        self.timetable_canvas.bind("<Configure>", lambda _event: self._render_timetable_canvas(self.build))
        self.course_detail_label = tk.Label(
            card, text="点击课表块查看课程时间、教师与地点。", bg=PANEL, fg=MUTED,
            font=SANS_SMALL, anchor="w", justify="left",
        )
        self.course_detail_label.grid(row=5, column=0, sticky="ew", padx=18, pady=(0, 8))

        tree_frame = tk.Frame(card, bg=PANEL)
        tree_frame.grid(row=6, column=0, sticky="nsew", padx=18, pady=(0, 8))
        tree_frame.grid_rowconfigure(0, weight=1)
        tree_frame.grid_columnconfigure(0, weight=1)
        columns = ("date", "weekday", "time", "course", "section", "teacher", "location")
        self.tree = ttk.Treeview(tree_frame, columns=columns, show="headings", height=6)
        headings = ["日期", "星期", "时间", "课程", "节次", "教师", "地点"]
        widths = [92, 48, 90, 170, 58, 80, 125]
        for column, heading, width in zip(columns, headings, widths, strict=True):
            self.tree.heading(column, text=heading)
            self.tree.column(column, width=width, minwidth=40, stretch=column in {"course", "location"})
        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.tree.tag_configure("conflict", background="#FFF0EB")

        conflict_row = tk.Frame(card, bg=PANEL)
        conflict_row.grid(row=7, column=0, sticky="ew", padx=18, pady=(0, 10))
        self.conflict_label = tk.Label(conflict_row, text="", bg=PANEL, fg=DANGER, font=MONO_SMALL, anchor="w")
        self.conflict_check = tk.Checkbutton(
            conflict_row, text="我已检查冲突，仍要导出", variable=self.conflict_ack,
            command=self._refresh_export_state, bg=PANEL, fg=DANGER,
            activebackground=PANEL, selectcolor="#FFF0EB", font=SANS_SMALL,
        )
        self.empty_preview = tk.Label(
            card, text="选择文件后，这里会按教学周展开课表。", bg=PANEL,
            fg=MUTED, font=SANS_SMALL, padx=20, pady=25,
        )
        self.empty_preview.grid(row=8, column=0, sticky="ew", padx=18)
        self._set_conflict_controls(False, [])

    def _week_range(self, week: int) -> str:
        start_day = date.fromisoformat(self.config.semester_start) + timedelta(days=(week - 1) * 7)
        end_day = start_day + timedelta(days=6)
        return f"{start_day:%m/%d}–{end_day:%m/%d}"

    def _set_week(self, week: int) -> None:
        self.selected_week = week
        for number, button in self.week_button_map.items():
            button.configure(bg=ACCENT if number == week else PANEL, fg=PAPER if number == week else MUTED)
        if self.build is not None:
            self.week_label.configure(text=f"第 {week} 周 · {self._week_range(week)}")
            self._render_timetable_canvas(self.build)

    def _render_week_ruler(self, build: BuildResult) -> None:
        for child in self.week_buttons_frame.winfo_children():
            child.destroy()
        self.week_button_map = {}
        configured_weeks = int(self.vars["teaching_weeks"].get() or 20)
        max_week = max([configured_weeks, *[event.week for event in build.events], 1])
        today = date.today()
        semester_start = date.fromisoformat(self.config.semester_start)
        current_week = min(max_week, max(1, (today - semester_start).days // 7 + 1)) if today >= semester_start else 1
        self.selected_week = min(max_week, max(1, self.selected_week or current_week))
        for week in range(1, max_week + 1):
            button = tk.Button(
                self.week_buttons_frame, text=f"{week:02d}", command=lambda value=week: self._set_week(value),
                width=3, height=1, bd=0, relief="flat", bg=PANEL, fg=MUTED,
                activebackground=ACCENT, activeforeground=PAPER, font=("Cascadia Mono", 8),
                cursor="hand2", padx=4, pady=5,
            )
            button.pack(side="left", padx=(0, 1), pady=1)
            self.week_button_map[week] = button
        self._set_week(self.selected_week)

    def _render_timetable_canvas(self, build: BuildResult | None) -> None:
        canvas = self.timetable_canvas
        canvas.delete("all")
        if build is None or not build.events:
            return
        week = self.selected_week
        events = [event for event in build.events if event.week == week]
        periods = self.config.periods or DEFAULT_PERIODS
        row_height = 34
        header_height = 28
        gutter = 62
        day_width = 116
        width = max(canvas.winfo_width(), gutter + day_width * 7)
        height = header_height + row_height * len(periods) + 2
        canvas.configure(scrollregion=(0, 0, width, height))
        canvas.create_rectangle(0, 0, gutter, height, fill=PAPER_2, outline=LINE)
        canvas.create_text(gutter / 2, header_height / 2, text="节次", fill=MUTED, font=("Cascadia Mono", 7))
        days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        for weekday, label in enumerate(days, start=1):
            x0 = gutter + (weekday - 1) * day_width
            canvas.create_rectangle(x0, 0, x0 + day_width, header_height, fill=PAPER_2, outline=LINE)
            canvas.create_text(x0 + day_width / 2, header_height / 2, text=label, fill=INK_SOFT, font=("Segoe UI", 9, "bold"))
        for row, period in enumerate(periods):
            y0 = header_height + row * row_height
            fill = "#FFFDF6" if row % 2 == 0 else "#F8F5EA"
            canvas.create_rectangle(0, y0, gutter, y0 + row_height, fill=PAPER_2, outline=LINE)
            canvas.create_text(8, y0 + 8, anchor="nw", text=f"{period.index:02d}", fill=INK, font=("Cascadia Mono", 8, "bold"))
            canvas.create_text(26, y0 + 8, anchor="nw", text=f"{period.start}–{period.end}", fill=MUTED, font=("Cascadia Mono", 6))
            for weekday in range(1, 8):
                x0 = gutter + (weekday - 1) * day_width
                canvas.create_rectangle(x0, y0, x0 + day_width, y0 + row_height, fill=fill, outline="#E2DED2")
        period_indexes = {period.index: row for row, period in enumerate(periods)}
        conflict_indexes = {index for conflict in build.conflicts for index in conflict.event_indexes}
        for index, event in enumerate(build.events):
            if event.week != week:
                continue
            start_row = period_indexes.get(event.start_period)
            end_row = period_indexes.get(event.end_period)
            if start_row is None or end_row is None or end_row < start_row:
                continue
            x0 = gutter + (event.weekday - 1) * day_width + 3
            y0 = header_height + start_row * row_height + 3
            x1 = x0 + day_width - 6
            y1 = header_height + (end_row + 1) * row_height - 3
            fill = "#FFF0E7" if index not in conflict_indexes else "#FFE0D8"
            outline = DANGER if index in conflict_indexes else ACCENT
            rect = canvas.create_rectangle(x0, y0, x1, y1, fill=fill, outline=outline, width=2 if index in conflict_indexes else 1)
            canvas.create_text(x0 + 5, y0 + 4, anchor="nw", width=max(40, int(x1 - x0 - 10)), text=event.title, fill=INK, font=("Segoe UI", 8, "bold"))
            canvas.create_text(x0 + 5, y1 - 4, anchor="sw", width=max(40, int(x1 - x0 - 10)), text=f"{event.start}–{event.end} · {event.location or '地点未提供'}", fill=ROOM_BLUE, font=("Cascadia Mono", 6))
            canvas.tag_bind(rect, "<Button-1>", lambda _click, item=event: self._show_course_detail(item))
        if not events:
            canvas.create_text(width / 2, height / 2, text=f"第 {week} 周没有课程安排", fill=MUTED, font=SANS_SMALL)

    def _show_course_detail(self, event: CalendarEvent) -> None:
        self.course_detail_label.configure(
            text=f"{event.title}  ·  {event.date} {event.start}–{event.end}  ·  {event.teacher or '教师未提供'}  ·  {event.location or '地点未提供'}",
            fg=INK_SOFT,
        )

    def _build_export(self, parent: tk.Frame) -> None:
        panel = tk.Frame(parent, bg=INK, width=300, highlightbackground="#363B33", highlightthickness=1)
        panel.grid(row=0, column=2, sticky="nsew")
        panel.grid_propagate(False)
        panel.grid_columnconfigure(0, weight=1)
        tk.Label(panel, text="04 / EXPORT", bg=INK, fg=SIGNAL, font=MONO_SMALL, anchor="w").pack(fill="x", padx=20, pady=(25, 1))
        tk.Label(panel, text="生成\n标准 ICS", bg=INK, fg=PAPER, font=("Georgia", 30), justify="left", anchor="w").pack(fill="x", padx=20, pady=(0, 12))
        tk.Label(
            panel, text="按每周实际日期展开，稳定 UID，RFC 5545 折行，内嵌 Asia/Shanghai 时区。",
            bg=INK, fg="#A4AA9D", font=SANS_SMALL, justify="left", wraplength=250, anchor="w",
        ).pack(fill="x", padx=20, pady=(0, 18))

        metrics = tk.Frame(panel, bg=INK, highlightbackground="#3A4037", highlightthickness=1)
        metrics.pack(fill="x", padx=20, pady=(0, 14))
        metrics.grid_columnconfigure(0, weight=1)
        metrics.grid_columnconfigure(1, weight=1)
        for index, (label, default) in enumerate([("EVENTS", "0"), ("FIRST", "—"), ("LAST", "—")]):
            row = 0 if index == 0 else 1
            column = 0 if index != 2 else 1
            cell = tk.Frame(metrics, bg=INK)
            cell.grid(row=row, column=column, sticky="ew", padx=9, pady=6)
            tk.Label(cell, text=label, bg=INK, fg="#7F8778", font=("Cascadia Mono", 7), anchor="w").pack(fill="x")
            value = tk.Label(cell, text=default, bg=INK, fg=SIGNAL if index == 0 else PAPER, font=("Cascadia Mono", 14 if index == 0 else 8), anchor="w")
            value.pack(fill="x")
            setattr(self, f"export_{label.lower()}_label", value)

        self.export_button = tk.Button(
            panel, text="下载 .ics 文件   ↓", command=self.export_ics, bg=SIGNAL, fg=INK,
            activebackground="#CBFF5D", activeforeground=INK, disabledforeground="#697061",
            font=("Segoe UI", 10, "bold"), relief="flat", pady=11, cursor="hand2",
        )
        self.export_button.pack(fill="x", padx=20)
        self.export_state = tk.Label(panel, text="等待有效课表", bg=INK, fg="#909788", font=("Cascadia Mono", 7), anchor="w")
        self.export_state.pack(fill="x", padx=20, pady=(6, 8))

        self.google_sync_button = tk.Button(
            panel,
            text="Google Calendar 增量同步…",
            command=self.sync_google_calendar,
            bg="#1B1E19",
            fg=PAPER,
            activebackground="#252A22",
            activeforeground=PAPER,
            font=("Segoe UI", 8, "bold"),
            relief="flat",
            pady=8,
            cursor="hand2",
        )
        self.google_sync_button.pack(fill="x", padx=20)
        self.google_clear_button = tk.Button(
            panel,
            text="清除 Google 授权",
            command=self.clear_google_auth,
            bg=INK,
            fg="#8D9486",
            activebackground=INK,
            activeforeground=PAPER,
            font=("Segoe UI", 7),
            relief="flat",
            cursor="hand2",
        )
        self.google_clear_button.pack(fill="x", padx=20, pady=(4, 6))

        guide = tk.Frame(panel, bg=INK)
        guide.pack(fill="x", padx=20, pady=(8, 0))
        tk.Label(guide, text="GOOGLE CALENDAR 导入", bg=INK, fg="#B8BDAF", font=("Cascadia Mono", 7), anchor="w").pack(fill="x")
        for number, text in [("01", "打开 Google Calendar 设置"), ("02", "选择“导入和导出”"), ("03", "上传本程序生成的 .ics"), ("04", "选择目标日历并导入")]:
            row = tk.Frame(guide, bg=INK)
            row.pack(fill="x", pady=2)
            tk.Label(row, text=number, bg=INK, fg=ACCENT, font=("Cascadia Mono", 7)).pack(side="left")
            tk.Label(row, text=text, bg=INK, fg="#D8D9D0", font=("Segoe UI", 8)).pack(side="left", padx=(8, 0))

        notice = tk.Frame(panel, bg="#1B1E19", highlightbackground=WARNING, highlightthickness=1)
        notice.pack(fill="x", padx=20, pady=(14, 0))
        tk.Label(notice, text="VERIFICATION NOTE", bg="#1B1E19", fg="#E6AD56", font=("Cascadia Mono", 7), anchor="w").pack(fill="x", padx=9, pady=(7, 1))
        tk.Label(
            notice, text="格式与 RFC 5545 已自动化验证；Google Calendar 实际导入需人工账号环境，当前未声称实测。",
            bg="#1B1E19", fg="#969C8F", font=("Segoe UI", 8), justify="left", wraplength=245, anchor="w",
        ).pack(fill="x", padx=9, pady=(0, 7))

    def _set_step(self, active_index: int) -> None:
        if not hasattr(self, "step_labels"):
            return
        for index, label in enumerate(self.step_labels):
            if index == active_index:
                label.configure(fg=INK, bg="#F0EDE2")
            elif index < active_index:
                label.configure(fg=INK_SOFT, bg=PAPER)
            else:
                label.configure(fg=MUTED, bg=PAPER)

    def _set_status(self, kind: str, text: str) -> None:
        colors = {
            "idle": (PAPER_2, MUTED), "working": ("#FBF1DF", WARNING),
            "success": ("#EDF4E4", SUCCESS), "error": ("#FAECE8", DANGER),
        }
        background, foreground = colors.get(kind, colors["idle"])
        if hasattr(self, "status_label"):
            self.status_label.configure(text=text, bg=background, fg=foreground)

    def _set_export_enabled(self, enabled: bool) -> None:
        if hasattr(self, "export_button"):
            self.export_button.configure(state="normal" if enabled else "disabled", cursor="hand2" if enabled else "arrow")

    def _refresh_export_state(self) -> None:
        enabled = bool(self.build and self.build.events)
        unresolved = bool(self.build and self.build.conflicts and not self.conflict_ack.get())
        self._set_export_enabled(enabled and not unresolved)
        if not hasattr(self, "export_state"):
            return
        if not enabled:
            self.export_state.configure(text="等待有效课表")
        elif unresolved:
            self.export_state.configure(text="请先确认课程冲突")
        else:
            self.export_state.configure(text="READY · RFC 5545 · Asia/Shanghai")

    def _set_conflict_controls(self, visible: bool, conflicts: list[object]) -> None:
        if not hasattr(self, "conflict_label"):
            return
        if visible:
            self.conflict_label.configure(text=f"检测到 {len(conflicts)} 个课程时间冲突")
            self.conflict_label.pack(side="left")
            self.conflict_check.pack(side="right")
            self.conflict_ack.set(False)
        else:
            self.conflict_label.pack_forget()
            self.conflict_check.pack_forget()
            self.conflict_ack.set(False)
    def _show_issues(self, errors: list[str], warnings: list[str]) -> None:
        if not errors and not warnings:
            self.issue_label.grid_remove()
            return
        lines = [f"错误：{item}" for item in errors[:3]] + [f"提示：{item}" for item in warnings[:2]]
        if len(errors) + len(warnings) > 5:
            lines.append(f"另有 {len(errors) + len(warnings) - 5} 条提示")
        self.issue_label.configure(text="\n".join(lines), fg=DANGER if errors else WARNING)
        self.issue_label.grid()

    def choose_file(self) -> None:
        path = filedialog.askopenfilename(
            title="选择课表文件",
            filetypes=[
                ("课表文件", "*.html *.htm *.csv *.txt *.xls *.xlsx"),
                ("HTML 课表", "*.html *.htm *.xls"),
                ("CSV 课表", "*.csv *.txt"),
                ("Excel 课表", "*.xlsx"),
                ("所有文件", "*.*"),
            ],
        )
        if path:
            self._load_path(Path(path))

    def load_sample(self, kind: str = "csv") -> None:
        root = Path(__file__).resolve().parents[2]
        if kind == "v2":
            sample = root / "fixtures" / "exchange" / "terics-example.terics.json"
        else:
            sample = root / "fixtures" / "csv" / "terics_sample.csv"
        if not sample.exists():
            sample = Path(__file__).resolve().parents[1] / sample.relative_to(root)
        if not sample.exists():
            messagebox.showinfo("terics", "当前发行包未包含测试样例，请选择自己的课表文件。")
            return
        self._load_path(sample)

    def _on_close(self) -> None:
        if self.browser_worker is not None:
            self.browser_worker.close()
        self.root.destroy()

    def open_sis_browser(self) -> None:
        selection = self.school_select.get()
        profile = self.school_profiles.get(selection)
        if profile is None:
            messagebox.showerror("terics", "当前没有可用学校 Profile。")
            return
        if self.browser_worker is None:
            self.browser_worker = ConnectorBrowserWorker()
        self.browser_worker.open_sis(profile.entry_url)
        self.open_sis_button.configure(state="disabled", cursor="arrow")
        self.browser_status_label.configure(text="正在打开独立浏览器…", fg=WARNING)
        self._set_status("working", "等待手动登录")
        messagebox.showinfo(
            "请在独立浏览器中登录",
            "terics 已打开独立 Playwright 浏览器，不会读取你的日常 Chrome/Edge 配置或 Cookie。\n\n"
            "请手动完成学校统一认证，进入“我的课表”，再回到 terics 点击“从浏览器提取”。",
            parent=self.root,
        )

    def extract_from_sis_browser(self) -> None:
        if self.browser_worker is None:
            messagebox.showinfo("terics", "请先打开教务浏览器。")
            return
        try:
            config = self._read_config()
        except (ValueError, TypeError) as exc:
            messagebox.showerror("学期参数错误", str(exc), parent=self.root)
            return
        semester = {
            "termName": config.title,
            "semesterStart": config.semester_start,
            "teachingWeeks": int(self.vars["teaching_weeks"].get() or 20),
            "timezone": TIMEZONE,
        }
        self.extract_sis_button.configure(state="disabled", cursor="arrow")
        self.browser_status_label.configure(text="正在提取…", fg=WARNING)
        self._set_status("working", "正在执行只读 Connector")
        self.browser_worker.extract(semester)

    def clear_sis_login(self) -> None:
        if not messagebox.askyesno(
            "清除独立浏览器数据",
            "将关闭 terics 独立浏览器，并删除其私有登录配置目录。\n\n"
            "不会影响你日常使用的 Chrome/Edge，也不会修改学校服务器数据。继续吗？",
            parent=self.root,
        ):
            return
        if self.browser_worker is None:
            self.browser_worker = ConnectorBrowserWorker()
        self.browser_worker.clear_login_data()
        self.browser_status_label.configure(text="正在清除…", fg=WARNING)

    def _poll_browser_messages(self) -> None:
        if self.browser_worker is not None:
            try:
                while True:
                    message = self.browser_worker.messages.get_nowait()
                    kind = message.get("type")
                    if kind == "status":
                        state = message.get("state")
                        text = str(message.get("message", ""))
                        self.browser_status_label.configure(text=text, fg=SUCCESS if state != "login_required" else WARNING)
                        if state == "login_required":
                            self.extract_sis_button.configure(state="normal", cursor="hand2")
                            self.open_sis_button.configure(state="normal", cursor="hand2")
                            self._set_status("success", "等待进入课表页")
                        elif state == "extracting":
                            self._set_status("working", "正在读取教务只读接口")
                        elif state == "cleared":
                            self.extract_sis_button.configure(state="disabled", cursor="arrow")
                            self.open_sis_button.configure(state="normal", cursor="hand2")
                            self._set_status("idle", "登录状态已清除")
                        elif state == "closed":
                            self.extract_sis_button.configure(state="disabled", cursor="arrow")
                    elif kind == "error":
                        text = str(message.get("message", "浏览器操作失败"))
                        self.browser_status_label.configure(text=text, fg=DANGER)
                        self.extract_sis_button.configure(state="normal", cursor="hand2")
                        self.open_sis_button.configure(state="normal", cursor="hand2")
                        self._set_status("error", "浏览器操作失败")
                        self._show_issues([text], [])
                    elif kind == "result":
                        payload = message.get("data") or {}
                        timetable = payload.get("timetable") if isinstance(payload, dict) else None
                        if isinstance(timetable, dict):
                            self._load_v2_timetable(timetable, f"SIS: {timetable.get('source', {}).get('schoolName', '教务系统')}")
                            self.extract_sis_button.configure(state="normal", cursor="hand2")
                        else:
                            self._show_issues(["Connector 返回了无法识别的数据"], [])
            except Exception:
                pass
        try:
            self.root.after(250, self._poll_browser_messages)
        except tk.TclError:
            pass

    def _load_v2_timetable(self, timetable: dict[str, object], source_name: str) -> None:
        report = validate_timetable_v2(timetable)
        if report["status"] == "failed":
            self._show_issues([issue.message for issue in report["issues"]], [])
            self._set_status("error", "terics v2 验证失败")
            return
        self.timetable_v2 = copy.deepcopy(timetable)
        self.parsed = None
        term = self.timetable_v2["term"]  # type: ignore[index]
        self.vars["title"].set(str(term.get("termName", "我的课表")))  # type: ignore[union-attr]
        self.vars["start"].set(str(term.get("semesterStart", "")))  # type: ignore[union-attr]
        self.vars["teaching_weeks"].set(str(term.get("teachingWeeks", 20)))  # type: ignore[union-attr]
        schedule = (term.get("periodSchedules") or [])[0]  # type: ignore[union-attr]
        if isinstance(schedule, dict):
            self.config.periods = [
                PeriodTime(
                    index=int(period["index"]),
                    start=str(period["start"]),
                    end=str(period["end"]),
                    label=str(period.get("label") or ""),
                )
                for period in schedule.get("periods", [])
            ]
        self._render_periods()
        source = self.timetable_v2["source"]  # type: ignore[index]
        self.file_label.configure(text=source_name)
        self.file_meta.configure(
            text=f"terics v2 · {source.get('adapterId', '')}@{source.get('adapterVersion', '')} · "
            f"{len(self.timetable_v2.get('courses', []))} courses"  # type: ignore[union-attr]
        )
        self._set_status("success", f"terics v2 · {source.get('schoolName') or source.get('adapterId')}")
        self._set_step(2)
        self.extract_sis_button.configure(state="normal", cursor="hand2")
        self.apply_settings(show_dialog=False)

    def _load_path(self, path: Path) -> None:
        self._set_status("working", "正在内容嗅探")
        self._set_step(1)
        self.root.update_idletasks()
        try:
            raw_bytes = path.read_bytes()
            text_preview = raw_bytes[:4096].decode("utf-8", errors="ignore").lstrip()
            if path.suffix.lower() == ".json" or text_preview.startswith("{"):
                timetable = parse_terics_json(raw_bytes.decode("utf-8-sig"))
                self._load_v2_timetable(timetable, path.name)
                return
            parsed = parse_timetable_file(path)
        except Exception as exc:  # noqa: BLE001 - show parse errors in GUI
            self.parsed = None
            self.timetable_v2 = None
            self.v2_build = None
            self.build = None
            self._set_status("error", "识别失败")
            self.file_label.configure(text=path.name)
            self.file_meta.configure(text=f"{path.stat().st_size if path.exists() else 0} bytes · 未确认格式")
            issues = exc.issues if isinstance(exc, TericsParseError) else []
            self._show_issues([str(exc)], [issue.message for issue in issues if issue.severity == "warning"])
            self.tree.delete(*self.tree.get_children())
            self._set_conflict_controls(False, [])
            self.events_label.configure(text="0")
            self.range_label.configure(text="—")
            self.conflicts_label.configure(text="0")
            self.weeks_label.configure(text="—")
            self._refresh_export_state()
            messagebox.showerror("无法解析课表", str(exc))
            return

        self.parsed = parsed
        self.timetable_v2 = None
        self.v2_build = None
        self.source_path = path
        self._set_status("success", f"{parsed.format_label} · 已识别")
        self._set_step(2)
        size = path.stat().st_size
        self.file_label.configure(text=path.name)
        meta_parts = [f"{size} bytes", parsed.metadata.detected_encoding or "encoding n/a"]
        if parsed.metadata.table_count is not None:
            meta_parts.append(f"{parsed.metadata.table_count} tables")
        if parsed.metadata.sheet_name:
            meta_parts.append(parsed.metadata.sheet_name)
        self.file_meta.configure(text=" · ".join(meta_parts) + f" · {len(parsed.courses)} courses")
        self.apply_settings(show_dialog=False)
        warnings = [issue.message for issue in parsed.issues if issue.severity == "warning"]
        errors = [issue.message for issue in parsed.issues if issue.severity == "error"]
        self._show_issues(errors, warnings)

    def _read_config(self) -> SemesterConfig:
        title = self.vars["title"].get().strip() or "我的课表"
        start_value = self.vars["start"].get().strip()
        start = monday_of_iso(start_value)
        if start != start_value:
            self.vars["start"].set(start)
            self.monday_hint.configure(text=f"已自动对齐到周一 {start}", fg=SUCCESS)
        alarm = int(self.vars["alarm"].get() or 0)
        periods = [
            PeriodTime(index=index, start=start_var.get().strip(), end=end_var.get().strip())
            for index, (start_var, end_var) in enumerate(self.period_vars, start=1)
        ]
        return SemesterConfig(title=title, semester_start=start, timezone=TIMEZONE, periods=periods, alarm_minutes=alarm)

    def _v2_build_to_legacy(self, v2_build) -> BuildResult:
        events = [
            CalendarEvent(
                uid=event.uid,
                title=event.title,
                teacher=event.teacher,
                location=event.room,
                note=event.note,
                weekday=event.weekday,
                start_period=event.start_period,
                end_period=event.end_period,
                week=event.week,
                date=event.date,
                start=event.start,
                end=event.end,
                start_date_time=event.start_date_time,
                end_date_time=event.end_date_time,
                week_rule=event.week_rule,
            )
            for event in v2_build.events
        ]
        return BuildResult(events=events, conflicts=v2_build.conflicts, issues=v2_build.issues)

    def _apply_v2_settings(self) -> BuildResult:
        assert self.timetable_v2 is not None
        timetable = copy.deepcopy(self.timetable_v2)
        term = timetable["term"]  # type: ignore[index]
        term["semesterStart"] = self.config.semester_start  # type: ignore[index]
        term["termName"] = self.config.title  # type: ignore[index]
        term["teachingWeeks"] = int(self.vars["teaching_weeks"].get() or 20)  # type: ignore[index]
        schedules = term.get("periodSchedules", [])  # type: ignore[union-attr]
        if not schedules:
            schedules = [
                {
                    "id": f"periods-{self.config.semester_start}",
                    "label": "用户确认作息",
                    "effectiveFrom": self.config.semester_start,
                    "periods": [
                        {"index": period.index, "start": period.start, "end": period.end, "label": period.label}
                        for period in self.config.periods
                    ],
                }
            ]
            term["periodSchedules"] = schedules  # type: ignore[index]
        else:
            primary = schedules[0]
            if len(schedules) == 1:
                primary["effectiveFrom"] = self.config.semester_start
            primary["periods"] = [
                {"index": period.index, "start": period.start, "end": period.end, "label": period.label}
                for period in self.config.periods
            ]
        report = validate_timetable_v2(timetable)
        timetable["validation"] = {
            "status": report["status"],
            "checks": [],
            "completeness": report["completeness"],
        }
        if report["issues"]:
            raise TericsParseError("terics v2 配置验证失败", report["issues"])
        self.timetable_v2 = timetable
        v2_build = build_v2_events(timetable)
        self.v2_build = v2_build
        warnings = [
            issue.message
            for issue in list(report["warnings"]) + list(v2_build.issues)
            if issue.severity == "warning"
        ]
        self._show_issues([], warnings)
        return self._v2_build_to_legacy(v2_build)

    def apply_settings(self, show_dialog: bool = True) -> None:
        if self.parsed is None and self.timetable_v2 is None:
            if show_dialog:
                messagebox.showinfo("terics", "请先选择课表文件或从浏览器提取。")
            return
        self.vars["title"].set(self.vars["title"].get()[:80])
        try:
            config = self._read_config()
            if self.timetable_v2 is not None:
                self.config = config
                build = self._apply_v2_settings()
            else:
                assert self.parsed is not None
                build = build_events(config, self.parsed.courses)
                self.config = config
        except (ValueError, TypeError, TericsParseError) as exc:
            self._set_status("error", "时间参数错误")
            self._show_issues([str(exc)], [])
            if show_dialog:
                messagebox.showerror("时间参数错误", str(exc), parent=self.root)
            return

        error_issues = [issue.message for issue in build.issues if issue.severity == "error"]
        if error_issues:
            self._set_status("error", "配置存在错误")
            self._show_issues(error_issues, [])
            if show_dialog:
                messagebox.showerror("配置存在错误", "\n".join(error_issues[:5]), parent=self.root)
            self._refresh_export_state()
            return

        self.build = build
        source_label = (
            f"{self.timetable_v2.get('source', {}).get('schoolName', 'terics v2')}"
            if self.timetable_v2 is not None
            else self.parsed.format_label if self.parsed is not None else "terics"
        )
        self._set_status("success", f"{source_label} · 已识别")
        self._set_step(3)
        self._render_preview(build)
        if self.timetable_v2 is None and self.parsed is not None:
            warnings = [issue.message for issue in self.parsed.issues + build.issues if issue.severity == "warning"]
            self._show_issues([], warnings)
        self._set_conflict_controls(bool(build.conflicts), list(build.conflicts))
        self._refresh_export_state()
        if show_dialog:
            messagebox.showinfo(
                "预览已更新",
                f"已生成 {len(build.events)} 个日历事件，检测到 {len(build.conflicts)} 个冲突。",
                parent=self.root,
            )

    def _render_preview(self, build: BuildResult) -> None:
        self.tree.delete(*self.tree.get_children())
        self.empty_preview.grid_remove()
        self._render_week_ruler(build)
        self._render_timetable_canvas(build)
        conflict_indexes = {index for conflict in build.conflicts for index in conflict.event_indexes}
        weekdays = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        for index, event in enumerate(build.events[:1500]):
            self.tree.insert(
                "", "end",
                values=(
                    event.date, weekdays[event.weekday], f"{event.start}–{event.end}",
                    event.title, f"{event.start_period}-{event.end_period}",
                    event.teacher or "—", event.location or "—",
                ),
                tags=("conflict",) if index in conflict_indexes else (),
            )
        weeks = len({event.week for event in build.events})
        self.events_label.configure(text=str(len(build.events)))
        self.range_label.configure(text=f"{build.events[0].date} → {build.events[-1].date}" if build.events else "—")
        self.conflicts_label.configure(text=str(len(build.conflicts)))
        self.weeks_label.configure(text=str(weeks))
        self.export_events_label.configure(text=str(len(build.events)))
        self.export_first_label.configure(text=build.events[0].date if build.events else "—")
        self.export_last_label.configure(text=build.events[-1].date if build.events else "—")

    def sync_google_calendar(self) -> None:
        if self.timetable_v2 is None:
            messagebox.showinfo(
                "需要 terics v2 数据",
                "请先导入扩展生成的 .terics.json，或通过“直连教务”提取；旧版 CSV/HTML/XLSX 请先在 Web 端转换或导出 ICS。",
                parent=self.root,
            )
            return
        if not oauth_configured():
            messagebox.showinfo(
                "Google OAuth 未配置",
                "请设置 TERICS_GOOGLE_CLIENT_ID / TERICS_GOOGLE_CLIENT_SECRET，"
                "或设置 TERICS_GOOGLE_CLIENT_CONFIG 指向 Desktop OAuth JSON。\n\n"
                "授权令牌保存在系统凭据库，不写入普通配置文件。离线 ICS 不受影响。",
                parent=self.root,
            )
            return
        try:
            self.config = self._read_config()
            self._apply_v2_settings()
            credentials = authenticate()
            from googleapiclient.discovery import build as google_build

            service = google_build("calendar", "v3", credentials=credentials, cache_discovery=False)
            client = GoogleApiCalendarClient(service)
            calendars = [item for item in client.list_calendars() if str(item.get("summary", "")).startswith("terics /")]
            if not calendars:
                if not messagebox.askyesno(
                    "创建独立 terics 日历",
                    "未找到 terics 专用日历。是否创建新的 Google 日历？\n\n不会修改其他应用创建的事件。",
                    parent=self.root,
                ):
                    return
                calendars = [client.create_calendar(f"terics / {self.config.title}")]
            if len(calendars) == 1:
                selected = calendars[0]
            else:
                choices = "\n".join(f"{index + 1}. {item.get('summary', 'terics')}" for index, item in enumerate(calendars))
                selected_index = simpledialog.askinteger(
                    "选择 terics 日历",
                    f"请选择目标日历：\n\n{choices}",
                    minvalue=1,
                    maxvalue=len(calendars),
                    parent=self.root,
                )
                if selected_index is None:
                    return
                selected = calendars[selected_index - 1]
            calendar_id = str(selected["id"])
            existing = client.list_managed_events(calendar_id, str(self.timetable_v2["term"]["termId"]))  # type: ignore[index]
            plan = plan_google_sync(self.timetable_v2, existing, calendar_id)
            if plan.blocked:
                messagebox.showerror(
                    "同步已阻止",
                    "\n".join(plan.warnings) or "数据完整性检查失败，禁止同步。",
                    parent=self.root,
                )
                return
            preview = (
                f"目标：{selected.get('summary', calendar_id)}\n"
                f"新建：{len(plan.creates)}\n更新：{len(plan.updates)}\n跳过：{len(plan.skips)}\n"
                f"删除候选：{len(plan.deletes)}"
            )
            if plan.warnings:
                preview += "\n\n提示：\n" + "\n".join(plan.warnings)
            if plan.deletes:
                preview += "\n\n删除候选只会影响带 terics_source=terics 且学期匹配的事件。"
            if not messagebox.askyesno("确认执行增量同步", preview, parent=self.root):
                return
            confirm_deletes = bool(plan.deletes) and messagebox.askyesno(
                "最终确认删除",
                f"即将删除 {len(plan.deletes)} 个旧 terics 事件。此操作需要你明确确认。继续吗？",
                parent=self.root,
            )
            result = execute_sync_plan(
                plan,
                client.insert_event,
                client.patch_event,
                client.delete_event,
                confirm_deletes,
            )
        except GoogleOAuthNotConfiguredError as exc:
            messagebox.showerror("Google OAuth 未配置", str(exc), parent=self.root)
            return
        except Exception as exc:  # noqa: BLE001 - show OAuth/API failure
            messagebox.showerror("Google Calendar 同步失败", str(exc), parent=self.root)
            return
        self.google_last_result = (
            f"{date.today().isoformat()} · 新建 {result.created} · 更新 {result.updated} · "
            f"跳过 {result.skipped} · 删除 {result.deleted}"
        )
        self.export_state.configure(text=self.google_last_result)
        log_path = Path.home() / ".terics" / "sync-log.jsonl"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as log:
            log.write(
                json.dumps(
                    {
                        "at": date.today().isoformat(),
                        "calendarId": calendar_id,
                        "termId": plan.term_id,
                        "created": result.created,
                        "updated": result.updated,
                        "skipped": result.skipped,
                        "deleted": result.deleted,
                        "errors": result.errors,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
        summary = self.google_last_result
        if result.errors:
            summary += "\n\n部分错误：\n" + "\n".join(result.errors[:5])
        messagebox.showinfo("Google Calendar 同步完成", summary, parent=self.root)

    def clear_google_auth(self) -> None:
        if not messagebox.askyesno(
            "清除 Google 授权",
            "将从系统凭据库删除 terics 保存的 Google OAuth Refresh Token。\n不会删除 Google 日历事件。继续吗？",
            parent=self.root,
        ):
            return
        try:
            clear_google_credentials()
        except Exception as exc:  # noqa: BLE001 - keyring backend failure
            messagebox.showerror("清除失败", str(exc), parent=self.root)
            return
        self.export_state.configure(text="Google 授权已清除")
        messagebox.showinfo("terics", "Google 授权已从系统凭据库清除。", parent=self.root)

    def export_ics(self) -> None:
        if (self.parsed is None and self.timetable_v2 is None) or self.build is None or not self.build.events:
            return
        if self.build.conflicts and not self.conflict_ack.get():
            messagebox.showwarning("存在冲突", "请先勾选“我已检查冲突，仍要导出”。", parent=self.root)
            return
        if self.timetable_v2 is not None:
            initial_name = suggested_ics_v2_file_name(self.timetable_v2)
        else:
            initial_name = suggested_file_name(self.config)
        target = filedialog.asksaveasfilename(
            title="保存 ICS 文件",
            defaultextension=".ics",
            initialfile=initial_name,
            filetypes=[("iCalendar 文件", "*.ics"), ("所有文件", "*.*")],
        )
        if not target:
            return
        try:
            if self.timetable_v2 is not None:
                self.config = self._read_config()
                self._apply_v2_settings()
                assert self.timetable_v2 is not None
                output = generate_ics_v2(self.timetable_v2, alarm_minutes=self.config.alarm_minutes)
                event_count = len(output.events)
            else:
                assert self.parsed is not None
                output = generate_ics(self.config, self.parsed.courses)
                event_count = len(output.build.events)
            Path(target).write_text(output.ics, encoding="utf-8", newline="")
        except (TericsParseError, ValueError, OSError) as exc:
            messagebox.showerror("导出失败", str(exc), parent=self.root)
            return
        self._set_step(4)
        self.export_state.configure(text=f"已写入 {event_count} 个事件")
        messagebox.showinfo(
            "ICS 已生成",
            f"已写入 {event_count} 个事件：\n{target}\n\n"
            "请在 Google Calendar 中通过“设置 → 导入和导出”手动导入。",
            parent=self.root,
        )


def main() -> None:
    root = tk.Tk()
    TericsApp(root)
    root.mainloop()
