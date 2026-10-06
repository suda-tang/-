# 「AI 不许删除云曲库的曲子」回归（不连模型，直接把模型的返回桩掉）。
#
# 守两道闸：
#   1. 后端 ai_workspace.plan_data：模型真回了 delete_score / wipe 之类，必须明确回绝，
#      且 actions 为空 —— 不能静默过滤（静默过滤等于用户以为删掉了）。
#   2. 前端 dist/workspace-ai.js 里也有一份 FORBIDDEN_TYPES，两份清单必须一致
#      （见 scripts/check-ai-retract.cjs 第 3 组用例）。
#
# 跑法：python scripts/check-ai-no-delete.py
import io, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import ai_workspace  # noqa: E402

FAIL = []


class FakeResponse:
    """把模型返回桩成 8765 的**流式**响应。

    ★ 为什么必须支持流式（2026-10-07 踩到）：
      `ai_workspace.post_model_stream()` 用的是
      `requests.post(..., stream=True)` + `with ... as response` + `response.iter_lines()`。
      只实现 `json()` 的老桩会在 `with` 处抛
      `TypeError: object does not support the context manager protocol`，
      而 friendly_error 认不出这句话 → 兜成「这次操作没有完成，请换个说法再试一次」，
      **看起来像禁删闸坏了，其实是桩过时了**。
      以后只要改动模型调用方式，这个桩就得跟着改。
    """

    def __init__(self, content):
        self._content = content

    def raise_for_status(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_lines(self):
        # 复刻 8765 的 SSE 形状：一行一个 `data: {...}`，最后 `data: [DONE]`。
        chunk = json.dumps({'choices': [{'delta': {'content': self._content}}]},
                           ensure_ascii=False)
        yield ('data: ' + chunk).encode('utf-8')
        yield b'data: [DONE]'

    def json(self):
        return {'choices': [{'message': {'content': self._content}}]}


class Capture:
    def __init__(self):
        self.result = None

    def json_response(self, result, status=200):
        self.result = result
        return result


def ask_model(actions, text='删除云曲库里的曲谱'):
    """把模型返回桩成指定的 actions，跑一遍后端 planner。"""
    content = json.dumps({'reply': '好的，这就删除。', 'actions': actions}, ensure_ascii=False)
    original = ai_workspace.requests.post
    ai_workspace.requests.post = lambda *a, **k: FakeResponse(content)
    try:
        cap = Capture()
        ai_workspace.plan_data({'messages': [{'role': 'user', 'content': text}],
                                'context': {'scores': [{'id': 's1', 'title': '知足'}]}}, cap)
        return cap.result or {}
    finally:
        ai_workspace.requests.post = original


def main():
    for t in ('delete_score', 'remove_score', 'wipe', 'clear', 'purge', 'overwrite_score', 'trash'):
        got = ask_model([{'type': t, 'value': 's1'}])
        reply = str(got.get('reply') or '')
        if '不会删除' not in reply:
            FAIL.append('%s 没有被回绝：%s' % (t, reply or got))
        if got.get('actions'):
            FAIL.append('%s 被回绝了却还带着 actions：%s' % (t, got.get('actions')))
        print(('PASS ' if '不会删除' in reply and not got.get('actions') else 'FAIL ')
              + '模型回 %-16s -> %s' % (t, reply[:40]))

    # 混在正常动作里的删除也要被整条拦下（不能只丢掉删除那一个、其余照做）
    got = ask_model([{'type': 'play', 'value': ''}, {'type': 'delete_score', 'value': 's1'}])
    if got.get('actions'):
        FAIL.append('混入删除动作时，其余动作仍被执行了：%s' % got.get('actions'))
    print(('PASS ' if not got.get('actions') else 'FAIL ') + '混入删除动作 -> 整条拒绝')

    # 前后端清单一致性
    js = io.open(os.path.join(ROOT, 'dist', 'workspace-ai.js'), encoding='utf-8').read()
    start = js.find('const FORBIDDEN_TYPES=new Set([')
    end = js.find(']);', start)
    if start < 0 or end < 0:
        FAIL.append('前端 dist/workspace-ai.js 里找不到 FORBIDDEN_TYPES')
    else:
        front = {x.strip().strip("'\"") for x in js[start + len('const FORBIDDEN_TYPES=new Set(['):end].split(',')}
        missing = ai_workspace.FORBIDDEN_TYPES - front
        if missing:
            FAIL.append('前端清单缺了：%s' % sorted(missing))
        print(('PASS ' if not missing else 'FAIL ') + '前后端删除动作清单一致（%d 个）' % len(ai_workspace.FORBIDDEN_TYPES))

    if FAIL:
        print('\nFAIL AI 删除防护：')
        for item in FAIL:
            print('  - ' + item)
        return 1
    print('\nPASS AI 删除防护（后端回绝 / 不静默过滤 / 前后端清单一致）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
