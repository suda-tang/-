"""Whole-request parser for unambiguous controls. Unknown clauses go to the model."""
import re


def direct_controls(text, context):
    named = re.fullmatch(r'(?:请)?(打开|播放)(?:云曲库(?:中|里)的)?《([^》]+)》(?:[，,]\s*(?:先|暂时)?(不要播放|不播放))?[。！!]?\s*', text)
    if named:
        hits=[s for s in context.get('scores',[]) if s.get('title')==named[2]]
        if len(hits)!=1:
            return None
        item=hits[0]
        if item.get('status')=='failed' or not item.get('ready'):
            return {'reply':'这份曲谱尚未就绪，请先查看任务中心的处理结果。','actions':[]}
        actions=[] if item['id']==context.get('currentId') else [{'type':'open','value':item['id']}]
        if named[1]=='播放' and not named[3]:actions.append({'type':'play','value':''})
        return {'reply':('打开' if named[1]=='打开' or named[3] else '打开并播放')+'《'+named[2]+'》。','actions':actions}
    if not context.get('currentId'):
        return None
    clauses = [c.strip() for c in re.split(r'[，,。；;！!\n]+', text) if c.strip()]
    actions, descriptions = [], []
    keep_paused = False
    for clause in clauses:
        c = re.sub(r'^(?:请|帮我|先|然后|再|并且|并)+', '', clause).strip()
        if re.fullmatch(r'(?:暂时|先)?(?:不要|别|不)(?:开始)?播放', c):
            keep_paused = True
            continue
        if c in ('保持当前位置', '保持位置', '不要换曲'):
            continue
        if re.fullmatch(r'我想(?:看看|查看)(?:每个|各个|全部)乐器(?:音轨|声部)?', c) and any(a['type']=='view' for a in actions):
            continue
        if c in ('暂停', '暂停播放', '暂停一下'):
            actions.append({'type': 'pause', 'value': ''})
            descriptions.append('暂停播放，保留当前位置')
        elif c in ('停止', '停止播放', '回到开头', '回到曲首'):
            actions.append({'type': 'stop', 'value': ''})
            descriptions.append('停止并回到开头')
        elif c in ('播放', '开始播放', '继续播放', '恢复播放'):
            actions.append({'type': 'play', 'value': ''})
            descriptions.append('开始播放')
        elif c in ('取消独奏', '恢复所有乐器', '恢复全部乐器', '恢复合奏'):
            actions.extend([{'type': 'solo', 'value': 'all'}, {'type': 'unmute', 'value': 'all'}])
            descriptions.append('恢复所有声部')
        elif m := re.fullmatch(r'(?:把)?(?:播放)?速度(?:调到|调成|设为|设置为|改为)\s*(\d{2,3})(?:\s*BPM)?', c, re.I):
            bpm = int(m[1])
            if not 30 <= bpm <= 240:
                return None
            actions.append({'type': 'set_tempo', 'value': bpm})
            descriptions.append(f'速度设为 {bpm} BPM')
        elif m := re.fullmatch(r'(打开|开启|关闭|关掉)节拍器', c):
            on = m[1] in ('打开', '开启')
            actions.append({'type': 'set_metronome', 'value': 'on' if on else 'off'})
            descriptions.append(('打开' if on else '关闭') + '节拍器')
        elif m := re.fullmatch(r'(?:切换到|切到|切回|换成|显示)(电子谱|五线谱|简谱|音轨视图|音轨|DAW)', c, re.I):
            view = {'电子谱': 'engraved', '五线谱': 'engraved', '简谱': 'simple'}.get(m[1], 'daw')
            actions.append({'type': 'view', 'value': view})
            descriptions.append('切换到' + m[1])
        elif m := re.fullmatch(r'(?:改成)?(?:只听|独奏)(.{1,30})', c):
            target = m[1].removesuffix('声部')
            matches = [p for p in context.get('parts', []) if p.get('value') != 'all'
                       and target == str(p.get('name') or p.get('label') or '').removesuffix('声部').strip()]
            if len(matches) != 1:
                return None
            actions.append({'type': 'solo', 'value': matches[0]['value']})
            descriptions.append('只听' + target)
        else:
            return None
    if not actions:
        return None
    if keep_paused:
        actions = [a for a in actions if a['type'] != 'play']
        if context.get('playing'):
            actions.append({'type': 'pause', 'value': ''})
    unique = []
    for action in actions:
        if action not in unique:
            unique.append(action)
    return {'reply': '、'.join(dict.fromkeys(descriptions)) + '。', 'actions': unique}
