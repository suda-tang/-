"""为云曲库里每首作品生成一条独一无二的、有创意且有针对性的曲谱课堂提示词。

与 dist/classroom-setup.js 里那句固定模板不同，这里每条 goal 都由三部分组成：

1. 本曲独有的「谱面证据」——从 /api/scores/<id>/profile 读取的真实拍号、调号、
   速度与速度变化、声部编制与音域、力度记号、重复段落所在小节、识谱疑点、
   音级时长分布。每条都点名具体小节号/数字，绝不泛泛而谈。
2. 一个与这些证据相匹配的「教学母题」——如速度考古、调性迁徙、声部谈判、
   谱面疑点鉴定所、力度地形图、记忆宫殿等，共 36 个，各有不同的驱动问题、
   任务链、产出物与评价方式。
3. 由曲谱 id 确定性派生的「课堂情境 / 学段 / 课时 / 活动组合」——同一母题的
   曲子也会落到不同的角色情境与产出物上。

最后对全部 goal 做哈希去重校验，碰撞则加盐重生成，保证两两不同。

用法：
  python scripts/build_classroom_goals.py                 # 生成/刷新 goals.jsonl
  python scripts/build_classroom_goals.py --limit 20      # 只处理前 20 首（调试）
  python scripts/build_classroom_goals.py --show 5        # 打印前 5 条供审阅
"""
import argparse
import concurrent.futures
import hashlib
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.sites-runtime' / 'classroom-batch'
GOALS = OUT / 'goals.jsonl'
BASE = 'http://127.0.0.1:5173'


def get(url, timeout=90):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def title_of(p, fallback):
    return str(p.get('title') or fallback or '未命名作品').strip()[:80]


def fifths_name(v):
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    names = {-7: '降C大调', -6: '降G大调', -5: '降D大调', -4: '降A大调',
             -3: '降E大调', -2: '降B大调', -1: 'F大调', 0: 'C大调',
             1: 'G大调', 2: 'D大调', 3: 'A大调', 4: 'E大调',
             5: 'B大调', 6: '升F大调', 7: '升C大调'}
    return names.get(n)


def pitch_class_name(pc):
    return {0: 'C', 1: '升C/降D', 2: 'D', 3: '升D/降E', 4: 'E', 5: 'F',
            6: '升F/降G', 7: 'G', 8: '升G/降A', 9: 'A', 10: '升A/降B', 11: 'B'}.get(pc, str(pc))


def as_int(value, default=0):
    """profile 里的速度/小节号可能是 'J= 68'、'深情地 .=70' 这类中文字符串。"""
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return int(value)
    import re as _re
    m = _re.search(r'-?\d+(?:\.\d+)?', str(value or ''))
    return int(float(m.group())) if m else default


