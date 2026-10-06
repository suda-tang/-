// 50 个「长流程」验收用例。
//
// 「长流程」的判定：**至少 2 步、步骤之间有依赖、需要多个动作协作**。
// 单步指令（「打开曲库」）不算长流程，但作为对照组保留了几条。
//
// 字段说明：
//   id      用例号（1~50）
//   name    给人看的名字
//   base    基线曲谱标题（先打开这首，页面因此处于干净状态）
//   say     发给 AI 的原话
//   expect  期望的**最终界面状态**（只写关心的字段，其余不检查）
//   reply   {must:[], mustNot:[]} 可选，对 AI 回复文本的要求
//   tier    'core' 应该能做到 / 'guard' 应该被拒绝或诚实说明 / 'probe' 探索性（只记录）
//
// ★ 期望值里的 `@名字` 是**语义占位**：运行时用基线探测出的声部表解析成真实 value。
//   这样用例定义与具体曲谱解耦（换一首曲子也不用改用例）。
//
// 可断言的界面状态（都能从浏览器直接读到，见 _probe-ai-longflow.cjs）：
//   currentId      当前曲谱 id（用 baseTitle 断言更可读）
//   playing        是否在播放
//   measure        当前小节（精确值，仅用于「不会播放推进」的场景）
//   measureRange   [lo,hi] 「跳到第 N 小节」用：seek 会开始播放且按可听声部的音符定位
//   measureAtLeast 当前小节 ≥ N
//   view           engraved / simple / pdf / daw
//   solo           独奏声部 value（'all' = 全部）
//   onlyPart       「只听 X」：solo==X **或** 除 X 外全部静音，两者皆算达成
//   muted          被静音的声部 value 数组
//   panel          play / library / arrange / tasks
//   tempo          #tempo 的值（数字）
//   tempoAtLeast   速度 ≥ N
//   tempoAtMost    速度 ≤ N
//   metronome      #metronome 是否勾选
//   instrumentText 当前音色选项的文本（如「三角钢琴」）
//   arrangement    配器 value（original/chamber/orchestra/strings/woodwinds/brass/custom）

const S = '知足';          // 主基线：86 小节、9 个声部、有逐音符演奏数据
const M = '月亮代表我的心';

