from __future__ import annotations

import tkinter as tk
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from .course import build_events
from .dates import monday_of_iso
from .errors import TericsParseError
from .ics import generate_ics, suggested_file_name
from .models import (
    APP_VERSION,
    DEFAULT_PERIODS,
    TIMEZONE,
    BuildResult,
    ParseResult,
    PeriodTime,
    SemesterConfig,
)
from .parsers import parse_timetable_file

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
        self.source_path: Path | None = None
        self.config = self._default_config()
        self.build: BuildResult | None = None

        self.vars = {
            "title": tk.StringVar(value=self.config.title),
            "start": tk.StringVar(value=self.config.semester_start),
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
        center.grid_rowconfigure(1, weight=1)
        setup = self._card(center)
        setup.grid(row=0, column=0, sticky="ew")
        setup.grid_columnconfigure(1, weight=1)
        self._build_ingest(setup)
        self._build_settings(setup)
        preview = self._card(center)
        preview.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        preview.grid_rowconfigure(3, weight=1)
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
            actions, text="载入 CSV 样例", command=self.load_sample, bg=PAPER_2, fg=INK_SOFT,
            activebackground="#DDDACD", font=MONO_SMALL, relief="flat", padx=10, pady=7, cursor="hand2",
        ).grid(row=0, column=1, rowspan=2, padx=(8, 14), sticky="w")
        self.file_label = tk.Label(actions, text="HTML / CSV / XLSX · 最大 10 MiB", bg=PANEL, fg=MUTED, font=SANS_SMALL, anchor="w")
        self.file_label.grid(row=0, column=2, sticky="w")
        self.file_meta = tk.Label(actions, text="按文件内容识别，不依赖扩展名", bg=PANEL, fg=MUTED, font=("Cascadia Mono", 7), anchor="w")
        self.file_meta.grid(row=1, column=2, sticky="w")
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
        self._eyebrow(card, "03 / INSPECT", 0)
        tk.Label(card, text="预览课程", bg=PANEL, fg=INK, font=("Georgia", 20), anchor="w").grid(
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

        tree_frame = tk.Frame(card, bg=PANEL)
        tree_frame.grid(row=3, column=0, sticky="nsew", padx=18, pady=(0, 8))
        tree_frame.grid_rowconfigure(0, weight=1)
        tree_frame.grid_columnconfigure(0, weight=1)
        columns = ("date", "weekday", "time", "course", "section", "teacher", "location")
        self.tree = ttk.Treeview(tree_frame, columns=columns, show="headings", height=8)
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
        conflict_row.grid(row=4, column=0, sticky="ew", padx=18, pady=(0, 10))
        self.conflict_label = tk.Label(conflict_row, text="", bg=PANEL, fg=DANGER, font=MONO_SMALL, anchor="w")
        self.conflict_check = tk.Checkbutton(
            conflict_row, text="我已检查冲突，仍要导出", variable=self.conflict_ack,
            command=self._refresh_export_state, bg=PANEL, fg=DANGER,
            activebackground=PANEL, selectcolor="#FFF0EB", font=SANS_SMALL,
        )
        self.empty_preview = tk.Label(
            card, text="选择文件后，这里会按实际日期展开每一周课程。", bg=PANEL,
            fg=MUTED, font=SANS_SMALL, padx=20, pady=25,
        )
        self.empty_preview.grid(row=5, column=0, sticky="ew", padx=18)
        self._set_conflict_controls(False, [])

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
        self.export_state.pack(fill="x", padx=20, pady=(6, 12))

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

    def load_sample(self) -> None:
        sample = Path(__file__).resolve().parents[2] / "fixtures" / "csv" / "terics_sample.csv"
        if not sample.exists():
            sample = Path(__file__).resolve().parents[1] / "fixtures" / "csv" / "terics_sample.csv"
        if not sample.exists():
            messagebox.showinfo("terics", "当前发行包未包含测试样例，请选择自己的课表文件。")
            return
        self._load_path(sample)

    def _load_path(self, path: Path) -> None:
        self._set_status("working", "正在内容嗅探")
        self._set_step(1)
        self.root.update_idletasks()
        try:
            parsed = parse_timetable_file(path)
        except Exception as exc:  # noqa: BLE001 - show parse errors in GUI
            self.parsed = None
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

    def apply_settings(self, show_dialog: bool = True) -> None:
        if self.parsed is None:
            if show_dialog:
                messagebox.showinfo("terics", "请先选择课表文件。")
            return
        self.vars["title"].set(self.vars["title"].get()[:80])
        try:
            config = self._read_config()
            build = build_events(config, self.parsed.courses)
        except (ValueError, TypeError) as exc:
            self._set_status("error", "时间参数错误")
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

        self.config = config
        self.build = build
        self._set_status("success", f"{self.parsed.format_label} · 已识别")
        self._set_step(3)
        self._render_preview(build)
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

    def export_ics(self) -> None:
        if self.parsed is None or self.build is None or not self.build.events:
            return
        if self.build.conflicts and not self.conflict_ack.get():
            messagebox.showwarning("存在冲突", "请先勾选“我已检查冲突，仍要导出”。", parent=self.root)
            return
        target = filedialog.asksaveasfilename(
            title="保存 ICS 文件",
            defaultextension=".ics",
            initialfile=suggested_file_name(self.config),
            filetypes=[("iCalendar 文件", "*.ics"), ("所有文件", "*.*")],
        )
        if not target:
            return
        try:
            output = generate_ics(self.config, self.parsed.courses)
            Path(target).write_text(output.ics, encoding="utf-8", newline="")
        except (TericsParseError, ValueError, OSError) as exc:
            messagebox.showerror("导出失败", str(exc), parent=self.root)
            return
        self._set_step(4)
        self.export_state.configure(text=f"已写入 {len(output.build.events)} 个事件")
        messagebox.showinfo(
            "ICS 已生成",
            f"已写入 {len(output.build.events)} 个事件：\n{target}\n\n"
            "请在 Google Calendar 中通过“设置 → 导入和导出”手动导入。",
            parent=self.root,
        )


def main() -> None:
    root = tk.Tk()
    TericsApp(root)
    root.mainloop()
