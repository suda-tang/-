import json, urllib.request, importlib.util, sys
spec=importlib.util.spec_from_file_location('aw','ai_workspace.py')
aw=importlib.util.module_from_spec(spec); sys.modules['aw']=aw; spec.loader.exec_module(aw)
scores=json.loads(urllib.request.urlopen('http://127.0.0.1:5173/api/scores',timeout=30).read())['scores']
ctx={'scores':[{'id':s['id'],'title':s['title'],'ready':s['ready'],'status':s.get('status','')} for s in scores],
     'currentId':scores[0]['id'],'parts':[],'settings':{'tempo':80,'metronome':False,'instrument':'三角钢琴','arrangement':'original'},
     'current':scores[0]['title'],'playing':True,'measure':1,'measureCount':86}
_scores_full=ctx.get('scores',[])
_ctx_full={k:v for k,v in ctx.items() if k!='scores'}
compact_scores=[]; _used=0
for _s in _scores_full:
    _ok=bool(_s.get('ready',False)) and str(_s.get('status') or '')!='failed'
    _item=[str(_s.get('id',''))[:12],_s.get('title',''),1 if _ok else 0]
    _j=json.dumps(_item,ensure_ascii=False)
    if _used+len(_j)>46000 and compact_scores: break
    compact_scores.append(_item); _used+=len(_j)
cc={**_ctx_full,'scores':compact_scores,'_scoresNote':'x'}
prompt=json.dumps(cc,ensure_ascii=False)
print('发送模型的 compact_context 字符数:', len(prompt))
print('  曲库项:', len(compact_scores), ' 上限46000 字符 第3位=可播放标记')
print('  < 50K system 上限?', len(prompt)<50000, ' -> 不会触发 suda 已省略裁剪')
