"""Local application dossier. Never sends mail or promotes unverified leads to supervisors."""
import json,html,re,zipfile
from pathlib import Path
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'application'/'2027申请材料'
OUT.mkdir(exist_ok=True)
DATE='2026-09-29'
def write(name,text):
 p=OUT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')
def demo(name,direction):return 'https://suzhou.super-tang.com/?'+urlencode({'tour':1,'auto':1,'mentor':name,'direction':direction})
mentors=[
 dict(name='李小兵',school='中央音乐学院',direction='ensemble',status='官方主页确认博导；2027名额待核',source='https://www.ccom.edu.cn/info/15131/214351.htm',paper='https://www.ccom.edu.cn/info/17551/256121.htm',basis='2025年ICMC会议报道；不是论文全文',title='时间补偿与网络合奏中的相互带动',
 opening='我平时弹钢琴，也做伴奏。这两年做异地 MIDI 合奏，原本只是想让不在同一间琴房的人也能一起排练，后来却卡在一个比延迟数值更难判断的问题上：程序把音对齐以后，演奏者是不是还觉得自己在和另一个人合奏。',
 connection='在学院关于2025年ICMC的报道中，我看到《虚拟合奏：通过网络化数字乐谱探索音乐活动的参与》，您是通讯作者之一。我目前读到的是这篇报道，还没读到论文全文。它把“参与”放进题目，让我想到，我一直在记录消息何时到达，却还没有同样认真地记录一位演奏者怎样带动另一位。想请教您，这两种层面的证据应怎样放在同一项研究里？',
 question='在相同网络扰动下，补偿策略能否减少技术误差，又不削弱演奏者对相互带动的感受？',
 design='先固定双人钢琴编制，校准输入到实际发声的链路；比较固定与自适应补偿，并设置匹配总延迟的条件。让演奏者交换主伴角色，以具体乐句回看解释等待与追赶。',
 outcome='以演奏者对为聚类单位报告时序误差、速度漂移和协调体验，不把更齐直接解释成更好的合奏。',
 reading='会议报道只证明该项工作与作者关系，尚不足以评价论文的方法或不足。会前优先取得论文全文，确认其“参与”的定义和研究方式。'),
 dict(name='肯尼斯·费尔兹',school='中央音乐学院',direction='ensemble',status='官方报道确认教授及网络音乐工作；现行博士招生资格、2027名额待核',source='https://www.ccom.edu.cn/info/17551/256121.htm',paper='https://www.ccom.edu.cn/info/17551/256121.htm',basis='官方会议与Netronome工作坊报道',title='共同时间参照下的合奏角色与时间自由',
 opening='我在做一个以时间码为参照的异地 MIDI 合奏系统。实际调试让我有些犹豫：共同时间参照能减少混乱，但如果所有人只能追着同一个格子走，伴奏中那些主动等待和带动又放在哪里？',
 connection='学院对2025年ICMC的报道介绍了您主持的Netronome工作坊，也提到您参与的网络化数字乐谱与虚拟合奏论文。我感兴趣的是，这种网络音乐实践是否允许演奏者把延迟纳入创作，而不只是消除延迟。我还没有读到论文全文，因此不敢替您概括结论；更想从我自己的系统出发，向您请教哪些比较是有意义的。',
 question='共同节拍参照和相互倾听参照，是否会改变领奏/伴奏之间的调整方式？',
 design='将共同节拍器作为独立实验因素，在相同网络条件下比较有无共同参照的合奏；固定补偿与自适应补偿分阶段研究，避免条件数过大。采用稳定节拍和可伸缩句尾两类短片段。',
 outcome='分别记录全局速度稳定、两人之间的相对时间变化及演奏者选择权；不预设自由度越大或越小越好。',
 reading='先区分Netronome实践、网络化数字乐谱和本项目的MIDI事件调度；三者不能因为都有时钟就写成同一技术。'),
 dict(name='雪巍',school='香港科技大学',direction='generation',status='官方主页确认助理教授；2027博士接收与申请条件待核',source='https://researchportal.hkust.edu.hk/en/persons/wei-xue/',paper='https://arxiv.org/html/2404.18081v2',basis='ComposerX正文的方法、评价和讨论部分已核对',title='从可播放到可练习：生成声部的教学约束',
 opening='我在苏州大学读音乐教育，主项是钢琴。除了异地 MIDI 合奏，我还做了一个能导入谱子、播放和生成编配的网页原型。编配部分有一类结果让我一直不满意：每条声部都在，听起来却谁也不让谁；把它拿给学生练，更不知道难度该怎么算。',
 connection='我准备向您请教ComposerX中的评价问题。论文把旋律、和声、配器与评审分工，并做了听感比较；我想接着问，如果目标变成学生的练习材料，听众喜欢和学生能学会之间会不会还有距离？这不是说论文应该承担一个它没有设定的教学任务，而是我想在自己的应用里把这一层单独检验。',
 question='对同一段旋律加入声部、音域和演奏难度约束，能否改善学生的试奏与练习，而不损失必要的音乐结构？',
 design='固定旋律、调性、长度和音源，比较基础生成、加入音乐约束、加入难度约束三组；记录模型、提示与随机种子。先由教师盲评筛除不可演奏材料，再开展成年学习者交叉试奏，并进行逐项消融。',
 outcome='分别报告生成失败率、声部问题、教师评价和学生停顿/重练位置；不把模型自评或偏好分数当成学习效果。',
 reading='套磁段是供申请人阅读后确认的讨论草稿。正式发送前需本人核对论文2.3、3.2、4节，避免把辅助整理的阅读写成个人已完成的精读。'),
 dict(name='郭毅可',school='香港科技大学',direction='generation',status='官方主页确认讲座教授与首席副校长；个人招生意向待核',source='https://hkust.edu.hk/zh-hant/about/leadership/guoyikejiaoshou-bsc-phd',paper='https://arxiv.org/html/2404.18081v2',basis='ComposerX正文与学校官方任职信息',title='教师如何介入音乐生成：修改位置与教学判断',
 opening='我是唐秋鸣，苏州大学音乐教育专业钢琴方向硕士研究生。我想咨询2027年的博士申请。我做过异地 MIDI 合奏，目前也在继续打磨一个钢琴网页原型，其中最想研究的不是一次生成多少种编制，而是老师在什么时候介入，才真正改变了生成材料的教学用途。',
 connection='ComposerX里的分工和评审过程给了我一个可以继续追问的入口：教师的判断能不能不只放在结果打分时，而是在生成过程中留下清楚的修改依据？比如老师说“伴奏太密”，系统究竟改了哪些声部，学生试奏以后是否真的更顺，这些过程我希望能一一对应起来。',
 question='在生成前设定约束与生成后由教师修改，哪一种介入更有助于产生可解释、可用于分层练习的材料？',
 design='同一教师在平衡次序下使用预设约束和事后修改两种工作流；材料固定，记录编辑时间、修改轨迹和判断理由。生成模型与预算保持一致，随后对材料进行独立盲评和小规模试奏。',
 outcome='检验教师决策怎样改变具体声部与试奏表现，同时报告工作负担；不把系统代替教师设定为目标。',
 reading='联系前核实具体接收单位、导师时间与合作导师安排。大型团队相关性不等于个人有招生名额。'),
 dict(name='李伟',school='复旦大学',direction='education',status='官方主页确认教授、博导；2027名额与跨专业条件待核',source='https://faculty.fudan.edu.cn/weilics/zh_CN/zdylm/644067/list/index.htm',paper='',basis='官方研究方向；尚未核对一篇具体近作',title='识别不确定性怎样进入钢琴练习反馈',
 opening='我从音乐教育和钢琴这边做程序，遇到过一个很具体的麻烦：谱子的拍号读错，播放就在每小节末尾多出空拍。如果继续拿这样的谱去判断学生，系统越认真评分，反馈可能越不可信。这个问题让我想把识别的不确定性本身放进研究。',
 connection='您的官方主页列出了音乐旋律、节奏分析及和弦检测等研究。我目前还没有选定并读完一篇足够贴近这个问题的近作，因此这封信先不冒充对某篇论文作评价。我想请教的是，面向练习反馈时，识别系统什么时候应该直接提示，什么时候应该先保留判断、让人核对原稿？',
 question='在错误代价不对称的练习场景中，保留不确定判断能否减少误导，而不使反馈失去可用性？',
 design='先建立人工复核的谱面与音频小型测试集，将解析错误、转录错误和学生错误分别标记。比较直接反馈、置信阈值反馈及请求核对三种策略；先验证校准与覆盖率，再做用户研究。',
 outcome='报告误报、漏报、覆盖率与复核负担；学生层面的效果另用练习后无提示表现检验。',
 reading='此版本只能称为方向咨询信。下一步必须补本人近作，不能把领域相关论文署到李伟名下。'),
 dict(name='王小雨',school='东北大学',direction='education',status='官方主页确认硕博导师；“欢迎27保研”不是2027博士名额证据',source='https://faculty.neu.edu.cn/wangxy/zh_CN/index.htm',paper='',basis='官方研究方向与导师身份；具体近作待核',title='看见错误以后：钢琴反馈时机与无提示保持',
 opening='我想向您咨询2027年博士申请。我在苏州大学读音乐教育，主项是钢琴，做过异地 MIDI 合奏，也在做钢琴练习网页。越做反馈界面，我越觉得一个问题还没有说清：学生跟着提示弹对了，和他离开提示后真的会了，可能不是同一件事。',
 connection='您的官方主页提到音乐能力测量、艺术感知和行为效果评估，我觉得这能帮助我把工程上的“能显示反馈”推进到一个可以检验的问题。我还没有核对到一篇与这个设计直接对应的论文，所以先把自己的疑问说清楚，也希望请您指点应该从哪类研究读起。',
 question='相同内容的逐音即时反馈与乐句后反馈，对撤掉提示后的纠错保持和练习策略有何不同影响？',
 design='固定练习材料、时长和反馈内容，平衡两类呈现时机；设置无提示后测、延迟保持和新片段迁移。先在成年学习者中预实验，再依效应与可行性决定主研究样本；不直接把未成年课堂作为初始试验场。',
 outcome='主要结果是无提示表现，辅以重练起点、停顿位置和主观负担；不把点击次数等同于注意或动机。',
 reading='当前材料基于官网方向，不能写成已读过该导师关于反馈时机的论文。还需核实招生专业与艺术学研究训练要求。')
]

