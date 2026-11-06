from __future__ import annotations

import io
import struct
import warnings
import zipfile

import pytest

from terics.errors import TericsParseError
from terics.parsers.xlsx_security import (
    MAX_COLUMNS,
    MAX_ROWS,
    MAX_SHEETS,
    MAX_XML_DEPTH,
    validate_worksheet_shape,
    validate_xlsx_zip,
)


def _zip(entries: list[tuple[str, bytes]]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in entries:
            archive.writestr(name, data)
    return output.getvalue()


def _required() -> list[tuple[str, bytes]]:
    return [
        ("[Content_Types].xml", b'<?xml version="1.0"?><Types></Types>'),
        ("xl/workbook.xml", b'<?xml version="1.0"?><workbook></workbook>'),
    ]


def _patch_central(data: bytes, target: str, *, flags: int | None = None, compressed: int | None = None, size: int | None = None) -> bytes:
    mutable = bytearray(data)
    index = 0
    while True:
        index = mutable.find(b"PK\x01\x02", index)
        if index < 0:
            raise AssertionError(f"central entry not found: {target}")
        name_length = struct.unpack_from("<H", mutable, index + 28)[0]
        name = bytes(mutable[index + 46 : index + 46 + name_length]).decode("utf-8")
        if name == target:
            if flags is not None:
                struct.pack_into("<H", mutable, index + 8, flags)
            if compressed is not None:
                struct.pack_into("<I", mutable, index + 20, compressed)
            if size is not None:
                struct.pack_into("<I", mutable, index + 24, size)
            return bytes(mutable)
        index += 46 + name_length


def test_rejects_zip_slip_duplicates_and_encryption() -> None:
    with pytest.raises(TericsParseError, match="不安全路径"):
        validate_xlsx_zip(_zip([("../evil.xml", b"x")]))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        duplicate = _zip([*_required(), ("duplicate.txt", b"a"), ("duplicate.txt", b"b")])
    with pytest.raises(TericsParseError, match="重复 ZIP entry"):
        validate_xlsx_zip(duplicate)
    encrypted = _patch_central(_zip([*_required(), ("xl/encrypted.xml", b"x")]), "xl/encrypted.xml", flags=1)
    with pytest.raises(TericsParseError, match="加密"):
        validate_xlsx_zip(encrypted)


def test_rejects_compression_bomb_and_expanded_total() -> None:
    ratio = _patch_central(
        _zip([*_required(), ("xl/bomb.xml", b"x")]),
        "xl/bomb.xml",
        compressed=100,
        size=1_000_000,
    )
    with pytest.raises(TericsParseError, match="压缩率"):
        validate_xlsx_zip(ratio)
    entries = _required()
    for index in range(4):
        entries.append((f"xl/filler-{index}.xml", b"x"))
    total = _zip(entries)
    for index in range(4):
        total = _patch_central(total, f"xl/filler-{index}.xml", compressed=100_000, size=6 * 1024 * 1024)
    with pytest.raises(TericsParseError, match="解压总量"):
        validate_xlsx_zip(total)


def test_rejects_dtd_entity_and_deep_xml() -> None:
    dtd = _zip([*_required(), ("xl/evil.xml", b'<!DOCTYPE x [<!ENTITY y "z">]><x>&y;</x>')])
    with pytest.raises(TericsParseError, match="DTD/ENTITY"):
        validate_xlsx_zip(dtd)
    deep = ("<n>" * (MAX_XML_DEPTH + 1) + "</n>" * (MAX_XML_DEPTH + 1)).encode()
    nested = _zip([*_required(), ("xl/deep.xml", deep)])
    with pytest.raises(TericsParseError, match="嵌套深度"):
        validate_xlsx_zip(nested)


def test_limits_sheets_rows_and_columns() -> None:
    entries = _required()
    for index in range(MAX_SHEETS + 1):
        entries.append((f"xl/worksheets/sheet{index}.xml", b""))
    with pytest.raises(TericsParseError, match="工作表数"):
        validate_xlsx_zip(_zip(entries))
    with pytest.raises(TericsParseError, match="行数"):
        validate_worksheet_shape("rows", MAX_ROWS + 1, 1)
    with pytest.raises(TericsParseError, match="列数"):
        validate_worksheet_shape("columns", 1, MAX_COLUMNS + 1)
