"""Keep repertoire selection and subsequent score analysis in the same conversation."""
import json
import re

# Only positively identified composers qualify; an unknown nationality is not a match.
# Biographical sources: bach.de/leben/index.html; telemann.org; pachelbel.org.
GERMAN_COMPOSERS = ('巴赫', '泰勒曼', '帕赫贝尔', 'bach', 'telemann', 'pachelbel')


def repertoire_controls(data):
    history = data.get('messages') or []
    users = [str(m.get('content', '')) for m in history if m.get('role') == 'user']
    if not users:
        return None
    text = users[-1]
    context = data.get('context') or {}
    from music_query import repertoire_request
    from music_index import title_in_period, composer_of
    current_request = repertoire_request(text)
    previous = next((t for t in reversed(users[:-1]) if repertoire_request(t)), '')
    inherited = bool(previous and re.search('符合条件|本地作品|刚才的条件|继续筛选', text))
    request = text if current_request else previous if inherited else ''
    # Compound requests choose a work first. Chord analysis is run after a real choice.
    if request and '巴洛克' in request and '德国' in request:
        candidates = [s for s in context.get('scores', [])
                      if s.get('ready') is not False and s.get('status') != 'failed'
                      and not re.search(r'remix|改编|混音',s.get('title',''),re.I)
                      and title_in_period(s.get('title', ''), '巴洛克')
                      and (composer_of(re.sub(r'\.(?:mid|midi|pdf|mp3|musicxml|mxl)$','',s.get('title',''),flags=re.I)) or '').lower() in GERMAN_COMPOSERS]
        if candidates:
            from music_index import load_index
            facts=load_index().get('songs') or {}
            # Prefer a score whose actual note index contains the requested quality.
            # This is a ranking preference, never evidence of harmonic function.
            candidates = sorted(candidates, key=lambda s: (not bool((facts.get(s['id'],{}).get('chordCounts') or {}).get('dim7')) if '减七' in request else False,s.get('title', '')))
            selected = next((s for s in candidates if s.get('id') == context.get('selectionId')), None)
            if selected:
                actions = [{'type': 'open', 'value': selected['id']}]
                if '和弦' in request:
                    actions.append({'type': 'chords', 'value': json.dumps({'part': 'all', 'quality': 'dim7'})})
                return {'reply': '打开《'+selected['title']+'》，随后按谱面核对减七和弦。', 'actions': actions}
            return {'reply': '本地有这些德国巴洛克作曲家的作品，请选一首。选定后再逐处核对减七和弦，不把半减七算进去。',
                    'actions': [{'type': 'choose_scores', 'value': candidates}]}
        return {'reply': '本地暂未核实到德国巴洛克作曲家的可用曲谱。可以联网找巴赫、泰勒曼或帕赫贝尔的作品；取得谱面后才能逐处提取和弦。要联网查找吗？', 'actions': []}
    # Resolve ordinals from the actual candidate list sent to this conversation.
    ordinal = re.search(r'(?:打开|选|就|听)(?:第)?([一二三四五六七八九十\d]+)(?:首|个)', text)
    if ordinal:
        from ai_workspace import cn_number
        index = cn_number(ordinal[1])
        for message in reversed(history):
            content = str(message.get('content', ''))
            if message.get('role') != 'assistant' or not content.startswith('曲谱候选：'):
                continue
            try:
                candidates = json.loads(content.split('：', 1)[1])
            except (ValueError, TypeError):
                return None
            if not index or index > len(candidates):
                return {'reply': '上一份清单只有 '+str(len(candidates))+' 首，请从清单中选择。', 'actions': []}
            chosen = candidates[index-1]
            actions = [{'type': 'open', 'value': chosen['id']}]
            if previous and '减七' in previous:
                actions.append({'type': 'chords', 'value': json.dumps({'part': 'all', 'quality': 'dim7'})})
            return {'reply': '打开《'+chosen['title']+'》。', 'actions': actions}
    return None