mentors.extend(json.loads((ROOT/'application/research/定制补充候选.json').read_text(encoding='utf-8')))
mentors.extend(json.loads((ROOT/'application/research/定制新增候选-第二批.json').read_text(encoding='utf-8')))
assert len({(m['school'],m['name']) for m in mentors})==len(mentors)

signature='唐秋鸣\n苏州大学音乐学院\n音乐教育专业钢琴方向2024级硕士研究生\n20245248013@stu.suda.edu.cn'
for m in mentors:
 m['demo']=demo(m['name'],m['direction']);m['admission_2027']='未确认';m['sent']=False
 salutation=m['name']+'老师您好：'
 intro=m['opening']
 if m['name'] in ['李小兵','肯尼斯·费尔兹','雪巍','李伟']:intro='我是唐秋鸣，苏州大学音乐学院音乐教育专业钢琴方向2024级硕士研究生，想咨询2027年的博士申请。'+intro
 personal='我现在的基础主要是项目实践。异地合奏这边，我用时间码作为参照处理同步、延迟补偿和本地音源渲染；但目前还没有一组严格的对照数据，不能说已经证明哪种方法更好。我希望博士阶段能把这个“能运行”的东西，往“能够解释为什么有效、什么时候失效”推进一步。'
 personal=m.get('personal',personal)
 letter=f"主题：2027年博士申请咨询｜唐秋鸣，{m['title']}\n\n{salutation}\n\n{intro}\n\n{m['connection']}\n\n{personal}\n\n如果有机会进一步研究，我想先做这样一个小问题：{m['question']}{m['design']}我知道这还需要把测量和实验设计补扎实，尤其希望得到这方面的训练。\n\n我把网页原型整理成了[为您准备的项目演示]({m['demo']})，打开后可以看谱、选曲和了解我遇到的问题；它与异地 MIDI 合奏是两个项目。若这个问题与您团队的计划有交集，希望有机会作一次简短汇报，也想请教我的音乐教育背景是否适合申请。感谢您读完这封信。\n\n祝好！\n{signature}\n"
 folder=Path('优先联系')/(m['school']+'-'+m['name'])
 write(folder/'套磁信.md',letter)
 plan=f"# {m['title']}\n\n拟咨询导师：{m['name']}｜{m['school']}\n\n## 为什么向您请教\n\n{m['connection']}\n\n## 核心问题\n\n{m['question']}\n\n## 研究设计\n\n{m['design']}\n\n先完成仪器与记录可靠性检查，再做可行性预实验。主实验样本量依据预实验方差和最小有意义差异计算；拟采用平衡顺序并记录不完整试次的原因。所有条件保持材料、音源或模型预算的一致，研究中途的版本变更另行记录。\n\n## 评价与反例\n\n{m['outcome']}\n\n若预期改善没有出现，不以更换指标追求显著性；应报告失败条件，检查测量误差、熟悉效应与条件混杂。实验前确定主要指标、排除规则与分析方法。效果的置信区间和实际代价比单个显著性结论更重要。\n\n## 我能带来的基础与需要补的训练\n\n已有音乐教育、钢琴伴奏及异地 MIDI 合奏项目经历；网页工作区提供谱面、播放及反馈原型。尚缺标准化数据、完整实验记录和已核实的论文成果清单。博士训练重点是将具体音乐经验转换成可靠测量，形成可复现的比较。\n\n## 工作安排\n\n第1年完成文献、测量和预实验；第2年完成主要研究；第3年检验新材料或新条件并修订系统；第4年整合。对于生成方向，优先做教师评审与试奏，不同时铺开远程合奏全部实验。对于教育方向，优先做保持与迁移，不将技术识别率当作学习效果。\n\n## 本稿的证据边界\n\n{m['status']}。2027名额均未确认。{m['reading']}\n\n官方资料：{m['source']}\n\n研究资料：{m['paper'] or '本次未取得可作逐篇讨论依据的论文'}\n\n演示：{m['demo']}\n\n通用测量、伦理与数据管理细节见材料包内《研究计划-异地MIDI合奏》；若采用本定制题目，应以本稿的实验对象和评价方式替换通用方案，不能把两个完整课题累加承诺。\n"
 write(folder/'定制研究计划.md',plan)
 write(folder/'发送前核查.md',f"# {m['name']}材料核查\n\n- 核查日期：{DATE}\n- 身份依据：{m['status']}\n- 阅读层级：{m['basis']}\n- 官方来源：{m['source']}\n- 论文/研究来源：{m['paper'] or '待补'}\n- {m['reading']}\n- 需申请人确认所有第一人称经历与阅读表述。\n- 2027招生专业、名额、语言与跨专业条件尚未核实。\n- 未发送邮件。\n")