module.exports = [
  // ── A. 打开与播放（7）──────────────────────────────────────────────
  {id:1,name:'打开《知足》并开始播放',base:S,say:'打开《知足》，然后开始播放。',tier:'core',
   expect:{baseTitle:S,playing:true}},
  {id:2,name:'打开《知足》→跳到第 30 小节→播放',base:S,say:'打开《知足》，跳到第 30 小节，然后播放。',tier:'core',
   expect:{baseTitle:S,measureRange:[30,33],playing:true}},
  // ★ 基线用 M（月亮）：原来基线是 S（知足），「打开知足」的结果与基线相同 → 断言恒真、假通过。
  {id:3,name:'搜索「知足」然后打开',base:M,say:'帮我搜一下曲库里的「知足」，然后打开它。',tier:'core',
   expect:{baseTitle:S}},
  {id:4,name:'打开《月亮代表我的心》',base:S,say:'打开《月亮代表我的心》。',tier:'core',
   expect:{baseTitle:M}},
  {id:5,name:'换《海阔天空》并从开头播放',base:S,say:'换一首《海阔天空》，从头开始播放。',tier:'core',
   expect:{baseTitle:'海阔天空',measure:1,playing:true}},
  {id:6,name:'从第 10 小节开始播放',base:S,say:'从第 10 小节开始播放。',tier:'core',
   expect:{measureRange:[10,13],playing:true}},
  {id:7,name:'打开不存在的曲子《小星星》',base:S,say:'打开《小星星变奏曲》。',tier:'guard',
   expect:{baseTitle:S},                     // 不许乱换曲
   reply:{mustNot:[/已(经)?打开/,/正在播放/]}},  // 不许谎称打开了

  // ── B. 声部控制（8）────────────────────────────────────────────────
  // ★ 「只听 X」有两种等价实现：①把 X 设为独奏声部；②把除 X 外的声部全部静音。
  //   用 onlyPart 断言（两者皆可），避免把「实现方式不同」误判成「做不到」。
  {id:8,name:'只听鼓组',base:S,say:'只听鼓组。',tier:'core',
   expect:{onlyPart:'@鼓组'}},
  {id:9,name:'只听钢琴',base:S,say:'只听钢琴。',tier:'core',
   expect:{onlyPart:'@钢琴'}},
  {id:10,name:'把钢琴静音',base:S,say:'把钢琴静音。',tier:'core',
   expect:{muted:['@钢琴']}},
  {id:11,name:'关闭鼓组和贝司',base:S,say:'把鼓组和贝司都关掉。',tier:'core',
   expect:{muted:['@鼓组','@贝司']}},
  {id:12,name:'恢复全部声部',base:S,say:'恢复全部声部，我要听完整的合奏。',tier:'core',
   expect:{solo:'all',muted:[]}},
  {id:13,name:'两步：独奏钢琴→恢复全部',base:S,say:'先只听钢琴，然后把所有声部都恢复回来。',tier:'core',
   expect:{solo:'all',muted:[]}},
  {id:14,name:'两步：静音钢琴→再打开',base:S,say:'把钢琴静音，然后再把钢琴打开。',tier:'core',
   expect:{muted:[]}},
  {id:15,name:'只听鼓组并开始播放',base:S,say:'只听鼓组，然后开始播放。',tier:'core',
   expect:{onlyPart:'@鼓组',playing:true}},

  // ── C. 定位（6）───────────────────────────────────────────────────
  {id:16,name:'跳到第 50 小节',base:S,say:'跳到第 50 小节。',tier:'core',
   expect:{measureRange:[50,53]}},
  {id:17,name:'通鼓最早出现的地方',base:S,say:'《知足》里通鼓最早出现的地方在哪？带我去那里。',tier:'core',
   expect:{measureAtLeast:2},                // 已知是第 72 小节，但不写死（避免与曲谱版本耦合）
   reply:{must:[/通鼓/]}},
  {id:18,name:'鼓组最早出现在哪',base:S,say:'鼓组是从第几小节开始进来的？',tier:'core',
   reply:{must:[/鼓/]}},
  {id:19,name:'跳到最后一小节',base:S,say:'跳到这首曲子的最后一小节。',tier:'core',
   expect:{measureAtLeast:80}},              // measureCount=86，允许模型用「最后一小节」的等价表达
  {id:20,name:'跳到第 9999 小节（超界）',base:S,say:'跳到第 9999 小节。',tier:'guard',
   expect:{measure:1},                       // 界面不许动
   reply:{mustNot:[/已经跳到/]}},
  {id:21,name:'跳到第 5 小节并只听鼓组',base:S,say:'跳到第 5 小节，并且只听鼓组。',tier:'core',
   expect:{measureRange:[5,8],onlyPart:'@鼓组'}},

  // ── D. 速度 / 节拍器 / 音色（8）────────────────────────────────────
  {id:22,name:'速度调到 120',base:S,say:'把演奏速度调到 120。',tier:'core',
   expect:{tempo:120}},
  {id:23,name:'速度调到 120 然后播放',base:S,say:'速度调到 120，然后播放。',tier:'core',
   expect:{tempo:120,playing:true}},
  {id:24,name:'打开节拍器',base:S,say:'把节拍器打开。',tier:'core',
   expect:{metronome:true}},
  {id:25,name:'打开节拍器并播放',base:S,say:'打开节拍器，然后开始播放。',tier:'core',
   expect:{metronome:true,playing:true}},
  {id:26,name:'关掉节拍器',base:S,say:'把节拍器关掉。',tier:'core',
   expect:{metronome:false}},
  {id:27,name:'换音色为三角钢琴',base:S,say:'把音色换成三角钢琴。',tier:'core',
   expect:{instrumentText:'三角钢琴'}},
  {id:28,name:'三步：速度 100 + 节拍器 + 播放',base:S,say:'速度设成 100，打开节拍器，然后播放。',tier:'core',
   expect:{tempo:100,metronome:true,playing:true}},
  // ★ 「快一点」是相对指令。第二轮起前端会把当前控件值放进 `context.settings`
  //   （tempo / metronome / instrument / arrangement），模型能先读基准再算绝对数字，
  //   所以这里从「探索性」升级为**要求真的改速度**，并要在回复里报出 BPM。
  {id:29,name:'「快一点」（相对指令，有基准）',base:S,say:'现在太慢了，快一点。',tier:'core',
   expect:{tempoAtLeast:81},reply:{must:[/BPM|速度/]}},

  // ── E. 视图（4）───────────────────────────────────────────────────
  {id:30,name:'切到简谱',base:S,say:'切换到简谱视图。',tier:'core',
   expect:{view:'simple'}},
  {id:31,name:'切到五线谱',base:S,say:'切换到五线谱。',tier:'core',
   expect:{view:'engraved'}},
  {id:32,name:'切到音轨视图',base:S,say:'切到音轨视图。',tier:'core',
   expect:{view:'daw'}},
  {id:33,name:'两步：切原稿→再切回五线谱',base:S,say:'先看原稿，然后切回五线谱。',tier:'core',
   expect:{view:'engraved'}},

  // ── F. 面板（4）───────────────────────────────────────────────────
  {id:34,name:'打开曲库面板',base:S,say:'打开曲库。',tier:'core',
   expect:{panel:'library'}},
  {id:35,name:'切到改编面板',base:S,say:'打开改编面板。',tier:'core',
   expect:{panel:'arrange'}},
  {id:36,name:'打开任务中心',base:S,say:'打开任务中心。',tier:'core',
   expect:{panel:'tasks'}},
  {id:37,name:'回到演奏面板',base:S,say:'回到演奏面板。',tier:'core',
   expect:{panel:'play'}},

  // ── G. 和弦（3）───────────────────────────────────────────────────
  {id:38,name:'分析当前小节的和弦',base:S,say:'分析一下当前小节的和弦。',tier:'core',
   expect:{},reply:{must:[/.{4,}/]}},
  {id:39,name:'提取全部和弦',base:S,say:'把这首曲子的和弦提取出来。',tier:'core',
   expect:{},reply:{must:[/.{4,}/]}},
  {id:40,name:'当前小节是什么和弦',base:S,say:'现在这个小节是什么和弦？',tier:'core',
   expect:{},reply:{must:[/.{4,}/]}},

  // ── H. 配器（4）───────────────────────────────────────────────────
  {id:41,name:'换成弦乐四重奏',base:S,say:'把配器换成弦乐四重奏。',tier:'core',
   expect:{arrangement:'strings'}},
  {id:42,name:'换成室内乐编制',base:S,say:'配器换成室内乐。',tier:'core',
   expect:{arrangement:'chamber'}},
  {id:43,name:'生成总谱',base:S,say:'用弦乐四重奏的编制生成一份总谱。',tier:'core',
   expect:{},reply:{must:[/.{4,}/]}},
  {id:44,name:'恢复原谱编制',base:S,say:'配器恢复成原谱。',tier:'core',
   expect:{arrangement:'original'}},

  // ── I. 多步长流程（5）★ 真正的「长流程」────────────────────────────
  {id:45,name:'五步：打开→独奏鼓组→跳72→速度90→播放',base:S,
   say:'打开《知足》，只听鼓组，跳到第 72 小节，速度调到 90，然后开始播放。',tier:'core',
   expect:{baseTitle:S,onlyPart:'@鼓组',measureRange:[72,75],tempo:90,playing:true}},
  {id:46,name:'四步：静音钢琴→开节拍器→切简谱→播放',base:S,
   say:'把钢琴静音，打开节拍器，切换到简谱，然后开始播放。',tier:'core',
   expect:{muted:['@钢琴'],metronome:true,view:'simple',playing:true}},
  {id:47,name:'四步：打开月亮→简谱→速度70→播放',base:S,
   say:'打开《月亮代表我的心》，切到简谱，速度调到 70，然后播放。',tier:'core',
   expect:{baseTitle:M,view:'simple',tempo:70,playing:true}},
  {id:48,name:'三步：独奏鼓组→跳通鼓最早处→播放',base:S,
   say:'只听鼓组，跳到通鼓最早出现的地方，然后开始播放。',tier:'core',
   expect:{onlyPart:'@鼓组',measureAtLeast:2,playing:true}},
  {id:49,name:'三步：分析和弦→切五线谱→播放',base:S,
   say:'先分析当前小节的和弦，然后切到五线谱，再开始播放。',tier:'core',
   expect:{view:'engraved',playing:true}},

  // ── J. 拒绝类（1）─────────────────────────────────────────────────
  {id:50,name:'删除《知足》（禁删）',base:S,say:'把《知足》从云曲库里删掉。',tier:'guard',
   expect:{baseTitle:S},
   reply:{must:[/不会删除|做不到|无法删除/]}},

  // ── K. 相对指令的反方向（1）★ 第二轮补：有基准后才可能一次到位 ──────
  {id:51,name:'「慢一点」（相对指令，基准 160）',base:S,pre:{tempo:160},
   say:'太快了，慢一点。',tier:'core',
   expect:{tempoAtMost:150},reply:{must:[/BPM|速度/]}},
];
