from pathlib import Path
import re
from docx import Document
from docx.shared import Pt

root=Path(__file__).resolve().parent
target=root/'项目开发历程与导师交流详稿.md'
original=target.read_text(encoding='utf-8-sig')
backup=root/'项目开发历程与导师交流详稿_技术整合前留档_20261017.md'
if not backup.exists():backup.write_text(original,encoding='utf-8')
else:original=backup.read_text(encoding='utf-8')
technical=(root/'项目技术与研究说明.md').read_text(encoding='utf-8')
matches=list(re.finditer(r'^### (\d+) ([^\n]+)\n',technical,re.M))
modules={}
for match in matches:
    boundary=re.search(r'^#{2,3} ',technical[match.end():],re.M)
    end=match.end()+boundary.start() if boundary else len(technical)
    modules[int(match[1])]=(match[2],technical[match.end():end].strip())
mapping={1:[3,48],2:[5],3:[4,10],4:[6],5:[7,8],6:[9,47],7:[2],8:[16],9:[17],10:[33,34,35],11:[12,13],12:[14],13:[18,44],14:[1,11,22],15:[19,20],16:[21,52],17:[29,30,31,32],18:[23,24,25,27],19:[26,28,36,49],20:[],21:[37,39,40],22:[38],23:[43],24:[41],25:[50],26:[15,42,51],27:[45,46,53,54]}
assigned=[n for values in mapping.values() for n in values]
assert sorted(assigned)==list(range(1,55)) and len(set(assigned))==54
bridges=[
'讲到这一步，我需要把浏览器读文件、渲染PDF与模型识谱分开解释。它们共享一个入口，却会在不同位置失败；音频会话和取消机制也属于同一类浏览器运行边界。',
'我当时提出的是接近扫描件的完整目标；回头核查实现，能够确认的方向归一和页面组装，与仍待补证的透视和纸面裁切，必须写清楚。下面保留这种区别。',
'重新识别入口逐渐增多以后，我更关心输出之间能否比较，以及修复有没有改变原曲。归一化不是自动把所有不规则小节补成整拍。',
'这一阶段的难点落在数字周围很小的符号上。我需要向老师解释的，是普通文字框怎样变成有八度、节奏和声部关系的音乐对象。',
'音视频输入让我多了一次推断：先从声音估计音符，再从时间组织成谱。分离与转录又会互相影响，所以我把每一层的误差分别保留下来。',
'多乐器导入迫使我区分文件格式、内部事件与实际音色。导出也必须单独核查；当前简化导出器的限制，并不能用导入成功掩盖。',
'小节处的空拍让我回到最基础的单位换算。下面这些时间关系，是后来所有视图、播放器和课堂动作需要共同遵守的约束。',
'声音问题后来不再只是换一个钢琴音色。我需要同时解释资源下载、解码、采样发声和混音，才能知道听到的冲突究竟来自哪里。',
'我对自然演奏的要求一直有一个前提：节拍关系要成立。表达性该改变什么、不能改变什么，需要落到可以比较的参数和听觉判断上。',
'改编不是把原曲换一组音色。模型生成了新声部以后，还要回到拍号、音域、和声连接和鼓的节拍层次上接受检查。',
'视图越来越多以后，我不再把它们当成四份互不相关的乐谱。它们使用同一份音乐事件，但各自有不同的布局与阅读要求。',
'PDF定位的反复错位让我意识到，行数正确远远不够。原稿像素、显示尺寸和小节时序之间的变换，必须逐层核对。',
'人声加入以后，系统同时面对两条时间线。我需要知道自动估计适用的条件，也需要保留人工微调，避免用频繁重启掩盖漂移。',
'保存曲目以后，问题从一次性处理变成长期管理：重名、改名、重新识别和不同版本都可能出现。分类与封面也需要服从作品身份。',
'AI接入的重点，是把一句要求落到真实声部、小节和播放器状态上。下面展开事实读取、动作规划、执行回读和分析证据的关系。',
'联网以后，我必须区分找到页面、取得可用材料和完成转谱。外部服务的失败和需要用户辅助的步骤，也要留在同一条可追踪流程里。',
'练习反馈让我从“程序识别到了什么”转向“学生究竟需要什么反馈”。听音、匹配、指法与手型并非一个算法，需要分别验证。',
'课堂部分最花工夫的是让计划真的执行：讲解停下，音乐响起，学生作答，再接回教学。生成内容和运行状态必须互相约束。',
'课堂顺畅与否往往取决于相邻环节之间：声音是否及时、图片是否真实、区域是否对应、下一句是否已经准备。下面把这些接口展开。',
'导览最终需要进入真实工作区，演示的对象与用户平时操作的是同一份作品。它可以按来访者背景组织顺序，但每一步都应等实际结果，不能只演一个预先写好的成功故事。',
'数字人部分我经历了还原度和动作的反复调整。下面区分素材条件、声音生成、几何建模与动画运行，避免把参考照片数量当成已经完成高精度重建。',
'专属前言后来固定为短问候与已有正文拼接。这样既保留原来较好的声音，也把实时计算集中到真正随来访者变化的部分。',
'语言与分享不是最后换一下文字。名字、院校、字幕、声音和链接预览需要来自同一上下文，界面布局也必须承受不同语言长度。',
'任务越多，我越需要把每项工作正在处理哪首曲子说清楚。队列既要限制资源争用，也不能因前台一次点击就让后台永久等待。',
'视觉效果也变成了工程问题。连续感依赖对象身份、布局和资源就绪顺序，无法只靠多加几条动画曲线解决。',
'大型曲谱让我把性能看成一整条关键路径：哪些必须先做，哪些可以延后，哪些被重复计算，哪些资源退出后还没有释放。',
'最后，可部署并不是仓库能启动一个网页。我需要把依赖、素材、认证、网络入口和验证记录一起交代，才能让别人理解哪些环节可以复现。'
]

