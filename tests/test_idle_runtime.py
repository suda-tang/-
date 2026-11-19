import unittest
from unittest.mock import patch
import idle_runtime

class IdleRuntimeTest(unittest.TestCase):
 def test_foreground_never_blocks_background(self):
  with patch.object(idle_runtime,'busy',side_effect=[True,True,False]),patch.object(idle_runtime.time,'sleep') as sleep:
   idle_runtime.checkpoint()
   sleep.assert_not_called()
 def test_no_wait_when_idle(self):
  with patch.object(idle_runtime,'busy',return_value=False),patch.object(idle_runtime.time,'sleep') as sleep:
   idle_runtime.checkpoint();sleep.assert_not_called()