papers=[
 ('P01','The Global Metronome: Absolute Tempo Sync For Networked Musical Performance','2016','https://www.nime.org/proceedings/2016/nime2016_paper0006.pdf','会议原文片段','共同时间参照与节拍同步，可作为时间码方案的对照背景。','同步节拍不等于保留自由速度；先明确实验是否允许共同节拍器。'),
 ('P02','Temporal Coordination in Piano Duet Networked Music Performance (NMP): Interactions Between Acoustic Transmission Latency and Musical Role Asymmetries','2021','https://doi.org/10.3389/fpsyg.2021.707090','出版页及检索片段；全文读取不稳定','将延迟与钢琴合奏角色共同纳入研究。','复核原文的参与者、延迟设定和角色任务，不能只凭题名复制参数。'),
 ('P03','Impact of Audio Delay and Quality in Network Music Performance','2025','https://doi.org/10.3390/fi17080337','出版方摘要','网络演奏的延迟、音质与体验评价。','音频流研究不能直接替代MIDI调度的端到端测量。'),
 ('P04','“Real time in different spacetime”: a phenomenology of networked music performance','2026','https://doi.org/10.3389/fpsyg.2026.1855693','出版方摘要及正文入口','以演奏者访谈理解网络音乐经验。','适合设计回看访谈，但质性主题不能拿来证明补偿算法的因果效果。'),
 ('P05','Long distance musical relationships: experiences of networked music performance','2015','https://researchonline.gcu.ac.uk/en/publications/long-distance-musical-relationships-experiences-of-networked-musi/','作者机构库摘要','远程条件下的音乐交流及适应策略。','借鉴问题维度，不把主观沟通体验压缩成一项同步误差。'),
 ('P06','Effects of Dynamic Local Lag Control on Sound Synchronization and Interactivity in Joint Musical Performance','2014','https://www.jstage.jst.go.jp/article/mta/2/4/2_299/_article','出版方摘要','动态本地滞后控制的同步与交互取舍。','已有动态控制研究，不能宣称自适应补偿思想由本项目首次提出。'),
 ('P07','Effect of a Global Metronome on Ensemble Accuracy in Networked Music Performance','2019','https://aes.org/publications/elibrary-page/?id=20591','学会摘要','共同节拍器、演奏准确性与主观评价。','将有无共同参照单列，不与算法条件混在一起。'),
 ('P08','ComposerX: Multi-Agent Symbolic Music Composition with LLMs','2024','https://arxiv.org/html/2404.18081v2','正文方法、评价及讨论','多代理分工生成符号音乐，并使用听感比较。','可播放率与听感偏好不能直接证明学生学习效果；生成约束需另做试奏评价。'),
 ('P09','Understanding Optical Music Recognition','2020（预印本2019）','https://arxiv.org/abs/1908.03608','作者预印本摘要；出版书目另核','识谱需要恢复记谱结构与音乐语义。','把拍号、时值、声部与版面错误分开，不以OCR标题准确率代替识谱质量。'),
 ('P10','High-resolution Piano Transcription with Pedals by Regressing Onset and Offset Times','2020预印本','https://arxiv.org/abs/2010.01815','作者摘要','钢琴起止时刻和踏板转录。','音符转录不等于拍号、声部和正式乐谱恢复；混合音色场景需另测。'),
 ('P11','VirtuosoNet: A Hierarchical RNN-based System for Modeling Expressive Piano Performance','2019','https://mac.kaist.ac.kr/expressive_piano_performance_rendering.html','作者实验室介绍与出版清单','从乐谱预测演奏特征。','模型输出不是人的意图真值；应用版本与训练分布需要单独核对。'),
 ('P12','Towards An Integrated Approach for Expressive Piano Performance Synthesis from Music Scores','2025','https://arxiv.org/abs/2501.10222','作者摘要','连接演奏表情与神经音频合成。','分开评估时序表情与音色，避免更好音色掩盖节奏问题。'),
 ('P13','Disentangling Score Content and Performance Style for Joint Piano Rendering and Transcription','2025','https://arxiv.org/abs/2509.23878','作者摘要','联合建模乐谱内容、演奏风格和转录。','值得检查内容与风格解耦，但摘要不足以证明适用于当前曲库。'),
 ('P14','Pianist Transformer: Towards Expressive Piano Performance Rendering via Scalable Self-Supervised Pre-Training','2025','https://arxiv.org/abs/2512.02652','题录与摘要入口已核','新近演奏表情研究线索。','尚未逐节核对，不据此承诺部署收益或把它称为最优方案。'),
 ('P15','虚拟合奏：通过网络化数字乐谱探索音乐活动的参与','2025','https://www.ccom.edu.cn/info/17551/256121.htm','官方会议报道，非论文正文','李小兵与肯尼斯·费尔兹的相关论文线索。','正文与完整会议书目待取得；不能编造样本、方法或结论。')
]
papers.extend([('P16','Explicit processing of melodic structure in congenital amusia can be improved by redescription-associate learning','2023','https://centaur.reading.ac.uk/110788/','作者机构库摘要；PDF被拒绝','反馈与显性旋律加工的学习问题。','原样本与普通钢琴学习者不同，须重新设计验证。'),('P17','Transduction in Action: Live Coding through a Simondonian Perspective','2025','https://www.kosmasgiannoutakis.art/publications/','作者出版清单','协作音乐实践的进一步阅读入口。','只有题录核对，不能声称已掌握其论证。'),('P18','音乐分析的学科拓展与当代问题','2021','https://faculty.ecnu.edu.cn/_s12/jl2/main.psp','官方个人成果表','音乐分析与生成材料评价的进一步阅读入口。','正文未读，不根据题目推断作者观点。')])
papers.extend([
 ('P19','Viennese Style in Viennese Waltzes: An Empirical Study of Timing in the Recordings of The Blue Danube','2022/2023修订','https://www.musau.org/parts/neue-article-page/view/135','出版方正文导论，方法待续读','杨健的风格与时间处理研究，可用于追问均匀节拍参照的边界。','期刊版本仅署Jian Yang；不要按获奖报道补写共同作者。圆舞曲现象不能直接移植到全部钢琴曲。'),
 ('P20','A Three-Dimensional Model for Evaluating Individual Differences in Tempo and Tempo Variation in Musical Performance','2021','https://doi.org/10.1177/1029864919873124','周全官方成果表题录；正文待取得','钢琴速度变化的评价框架线索。','尚未核实模型维度，不根据标题构造理论内容。'),
 ('P21','Audio Matters Too! Enhancing Markerless Motion Capture with Audio Signals for String Performance Capture','2024','https://arxiv.org/html/2405.04963v1','作者表、方法3.3、评价4及讨论5已核','声音可参与演奏动作判断；启发多模态证据与失效边界研究。','原文针对弦乐，明确复音与采集限制；不等于钢琴识别或教学效果已解决。'),
 ('P22','短视频催生音乐新业态','2020','https://xuanchuanbu.cuc.edu.cn/2020/0826/c771a172512/page.htm','作者评论正文；不是实验论文','李小莹讨论音乐入口、使用和内容生产，启发传播到练习的转变问题。','历史平台信息不能当作现行规则，不把点击或停留解释成学习。'),
 ('P23','国风音乐——探传统宝库 创时代新声','2022','https://www.cuc.edu.cn/cucnews/2022/0419/c10128a192623/page.htm','作者评论正文；不是算法论文','赵志安讨论传统元素与现代创作融合，可用于提出生成风格评价的问题。','不把国风当作单一传统，不把文章写成已验证的生成方法。')])
