"""为云曲库里带 pbl 的 1075 首作品，生成「顶级公开课 PBL」定制提示词。

与 build_classroom_goals.py 共用同一套真实谱面证据逻辑（evidence_lines /
tags_for / pick / GUARD 等），但在 goal 里额外强化四项公开课质量要素：

  1) 板书 / 课件 / 讲稿可观摩
  2) 探究合作 + 公开展示
  3) 可观测目标 + 嵌入式评价
  4) 真实驱动问题 + 可公开展示的产出物

并通过 score_classroom.create(openClass=True) → classroom-pipeline.mjs 的
openClass 分支，把上述要求进一步落成结构化字段（drivingQuestion /
deliverable / boardDesign / script / collaboration / assessment 等）。

不同的 goal 文本天然生成不同的课堂 id（create() 的 ident 哈希也含 openClass），
因此不会覆盖 build_classroom_goals 产出的 1879 堂普通课。

用法：
  python scripts/build_openclass_goals.py            # 生成 goals-openclass.jsonl
  python scripts/build_openclass_goals.py --show 3   # 打印前 3 条供审阅
"""
import argparse
import concurrent.futures
import hashlib
import json
import pathlib
import sys
import time
import urllib.request

from build_classroom_goals import (
    as_int, evidence_lines, tags_for, title_of, pick, GUARD, THEMES,
    ROLES, PRODUCTS, STAGES, DURATIONS, OPENERS, FALLBACK_TAGS,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.sites-runtime' / 'classroom-batch'
GOALS = OUT / 'goals.jsonl'
OPENCLASS_GOALS = OUT / 'goals-openclass.jsonl'
BASE = 'http://127.0.0.1:5173'


def get(url, timeout=90):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


OPENCLASS_GUARD = ('公开课前须先确认：历史背景、作者信息与作品标题之外的史实须核验，查不到就标为未知；'
                   '谱面未标注的调性、曲式与和声结论只能写成推测；'
                   '不要把鉴赏课上成单纯的演奏训练，也不要把小组探究写成教师独白。')


# 公开课 PBL 优先采用本身就强调协作 / 展示 / 实证的母题
PREFERRED_TAGS = {'parts', 'issues', 'repeat', 'structure', 'dance', 'narrative',
                  'culture', 'chord', 'words', 'range', 'meter', 'dense', 'debate',
                  'game', 'build', 'workshop', 'detective', 'contrast', 'teach',
                  'archive', 'sense'}


def choose_theme(p, title, seed):
    """与 build_classroom_goals 同样的确定性母题选择，但偏向协作 / 探究型母题。"""
    tags = tags_for(p, title)
    strong_tags = [t for t in tags if t not in FALLBACK_TAGS]
    matching = [t for t in THEMES if t['tag'] in strong_tags] if strong_tags else []
    if matching:
        preferred = [t for t in matching if t['tag'] in PREFERRED_TAGS] or matching
    else:
        preferred = [t for t in THEMES if t['tag'] in FALLBACK_TAGS]
    h = int(hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16], 16)
    weighted = []
    for t in preferred:
        weighted += [t] * (1 + min(3, (strong_tags or FALLBACK_TAGS).count(t['tag'])))
    pool = weighted or THEMES
    return pool[h % len(pool)]


