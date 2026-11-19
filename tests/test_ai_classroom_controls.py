import json
import unittest
from ai_classroom_controls import classroom_controls
from ai_workspace import action_value
class ClassroomControlsTests(unittest.TestCase):
    def plan(self,text,context=None):
        return classroom_controls({'messages':[{'role':'user','content':text}],'context':context or {'currentId':'id','current':'突然好想你'}})
    def test_current_piece_whole_course(self):
        action=self.plan('为这首作品生成高中鉴赏课PPT，45分钟，全曲')['actions'][0]
        self.assertEqual(action['type'],'create_classroom')
        settings=json.loads(action_value(action))
        self.assertEqual(settings['scope'],'whole')
        self.assertEqual(settings['schoolStage'],'senior')
        self.assertEqual(settings['mode'],'classroom')
    def test_follow_up_stage_change(self):
        settings=json.loads(self.plan('改为初中学生，生成35分钟的音乐课PPT')['actions'][0]['value'])
        self.assertEqual(settings['schoolStage'],'junior')
        self.assertEqual(settings['duration'],'35')
    def test_no_score_requires_selection(self):
        result=self.plan('生成小学音乐课PPT',{'scores':[]})
        self.assertEqual(result['actions'],[{'type':'panel','value':'library'}])
    def test_no_wrong_piece_or_unrequested_generation(self):
        for text in ('不要生成PPT','如何制作音乐课PPT','为《致爱丽丝》生成PPT'):
            self.assertIsNone(self.plan(text))
    def test_dont_play_can_still_prepare(self):
        self.assertIsNotNone(self.plan('不要播放，生成这首作品的音乐课PPT'))
    def test_everyday_lesson_preparation_requests(self):
        for text in ('把这节课备课一下','把这节课PPT做一下','帮我备课','准备一下这节课','把教案写一下','帮我做一下这首曲子的课件'):
            self.assertEqual(self.plan(text)['actions'][0]['type'],'create_classroom',text)
    def test_existing_lesson_is_opened_instead_of_duplicate_generation(self):
        context={'currentId':'id','current':'突然好想你','classroom':{'id':'course','scoreId':'id','status':'generating','settings':{'schoolStage':'junior','duration':35}}}
        result=self.plan('把这节课PPT做一下',context)
        self.assertEqual([a['value']['operation'] for a in result['actions']],['open','status'])
    def test_classroom_settings_are_inherited_only_for_the_same_score(self):
        context={'currentId':'id','current':'突然好想你','classroom':{'scoreId':'id','settings':{'schoolStage':'junior','duration':35,'goal':'初中音乐聆听与讨论'}}}
        value=json.loads(self.plan('把这节课备课一下',context)['actions'][0]['value'])
        self.assertEqual(value['schoolStage'],'junior');self.assertEqual(value['duration'],35)
        context['classroom']['scoreId']='other'
        value=json.loads(self.plan('把这节课备课一下',context)['actions'][0]['value'])
        self.assertEqual(value['schoolStage'],'senior');self.assertNotIn('duration',value)
    def test_compound_request_is_not_partially_consumed(self):
        self.assertIsNone(self.plan('生成PPT，然后播放钢琴'))

class TeacherTransportTests(unittest.TestCase):
    def test_explicit_measure_is_never_dropped(self):
        from ai_direct_controls import direct_controls
        context={'currentId':'id','measureCount':74,'parts':[{'value':'piano','name':'钢琴'}]}
        for text in ('从第5小节只播放钢琴','从第37小节开始播放钢琴'):
            actions=direct_controls(text,context)['actions']
            self.assertEqual([a['type'] for a in actions],['solo','seek_measure','play'])
    def test_invalid_or_compound_goes_to_model(self):
        from ai_direct_controls import direct_controls
        context={'currentId':'id','measureCount':74,'parts':[{'value':'piano','name':'钢琴'}]}
        for text in ('从第99小节只播放钢琴','从第5小节只播放钢琴，并分析和弦'):
            self.assertIsNone(direct_controls(text,context))
    def test_now_play_is_direct(self):
        from ai_direct_controls import direct_controls
        self.assertEqual(direct_controls('现在开始播放',{'currentId':'id'})['actions'],[{'type':'play','value':''}])

class ClassroomAgentContractTests(unittest.TestCase):
    def test_classroom_command_json_round_trip(self):
        from ai_workspace import action_value
        payload={'operation':'goto_slide','page':2}
        self.assertEqual(json.loads(action_value({'type':'classroom','value':payload})),payload)
    def test_unregistered_operation_is_rejected(self):
        from ai_workspace import action_value
        with self.assertRaises(ValueError):
            action_value({'type':'classroom','value':{'operation':'arbitrary_script'}})

class ClassroomRoutingTests(unittest.TestCase):
    def test_classroom_measure_range_is_not_transport(self):
        from ai_workspace import fast_plan
        context={'currentId':'id','measureCount':74,'parts':[{'value':'piano','name':'钢琴'}]}
        self.assertIsNone(fast_plan({'messages':[{'role':'user','content':'将课堂范围设为第1到4小节，不要重新生成'}],'context':context}))
