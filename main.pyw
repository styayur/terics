from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    root_dir = Path(__file__).resolve().parent
    sys.path.insert(0, str(root_dir / "python"))
    try:
        import tkinter as tk
        from tkinter import messagebox

        from terics.gui import TericsApp
    except ModuleNotFoundError as exc:
        try:
            import tkinter as tk
            from tkinter import messagebox

            root = tk.Tk()
            root.withdraw()
            messagebox.showerror(
                "terics 缺少依赖",
                "无法导入解析依赖。\n\n请先在项目目录执行：\n"
                "py -3.12 -m pip install -r requirements.txt\n\n"
                f"详细信息：{exc}",
            )
            root.destroy()
        except Exception:  # noqa: BLE001 - best-effort GUI dependency error
            print(f"terics: 缺少依赖：{exc}", file=sys.stderr)
        return 1

    if "--smoke-test" in sys.argv:
        root = tk.Tk()
        root.withdraw()
        TericsApp(root)
        root.update_idletasks()
        root.destroy()
        print("terics GUI smoke test passed")
        return 0

    root = tk.Tk()
    TericsApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
