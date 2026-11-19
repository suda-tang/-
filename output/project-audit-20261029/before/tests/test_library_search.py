import unittest
from unittest.mock import Mock
from library_classification import search_scores, SEARCH_CACHE

class LibrarySearchTests(unittest.TestCase):
    def setUp(self): SEARCH_CACHE.clear()

    def test_normal_library_uses_one_request(self):
        items = [{'id': str(i), 'title': f'Song {i}'} for i in range(1, 126)]
        response = Mock()
        response.json.return_value = {'choices': [{'message': {'content': '{"matches":["score125"]}'}}]}
        request = Mock(return_value=response)
        self.assertEqual(search_scores('lyrical piano pieces', items, request=request)['ids'], ['125'])
        self.assertEqual(request.call_count, 1)
        search_scores('lyrical piano pieces', items, request=request)
        self.assertEqual(request.call_count, 1)

    def test_title_does_not_wait_for_model(self):
        request = Mock(side_effect=AssertionError('unexpected model request'))
        self.assertEqual(search_scores('Moon', [{'id':'1','title':'Moon River'}], request=request)['ids'], ['1'])

    def test_unmatched_title_never_calls_model(self):
        request = Mock(side_effect=AssertionError('unexpected model request'))
        self.assertEqual(search_scores('Unknown title', [{'id':'1','title':'Moon River'}], request=request)['ids'], [])

    def test_classified_genre_is_local(self):
        request = Mock(side_effect=AssertionError('unexpected model request'))
        items = [{'id':'1','title':'Sonata','category':'古典作品'}]
        self.assertEqual(search_scores('找古典作品', items, request=request)['ids'], ['1'])

    def test_timeout_preserves_results_and_is_bounded(self):
        import requests
        request = Mock(side_effect=requests.Timeout())
        result = search_scores('lyrical piano pieces', [{'id':'1','title':'Moon River'}], request=request)
        self.assertIn('8 秒', result['warning'])
        self.assertLessEqual(request.call_args.kwargs['timeout'][1], 8)
        self.assertEqual(request.call_count, 1)

if __name__ == '__main__': unittest.main()
