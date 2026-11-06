from __future__ import annotations

import io
import re
import stat
import zipfile
from dataclasses import dataclass

from ..errors import TericsParseError

MAX_ENTRIES = 512
MAX_ENTRY_BYTES = 8 * 1024 * 1024
MAX_TOTAL_BYTES = 24 * 1024 * 1024
MAX_COMPRESSION_RATIO = 200
MAX_SHEETS = 32
MAX_ROWS = 20_000
MAX_COLUMNS = 256
MAX_XML_DEPTH = 128


@dataclass(frozen=True)
class XlsxZipStats:
    entries: int
    total_uncompressed_bytes: int


def _safe_entry_name(name: str) -> bool:
    if not name or len(name) > 512 or "\x00" in name or "\\" in name:
        return False
    if name.startswith("/") or re.match(r"^[A-Za-z]:", name):
        return False
    return ".." not in name.split("/")


def _inspect_xml(text: str, name: str) -> None:
    if re.search(r"<!DOCTYPE|<!ENTITY", text, re.I):
        raise TericsParseError(f"XLSX XML 包含 DTD/ENTITY，已阻止：{name}")
    depth = 0
    index = 0
    while True:
        opening = text.find("<", index)
        if opening < 0:
            break
        if text.startswith("<!--", opening):
            closing = text.find("-->", opening + 4)
            if closing < 0:
                raise TericsParseError(f"XLSX XML 注释未闭合：{name}")
            index = closing + 3
            continue
        if text.startswith("<![CDATA[", opening):
            closing = text.find("]]>", opening + 9)
            if closing < 0:
                raise TericsParseError(f"XLSX XML CDATA 未闭合：{name}")
            index = closing + 3
            continue
        closing = _find_tag_end(text, opening)
        if closing < 0:
            raise TericsParseError(f"XLSX XML 标签未闭合：{name}")
        tag = text[opening + 1 : closing].strip()
        if tag.startswith(("?", "!")):
            index = closing + 1
            continue
        if tag.startswith("/"):
            depth -= 1
        elif not tag.endswith("/"):
            depth += 1
        if depth < 0 or depth > MAX_XML_DEPTH:
            raise TericsParseError(f"XLSX XML 嵌套深度异常：{name}")
        index = closing + 1
    if depth != 0:
        raise TericsParseError(f"XLSX XML 结构未闭合：{name}")


def _find_tag_end(text: str, start: int) -> int:
    quote: str | None = None
    for index in range(start + 1, len(text)):
        char = text[index]
        if quote is not None:
            if char == quote:
                quote = None
        elif char in {'"', "'"}:
            quote = char
        elif char == ">":
            return index
    return -1


def validate_xlsx_zip(data: bytes) -> XlsxZipStats:
    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as archive:
            infos = archive.infolist()
            if not infos or len(infos) > MAX_ENTRIES:
                raise TericsParseError(f"XLSX ZIP entry 数超出限制（{len(infos)} > {MAX_ENTRIES}）")
            names: set[str] = set()
            total = 0
            for info in infos:
                name = info.filename
                if not _safe_entry_name(name):
                    raise TericsParseError(f"XLSX 包含不安全路径：{name[:120]}")
                folded = name.casefold()
                if folded in names:
                    raise TericsParseError(f"XLSX 包含重复 ZIP entry：{name}")
                names.add(folded)
                if info.flag_bits & 0x1:
                    raise TericsParseError("不支持加密或受密码保护的 XLSX")
                if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                    raise TericsParseError(f"XLSX 使用不支持的 ZIP 压缩方法 {info.compress_type}")
                mode = (info.external_attr >> 16) & 0o170000
                if mode == stat.S_IFLNK:
                    raise TericsParseError(f"XLSX 包含符号链接 entry：{name}")
                if info.file_size > MAX_ENTRY_BYTES:
                    raise TericsParseError(f"XLSX 单 entry 解压后超过 {MAX_ENTRY_BYTES // 1024 // 1024} MiB 限制")
                if info.compress_size == 0 and info.file_size > 0:
                    raise TericsParseError("XLSX ZIP 压缩大小无效")
                if info.compress_size > 0 and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO:
                    raise TericsParseError(f"XLSX ZIP 压缩率异常：{name}")
                total += info.file_size
            if total > MAX_TOTAL_BYTES:
                raise TericsParseError(f"XLSX 解压总量超过 {MAX_TOTAL_BYTES // 1024 // 1024} MiB 限制")
            if "[content_types].xml" not in names or "xl/workbook.xml" not in names:
                raise TericsParseError("XLSX 缺少 [Content_Types].xml 或 xl/workbook.xml")
            worksheet_count = sum(bool(re.match(r"^xl/worksheets/[^/]+\.xml$", name, re.I)) for name in names)
            if worksheet_count > MAX_SHEETS:
                raise TericsParseError(f"XLSX 工作表数超过 {MAX_SHEETS} 限制")
            for info in infos:
                if not re.search(r"\.(?:xml|rels)$", info.filename, re.I):
                    continue
                try:
                    with archive.open(info, "r") as handle:
                        chunks: list[bytes] = []
                        read = 0
                        while chunk := handle.read(64 * 1024):
                            read += len(chunk)
                            if read > info.file_size or read > MAX_ENTRY_BYTES:
                                raise TericsParseError("XLSX XML 解压超过声明大小，已阻止 ZIP Bomb")
                            chunks.append(chunk)
                except (zipfile.BadZipFile, RuntimeError) as exc:
                    raise TericsParseError(f"XLSX ZIP entry 无法安全解压：{info.filename}") from exc
                if read != info.file_size:
                    raise TericsParseError(f"XLSX XML 解压大小与中央目录不一致：{info.filename}")
                _inspect_xml(b"".join(chunks).decode("utf-8", errors="replace"), info.filename)
            return XlsxZipStats(entries=len(infos), total_uncompressed_bytes=total)
    except zipfile.BadZipFile as exc:
        raise TericsParseError(f"XLSX ZIP 结构损坏：{exc}") from exc


def validate_worksheet_shape(sheet_name: str, row_count: int, maximum_columns: int) -> None:
    if row_count > MAX_ROWS:
        raise TericsParseError(f"工作表“{sheet_name}”行数超过 {MAX_ROWS} 限制")
    if maximum_columns > MAX_COLUMNS:
        raise TericsParseError(f"工作表“{sheet_name}”列数超过 {MAX_COLUMNS} 限制")
