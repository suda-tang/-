# -*- coding: utf-8 -*-
"""离线探针：直接调 fast_plan，判断「规则通道」对某句话给出什么。

为什么需要它：50 条长流程用例里有 11 条失败，光看界面状态分不清是
「规则通道写死了」还是「模型选错了动作」。这个探针**不经过浏览器、不调模型**，
把 fast_plan 的原始返回值打出来 —— 秒级、确定性，改代码后可以立刻复验。

用法：python scripts/_probe-fastplan.py            # 跑内置的关注清单
      python scripts/_probe-fastplan.py "打开《知足》，然后开始播放。"
"""
import io, json, sys, importlib.util, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


aw = load('ai_workspace', 'ai_workspace.py')
catalog = load('ai_catalog', 'ai_catalog.py')


def cloud_scores():
    """直接问本地服务要曲库（不再依赖手工快照文件，免得快照过期）。"""
    try:
        with urllib.request.urlopen('http://127.0.0.1:5173/api/scores', timeout=20) as r:
            return json.loads(r.read().decode('utf-8'))['scores']
    except Exception as e:                       # noqa: BLE001
        sys.exit('读不到曲库（5173 在跑吗？）：' + str(e))


SCORES = cloud_scores()
ITEMS = [{'id': s['id'], 'title': s['title'], 'ready': s.get('ready', False),
          'status': s.get('status', '')} for s in SCORES]


def find_id(sub):
    hit = next((s for s in SCORES if s.get('title') == sub), None) or \
          next((s for s in SCORES if sub in (s.get('title') or '')), None)
    return hit['id'] if hit else None


# 《知足》的两个同名条目（曲库里确实有两首叫「知足」的）
ZHIZU = [s for s in SCORES if s.get('title') == '知足']
ZHIZU_ID = ZHIZU[0]['id'] if ZHIZU else None

# 声部表（从真实页面抄下来的《知足》声部）
PARTS = [
    {'value': 'all', 'name': '全部乐器'},
    {'value': 'P1-1', 'name': '钢琴'},
    {'value': 'P2-26', 'name': '钢弦吉他'},
    {'value': 'P3-28', 'name': '吉他28'},
    {'value': 'P4-34', 'name': '贝司34'},
    {'value': 'P10', 'name': '鼓组'},
    {'value': 'P5-49', 'name': '弦乐合奏'},
    {'value': 'P6-53', 'name': '弦乐53'},
    {'value': '__vocal', 'name': '人声'},
]


def ctx(**over):
    base = {
        'scores': ITEMS, 'selectionId': None, 'currentId': ZHIZU_ID,
        'playing': False, 'measure': 1, 'measureCount': 86,
        'measureNumbers': list(range(1, 87)),
        'parts': PARTS, 'current': '知足',
        'currentChord': '', 'controls': [],
    }
    base.update(over)
    return base


def run(say, **over):
    data = {'messages': [{'role': 'user', 'content': say}], 'context': ctx(**over)}
    try:
        plan = aw.fast_plan(data, lambda t: None)
    except Exception as e:                       # noqa: BLE001
        plan = {'__exception__': type(e).__name__ + ': ' + str(e)}
    return plan


CASES = [
    ('#1/#2/#45 打开《知足》（曲库里有两首同名）', '打开《知足》，然后开始播放。', {}),
    ('#4 打开《月亮代表我的心》（唯一匹配，但没说「播放」）', '打开《月亮代表我的心》。', {}),
    ('#4b 同一句但带「播放」', '打开《月亮代表我的心》，然后播放。', {}),
    ('#5 换《海阔天空》（唯一匹配 + 播放）', '换一首《海阔天空》，从头开始播放。', {}),
    ('#19 跳到最后一小节', '跳到这首曲子的最后一小节。', {}),
    ('#19b 跳到第 86 小节（对照）', '跳到第 86 小节。', {}),
    ('#21 跳到第 5 小节并只听鼓组', '跳到第 5 小节，并且只听鼓组。', {}),
    ('#46 静音钢琴+节拍器+简谱+播放', '把钢琴静音，打开节拍器，切换到简谱，然后开始播放。', {}),
    ('#47 打开月亮+简谱+速度70+播放', '打开《月亮代表我的心》，切到简谱，速度调到 70，然后播放。', {}),
    ('#50 删除《知足》', '把《知足》从云曲库里删掉。', {}),
    ('#49 分析和弦+切五线谱+播放', '先分析当前小节的和弦，然后切到五线谱，再开始播放。', {}),
    ('#29 快一点（相对指令）', '现在太慢了，快一点。', {}),
]

if len(sys.argv) > 1:
    CASES = [('命令行', ' '.join(sys.argv[1:]), {})]

print('曲库中标题为「知足」的条目数：', len(ZHIZU), [s['id'][:12] for s in ZHIZU])
print()
for name, say, over in CASES:
    print('─' * 78)
    print(name)
    print('  说：' + say)
    plan = run(say, **over)
    if plan is None:
        print('  fast_plan → None  ← 交给模型处理')
    elif plan.get('analysis'):
        print('  fast_plan → 分析路径（走模型写曲式）')
    else:
        print('  reply  : ' + str(plan.get('reply', '')).replace('\n', ' / '))
        acts = plan.get('actions') or []
        print('  actions: ' + json.dumps(acts, ensure_ascii=False))
    print()