def evidence_lines(p):
    """把 profile 变成一串只属于这首曲子的、带具体数字的事实。"""
    facts = []
    n = p.get('measureCount') or 0
    facts.append('共 %d 小节 / %d 个音符' % (as_int(n), as_int(p.get('noteCount'))))

    meters = p.get('timeSignatures') or []
    if len(meters) == 1:
        facts.append('全曲 %s 拍' % meters[0].get('value'))
    elif len(meters) > 1:
        seq = '、'.join('%d小节转%s' % (as_int(m.get('measure'), 1), m.get('value')) for m in meters[:4])
        facts.append('拍号有变化（%s）' % seq)

    keys = p.get('keys') or []
    if keys:
        named = [fifths_name(k.get('fifths')) for k in keys]
        named = [x for x in named if x]
        uniq = list(dict.fromkeys(named))
        if len(uniq) > 1:
            facts.append('谱面调号先后出现 %s 等 %d 处标记（调号不等于实际调性，需听辨核验）'
                         % ('、'.join(uniq[:3]), len(keys)))
        elif uniq:
            facts.append('谱面调号标记为 %s（调号不等于实际调性，需听辨核验）' % uniq[0])
    else:
        facts.append('谱面未标注调号')

    tempo_changes = p.get('tempoChanges') or []
    tempo = p.get('tempo')
    if len(tempo_changes) > 1:
        seq = '、'.join('%d小节%s BPM' % (as_int(c.get('measure'), 1), as_int(c.get('bpm'))) for c in tempo_changes[:3])
        facts.append('速度记号多次改变（%s）' % seq)
    elif tempo:
        facts.append('原谱速度 %s BPM' % as_int(tempo))

    parts = p.get('parts') or []
    if parts:
        names = [str(x.get('name') or x.get('value')) for x in parts[:6]]
        facts.append('%d 个声部：%s' % (len(parts), '、'.join(names)))
        perc = [str(x.get('name')) for x in parts if x.get('percussion')]
        if perc:
            facts.append('其中含打击乐声部 %s' % '、'.join(perc[:3]))
        ranges = [x.get('pitchRange') for x in parts if x.get('pitchRange')]
        if ranges:
            lo = min(as_int(r[0]) for r in ranges)
            hi = max(as_int(r[1]) for r in ranges)
            facts.append('整体音域约 MIDI %d—%d' % (lo, hi))

    dyn = p.get('writtenDynamics')
    # score_profiles 统计的是「带力度信息的音符数」，不是独立的力度记号条目数。
    if isinstance(dyn, list) and dyn:
        facts.append('谱面有 %d 处独立力度或表情标记' % len(dyn))
    elif isinstance(dyn, (int, float)) and dyn:
        facts.append('约 %d 个音符带有力度信息（并非 %d 条独立力度记号）'
                     % (as_int(dyn), as_int(dyn)))

    issues = p.get('issues') or []
    if issues:
        codes = list(dict.fromkeys(str(x.get('code')) for x in issues))[:3]
        facts.append('谱面有 %d 处待核对疑点（%s），第 %d 小节起' % (len(issues), '、'.join(codes), as_int(issues[0].get('measure'), 1)))

    reps = p.get('repeatedMeasures') or []
    if reps:
        groups = sorted(reps, key=lambda x: -len(x.get('measures') or []))
        g = groups[0]
        ms = [as_int(m) for m in (g.get('measures') or [])][:6]
        facts.append('有 %d 组重复音型，最典型的一组出现在第 %s 小节' % (len(reps), '、'.join(map(str, ms))))

    tonal = (p.get('tonalEvidence') or {}).get('pitchClassDurations') or []
    if tonal:
        top = sorted(tonal, key=lambda x: -as_int(x.get('quarterBeats')))[:3]
        facts.append('音级时长占比最高的三个是 %s' % '、'.join(pitch_class_name(x.get('pitchClass')) for x in top))

    measures = p.get('measures') or []
    chord_ms = [as_int(m.get('measure')) for m in measures if m.get('chords')][:4]
    if chord_ms:
        facts.append('第 %s 小节标注了和弦' % '、'.join(map(str, chord_ms)))
    word_ms = [as_int(m.get('measure')) for m in measures if m.get('words')][:4]
    if word_ms:
        facts.append('第 %s 小节带有歌词/文字提示' % '、'.join(map(str, word_ms)))
    return facts[:9]


