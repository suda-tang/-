# OpenMAIC研究核查与本项目的论证依据

核查日期：2026年10月14日。用途：博士申请、研究说明与论文底稿。本文记录来源和可用结论，不将上游研究结果移植为本项目结果。

## 一、必须区分的四个对象

**MAIC研究论文。** Yu等发表于《Journal of Computer Science and Technology》的论文为 *From MOOC to MAIC: Reimagine Online Teaching and Learning Through LLM-Driven Agents*，2026，41(1)：394–414，DOI：10.1007/s11390-025-6000-0。期刊页明确列出国家自然科学基金62407027、清华大学自主科研计划2024THZWJC11等资助。它讨论课程生产、适应性支持与多角色学习，并报告500余名学生、10万余条学习记录的初步分析。这些数字只属于该研究。[正式期刊页](https://jcst.ict.ac.cn/article/doi/10.1007/s11390-025-6000-0)

**基金资助与基金申请书。** 目前核实的是上述资助声明；未取得62407027的正式项目申请书，未核实项目名称、负责人、研究期限及完整技术路线。因此只能借鉴论文论证，不能声称复现了它的“国自然申请书写法”，更不能把该资助写入唐秋鸣项目。

**学习过程研究。** Hao等的 *Mapping Student-AI Interaction Dynamics in Multi-Agent Learning Environments: Supporting Personalised Learning and Reducing Performance Gaps*，arXiv:2506.02993，考察305名大学生和19,365行对话，结合前后测与互动序列分析。作者指出单一课程、即时后测和结构编码的局限。对本项目最有用的启发是同时研究行为过程与学习结果，而不以对话量代替理解。[作者论文全文](https://arxiv.org/pdf/2506.02993)

**MAIC-UI研究。** Tu等的 *MAIC-UI: Making Interactive Courseware with Generative UI*，arXiv:2604.25806，报告40人实验室研究和53名高中生、三个月的课堂部署，分别考察制作与学习。它突出内容分析、生成校验和局部编辑。该预印本网页仍有出版模板占位符，本材料不将其写成已核实的某会议正式录用成果。它的高中也不是苏州星海高级中学。[作者论文全文](https://arxiv.org/html/2604.25806v1)

**OpenMAIC开源软件。** 官方仓库与论文相互关联，但某一时点的仓库能力不能倒推为早期实验的系统条件。本项目调用`@openmaic/generation@0.3.18`，不是完整部署最新OpenMAIC；本地新增音乐上下文、播放器桥接和教学约束。[官方仓库](https://github.com/THU-MAIC/OpenMAIC)

## 二、对本项目的独立判断

值得学习的是研究结构：先解释真实教学中的矛盾，再说明机制如何对应矛盾，最后用不同层级的证据验证。不能先堆积“多模态、多智能体、个性化”，再用一份满意度问卷宣布教育有效。

本项目的领域问题具有明确区别。音乐理解需要在声音时间中形成，文本正确不意味着播放正确。教学系统必须知道解释对应哪个版本、哪一小节、哪个声部和哪次实际聆听；学生还要通过再听、比较或演奏检验解释。由此可提出“以乐谱为依据的可执行教学活动”这一设计贡献，再考察它是否促进有证据的音乐判断。它是待验证的研究主张，不是已经证明的新理论。

对原有材料最大的修正是：把“学生看到了生成内容”进一步拆成内容已生成、动作已请求、声音已播放、学生已参与、判断已修正五种状态。前一状态不能代替后一状态。另一个修正是把高中普通音乐课堂与钢琴个别技能课分开：前者以共同聆听、审美判断、合作表达为主，不能用键盘音符准确率统摄所有学生的学习。

## 三、音乐教育文献依据

1. Duke, R. A., Simmons, A. L., & Cash, C. D. (2009). *It’s Not How Much; It’s How: Characteristics of Practice Behavior and Retention of Performance Skills*. Journal of Research in Music Education, 56(4), 310–321. DOI：10.1177/0022429408328851。该研究提醒本项目区分练习数量与练习策略，不将点击、时长、重复次数直接解释为有效学习。[论文全文](https://blogs.ischool.berkeley.edu/i225s14/files/2014/04/Music-practice-Its-not-how-much-its-how.pdf)
2. McPherson, G. E., & Renwick, J. M. (2001). *A Longitudinal Study of Self-regulation in Children’s Musical Practice*. Music Education Research, 3(2), 169–186. DOI：10.1080/14613800120089232。用于支持关注学生如何监控与调整练习；不把儿童器乐练习结论直接外推为高中全班课堂效应。[作者公开全文](https://www.researchgate.net/publication/260184002_McPherson_Renwick_2001)
3. Hattie, J., & Timperley, H. (2007). *The Power of Feedback*. Review of Educational Research, 77(1), 81–112. DOI：10.3102/003465430298487。用于提出反馈方式需要检验，不预设反馈越即时、越多越有效。[期刊入口](https://doi.org/10.3102/003465430298487)
4. 教育部：《普通高中音乐课程标准（2017年版2020年修订）》。课程定位依据审美感知、艺术表现、文化理解；具体课例需对应学校所用教材与课时安排。[教育部印发通知](https://www.moe.gov.cn/srcsite/A26/s8001/202006/t20200603_462199.html)；[人民教育出版社公开文本](https://www.pep.com.cn/xw/zt/rjwy/gzkb2020/202205/P020220517521792634168.pdf)。后一个PDF在本轮网页解析时失败，相关概念由检索内容核对，正式定稿须再次核读具体页码。

## 四、本轮本地证据

核查核心文件：`score_classroom.py`、`classroom_runtime.py`、`services/openmaic/classroom-pipeline.mjs`、`teaching-context.mjs`、`score-evidence.mjs`、`dist/classroom-engine.js`、`classroom-listening.js`、`classroom-music-bridge.js`，并参考此前已核查的谱面、播放、练习、材料模块。此范围不是全仓库逐行审计。

2026年10月14日重新执行：

```text
Python 3.12 -m unittest tests.test_classroom_runtime tests.test_score_classroom
13 tests，OK

node --test services/openmaic/teaching-context.test.mjs services/openmaic/score-evidence.test.mjs
11 tests，11 pass，0 fail
```

测试覆盖材料分片/重试/作品绑定、课堂动作范围、版本冲突、修改讲稿使旧音频失效、全曲设置、学段缓存隔离、渐进场景升级、失败任务可见、部分音符时值断言校验等。部分测试使用临时文件、模拟任务池或人工构造音符；它们不能证明真实网络可用率、所有谱例正确、听音模型准确率或学生学习效果。

一个必须披露的实际限制：`classroom-pipeline.mjs`在音符证据未抽样且拍号分母均为4时才向时值核查器传入音符；其他情况不进行同等校验。`score-evidence.mjs`主要处理中文明确小节与明确音高/时值断言，不是通用音乐推理验证器。`classroom-listening.js`还有中文关键词与词项匹配补偿，不能描述成已完成的全语种语义对齐。

另一个限制：课堂观察只保留最近200条、修订快照最近20个；现有实现不能单独支撑“已完整保存一年所有学生的多模态纵向数据”这一表述。申请人独立保存的课堂音视频和记录应另行盘点、授权、关联。

## 五、写作与署名原则

申请人可以据实叙述需求提出、音乐教育设计、实现组织、系统集成、调试和课堂实践。上游SDK、预训练识音模型、排版库与现成指法算法应在论文和技术附件注明来源；不能写成全部算法均自行发明。AI辅助开发也不应被改写为“每行代码独立完成”。

星海高中是申请人提供的实践场景。当前没有取得可审计的实验人数、分组、前后测、访谈转录及伦理材料。因此本轮论文采用“系统设计、工程核查及实证研究方案”的体例。它可以作为博士申请研究写作样本，不应冒充已完成效果验证的投稿论文。后续补足真实资料，应增加数据结果，而不是先写结论再寻找数字。
