"""Small, sourced reference notes used to check musical claims, not search results.

Paraphrases only. These notes do not establish that a work exists in the local
library or that a particular edition/arrangement has the original instrumentation.
"""
import re

REFERENCES = [
 {'pattern':r'单三部|复三部|三段体|曲式|ternary',
  'title':'Open Music Theory: Ternary and Rondo Forms',
  'url':'https://milnepublishing.geneseo.edu/fundamentals-function-form/chapter/37-ternary-and-rondo-forms/',
  'facts':'A–B–A 外形不能独自决定单三部或复三部，需看各部分的内部组织、终止、调性与主题功能；复三部中的主要部分本身可有二部结构。各部分不必全部是单三部；8/16 小节不是定义性硬门槛。'},
 {'pattern':r'K\.?\s*545|KV\.?\s*545|莫扎特.*慢乐章',
  'title':'PTNA Piano Encyclopedia: Mozart K.545, commentary by Akihiro Okada',
  'url':'https://enc.piano.or.jp/en/musics/300',
  'facts':'K.545 原作为钢琴独奏。第二乐章为 G 大调、3/4、Andante。该评论分析其前两个反复段及第 33 小节后的扩展部分，指出前两段形成简洁二部结构；不能把它未经说明地作为“单三部、完全符合”的确定范例。不同分析框架需注明，不能将另一乐章的回旋曲式套过来。'},
 {'pattern':r'Op\.?\s*89|雷格|Reger',
  'title':'Henle: Reger, Sonatinas op.89',
  'url':'https://www.henle.de/Sonatinas-op.-89/HN-469',
  'facts':'Op.89 的作品标题是四首钢琴小奏鸣曲（Sonatinas），不是可不加说明替代奏鸣曲的同一体裁。出版资料确认钢琴作品与小奏鸣曲体裁，但不足以确认某具体乐章为单三部。'},
 {'pattern':r'D\.?\s*959|舒伯特.*第二乐章',
  'title':'LA Phil: Schubert, Sonata in A, D.959',
  'url':'https://www.laphil.com/works/sonata-in-a-d-959',
  'facts':'D.959 是舒伯特晚期的 A 大调钢琴奏鸣曲；第二乐章是 Andantino，不能把 Andantino 偷换成 Andante。“晚期舒伯特”不等于“后浪漫主义时期”。详细调性与单/复三部分类仍需按具体谱面和分析来源核对，不能凭作品题名编造 A/B 部均为单三部。'},
]


def references_for(text, titles=()):
 scope=str(text)+'\n'+'\n'.join(str(t) for t in titles)
 return [{k:v for k,v in ref.items() if k!='pattern'} for ref in REFERENCES if re.search(ref['pattern'],scope,re.I)]