def build_openclass_goal(score_id, p, fallback_title, salt=0):
    title = title_of(p, fallback_title)
    facts = evidence_lines(p)
    seed = score_id + '|openclass|' + str(salt)
    theme = choose_theme(p, title, seed)
    role = pick(ROLES, seed + '|role')
    product = pick(PRODUCTS, seed + '|product')
    stage_key, level, stage_word = pick(STAGES, seed + '|stage')
    duration = pick(DURATIONS, seed + '|duration')
    opener = pick(OPENERS, seed + '|opener')

    facts_text = '；'.join(facts)
    driving = ('请把核心问题「%s？」落到一个真实情境里——例如向校内外观众公开展示、'
               '或为某个真实听众解决一个具体的音乐问题，而不是停在“赏析这首曲子”。' % theme['q'])
    showcase = ('课堂须分小组协作探究，每组承担一个明确的音乐任务并产出可比较的中间成果；'
                '末尾设置公开展示环节，各组展示产出物并接受同伴评价。')
    goal = (
        '为《%s》设计一节 %d 分钟的%s音乐公开课（项目式学习 PBL），学生是%s，课堂身份是%s。'
        '%s'
        '本课的真实驱动情境是：%s'
        '必须以当前谱面为唯一证据起点：%s。'
        '围绕这个真实问题，按以下项目式路径展开：①以「%s」作为小组协作探究的主线；'
        '②%s'
        '③课堂最终产出是%s（须是可公开展示、可被同伴评价的具体成果，而非一张纸）。'
        '评价重点：%s。请在每个环节都写明：可观测的学习目标与成功标准、嵌入式形成性评价、'
        '板书设计、逐字讲稿；板书、课件与讲稿三者须一致。'
        '%s'
        '请据此安排完整聆听、小组协作、公开展示与反思；凡是引用本曲信息，都要点明具体小节号或数字。'
        '本节须达到可对外观摩的公开课水准。'
        % (title, duration, stage_word, level, role,
           opener, driving,
           facts_text, theme['chain'], showcase, product,
           theme['assess'], OPENCLASS_GUARD)
    )
    return goal[:2800], dict(theme=theme['name'], role=role, product=product,
                             schoolStage=stage_key, level=level,
                             duration=duration,
                             features=['slides', 'pbl', 'interactive'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--show', type=int, default=0)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    rows = [json.loads(l) for l in open(GOALS, encoding='utf-8') if l.strip()]
    pbl = [r for r in rows if 'pbl' in (r.get('features') or [])]
    print('PBL 目标总数：%d' % len(pbl), flush=True)

    def fetch(r):
        last = None
        for attempt in range(3):
            try:
                p = get(BASE + '/api/scores/' + r['scoreId'] + '/profile', timeout=180)
                if not isinstance(p, dict) or 'measureCount' not in p:
                    last = str(p)[:120] if isinstance(p, dict) else '响应格式异常'
                    break
                return r, p, None
            except Exception as e:
                last = str(e)
                time.sleep(0.8 * (attempt + 1))
        return r, None, last

    profiles = {}
    failed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for i, (r, p, err) in enumerate(pool.map(fetch, pbl), 1):
            if p is None:
                failed += 1
                if failed <= 5:
                    print('  跳过 %s：%s' % (r.get('title', '')[:24], err), flush=True)
                continue
            profiles[r['scoreId']] = (r, p)
            if i % 200 == 0:
                print('  已读取 %d / %d' % (i, len(pbl)), flush=True)
    print('可用 profile：%d，失败/跳过：%d' % (len(profiles), failed), flush=True)

    seen = {}
    records = []
    collisions = 0
    for idx, (sid, (r, p)) in enumerate(sorted(profiles.items(), key=lambda kv: kv[0])):
        for salt in range(12):
            goal, meta = build_openclass_goal(sid, p, r.get('title'), salt)
            digest = hashlib.sha256(goal.encode('utf-8')).hexdigest()
            if digest not in seen:
                seen[digest] = sid
                break
            collisions += 1
        else:
            print('  警告：%s 多次碰撞' % sid[:12], flush=True)
        records.append(dict(scoreId=sid, title=title_of(p, r.get('title')),
                            goal=goal, goalHash=digest,
                            openClass=True, **meta))

    tmp = OPENCLASS_GOALS.with_suffix('.jsonl.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    tmp.replace(OPENCLASS_GOALS)

    unique = len({x['goalHash'] for x in records})
    print('\n生成完成：%d 条，去重后 %d 条，碰撞重试 %d 次' % (len(records), unique, collisions), flush=True)
    print('输出：%s' % OPENCLASS_GOALS, flush=True)
    themes = {}
    for x in records:
        themes[x['theme']] = themes.get(x['theme'], 0) + 1
    print('用到 %d 个教学母题，最多的五个：%s' % (len(themes), sorted(themes.items(), key=lambda kv: -kv[1])[:5]), flush=True)

    for rec in records[:args.show]:
        print('\n--- %s | %s | %s %d分钟 ---' % (rec['title'], rec['theme'], rec['level'], rec['duration']))
        print(rec['goal'])
    if unique != len(records):
        print('错误：仍有重复 goal', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
