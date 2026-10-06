# 「X 最早出现的地方」回归（不打桩、不调模型，直接打后端 planner）。
#
# 为什么要单独守这条：以前这条**一定失败** —— 模型只看得见声部名（鼓组），
# 而「通鼓」是鼓组里的单个音高（GM 47），它既编不出小节号、也没有动作能表达。
# 现在服务端按真实演奏数据（.sites-runtime/score-cache 里的 midiPlayback）去查，
# 再落成 open + seek_measure + play。
#
# 前提：本地 http://127.0.0.1:5173 已经在跑，且曲库里有带逐音符演奏数据的《知足》。
# 跑法：python scripts/check-ai-locate.py
import json, sys, urllib.request

BASE = 'http://127.0.0.1:5173'


def api(path, body=None):
    if body is None:
        with urllib.request.urlopen(BASE + path, timeout=30) as r:
            return json.load(r)
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def ask(text, score, measure=1):
    ctx = {'scores': score['all'], 'library': '共%d首' % len(score['all']), 'panel': 'play',
           'current': score['title'], 'currentId': score['id'], 'measure': measure,
           'parts': score.get('parts', []), 'measureCount': score.get('measureCount', 200),
           'measureNumbers': list(range(1, score.get('measureCount', 200) + 1))}
    return api('/api/workspace-ai', {'messages': [{'role': 'user', 'content': text}], 'context': ctx})


def main():
    scores = api('/api/scores')['scores']
    zhizu = [x for x in scores if '知足' in (x.get('title') or '')]
    if len(zhizu) < 1:
        print('SKIP 曲库里没有《知足》，无法回归这条链路'); return 0
    # 有逐音符演奏数据的那一份才查得到（另一份是 PDF 识谱来的，没有 midiPlayback）。
    score = {'all': scores, 'id': zhizu[0]['id'], 'title': zhizu[0]['title']}

    cases = [
        # (提问, 断言：reply 必须包含 / actions 必须包含的类型)
        ('播放《知足》里边通鼓最早出现的地方', '通鼓', {'seek_measure', 'play'}),
        ('《知足》里通鼓最早出现在第几小节？', '小节', {'seek_measure'}),
        ('鼓组是什么时候进来的', '鼓组', set()),
        ('只听鼓组，播放通鼓最早出现的地方', '通鼓', {'solo', 'seek_measure', 'play'}),
        # 数据里确实没有的打击乐器，必须诚实说没找到，而不是编一个位置
        ('《知足》里小号最早出现的地方', '没有找到', set()),
    ]
    failed = []
    for text, want, types in cases:
        try:
            r = ask(text, score)
        except Exception as e:
            failed.append('%s -> 请求异常 %s' % (text, e)); continue
        reply = r.get('reply') or r.get('error') or ''
        got = {a['type'] for a in (r.get('actions') or [])}
        ok = want in reply and types <= got
        print(('PASS ' if ok else 'FAIL ') + text)
        print('      reply  : ' + reply.replace('\n', ' / '))
        print('      actions: ' + json.dumps(r.get('actions'), ensure_ascii=False))
        if not ok:
            failed.append('%s -> reply 缺「%s」或 actions 缺 %s（实际 %s）'
                          % (text, want, sorted(types - got), sorted(got)))

    # 当前打开的是**没有演奏数据**的那一份时：同名曲目可能有多份，
    # 服务端会退回到另一份有数据的（并补一个 open 动作），或者老实说明查不到。
    # 两种都算对，但不许「既没数据、又假装查到了」。
    if len(zhizu) > 1:
        alt = {'all': scores, 'id': zhizu[1]['id'], 'title': zhizu[1]['title']}
        r = ask('播放《知足》里边通鼓最早出现的地方', alt)
        reply = r.get('reply') or ''
        got = {a['type'] for a in (r.get('actions') or [])}
        fellback = '小节' in reply and 'open' in got
        explained = any(k in reply for k in ('没有逐音符', '没有可检索的电子谱', '没有找到'))
        ok = fellback or explained
        print(('PASS ' if ok else 'FAIL ') + '无演奏数据的曲谱：退回有数据的副本，或说明原因')
        print('      reply  : ' + reply.replace('\n', ' / '))
        print('      actions: ' + json.dumps(r.get('actions'), ensure_ascii=False))
        if not ok:
            failed.append('无演奏数据的曲谱既没退回副本也没说明原因：' + reply)

    if failed:
        print('\nFAIL AI 定位检查：')
        for item in failed:
            print('  - ' + item)
        return 1
    print('\nPASS AI 定位检查（通鼓/鼓组/独奏/换曲/查无此乐器）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