write('相关论文导读.md','# 与项目相关的论文与阅读任务\n\n核查日期：'+DATE+'。这是有阅读层级的导读，不是全部精读完成的文献综述。包含论文、作者评论及会议线索，类型分别标注。英文题名沿用原文。\n\n'+'\n\n'.join(f'## {i}｜{title}\n\n年份：{year}。阅读层级：{level}。\n\n与项目关系：{use}\n\n需要追问：{limit}\n\n原始来源：{url}' for i,title,year,url,level,use,limit in papers))
write('论文题录.json',json.dumps([dict(id=i,title=t,year=y,url=u,reading=l,relevance=r,caution=c) for i,t,y,u,l,r,c in papers],ensure_ascii=False,indent=2))
write('优先联系名单.json',json.dumps(mentors,ensure_ascii=False,indent=2))

# Existing 1,322 leads remain explicitly provisional. No invented paper matching.
candidates=json.loads((ROOT/'application/research/方向候选与专属链接.json').read_text(encoding='utf-8'))
for r in candidates:
 r['material_status']='方向初筛备稿；论文与招生待核；不可直接群发'
 r['proposed_question']=r.get('question','')
 r['planning_note']='这是基于研究方向提出的拟议问题，不是该导师论文的结论。先核对本人近期论文，再确定是否保留申请。'
 r['letter_draft']=f"{r['name']}老师您好：\n\n我是唐秋鸣，苏州大学音乐学院音乐教育专业钢琴方向2024级硕士研究生，拟咨询2027年博士申请。我目前主要做异地 MIDI 合奏，也在继续打磨钢琴网页原型。\n\n我根据您在{r['institution']}的个人主页整理了一个可能的讨论入口：{r.get('focus','')}。这只是初步判断，还需要结合您近期的具体论文核实是否贴合。我想提出的问题是：{r.get('question','')}\n\n如果这个问题与您的工作有交集，希望了解您是否接受相关背景的申请，并向您作一次简短汇报。网页原型：{r.get('demo_url','')}。谢谢您。\n\n{signature}"
 r['plan_draft']=f"拟议问题：{r.get('question','')}\n依据入口：{r['profile']}\n申请人基础：异地 MIDI 合奏项目、钢琴与音乐教育经历。\n下一步：精读一篇本人近作，明确所用构念与方法；确定可检验对照和主要结果；完成预实验后再确定样本量。\n当前缺口：具体论文、招生资格/名额、跨专业要求、该研究问题与导师工作的直接对应。\n不得将此备稿称为已完成的个性化研究计划。"
