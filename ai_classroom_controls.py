"""Map explicit classroom preparation requests to the existing course generator."""
import json
import re

def classroom_controls(data):
    text=next((str(m.get('content','')) for m in reversed(data.get('messages',[])) if m.get('role')=='user'),'')
    if not re.search(r'备课|备(?:一|这|下).{0,8}课|(?:生成|创建|制作|做|准备|设计|安排|整理|写|完善|优化|补全).{0,24}(?:PPT|课件|教案|课程|音乐课|这节课)|(?:PPT|课件|教案|课程|这节课).{0,18}(?:生成|创建|制作|做|准备|设计|备|整理|完善|写|安排|补全|优化)',text,re.I):return None
    if re.search(r'(?:不要|先不|别)[^，,。；;]{0,4}(?:生成|创建|制作|准备|备课|做)|如何|怎么做',text):return None
    if re.search(r'(?:并|然后|同时).*(?:播放|静音|独奏|节拍器|切换|打开曲库)',text) or (re.match(r'^(?:请|帮我)?(?:找|搜|推荐)',text) and not re.search('当前|这首',text)):return None
    context=data.get('context') or {}
    if not context.get('currentId'):return {'reply':'先选择要讲授的曲谱，再生成对应课件。','actions':[{'type':'panel','value':'library'}]}
    named=re.findall(r'《([^》]+)》',text)
    if named and any(name not in str(context.get('current','')) for name in named):return None
    course=context.get('classroom') or {}
    previous=(course.get('settings') or {}) if course.get('scoreId')==context.get('currentId') else {}
    if course.get('id') and course.get('scoreId')==context.get('currentId') and not re.search('重新|重做|小学|初中|高中|分钟|小节|视角|要求|加入|增加|改|完善|优化',text) and course.get('status') in ('queued','generating','complete'):
        return {'reply':'这节课已有课件，我先打开现有课堂。' if course['status']=='complete' else '这节课正在生成，我打开课堂查看当前进度。','actions':[{'type':'classroom','value':{'operation':'open'}},{'type':'classroom','value':{'operation':'status'}}]}
    stage='primary' if '小学' in text else 'junior' if '初中' in text else 'senior' if '高中' in text else previous.get('schoolStage','senior')
    value={'goal':text if re.search('小学|初中|高中|视角|要求|加入|增加|改|完善|优化',text) else previous.get('goal') or text,'schoolStage':stage,'mode':'piano' if '钢琴教学' in text else previous.get('mode','classroom'),'scope':'whole'}
    if previous.get('duration'):value['duration']=previous['duration']
    span=re.search(r'第?(\d+)\s*(?:到|至|—|-)\s*(\d+)小节',text)
    if span:value.update(scope='range',start=int(span[1]),end=int(span[2]))
    minutes=re.search(r'(20|35|40|45|90)\s*分钟',text)
    if minutes:value['duration']=minutes[1]
    return {'reply':'按当前曲谱准备课程和 PPT，生成进度会显示在课堂和任务中心。','actions':[{'type':'create_classroom','value':json.dumps(value,ensure_ascii=False)}]}