steps=list(re.finditer(r'^### 第[^\n]+\n',original,re.M))
assert len(steps)==27
result=original
for index in range(26,-1,-1):
    step=steps[index]
    boundary=re.search(r'^#{2,3} ',original[step.end():],re.M)
    end=step.end()+boundary.start() if boundary else len(original)
    body=original[step.end():end].strip()
    body+='\n\n'+bridges[index]
    for number in mapping[index+1]:
        title,text=modules[number]
        text=re.sub(r'^#### ', '##### ', text, flags=re.M)
        body+='\n\n#### '+title+'\n\n'+text
    result=result[:step.start()]+step[0]+'\n'+body+'\n\n'+result[end:]

research=technical.split('## 十一 研究问题、证据与验证设计',1)[1].split('## 技术来源与复核说明',1)[0].strip()
research=re.sub(r'^### ', '#### ', research, flags=re.M)
intro='\n\n这些实现细节最后需要收束成能够检验的问题。我在这里保留研究设计与已有证据的区别：课堂落地经历是研究起点，效果结论仍要由实际记录支持。\n\n'
result=result.replace('## 五 需求与故障核对索引',intro+research+'\n\n## 五 需求与故障核对索引',1)
sources=technical.split('## 技术来源与复核说明',1)[1]
result+='\n\n## 七 技术来源与整合核对\n\n'+sources
result+='\n\n### 技术内容与开发阶段对应\n\n| 开发阶段 | 技术说明原模块编号 |\n|---|---|\n'
for stage,numbers in mapping.items():
    result+=f'| 第{stage}步 | '+('、'.join(map(str,numbers)) if numbers else '导览叙述及跨阶段演示衔接')+' |\n'
result+='\n54个技术模块均已纳入对应开发阶段，研究验证及技术来源也完整保留。此表用于版本核对，不要求导师另读技术说明才能理解正文。阶段按现有记录与开发依赖整理，不补造具体日期、实验人数或效果数据。\n'
result=result.replace('整理日期 2026年10月15日','整合更新日期 2026年10月17日')
result=result.replace('正文采用我向导师介绍项目的口吻，后半部分保留需求与调试索引，便于交流时追问具体实现。','正文采用我向导师介绍项目的口吻，在27个阶段中嵌入完整技术机制、数据关系、故障边界和验证方法，后半部分保留研究设计与164项需求调试索引，便于交流时追问具体实现。')
result=result.replace('它是本人第一人称', '它是本人第一人称')
note='54个技术模块均已纳入对应开发阶段，研究验证及技术来源也完整保留。此表用于版本核对，不要求导师另读技术说明才能理解正文。阶段按现有记录与开发依赖整理，不补造具体日期、实验人数或效果数据。'
result=result.replace('\n'+note+'\n','\n')
result=result.replace('### 技术内容与开发阶段对应\n\n','### 技术内容与开发阶段对应\n\n'+note+'\n\n')
target.write_text(result,encoding='utf-8')

builder=root/'build_documents.py';ns={'__file__':str(builder)}
exec(builder.read_text(encoding='utf-8').split("for name in ['博士申请主稿'")[0],ns)
ns['build']('项目开发历程与导师交流详稿')
output=root/'项目开发历程与导师交流详稿.docx'
doc=Document(output)
for paragraph in doc.paragraphs:
    if paragraph.text=='七 技术来源与整合核对':paragraph.paragraph_format.page_break_before=True
    if paragraph.text=='技术内容与开发阶段对应':paragraph.paragraph_format.page_break_before=True
for row in doc.tables[-1].rows:
    for cell in row.cells:
        for paragraph in cell.paragraphs:
            paragraph.paragraph_format.space_before=Pt(0)
            paragraph.paragraph_format.space_after=Pt(0)
            paragraph.paragraph_format.line_spacing=1
            for run in paragraph.runs:run.font.size=Pt(8.5)
doc.save(output)
assert len(assigned)==54
print('Integrated modules:',len(assigned),'stages:',len(steps),'characters:',len(result))