write('全部候选备稿.json',json.dumps(candidates,ensure_ascii=False,separators=(',',':')))

summary={'date':DATE,'broad_candidates':len(candidates),'priority_packets':len(mentors),'literature_entries':len(papers),'verified_2027_places':0,'sent':0,'full_personalization_for_all_candidates':False}
write('完成情况.json',json.dumps(summary,ensure_ascii=False,indent=2))
data=json.dumps(candidates,ensure_ascii=False).replace('<','\\u003c')
cards=''.join(f'<li><b>{html.escape(m["name"])}</b>　{html.escape(m["school"])}<p>{html.escape(m["title"])}</p><small>{html.escape(m["status"])}</small><p><a href="优先联系/{m["school"]}-{m["name"]}/套磁信.md">套磁信</a>　<a href="优先联系/{m["school"]}-{m["name"]}/定制研究计划.md">研究计划</a>　<a href="{html.escape(m["demo"])}" target="_blank" rel="noopener">专属演示</a></p></li>' for m in mentors)
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>唐秋鸣 2027博士申请材料</title><style>body{font:15px/1.8 system-ui;background:#f5f2ee;color:#302f2d;margin:0}main{max-width:1100px;margin:auto;padding:36px 22px}h1{font-size:30px}h2{margin-top:40px}a{color:#865048}ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;padding:0;list-style:none}li,article{background:white;border:1px solid #e6ddd3;border-radius:16px;padding:22px}p{margin:10px 0}small{color:#726b63}input,select,button{padding:11px;border:1px solid #d6cfc6;border-radius:10px;font:inherit;background:white}input{width:min(350px,90%)}pre{white-space:pre-wrap;font:inherit}#results{max-height:300px;overflow:auto}#results button{display:block;width:100%;text-align:left;margin:6px 0}.note{padding:18px;background:#ece5dc;border-radius:12px}@media print{input,button,#results{display:none}body{background:white}article{border:0}}</style><main><h1>唐秋鸣｜2027博士申请材料</h1><p class="note">1,322条广泛方向候选，PRIORITY_COUNT份独立联系材料，LITERATURE_COUNT条相关文献线索。2027名额均未确认，邮件未发送。广泛名单提供的是待核备稿，不能等同于逐篇研究过的1,322位导师。</p><p><a href="研究计划-异地MIDI合奏.md">核心研究计划</a>　<a href="论文初稿-研究方案而非结果论文.md">研究方案论文初稿</a>　<a href="相关论文导读.md">相关论文导读</a>　<a href="阅读说明.md">阅读说明与未完成项</a></p><h2>优先联系材料</h2><ul>CARDS</ul><h2>广泛候选检索与备稿</h2><p>每条保留原始主页和摘录。先核实，再决定是否申请；“博士生导师”字样可能来自页面其他内容，不能单靠关键词认定。</p><input id="query" placeholder="搜索姓名、学校、研究关键词"><p id="count"></p><div id="results"></div><article id="detail" hidden><h2 id="name"></h2><a id="source" target="_blank" rel="noopener">个人主页</a><p id="evidence"></p><h3>研究问题备稿</h3><pre id="plan"></pre><h3>咨询信备稿（论文对应待补）</h3><pre id="letter"></pre></article></main><script id="dataset" type="application/json">DATA</script><script>const rows=JSON.parse(document.querySelector('#dataset').textContent),$=s=>document.querySelector(s);function render(){const q=$('#query').value.trim().toLowerCase(),filtered=rows.filter(r=>[r.name,r.institution,r.matches,r.evidence].join(' ').toLowerCase().includes(q));$('#count').textContent=`匹配 ${filtered.length} 条，显示前80条；请用姓名或学校缩小范围。`;$('#results').replaceChildren();for(const r of filtered.slice(0,80)){const b=document.createElement('button');b.textContent=r.name+'　'+r.institution+'　'+r.focus;b.onclick=()=>{$('#detail').hidden=false;$('#name').textContent=r.name+' / '+r.institution;$('#source').href=/^https?:\\/\\//.test(r.profile)?r.profile:'#';$('#evidence').textContent='原页摘录（仍需核对归属）：'+r.evidence;$('#plan').textContent=r.plan_draft;$('#letter').textContent=r.letter_draft;$('#detail').scrollIntoView({behavior:'smooth'});};$('#results').append(b);}}$('#query').oninput=render;render();</script></html>'''.replace('PRIORITY_COUNT',str(len(mentors))).replace('LITERATURE_COUNT',str(len(papers))).replace('CARDS',cards).replace('DATA',data)
write('申请材料总览.html',page)
write('阅读说明.md',f'''# 材料状态与使用顺序

更新于{DATE}。请从《申请材料总览.html》开始。

本次形成{len(mentors)}套独立联系材料、1份完整主研究计划、1份研究方案论文初稿，以及{len(papers)}条相关文献导读（含论文、作者评论与会议线索）。现有1,322条候选保留为广泛检索池，并提供基于方向的咨询备稿与研究问题备稿；这些不是1,322份逐篇精读完成的定制申请。

最初6人中，李小兵、李伟、王小雨有官方博导身份依据；肯尼斯·费尔兹当前博士招生资格仍需另核；雪巍、郭毅可按港科大官方任职确认，但不推定个人2027接收名额。全部名额、招生专业及跨专业条件尚未确认。

阅读层级有明确区别：ComposerX核对了正文相关部分；虚拟合奏工作只取得会议报道；李伟和王小雨版本是方向咨询信，尚未达到具体近作讨论版。发送前请本人读对应材料，确认第一人称经历与研究兴趣，不能把辅助整理的理解当成本人早已完成的阅读。

姓名纠正：Wei Xue的官方中文名为雪巍，此前资料中的“薛维”有误；公开演示匹配已纠正。

你的论文目前是研究方案稿，无实验结果。已有经历以你提供的异地MIDI合奏为核心；没有添加发表、获奖、实验人数或效果数据。若后续要形成结果论文，必须补实际采集与分析。

仍未完成：1,322位逐人招生核验、逐人论文精读和最终个性化材料；相关文献的完整系统综述；可验证的个人成果与排演附件。不能把当前材料包称为上述工作的全部完成。

邮件没有发送。所有广泛候选备稿留在本地，不自动公开，也不用于自动群发。
''')
# Keep each invitation and its public tour on the same research question.
aliases={'肯尼斯·费尔兹':['Kenneth Fields'],'雪巍':['Wei Xue'],'郭毅可':['Yike Guo']}
tour_profiles=[]
for m in mentors:
 tour_profiles.append(dict(names=[m['name']]+aliases.get(m['name'],[]),institution=m['school'],direction=m['direction'],title=m['title'],source=m['paper'] or m['source'],basis=m['basis'],heading='我想向您请教的问题',opening=m['opening']+'\n\n'+m['connection']+'\n\n我们先在曲库里选一首熟悉的作品。这里演示的是钢琴网页原型，异地 MIDI 合奏是另一项工作；我想借谱面、声音和操作过程，把准备研究的问题说明白。',play='这一段可以先听，再对着原稿核对。识别和播放还需要逐项验证，不能把界面显示正常当成演奏或教学效果已经成立。\n\n'+m['question'],arrange='这里可以查看编配结果并试听。接下来我准备怎样研究它，还要与原型目前能做什么分开。\n\n'+m['design'],question=m['question']+'\n\n'+m['outcome']))
(ROOT/'dist/mentor-research.json').write_text(json.dumps(tour_profiles,ensure_ascii=False,indent=2),encoding='utf-8')
write('导师导览对应表.json',json.dumps(tour_profiles,ensure_ascii=False,indent=2))
archive=ROOT/'application'/'唐秋鸣-2027博士申请材料.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in OUT.rglob('*'):
  if p.is_file():z.write(p,p.relative_to(OUT))
print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':pass