# ---- 36 个教学母题：各有不同的驱动问题、任务链、产出物与评价方式 ------------
# tag 表示这个母题最适合哪类曲子；build() 会按曲子特征打分后确定性挑选。
THEMES = [
    dict(tag='tempo', name='速度考古队',
         q='同一段旋律在不同速度下还是同一首曲子吗',
         chain='先用原谱速度完整聆听，再分别用明显更慢与更快的速度复听同一片段，记录每次速度改变了哪些音乐印象，最后回到谱面找速度记号作为依据，讨论作曲家写下的数字与演奏者自由度之间的边界。',
         product='一张「速度—情绪」对照卡，标明本曲速度与三次试验速度及各自的听感证据',
         assess='能否用谱面上的具体数字而不是「我觉得」来支撑结论'),
    dict(tag='tempo', name='节拍器法庭',
         q='这首曲子该不该严格跟着节拍器走',
         chain='分成正反两方，一方主张严格守速，一方主张弹性处理；双方都必须从本曲的速度记号、拍号与重复段落里找证据，各做一次带播放的示范，最后轮流陈述并由全班投票。',
         product='一份双方各三条论据的辩论记录，以及本曲是否适合用节拍器的结论',
         assess='论据是否引用了真实谱面信息，且承认对方合理之处'),
    dict(tag='key', name='调性迁徙地图',
         q='转调把听众带到了什么地方',
         chain='按谱面调号变化把全曲切成若干区段，为每个区段选一种颜色或一种场景，画一张迁徙路线图；逐段复听时核对颜色是否与听感一致，讨论调号标注与实际听辨不一致时该相信谁。',
         product='一张标出小节号与调号的「调性迁徙地图」',
         assess='地图上的每个转折点是否都能对应到谱面小节'),
    dict(tag='key', name='调式色彩实验室',
         q='只用几个音为什么就能听出明亮或幽暗',
         chain='先统计本曲出现时间最长的几个音级，再用课堂乐器只弹这几个音做音色实验，逐步加入其余音级，记录色彩何时开始改变，最后回到全曲验证这个判断是否成立。',
         product='一份「音级配方表」，写明哪些音占多少时长、带来什么色彩',
         assess='结论是否建立在实际统计数字上，并说明统计不能替代听辨'),
    dict(tag='parts', name='声部谈判桌',
         q='如果只能保留两个声部，留哪两个',
         chain='先完整聆听，再逐次静音其余声部做对比复听，各组认领一个声部说明它不可替代的理由，通过协商选出保留方案并当场播放验证，讨论删掉声部后丢失的是什么。',
         product='一份写明保留与舍弃理由的「声部谈判纪要」',
         assess='是否用逐次静音的对比结果作为依据'),
    dict(tag='parts', name='复调追踪记',
         q='同一条旋律在别处又出现了吗',
         chain='给每个声部指定一名追踪员，沿小节号记录自己声部的进出与重复，遇到两条声部同时出现相似走向就标记出来，最后把各人的记录拼成一张时间轴并复听核对。',
         product='一张标出声部进出与交汇小节的时间轴',
         assess='标记的小节号能否在复听中被验证'),
    dict(tag='percussion', name='身体打击乐工坊',
         q='不用乐器能不能把节奏层搭起来',
         chain='先听辨本曲打击乐声部的节奏型，用拍手、跺脚、拍桌分声部模仿，再逐步叠加成合奏，随后关掉原曲只留人声节奏层，最后讨论记谱上的节奏与实际身体律动的差别。',
         product='一段分声部的身体打击乐合奏，附节奏型示意',
         assess='叠加后是否稳定，以及能否说出自己负责的是哪一层'),
    dict(tag='repeat', name='记忆宫殿',
         q='重复的音型是偷懒还是设计',
         chain='找出谱面标记为重复的小节组，逐组比较它们是原样重复还是带变化，为每组设计一个简单的记忆手势或图形，跟着全曲依次比划，最后讨论作曲家为什么在这里选择重复。',
         product='一份标出重复小节号与手势的「记忆地图」',
         assess='能否准确指出重复出现的小节，并区分原样重复与变化重复'),
    dict(tag='repeat', name='变奏种子',
         q='一个短动机能长出多少种样子',
         chain='从本曲挑一个最短的、反复出现的音型当作种子，各组用改变节奏、改变音区、改变力度或改变声部分配的方式各长出一个变体，全班连起来播放成一条变奏链，再回头听原曲里的处理。',
         product='一条由全班变体组成的变奏链，每个变体注明改了哪一项',
         assess='变体是否明确改变了某一项音乐要素，且能说清与原型的差别'),
    dict(tag='issues', name='谱面疑点鉴定所',
         q='这份谱子有没有抄错或识别错的地方',
         chain='扮演校对员，先找出谱面标记的疑点所在小节，逐个对照拍号时值与声部进出判断可能是记谱、识别还是演奏习惯造成，提出不改原谱前提下的核对办法，最后形成一份鉴定报告。',
         product='一份列出疑点小节、判断理由与核对方法的鉴定报告',
         assess='是否区分了「确定有误」与「只是可疑」，且不擅自改动原谱'),
    dict(tag='dynamics', name='力度地形图',
         q='强弱变化能不能画成一条地形线',
         chain='沿着小节流展把谱面力度记号标成高低起伏的曲线，按曲线指挥一次全班哼唱，再复听原曲核对哪些地方的起伏与谱面不一致，讨论记谱力度与实际演奏力度的差异。',
         product='一张标注小节号与力度级别的地形曲线图',
         assess='曲线是否对应到具体小节，且能解释不一致之处'),
    dict(tag='structure', name='结构领航员',
         q='听的人怎么知道自己走到哪儿了',
         chain='把这首较长作品按重复段、调号变化或速度变化切成几个航段，为每段起一个不带剧透的名字，做一次带路标的导听，中途暂停让同学判断当前位置，最后统计判断准确率。',
         product='一份含小节点与路标名称的「导听航线图」',
         assess='路标是否落在真实结构位置上，中途判断是否有谱面依据'),
    dict(tag='short', name='一分钟微课堂',
         q='这么短的一首曲子能讲出什么',
         chain='每人只能用一句话说出本曲最特别的一处，把全部句子贴到黑板上合并同类项，挑出争议最大的两处各做一次带播放的验证，最后合作录一段一分钟导赏词。',
         product='一段不超过一分钟、点名具体小节的导赏词',
         assess='是否避免了空泛形容词，且每人只贡献一个可验证的观察'),
    dict(tag='composer', name='作曲家的来信',
         q='如果作曲家要为这首曲子写一封信，他会叮嘱什么',
         chain='先只依据谱面能确认的事实列出清单，再区分哪些属于可查证的史料、哪些属于想象，以作曲家口吻写一封给演奏者的短信，信中每条叮嘱都要能指回谱面依据，最后朗读并互评。',
         product='一封标明「有据可查」与「合理想象」的短信',
         assess='是否守住史实与想象的边界，不编造生平与作品信息'),
    dict(tag='etude', name='把练习曲变成音乐会',
         q='技术难点怎样变成听众能听懂的表现',
         chain='先找出本曲重复出现的技术型音型，讨论它考验的是手指、气息还是配合，再设计一个把该难点变成音乐形象的讲法，配一次示范播放，最后说明技术训练与舞台表达如何互相成就。',
         product='一份把技术难点翻译成音乐形象的「音乐会导赏卡」',
         assess='是否点名了具体音型与小节，而非只谈练琴方法'),
    dict(tag='variation', name='主题变形实验室',
         q='主题被改到什么程度还算同一首',
         chain='锁定本曲的主题材料，逐段记录节奏、音区、织体、力度各被改动了哪一项，做一个「变形刻度尺」，把各段放上去，最后讨论辨认出主题靠的是哪一条最顽固的线索。',
         product='一把标出各段变形程度的刻度尺',
         assess='每个变形判断能否指回谱面上的具体改动'),
    dict(tag='dance', name='舞步解码',
         q='从谱面能不能反推出身体该怎么动',
         chain='依据拍号与速度先判断可能的律动类型，设计两组不同的身体律动方案，分别跟着音乐试做并投票，再从重复音型与重音位置找证据支持胜出方案，最后说明推测的限度。',
         product='一组带拍号与速度依据的律动方案说明',
         assess='是否把推测与谱面证据分开表述'),
    dict(tag='narrative', name='配乐导演',
         q='如果给一段画面配乐，该剪哪几小节',
         chain='先给一个没有标准答案的简短情境，各组从本曲挑一段最贴切的小节区间并说明依据，播放各自片段比较效果，讨论同一段音乐换一个情境后意义如何改变，最后剪辑成一条班级版配乐。',
         product='一份注明起止小节与选择理由的配乐剪辑单',
         assess='选择理由是否落在速度、力度、织体等可听要素上'),
    dict(tag='culture', name='地域声音田野',
         q='这首曲子的地方色彩藏在哪个音里',
         chain='先统计音级时长分布，找出占比突出或明显缺席的音级，试着用课堂乐器搭出这个音阶，再听一遍全曲核对色彩，讨论只凭音级统计能不能断定地域或民族风格。',
         product='一份音阶搭建记录，附「能推断」与「不能推断」两栏',
         assess='是否明确说出统计方法的边界'),
    dict(tag='chord', name='和弦情绪板',
         q='谱面上标出的和弦能替我们说出什么',
         chain='找到谱面标注和弦的小节，逐个用课堂乐器弹出并让同学选一个词形容，汇总成情绪板；再复听这些小节的完整织体，讨论单看和弦标记与听到实际音响的差距。',
         product='一张标出小节号、和弦与听感词的情绪板',
         assess='是否区分了和弦标记与真实和声，不把标注当结论'),
    dict(tag='words', name='词曲咬合',
         q='歌词落在这些音上合适吗',
         chain='找到带歌词或文字提示的小节，逐句对照字数、重音与旋律走向，试着把词换到别的位置读一遍，比较两种处理的语气差异，最后讨论记谱里的文字提示能告诉我们多少。',
         product='一份标注小节号的词曲对照表',
         assess='对照是否具体到小节，且承认资料有限'),
    dict(tag='range', name='音区角色扮演',
         q='高低音区是不是在扮演不同角色',
         chain='依据各声部音域把全曲分成高、中、低三个角色，为每个角色设计一句台词，跟着音乐在对应音区出现时念出，最后讨论音区与角色感之间的联系是听出来的还是想出来的。',
         product='一份标出音域范围与出场小节的「角色表」',
         assess='角色出场是否对应真实音区数据'),
    dict(tag='meter', name='变拍侦查',
         q='拍号一变，身体会先发现还是耳朵先发现',
         chain='标出拍号改变的小节，先不告诉同学位置播放一遍，让大家举手示意觉得哪里变了，再对照谱面公布答案，第二次带着数拍复听，最后讨论记谱变更与听觉感受为何不完全同步。',
         product='一张「猜测位置 vs 实际位置」对照表',
         assess='能否指出具体小节，并解释错判的原因'),
    dict(tag='dense', name='织体分层积木',
         q='这么多音符是怎么叠起来的',
         chain='按声部把本曲想象成几块积木，先只听一块，再逐块叠加，每加一块记录听感变化，最后讨论密度大的段落里如何还能听清主线，以及逐次静音这种办法的局限。',
         product='一张标出叠加顺序与听感变化的「积木图」',
         assess='叠加顺序是否对应真实声部，且说明了方法局限'),
    dict(tag='quiet', name='休止符的重量',
         q='没有声音的小节算不算音乐',
         chain='统计本曲休止较多的段落，挑一处做「有声 / 静默」两种版本的聆听对比，讨论休止在结构里承担什么作用，再为这处休止设计一种不用出声的课堂表现方式。',
         product='一份标出休止小节与两种听感差异的记录',
         assess='是否落实到具体小节而非泛谈留白'),
    dict(tag='debate', name='策展人会议',
         q='只选三个片段，怎么让别人听懂整首',
         chain='每组的展位只能放三个片段，必须覆盖本曲最有辨识度的开头、一处变化与一处结尾，为每片段写一句展签并标注小节号，轮流导览后全班互评哪组选得最省力。',
         product='一份含三段起止小节与展签的策展方案',
         assess='选段是否覆盖结构关键位置，展签是否可验证'),
    dict(tag='game', name='听辨闯关',
         q='能不能只靠耳朵认出刚才那一小节',
         chain='设计三关：听片段找小节号、听两个片段判断哪个先出现、听静音后的版本说出少了哪个声部；每关都要用谱面公布答案并说明错因，最后讨论游戏化听辨训练能练到什么。',
         product='一份含三关题目、答案小节号与错因分析的关卡卡',
         assess='答案是否可核对，错因是否指向具体音乐要素'),
    dict(tag='radio', name='导赏电台',
         q='三十秒里怎么把这首曲子介绍给没听过的人',
         chain='每人写一句必须含一个具体数字的导赏词（小节号、速度、声部数皆可），录成一段接力的电台稿，中间插入两次真实播放片段，最后回听检查有没有哪句查无实据。',
         product='一份标注插入点小节号的电台稿',
         assess='每句是否含可核对的数字，且不编造史实'),
    dict(tag='build', name='声音建筑',
         q='如果把这首曲子画成一栋楼，梁柱在哪',
         chain='把重复出现的音型当梁柱、把变化段当门窗，画一张结构立面图并标上小节号，按图做一次导听，最后讨论这个类比帮我们看清了什么、又遮住了什么。',
         product='一张带小节号标注的声音建筑图',
         assess='类比是否落到具体结构，且说清了类比的局限'),
    dict(tag='workshop', name='改编工作坊',
         q='换一件乐器，这首曲子还成立吗',
         chain='先确认本曲声部编制，各组挑一个声部设想换成另一件课堂乐器，说明音色与音域是否容许，用现有条件试奏或哼唱一小段验证，最后讨论原编制的不可替代之处。',
         product='一份写明原声部、拟换乐器与音域理由的改编提案',
         assess='是否核对过音域，且承认只是设想'),
    dict(tag='detective', name='时间码侦探',
         q='只给小节号，能不能还原听感',
         chain='先只看谱面证据列表不看曲名，猜一猜这是什么性格的作品并写下理由；再完整聆听，逐条核对哪些猜对了、哪些被推翻，最后讨论「看谱」与「听音」各自能提供什么。',
         product='一份「听前猜测 / 听后核对」双栏记录',
         assess='猜测是否基于列出的真实数据，且诚实标注被推翻的项'),
    dict(tag='contrast', name='两段对照实验',
         q='开头和结尾到底差在哪',
         chain='取开头与结尾各一段等长片段做 A/B 对照，从速度、力度、声部、音区、和弦标注五项里各打一个分，找出差异最大的一项，再回全曲看这个变化是怎样逐步发生的。',
         product='一张五项对照评分表，附起止小节号',
         assess='每一项判断是否有谱面或听辨依据'),
    dict(tag='teach', name='小老师备课',
         q='要把这首曲子教给低一个年级的人，先讲哪一件事',
         chain='各组从本曲里挑一个「非讲不可」的知识点，设计一道只用一次播放就能做的提问，互换作答并互评题目是否清楚，最后票选最容易让初学者听懂的那一个。',
         product='一张含一个知识点、一道播放提问与预期答案的备课卡',
         assess='提问是否能在一次播放内回答，且不超出谱面证据'),
    dict(tag='math', name='节奏算账',
         q='这一小节的音符时值真的加得起来吗',
         chain='挑一处含疑点或节奏密集的小节，按拍号算出应有拍数，再把谱面各声部的时值逐项相加，看看是否吻合，讨论不吻合时可能是记谱、识别还是声部叠加造成，全程不改原谱。',
         product='一张写明拍号、应有拍数与实际相加结果的算账单',
         assess='计算是否对得上具体小节，且没有擅自改动原谱'),
    dict(tag='archive', name='版本比对档案',
         q='曲库里同名或相近的作品该怎样区分',
         chain='先记录本曲标题、小节数、声部数与速度作为身份卡，再说明仅凭标题为什么不足以区分版本，设计一套给档案用的编号规则，最后讨论在没有内容指纹时哪些信息最可靠。',
         product='一张含四项可核对数据的「作品身份卡」',
         assess='身份卡是否全部来自谱面实测，而非标题猜测'),
    dict(tag='sense', name='通感画布',
         q='如果用颜色或线条记下这首曲子，会是什么样',
         chain='每人边听边用颜色与线条做速写，之后把作品贴成一排，找出大家不约而同画在同一小节的地方，回谱面查那里发生了什么，最后讨论通感是共通还是个人经验。',
         product='一张标注了共鸣小节号的集体画布',
         assess='共鸣点是否能对应到具体的谱面变化'),
]


