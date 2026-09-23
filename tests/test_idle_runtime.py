import unittest
from unittest.mock import patch
import idle_runtime

class IdleRuntimeTest(unittest.TestCase):
 def test_checkpoint_yields_then_resumes(self):
  with patch.object(idle_runtime,'busy',side_effect=[True,True,False]),patch.object(idle_runtime.time,'sleep') as sleep:
   idle_runtime.checkpoint()
   self.assertEqual(sleep.call_count,2)
 def test_no_wait_when_idle(self):
  with patch.object(idle_runtime,'busy',return_value=False),patch.object(idle_runtime.time,'sleep') as sleep:
   idle_runtime.checkpoint();sleep.assert_not_called()
