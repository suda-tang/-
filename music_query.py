"""Recognize repertoire constraints without pretending titles prove musical form."""
import re

FACETS = {
 'period': r'后浪漫|晚期浪漫|浪漫主义|古典时期|古典主义|巴洛克|印象主义|二十世纪|20世纪|文艺复兴|现代主义',
 'nationality': r'德国|法国|奥地利|俄罗斯|俄国|波兰|匈牙利|捷克|英国|意大利|国籍',
 'form': r'单三部|复三部|三段体|二部曲式|奏鸣曲式|回旋曲式|变奏曲式|曲式|赋格|对位|复调',
 'instrumentation': r'钢琴独奏|钢琴四手|双钢琴|管风琴|弦乐|小提琴|大提琴|木管|铜管|室内乐|无伴奏',
 'practical': r'分钟|时长|八度|跨度|手小|初学|中级|高级|考级|踏板|难度',
 'style': r'风格|感觉|抒情|爵士|蓝调|布鲁斯|blues|jazz|摇滚|民谣|乡村|舞曲|像巴赫|巴赫.*(?:对位|复调)|印象派',
}


def library_discovery_request(text):
 """Simple repertoire requests must produce a real search, not a promise."""
 text=str(text or '')
 if re.search(r'联网|网上|网络|库外|曲库没有|不要|别找|不用找|不需要|排除|不含|不要播放|只听|静音|独奏|第.{0,5}小节|调速|节拍器|改编|和弦|分析|解释|是什么|什么意思',text,re.I):return False
 return bool(re.search(r'找|搜|推荐|挑|有没有|来一首|来点|来个|find|recommend',text,re.I) and re.search(r'音乐|歌曲|曲子|作品|曲谱|首歌|风格|蓝调|布鲁斯|blues|jazz|爵士|摇滚|民谣|乡村|music|song|piece',text,re.I) and not constrained_query(text))


def query_facets(text):
 return {key: list(dict.fromkeys(re.findall(pattern, text or '', re.I)))
         for key, pattern in FACETS.items() if re.search(pattern, text or '', re.I)}


def required_query_facets(text):
 # A preference does not disqualify a work whose hard conditions are met.
 clauses=re.split(r'[，。；\n]',text or '')
 hard='，'.join(clause for clause in clauses if not re.search('加分项|非必须|不是必须|最好|可有可无',clause))
 return query_facets(hard)


def constrained_query(text):
 facets=query_facets(text)
 return len(facets)>=2 or bool(facets and re.search(r'不要|排除|不含|没有|不能|必须|保留|仍然',text or '')) or 'form' in facets or 'nationality' in facets or 'period' in facets


def repertoire_request(text):
 return bool(re.search(r'找|推荐|挑|筛选|有没有|有哪些|哪[些首个部]|来一首|想听|需要一首',text or '')
             and re.search(r'曲|作品|奏鸣|乐章|音乐|练习',text or '')
             and constrained_query(text))


def repertoire_conversation(history):
 users=[str(m.get('content','')) for m in history if m.get('role')=='user']
 if not users:return False
 if repertoire_request(users[-1]):return True
 return bool(re.search(r'上一条|刚才|仍然|条件|国籍|时期|放宽|排除|保留',users[-1])
             and any(repertoire_request(t) for t in users[:-1]))


def repertoire_query(history):
 users=[str(m.get('content','')) for m in history if m.get('role')=='user']
 start=next((i for i in range(len(users)-1,-1,-1) if repertoire_request(users[i])),len(users)-1)
 return '\n后续要求：'.join(users[start:])


def web_consent(history):
 users=[(i,str(m.get('content',''))) for i,m in enumerate(history) if m.get('role')=='user']
 if not users:return False
 index,text=users[-1]
 if re.search(r'(?:不要|不许|别|不能|不需要|先不|禁止).{0,6}(?:联网|网上|网络)',text):return False
 if re.search(r'(?:联网|网上|网络).{0,6}(?:搜索|查找|搜|查|找)|(?:去|到)(?:网上|网络)',text):return True
 previous=next((str(m.get('content','')) for m in reversed(history[:index]) if m.get('role')=='assistant'),'')
 return bool(re.search('联网|网上|网络',previous) and re.fullmatch(r'\s*(?:好[的吧]?|可以|同意|行|继续|是的|请继续)[。！!\s]*',text))


REPERTOIRE_GUIDANCE = '''
音乐家选曲时，先完整理解作品要求：体裁、具体乐章、曲式、历史时期、作曲家国籍、编制、风格倾向、难度和排除项。不得遗漏后半句话，不得把“不要某作曲家/弦乐”理解成要找该作曲家/弦乐。
用户已明确慢乐章、第二乐章等范围时，不得重复追问整首还是某乐章；只澄清仍然缺失且确实影响筛选的条件。
“找没有弦乐的作品”是选曲要求，不是静音当前作品；“先推荐/先别播放”不得产生打开、播放、切换声部、改编等操作。音乐知识和选曲不使用 skill_search 搜软件插件。
奏鸣曲是作品体裁，奏鸣曲式是曲式；单三部、复三部、奏鸣曲式不同，三个乐章不等于单三部。需要具体到乐章/段落才能判断时，简洁询问这一点，同时说明能先核对哪些条件。不能凭题名或 A-B-A 字母断言单三部。
后浪漫主义、晚期浪漫主义、古典时期、巴洛克等条件必须保留；不要把奥地利/波兰作曲家当德国作曲家，不把巴赫本人写成后浪漫主义作曲家。钢琴的弦不算用户所说的弦乐编制；双钢琴/四手联弹不等于钢琴独奏。
可以运用音乐知识提供少量候选并说明依据，但必须区分已知事实、风格判断和未核实的曲式/时长/跨度。不得把可能符合说成全条件符合；不能擅自以小奏鸣曲代替奏鸣曲，或以其中乐章代替整首。条件矛盾时说明矛盾并提出最少的澄清，不替用户放宽硬条件。
本地 search 可以使用完整音乐描述，value 必须保留所有限制与排除项，不缩成某个作曲家名字；曲库只有标题时不能承诺全库严格筛选、也不能说连候选检索都做不了。不要声称已经找到尚未执行的搜索结果。库外候选不能编造库内 id；联网前沿用用户同意规则。
context.musicReferences 提供已核对的参考摘要和原始链接，引用时使用真实链接，优先据此检查结论。资料没确认的曲式不得称“完全符合”；不能以知识常识补齐未经核对的每个乐章结构。说明事实与尚待核实的要求即可，不铺陈不符合条件的作曲家清单。音乐概念解释也先处理用户的具体问题，不得只回“没找到，要联网吗”。
“尚未核实符合”与“确认不存在”不同。没有执行搜索不能说“我检索了”，没有遍查证据不能宣称没有这样的作品。不要把单三部直接定义为固定8/16小节；不要把复三部定义成每一部分都一定是单三部。后浪漫主义的边界需结合史学分类，不能自动把整个19世纪浪漫主义都叫后浪漫主义。
涉及“不是必须/加分项/最好”的条件是软偏好，其余“必须/不要/不能放宽”是硬约束。追问时继承前面的条件，只替换用户明确改变的那一项。不要用当前曲子的和弦分析代替全库选曲。
'''
