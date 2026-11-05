from __future__ import annotations

import re
from pathlib import Path

from ..errors import TericsParseError
from ..models import ParseResult
from .csv_parser import parse_csv
from .html_parser import parse_html
from .xlsx_parser import parse_xlsx

MAX_FILE_BYTES = 10 * 1024 * 1024
ZIP_MAGIC = b"PK\x03\x04"
OLE_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")


def _declared_charset(data: bytes) -> str | None:
    head = data[:4096].decode("latin-1", errors="ignore")
    meta = re.search(r"<meta[^>]+charset\s*=\s*['\"]?\s*([a-zA-Z0-9._-]+)", head, re.I)
    if not meta:
        meta = re.search(
            r"<meta[^>]+content\s*=\s*['\"][^'\"]*charset\s*=\s*([a-zA-Z0-9._-]+)",
            head,
            re.I,
        )
    if not meta:
        return None
    label = meta.group(1).lower()
    if label in {"gbk", "gb2312", "gb18030", "x-gbk", "cp936"}:
        return "gb18030"
    if label in {"utf-8", "utf8"}:
        return "utf-8"
    if label in {"utf-16", "utf-16le", "utf-16be"}:
        return "utf-16"
    return None


def _decode_text(data: bytes) -> tuple[str, str]:
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            return data.decode("utf-16"), "utf-16"
        except UnicodeDecodeError as exc:
            raise TericsParseError("文件带有 UTF-16 BOM，但内容编码无效") from exc

    charset = _declared_charset(data)
    if charset and charset != "utf-8":
        try:
            return data.decode(charset), charset
        except UnicodeDecodeError as exc:
            raise TericsParseError(f"文件声明编码为 {charset}，但内容无法按该编码读取") from exc

    try:
        return data.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        try:
            return data.decode("gb18030"), "gb18030"
        except UnicodeDecodeError as exc:
            raise TericsParseError("无法识别文本编码；请将文件另存为 UTF-8 或 GB18030 后重试") from exc


def _looks_like_html(text: str) -> bool:
    head = text.lstrip("\ufeff").lstrip()[:4096].lower()
    return (
        head.startswith("<!doctype html")
        or head.startswith("<html")
        or head.startswith("<table")
        or "<table" in head
        or re.search(r"<(?:tr|td|th)[\s>]", head) is not None
    )


def _binary_nul_ratio(data: bytes) -> float:
    sample = data[: min(len(data), 8192)]
    return sample.count(0) / len(sample) if sample else 0.0


def parse_timetable_bytes(data: bytes, file_name: str) -> ParseResult:
    if not data:
        raise TericsParseError("文件为空")
    if len(data) > MAX_FILE_BYTES:
        raise TericsParseError(f"文件超过 10 MiB 限制（当前 {len(data) / 1024 / 1024:.2f} MiB）")

    if data.startswith(OLE_MAGIC):
        raise TericsParseError(
            "检测到旧版二进制 XLS（OLE）文件。v0.1.0 仅支持 XLSX；请另存为 .xlsx、CSV，或使用教务系统导出的 HTML 表格。"
        )
    if data.startswith(ZIP_MAGIC):
        return parse_xlsx(data, file_name)

    if _binary_nul_ratio(data) > 0.02 and not data.startswith((b"\xff\xfe", b"\xfe\xff")):
        raise TericsParseError("检测到二进制内容，但没有发现有效的 XLSX/ZIP 签名")

    text, encoding = _decode_text(data)
    if not text.strip():
        raise TericsParseError("文件没有可读取的文本内容")

    if _looks_like_html(text):
        result = parse_html(text, file_name)
    else:
        result = parse_csv(text, file_name)
    result.metadata.detected_encoding = encoding
    return result


def parse_timetable_file(path: str | Path) -> ParseResult:
    file_path = Path(path)
    try:
        data = file_path.read_bytes()
    except OSError as exc:
        raise TericsParseError(f"无法读取文件：{exc}") from exc
    return parse_timetable_bytes(data, file_path.name)
