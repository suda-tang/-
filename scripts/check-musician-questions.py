"""Read-only live-model checks: plan responses; never execute returned actions."""
import argparse
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import ai_workspace
from library_classification import search_scores

CASES = [
 ('late-romantic-sonata', '你帮我找一个单三部曲式的奏鸣曲，要后浪漫主义时期的，这个曲子不要有弦乐，又有一点巴赫的对位的感觉，哦，对了，这个作曲家是德国人。'),
 ('classical-exclusions', '找一首古典时期的钢琴独奏奏鸣曲慢乐章，要单三部曲式，不要贝多芬，也不要弦乐。只推荐，先别播放。'),
 ('organ-not-piano', '找德国后浪漫主义作曲家的管风琴奏鸣曲，要明显的巴赫式对位，不要把钢琴曲换成管风琴音色来凑。'),
 ('compound-not-simple', '舒伯特 D959 第二乐章可以当成单三部曲式教吗？请区分单三部和复三部，不要直接替我打开。'),
 ('soft-vs-hard', '想找法国印象主义的钢琴独奏作品，三分钟左右，双手跨度别太大，复调味道是加分项，不是必须。不要把时长和跨度猜成确定的。'),
 ('composite-form', '找一首有再现的三段体钢琴作品，但不要因为有 A-B-A 就直接说单三部。请说明还需要看什么。'),
 ('conflicting-history', '找一首巴赫本人写的后浪漫主义钢琴奏鸣曲，所有条件都不能放宽。'),
 ('scope-vs-control', '帮我找没有弦乐、只有钢琴的室内乐作品，先解释钢琴独奏和室内乐的区别，别把当前曲子的弦乐静音当成找到作品。'),
 ('negated-composer', '找一首德国作曲家的浪漫主义钢琴独奏作品，排除勃拉姆斯、舒曼和门德尔松，不要把这三个名字当推荐对象。'),
 ('followup', '上一条的国籍条件改成法国，时期仍然保留，单三部曲式也保留，不要偷偷改成奏鸣曲式。'),
]
TITLES = ['莫扎特 C大调钢琴奏鸣曲 K545', '贝多芬 升c小调钢琴奏鸣曲 Op.27 No.2', '巴赫 二部创意曲 BWV772', '雷格 钢琴小奏鸣曲 Op.89 No.2', '勃拉姆斯 第三钢琴奏鸣曲 Op.5', '舒伯特 A大调钢琴奏鸣曲 D959', '雷格 第一管风琴奏鸣曲 Op.33', '知足']
CONTEXT = {'scores':[{'id':format(i+1,'064x'),'title':t,'ready':True} for i,t in enumerate(TITLES)],'currentId':format(8,'064x'),'current':'知足','measureCount':86,'measure':1,'parts':[{'value':'all','name':'全部声部'},{'value':'piano','name':'钢琴'},{'value':'strings','name':'弦乐'}],'settings':{'tempo':90,'drums':False},'controls':['search 按完整音乐条件搜索曲库','chords 分析当前曲谱','solo/mute 播放声部控制']}

class Capture:
 def json_response(self,result,status=200):self.result=result;self.status=status

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--phase',default='after');parser.add_argument('--limit',type=int,default=len(CASES));parser.add_argument('--search',action='store_true');args=parser.parse_args()
 rows=[]
 for ident,question in CASES[:args.limit]:
  history=[{'role':'user','content':question}]
  if ident=='followup':history=[{'role':'user','content':CASES[0][1]},{'role':'assistant','content':'需要区分整首奏鸣曲与其中一个乐章；暂未核实全部条件。'},*history]
  target=Capture();started=time.monotonic()
  if args.search:
   result=search_scores(question,CONTEXT['scores']);status=200
  else:
   ai_workspace.plan_data({'messages':history,'context':CONTEXT},target);result=target.result;status=target.status
  row={'id':ident,'question':question,'seconds':round(time.monotonic()-started,2),'status':status,**result}
  rows.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
 directory=ROOT/'.sites-runtime';directory.mkdir(exist_ok=True)
 (directory/('musician-questions-'+args.phase+'.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
