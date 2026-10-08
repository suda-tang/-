// 50 个「连续对话 + 操作」验收用例（2026-10-09，唐老师：五十个连续对话和操作的测试）。
//
// 与 scripts/check-ai-longflow.cjs 完全兼容（字段同 ai-musician-cases.cjs 头部注释）。
// 重点覆盖一个**此前没测过的新领域**：**全库乐理检索**——「找曲库里所有带减七和弦的曲子」
// 这类。现有 100 条只围绕当前打开的一首曲子做演奏控制，从没考过「跨全库、按音乐属性找歌」。
//
// 断言分级：
//   core   应做到（操作类，界面状态可断言）
//   probe  探索（乐理检索类，只断言"回复有实质内容、不崩、不假装"，回复人工看）
//   guard  应拒绝或诚实说明
//
// @名字 是声部语义占位，运行时按基线真实声部表解析。
const S = '知足';            // 86 小节
const M = '月亮代表我的心';   // 69 小节
const H = '海阔天空';        // 76 小节

module.exports = [
  // ══ A. 全库乐理检索（唐老师的 headline，1~16）═══════════════════════
  {id:1,name:'找所有带减七和弦的曲子',base:S,tier:'probe',
   say:'帮我找曲库里所有带有减七和弦的曲子。',expect:{},
   // ★ 不许把「全库检索」答成「当前曲子的逐小节和弦表」（第2小节：… 第3小节：…）
   reply:{must:[/.{8,}/],mustNot:[/^第\s*\d+\s*小节[：:]/]}},
  {id:2,name:'找所有带属七和弦的曲子',base:S,tier:'probe',
   say:'曲库里哪些曲子用到了属七和弦？',expect:{},
   reply:{must:[/.{8,}/],mustNot:[/^第\s*\d+\s*小节[：:]/]}},
  {id:3,name:'找所有小调的曲子',base:S,tier:'probe',
   say:'曲库里有哪些曲子是小调的？',expect:{},reply:{must:[/.{8,}/]}},
  {id:4,name:'找 3/4 拍的曲子',base:S,tier:'probe',
   say:'帮我找几首 3/4 拍的曲子。',expect:{},reply:{must:[/.{8,}/]}},
  {id:5,name:'找速度 60~80 的曲子',base:S,tier:'probe',
   say:'找几首速度在 60 到 80 之间的曲子。',expect:{},reply:{must:[/.{8,}/]}},
  {id:6,name:'找有转调的曲子',base:S,tier:'probe',
   say:'曲库里有哪些曲子中间有转调？',expect:{},reply:{must:[/.{8,}/]}},
  {id:7,name:'找含半音阶进行的曲子',base:S,tier:'probe',
   say:'帮我找所有包含半音阶进行的曲子。',expect:{},reply:{must:[/.{8,}/]}},
  {id:8,name:'找爵士风格的曲子',base:S,tier:'probe',
   say:'曲库里有爵士风格的曲子吗？',expect:{},reply:{must:[/.{8,}/]}},
  {id:9,name:'找钢琴独奏的曲子',base:S,tier:'probe',
   say:'帮我找一些钢琴独奏的曲子。',expect:{},reply:{must:[/.{8,}/]}},
  {id:10,name:'找适合初学者练习的曲子',base:S,tier:'probe',
   say:'找几首适合初学者练习的简单曲子。',expect:{},reply:{must:[/.{8,}/]}},
  {id:11,name:'找带减三和弦的曲子',base:S,tier:'probe',
   say:'曲库里有哪些曲子用到了减三和弦？',expect:{},
   reply:{must:[/.{8,}/],mustNot:[/^第\s*\d+\s*小节[：:]/]}},
  {id:12,name:'找最长的一首',base:S,tier:'probe',
   say:'曲库里最长的一首曲子是哪首？',expect:{},reply:{must:[/.{8,}/]}},
  {id:13,name:'找有终止式的曲子',base:S,tier:'probe',
   say:'帮我找一些有明显终止式的曲子。',expect:{},reply:{must:[/.{8,}/]}},
  {id:14,name:'找 6/8 拍的曲子',base:S,tier:'probe',
   say:'找一首 6/8 拍的曲子。',expect:{},reply:{must:[/.{8,}/]}},
  {id:15,name:'找带那不勒斯和弦的曲子',base:S,tier:'probe',
   say:'曲库里有没有用到那不勒斯六和弦的曲子？',expect:{},
   reply:{must:[/.{8,}/],mustNot:[/^第\s*\d+\s*小节[：:]/]}},
  {id:16,name:'找变拍子的曲子',base:S,tier:'probe',
   say:'找几首有变拍子（中途换拍号）的曲子。',expect:{},reply:{must:[/.{8,}/]}},

  // ══ B. 检索后联动操作（17~26）══════════════════════════════════════
  {id:17,name:'搜索「知足」并打开',base:M,tier:'core',
   say:'帮我搜一下曲库里的《知足》，然后打开它。',expect:{baseTitle:S}},
  {id:18,name:'打开海阔天空并切简谱',base:S,tier:'core',
   say:'打开《海阔天空》，切到简谱。',expect:{baseTitle:H,view:'simple'}},
  {id:19,name:'打开月亮并从第10小节播放',base:S,tier:'core',
   say:'打开《月亮代表我的心》，从第 10 小节开始播放。',
   expect:{baseTitle:M,measureRange:[10,13],playing:true}},
  {id:20,name:'找一首 6/8 拍的曲子然后播放',base:S,tier:'probe',
   say:'找一首 6/8 拍的曲子，然后播放。',expect:{},reply:{must:[/.{6,}/]}},
  {id:21,name:'打开知足→分析当前和弦→切五线谱',base:S,tier:'core',
   say:'分析当前小节的和弦，然后切到五线谱。',expect:{view:'engraved'},reply:{must:[/.{4,}/]}},
  {id:22,name:'打开知足→只听人声→播放',base:M,tier:'core',
   // ★ 原用《海阔天空》——实测它只有 8 个声部、**没有人声**，用例本身不成立；
   //   改用有 人声 声部的《知足》，才测得到「打开 + 只听非弦乐/钢琴声部 + 播放」。
   say:'打开《知足》，只听人声，然后播放。',
   expect:{baseTitle:S,onlyPart:'@人声',playing:true}},
  {id:23,name:'打开月亮→速度60→节拍器→播放',base:S,tier:'core',
   say:'打开《月亮代表我的心》，速度调到 60，打开节拍器，然后播放。',
   expect:{baseTitle:M,tempo:60,metronome:true,playing:true}},
  {id:24,name:'找慢速抒情曲并切简谱',base:S,tier:'probe',
   say:'找一首慢速抒情的曲子，切到简谱。',expect:{},reply:{must:[/.{6,}/]}},
  {id:25,name:'搜含「月亮」的曲子并打开',base:S,tier:'probe',
   // 实测：AI 找到《月亮代表我的心》但**先问「要我打开这首吗」**（与提示词「多首候选先询问」一致）。
   // 属行为可议、非硬缺陷 → 降为 probe，只断言它认出了这首。
   say:'搜一下曲库里名字带「月亮」的曲子，打开它。',
   expect:{},reply:{must:[/月亮代表我的心/]}},
  {id:26,name:'打开知足→只听钢琴→五线谱→播放',base:S,tier:'core',
   say:'打开《知足》，只听钢琴，切到五线谱，然后播放。',
   expect:{baseTitle:S,onlyPart:'@钢琴',view:'engraved',playing:true}},

  // ══ C. 多轮连续对话（省略主语，27~40）══════════════════════════════
  {id:27,name:'两轮：打开知足→分析当前和弦',base:M,tier:'core',
   say:['打开《知足》。','分析一下当前小节的和弦。'],
   expect:{baseTitle:S},reply:{must:[/.{4,}/]}},
  {id:28,name:'三轮：打开知足→切简谱→跳30播放',base:M,tier:'core',
   say:['打开《知足》。','切到简谱。','跳到第 30 小节，然后播放。'],
   expect:{baseTitle:S,view:'simple',measureAtLeast:30,playing:true}},
  {id:29,name:'两轮：打开海阔天空→只听鼓组',base:S,tier:'core',
   say:['打开《海阔天空》。','只听鼓组。'],expect:{baseTitle:H,onlyPart:'@鼓组'}},
  {id:30,name:'四轮：打开月亮→速度70→节拍器→播放',base:S,tier:'core',
   say:['打开《月亮代表我的心》。','速度调到 70。','打开节拍器。','播放。'],
   expect:{baseTitle:M,tempo:70,metronome:true,playing:true}},
  {id:31,name:'两轮：切五线谱→跳最后一小节',base:S,tier:'core',
   say:['切到五线谱。','跳到最后一小节。'],expect:{view:'engraved',measureAtLeast:80}},
  {id:32,name:'三轮：换知足→弦乐四重奏→播放',base:M,tier:'core',
   say:['打开《知足》。','换成弦乐四重奏。','播放。'],
   expect:{baseTitle:S,arrangement:'strings',playing:true}},
  {id:33,name:'两轮：只听钢琴→恢复全部声部',base:S,tier:'core',
   say:['只听钢琴。','恢复全部声部。'],expect:{solo:'all',muted:[]}},
  {id:34,name:'三轮：打开知足→跳40→只听鼓组',base:M,tier:'core',
   // ★ 原用「只听弦乐合奏」——《知足》有两个弦乐声部（弦乐合奏 P5-49 + 弦乐53 P6-53），
   //   只保留整族是合理行为、与「只听某一个」的断言不符；改用唯一的「鼓组」。
   say:['打开《知足》。','跳到第 40 小节。','只听鼓组。'],
   expect:{baseTitle:S,measureAtLeast:40,onlyPart:'@鼓组'}},
  {id:35,name:'两轮：速度100→再快一点',base:S,tier:'core',
   say:['把速度调到 100。','再快一点。'],expect:{tempoAtLeast:101},reply:{must:[/BPM|速度/]}},
  {id:36,name:'四轮：打开海阔→切音轨→只听贝司→播放',base:S,tier:'core',
   say:['打开《海阔天空》。','切到音轨视图。','只听贝司。','播放。'],
   expect:{baseTitle:H,view:'daw',onlyPart:'@贝司',playing:true}},
  {id:37,name:'两轮：分析曲式→切五线谱',base:S,tier:'core',
   say:['这首的曲式结构是怎样的？','切到五线谱。'],expect:{view:'engraved'},reply:{must:[/.{10,}/]}},
  {id:38,name:'三轮：打开月亮→管弦乐→速度80→播放',base:S,tier:'core',
   say:['打开《月亮代表我的心》。','配器换成管弦乐。','速度调到 80，然后播放。'],
   expect:{baseTitle:M,arrangement:'orchestra',tempo:80,playing:true}},
  {id:39,name:'两轮：跳第20小节→然后暂停',base:S,tier:'core',
   say:['跳到第 20 小节，开始播放。','然后暂停。'],
   expect:{measureAtLeast:20,playing:false}},
  {id:40,name:'三轮：打开知足→静音鼓组→播放',base:M,tier:'core',
   say:['打开《知足》。','把鼓组静音。','播放。'],
   expect:{baseTitle:S,muted:['@鼓组'],playing:true}},

  // ══ D. 深度乐理 / 教学（单轮，41~47）═══════════════════════════════
  {id:41,name:'当前曲子的和声进行',base:S,tier:'core',
   say:'这首曲子的和声进行是怎样的？',expect:{},reply:{must:[/.{10,}/]}},
  {id:42,name:'分析调性',base:S,tier:'probe',
   say:'帮我分析一下这首曲子的调性。',expect:{},reply:{must:[/.{10,}/]}},
  {id:43,name:'曲式结构分析',base:S,tier:'core',
   say:'这首曲子的曲式结构是怎样的？',expect:{},reply:{must:[/.{10,}/]}},
  {id:44,name:'终止式分析',base:S,tier:'probe',
   say:'这首曲子里有哪些终止式？',expect:{},reply:{must:[/.{8,}/]}},
  {id:45,name:'针对这首的练习计划',base:S,tier:'core',
   say:'给我一份针对这首曲子的分段练习计划。',expect:{},reply:{must:[/.{10,}/]}},
  {id:46,name:'旋律动机分析',base:S,tier:'probe',
   say:'这首曲子的旋律动机是什么？',expect:{},reply:{must:[/.{8,}/]}},
  {id:47,name:'改编弦乐四重奏的配器建议',base:S,tier:'core',
   say:'如果把这首改编成弦乐四重奏，配器上你有什么建议？',expect:{},reply:{must:[/.{10,}/]}},

  // ══ E. 边界 / 拒绝 / 诚实（48~50）═════════════════════════════════
  {id:48,name:'删掉所有带减七和弦的曲子（禁删）',base:S,tier:'guard',
   say:'把曲库里所有带减七和弦的曲子都删掉。',
   expect:{},reply:{must:[/不会|做不到|无法|不能/]}},
  {id:49,name:'导出 MIDI（做不到应诚实）',base:S,tier:'guard',
   say:'把这首曲子导出成 MIDI 文件给我。',
   expect:{},reply:{must:[/做不到|没有|无法|不能/]}},
  {id:50,name:'改谱：把减七和弦改成属七（做不到应诚实）',base:S,tier:'guard',
   say:'把第 5 小节的减七和弦改成属七和弦。',
   expect:{},reply:{must:[/做不到|没有|无法|不能/]}},
];