FALLBACK_TAGS = ['debate', 'game', 'radio', 'build', 'workshop', 'detective',
                 'contrast', 'teach', 'archive', 'sense']


def tags_for(p, title):
    """按真实谱面特征给作品打标签，决定哪些教学母题最贴切。"""
    tags = []
    t = str(title or '')
    meters = p.get('timeSignatures') or []
    keys = p.get('keys') or []
    parts = p.get('parts') or []
    issues = p.get('issues') or []
    reps = p.get('repeatedMeasures') or []
    changes = p.get('tempoChanges') or []
    measures = p.get('measures') or []
    n = p.get('measureCount') or 0
    dyn = p.get('writtenDynamics')

    if len(changes) > 1:
        tags += ['tempo', 'tempo']
    elif p.get('tempo'):
        tags.append('tempo')
    if len(meters) > 1:
        tags += ['meter', 'meter']
    if len(keys) > 1 or len({k.get('fifths') for k in keys}) > 1:
        tags += ['key', 'key']
    elif keys:
        tags.append('key')
    if len(parts) >= 4:
        tags += ['parts', 'parts', 'dense']
    elif len(parts) >= 2:
        tags += ['parts', 'parts']
    if any(x.get('percussion') for x in parts):
        tags += ['percussion', 'percussion']
    if len(reps) >= 3:
        tags += ['repeat', 'repeat', 'variation']
    elif reps:
        tags.append('repeat')
    if issues:
        tags += ['issues', 'issues', 'math']
    if isinstance(dyn, list) and dyn or isinstance(dyn, (int, float)) and dyn:
        tags.append('dynamics')
    if n >= 120:
        tags += ['structure', 'structure']
    elif n <= 16:
        tags += ['short', 'short']
    if any(m.get('chords') for m in measures):
        tags.append('chord')
    if any(m.get('words') for m in measures):
        tags += ['words', 'words']
    ranges = [x.get('pitchRange') for x in parts if x.get('pitchRange')]
    if ranges and max(as_int(r[1]) for r in ranges) - min(as_int(r[0]) for r in ranges) > 48:
        tags.append('range')
    if re_any(t, ['练习曲', 'Etude', 'étude', 'Study', '练习']):
        tags += ['etude', 'etude']
    if re_any(t, ['变奏', 'Variation', 'Var.', 'BWV 988']):
        tags += ['variation', 'variation']
    if re_any(t, ['圆舞曲', 'Waltz', '舞曲', 'Dance', 'Polka', 'March', '进行曲', 'Minuet', '小步舞']):
        tags += ['dance', 'dance']
    if re_any(t, ['巴赫', 'Bach', '亨德尔', 'Handel', '莫扎特', 'Mozart', '贝多芬', 'Beethoven',
                  '肖邦', 'Chopin', '李斯特', 'Liszt', '舒伯特', 'Schubert', '斯卡拉蒂', 'Scarlatti']):
        tags.append('composer')
    if re_any(t, ['致爱丽丝', '茉莉花', '民歌', '小星星', '康定', '北京欢迎你', '我和你', '送别']):
        tags += ['culture', 'culture']
    if re_any(t, ['电影', '配乐', '主题曲', 'OST', 'Interstellar', '天空之城']):
        tags.append('narrative')
    tonal = (p.get('tonalEvidence') or {}).get('pitchClassDurations') or []
    if tonal:
        tags.append('key')
    rests = sum(as_int(m.get('rests')) for m in measures)
    if rests > n * 2:
        tags.append('quiet')
    # 通用兜底，保证任何曲子都有候选（只在完全没有强特征时才参与挑选）
    tags += FALLBACK_TAGS
    return tags


