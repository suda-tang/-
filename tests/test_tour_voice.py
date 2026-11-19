import unittest
from unittest.mock import patch
import tour_voice as voice

class VoicePriorityTests(unittest.TestCase):
 def tearDown(self):
  voice.MEMORY.clear();voice.ERRORS.clear();voice.STAGES.clear()
 def test_neural_voice_is_primary_without_starting_online_fallback(self):
  key=voice.key('测试自然朗读')
  with patch('classroom_voice.available',return_value=True),patch('classroom_voice.stream',return_value=iter([b'ID3'+b'x'*2000])) as stream,patch.object(voice.subprocess,'Popen') as fallback:
   voice.generate('测试自然朗读',key)
  self.assertEqual(voice.MEMORY[key]['provider'],'kokoro-cpu');self.assertTrue(voice.MEMORY[key]['done']);self.assertIsNone(voice.MEMORY[key]['error']);fallback.assert_not_called();stream.assert_called_once_with('测试自然朗读','teacher')
 def test_guide_voice_identity_is_separate(self):
  self.assertNotEqual(voice.key('同一句话',role='narrator'),voice.key('同一句话',role='teacher'))
  self.assertEqual(voice.VOICES['zh'],'zh-CN-YunxiNeural')
 def test_student_voice_uses_separate_audio_identity(self):
  self.assertNotEqual(voice.key('同一句话',role='teacher'),voice.key('同一句话',role='student'))
  key=voice.key('同一句话',role='student')
  with patch('classroom_voice.available',return_value=True),patch('classroom_voice.stream',return_value=iter([b'ID3'+b'x'*2000])) as stream:
   voice.generate('同一句话',key,role='student')
  stream.assert_called_once_with('同一句话','student')
 def test_streaming_preserves_all_chunks(self):
  key=voice.key('第一句。第二句。')
  chunks=[b'ID3'+b'a'*1100,b'b'*1200]
  with patch('classroom_voice.available',return_value=True),patch('classroom_voice.stream',return_value=iter(chunks)):
   voice.generate('第一句。第二句。',key)
  self.assertEqual(bytes(voice.MEMORY[key]['audio']),b''.join(chunks))

if __name__=='__main__':unittest.main()
