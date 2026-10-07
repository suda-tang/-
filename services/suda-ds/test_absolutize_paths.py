# -*- coding: utf-8 -*-
"""钉住「内置文件工具的相对路径必须补成绝对路径」这条兜底。

背景（2026-10-02 实测，详见 suda_api.py 里 extract_workdir 上方注释）：
  CLI 的 Write 工具收到相对路径 `data.txt` 时，回报的绝对路径可能
  **丢掉 workdir 的中间一层**（回 `...\\cli-sandbox\\c3\\data.txt`，
  而真实 workdir 是 `...\\cli-sandbox\\run-1002-161800\\c3`）。
  模型信了那个回报 → 后续 shell 全走错路径 → 文件落到 workdir 外面。

  对策：在 `decide_tool_call` 的唯一出口把相对路径补成绝对路径。

对照旧实现：`absolutize_tool_paths` 不存在 → 前 8 条全挂。
"""

import suda_api

WD = "C:\\Users\\mail\\.workbuddy\\suda-deepseek\\cli-sandbox\\run-1002-161800\\c3"


def _tc(name, **args):
    return {"name": name, "arguments": dict(args)}


# ---------- 相对路径 → 绝对 ----------

def test_relative_write_path_gets_workdir():
    tc = suda_api.absolutize_tool_paths(_tc("Write", file_path="data.txt"), WD)
    assert tc["arguments"]["file_path"] == WD + "\\data.txt"


def test_dot_slash_stripped():
    tc = suda_api.absolutize_tool_paths(_tc("Write", file_path=".\\hello.txt"), WD)
    assert tc["arguments"]["file_path"] == WD + "\\hello.txt"


def test_forward_slash_converted():
    tc = suda_api.absolutize_tool_paths(_tc("Write", file_path="sub/x.txt"), WD)
    assert tc["arguments"]["file_path"] == WD + "\\sub\\x.txt"


def test_read_tool_also_fixed():
    tc = suda_api.absolutize_tool_paths(_tc("Read", file_path="out.txt"), WD)
    assert tc["arguments"]["file_path"] == WD + "\\out.txt"


# ---------- 不该动的一律不动 ----------

def test_absolute_path_untouched():
    p = "C:\\other\\place\\a.txt"
    tc = suda_api.absolutize_tool_paths(_tc("Write", file_path=p), WD)
    assert tc["arguments"]["file_path"] == p


def test_posix_absolute_untouched():
    p = "/tmp/a.txt"
    tc = suda_api.absolutize_tool_paths(_tc("Write", file_path=p), WD)
    assert tc["arguments"]["file_path"] == p


def test_shell_tool_untouched():
    """PowerShell 命令串里的路径是模型有意拼的，改写风险大 → 不碰。"""
    cmd = "Set-Content -Path 'out.txt' -Value 'x'"
    tc = suda_api.absolutize_tool_paths(_tc("PowerShell", command=cmd), WD)
    assert tc["arguments"]["command"] == cmd


def test_no_workdir_untouched():
    tc = suda_api.absolutize_tool_paths(_tc("Write", file_path="data.txt"), "")
    assert tc["arguments"]["file_path"] == "data.txt"


def test_none_tool_call_is_safe():
    assert suda_api.absolutize_tool_paths(None, WD) is None


# ---------- 结构性：确认出口真的调用了它 ----------

def test_decide_tool_call_uses_absolutize():
    """源码级断言：唯一出口处必须调用 absolutize_tool_paths。

    谁把这一行删了，这条会红 —— 不依赖任何运行时数据。
    """
    import inspect
    src = inspect.getsource(suda_api.decide_tool_call)
    assert "absolutize_tool_paths(" in src, "decide_tool_call 出口必须做路径绝对化"
    assert "extract_workdir(messages)" in src, "必须从 messages 里取 workdir"


if __name__ == "__main__":
    import traceback

    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
            passed += 1
        except Exception:
            print(f"  FAIL  {fn.__name__}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed}/{passed + failed} 通过")
    raise SystemExit(1 if failed else 0)
