# -*- coding: utf-8 -*-
"""钉住「workdir 必须逐字写进工具决策提示词」这条约束。

背景（2026-10-02 一整轮端到端排查的结论）：
  模型（苏大 DeepSeek）对路径的处理极不稳定，实测三种翻车：
    ① 用相对路径 `out.txt`，赌 shell 的 cwd 恰好是 workdir；
    ② 把 workdir 截断成**少了中间一层** —— workdir 是
       `...\\cli-sandbox\\run-1002-161800\\c3`，它却写
       `...\\cli-sandbox\\c3\\data.txt`，文件落到别处，磁盘上什么都没留下；
    ③ 报 `/home/user/out.txt`、`/Users/current_working_directory/out.txt`
       这种本机根本不存在的路径（训练数据里的 Linux 路径泄漏）。

  对策：从 CLI 注入的 `<current-working-directory>` 里捞出 workdir，
  逐字写进提示词，附「截断路径」的反例 + 「先跑 (Get-Location).Path」的正面做法。

对照旧实现：`extract_workdir` 不存在、提示词里也没有这段 →
  test_prompt_contains_workdir / test_prompt_has_counterexample_and_hint 会挂。
"""

import suda_api

REMINDER = (
    "<system-reminder><current-working-directory>\n"
    "Current working directory: C:\\Users\\mail\\.workbuddy\\suda-deepseek"
    "\\cli-sandbox\\run-1002-161800\\c3\n"
    "\n"
    "Files operation rules:\n"
    "- Search & read: Start from this directory\n"
    "</current-working-directory></system-reminder>"
)

WORKDIR = (
    "C:\\Users\\mail\\.workbuddy\\suda-deepseek\\cli-sandbox\\run-1002-161800\\c3"
)


def _msgs(*contents):
    return [{"role": "user", "content": c} for c in contents]


# ---------- extract_workdir ----------

def test_extract_workdir_from_reminder():
    assert suda_api.extract_workdir(_msgs(REMINDER)) == WORKDIR


def test_extract_workdir_from_list_content():
    msgs = [{"role": "user", "content": [{"type": "input_text", "text": REMINDER}]}]
    assert suda_api.extract_workdir(msgs) == WORKDIR


def test_extract_workdir_empty_when_absent():
    assert suda_api.extract_workdir(_msgs("帮我写个文件")) == ""


def test_extract_workdir_takes_latest():
    """同一个会话里 reminder 会重复出现，必须取**最后一条**（cwd 可能中途变化）。"""
    old = REMINDER.replace("run-1002-161800\\c3", "run-OLD\\c9")
    assert suda_api.extract_workdir(_msgs(old, REMINDER)) == WORKDIR


# ---------- build_tool_decision_prompt ----------

def test_prompt_contains_workdir():
    p = suda_api.build_tool_decision_prompt(_msgs(REMINDER), [])
    assert WORKDIR in p, "提示词里必须逐字出现 workdir"


def test_prompt_has_counterexample_and_hint():
    p = suda_api.build_tool_decision_prompt(_msgs(REMINDER), [])
    # 反例：必须点出「截断路径」这种翻车方式（措辞会改，所以分开断言关键词）
    assert "丢掉" in p and "中间一层" in p, "要给出「截断路径」的反例"
    assert "cli-sandbox\\c3" in p or "cli-sandbox\\c3" in p.replace("\\\\", "\\"), (
        "反例里要出现被截断后的样子"
    )
    assert "Get-Location" in p, "要给出「先问路径」的正面做法"
    assert "/home/user/" in p, "要点名 Linux 幻觉路径"


def test_prompt_without_workdir_still_builds():
    """离线回放 / curl 手造的请求里没有 reminder，不能因此报错。"""
    p = suda_api.build_tool_decision_prompt(_msgs("帮我写个文件"), [])
    assert isinstance(p, str) and len(p) > 50


def test_no_workdir_block_when_absent():
    p = suda_api.build_tool_decision_prompt(_msgs("帮我写个文件"), [])
    assert "当前工作目录（逐字复制" not in p, "没有 workdir 时不该硬塞这段"


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