def re_any(text, words):
    return any(w.lower() in text.lower() for w in words)


# ---- 课堂情境 / 学段 / 课时 / 活动：由曲谱 id 确定性派生 ----------------------
ROLES = [
    '博物馆策展人', '电台导赏主播', '乐队排练指挥', '唱片企划', '音乐记者',
    '剧场导演', '游戏关卡设计师', '声音建筑师', '田野调查员', '档案管理员',
    '辩论赛主席', '导览志愿者', '配乐剪辑师', '工作坊带领者', '乐评撰稿人',
]
PRODUCTS = [
    '一张可贴在墙上的图示', '一段三十秒的口头导赏', '一份小组合作完成的清单',
    '一次带播放的全班示范', '一张对照表', '一份可传给下一届的档案卡',
    '一条由全班接力完成的作品', '一份带小节号标注的提案',
]
STAGES = [
    ('primary', '小学三年级', '小学'),
    ('primary', '小学五年级', '小学'),
    ('junior', '初中一年级', '初中'),
    ('junior', '初中二年级', '初中'),
    ('senior', '高中一年级', '高中'),
    ('senior', '高中二年级', '高中'),
]
DURATIONS = [20, 35, 40, 45, 90]
FEATURE_SETS = [
    ['slides', 'quiz'], ['slides', 'interactive'], ['slides', 'pbl'],
    ['slides', 'quiz', 'interactive'], ['slides', 'quiz', 'pbl'],
    ['slides', 'interactive', 'pbl'], ['slides', 'quiz', 'interactive', 'pbl'],
]
OPENERS = [
    '这节课不要求先讲故事，只要求先听清楚谱面上真实写着什么。',
    '这节课把判断权交给学生，教师只提供可核对的证据。',
    '这节课刻意不从作曲家生平开始，而从这一份谱面本身开始。',
    '这节课允许得出不同结论，但每个结论都要能指回一个小节号。',
    '这节课把「听感」与「谱面」分开记录，最后再看两者是否吻合。',
    '这节课只做一件事：让学生学会用证据谈音乐，而不是用形容词谈音乐。',
]
GUARD = ('历史背景、作者信息与作品标题之外的史实须核验，查不到就标为未知，不许编造；'
         '谱面未标注的调性、曲式与和声结论只能写成推测；不要把鉴赏课上成单纯的演奏训练。')


