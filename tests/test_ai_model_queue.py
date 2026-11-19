import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch
import ai_workspace as ai


class ModelQueueTests(unittest.TestCase):
    def test_six_requests_never_overlap_and_release_after_error(self):
        lock = threading.Lock()
        active = peak = 0
        @ai.serialized_model
        def request(i):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            try:
                time.sleep(.01)
                if i == 2:
                    raise ValueError('upstream failed')
                return i
            finally:
                with lock:
                    active -= 1
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = [pool.submit(request,i) for i in range(6)]
            for i,future in enumerate(futures):
                if i == 2:
                    with self.assertRaises(ValueError):future.result()
                else:self.assertEqual(future.result(),i)
        self.assertEqual(peak,1)
        self.assertEqual(request(7),7)

    def test_workspace_explicitly_disables_gateway_tools(self):
        response=Mock()
        response.json.return_value={'choices':[{'message':{'content':'{"reply":"好的","actions":[]}'}}]}
        with patch('ai_workspace.requests.post',return_value=response) as post:
            ai.recover_model_plan([], '说明和弦')
        self.assertEqual(post.call_args.kwargs['json']['tools'],[])
        self.assertEqual(post.call_args.kwargs['json']['tool_choice'],'none')

if __name__=='__main__':unittest.main()