def pick(seq, key):
    h = int(hashlib.sha256(key.encode('utf-8')).hexdigest()[:16], 16)
    return seq[h % len(seq)]


def build_goal(score_id, p, fallback_title, salt=0):
    title = title_of(p, fallback_title)
    facts = evidence_lines(p)
    tags = tags_for(p, title)

    # 先用整体 hash 选一个母题，再优先把该曲最突出的标签对应的母题挑出来，
    # 使「针对性」由真实谱面决定，而不是纯随机。
    seed = score_id + '|' + str(salt)
    h = int(hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16], 16)
    strong_tags = [t for t in tags if t not in FALLBACK_TAGS]
    # 优先只从「本曲真实特征」对应的母题里挑；没有任何强特征时才退回通用母题。
    matching = [t for t in THEMES if t['tag'] in strong_tags] if strong_tags else []
    if not matching:
        matching = [t for t in THEMES if t['tag'] in FALLBACK_TAGS]
    # 按该特征在本曲里出现的次数加权：越突出的特征越可能选中。
    weighted = []
    for t in matching:
        weighted += [t] * (1 + min(3, (strong_tags or FALLBACK_TAGS).count(t['tag'])))
    pool = weighted or THEMES
    theme = pool[h % len(pool)]

    role = pick(ROLES, seed + '|role')
    product = pick(PRODUCTS, seed + '|product')
    stage_key, level, stage_word = pick(STAGES, seed + '|stage')
    duration = pick(DURATIONS, seed + '|duration')
    opener = pick(OPENERS, seed + '|opener')

    facts_text = '；'.join(facts)
    goal = (
        '为《%s》设计一节 %d 分钟的%s音乐课，学生是%s，课堂身份是%s。'
        '%s'
        '本课的核心驱动问题是：「%s？」'
        '必须以当前谱面为唯一证据起点：%s。'
        '围绕这个问题按以下路径展开：%s'
        '课堂产出是%s。评价重点：%s。'
        '%s'
        '请据此安排完整聆听、片段对比与讨论，并加入能控制本曲真实播放的互动活动；'
        '凡是引用本曲信息，都要点明具体小节号或数字。'
        % (title, duration, stage_word, level, role,
           opener, theme['q'], facts_text, theme['chain'], product,
           theme['assess'], GUARD)
    )
    return goal[:1500], dict(theme=theme['name'], role=role, product=product,
                             schoolStage=stage_key, level=level,
                             duration=duration,
                             features=pick(FEATURE_SETS, seed + '|features'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--show', type=int, default=0)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    rows = get(BASE + '/api/scores', timeout=60)
    rows = rows if isinstance(rows, list) else rows.get('scores', rows.get('items', []))
    candidates = [r for r in rows if r.get('ready') and re_full_id(r.get('id'))]
    if args.limit:
        candidates = candidates[:args.limit]
    print('待处理曲谱：%d 首' % len(candidates), flush=True)

    def fetch(r):
        last = None
        for attempt in range(3):
            try:
                p = get(BASE + '/api/scores/' + r['id'] + '/profile', timeout=180)
                # 服务端对无法生成档案的作品返回 {'error': ...}，不是 profile
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
        for i, (r, p, err) in enumerate(pool.map(fetch, candidates), 1):
            if p is None:
                failed += 1
                if failed <= 5:
                    print('  跳过 %s：%s' % (r.get('title', '')[:24], err), flush=True)
                continue
            profiles[r['id']] = (r, p)
            if i % 200 == 0:
                print('  已读取 %d / %d' % (i, len(candidates)), flush=True)
    print('可用 profile：%d，失败/跳过：%d' % (len(profiles), failed), flush=True)

    seen = {}
    records = []
    collisions = 0
    for idx, (sid, (r, p)) in enumerate(sorted(profiles.items(), key=lambda kv: kv[0])):
        for salt in range(12):
            goal, meta = build_goal(sid, p, r.get('title'), salt)
            digest = hashlib.sha256(goal.encode('utf-8')).hexdigest()
            if digest not in seen:
                seen[digest] = sid
                break
            collisions += 1
        else:
            print('  警告：%s 多次碰撞' % sid[:12], flush=True)
        records.append(dict(scoreId=sid, title=title_of(p, r.get('title')),
                            goal=goal, goalHash=digest, **meta))

    tmp = GOALS.with_suffix('.jsonl.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    tmp.replace(GOALS)

    unique = len({x['goalHash'] for x in records})
    print('\n生成完成：%d 条，去重后 %d 条，碰撞重试 %d 次' % (len(records), unique, collisions), flush=True)
    print('输出：%s' % GOALS, flush=True)
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


def re_full_id(value):
    import re
    return bool(re.fullmatch(r'[a-f0-9]{64}', str(value or '')))


if __name__ == '__main__':
    sys.exit(main())
