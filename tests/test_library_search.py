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

    def test_unmatched_query_can_check_semantics_without_inventing_results(self):
        response = Mock()
        response.json.return_value = {'choices':[{'message':{'content':'{"matches":[]}'}}]}
        request = Mock(return_value=response)
        self.assertEqual(search_scores('Unknown title', [{'id':'1','title':'Moon River'}], request=request)['ids'], [])

    def test_classified_genre_is_local(self):
        request = Mock(side_effect=AssertionError('unexpected model request'))
        items = [{'id':'1','title':'Sonata','category':'古典作品'}]
        self.assertEqual(search_scores('找古典作品', items, request=request)['ids'], ['1'])

    def test_timeout_preserves_results_and_is_bounded(self):
        import requests
        request = Mock(side_effect=requests.Timeout())
        result = search_scores('lyrical piano pieces', [{'id':'1','title':'Moon River'}], request=request)
        self.assertIn('时限', result['warning'])
        self.assertLessEqual(request.call_args.kwargs['timeout'][1], 75)
        self.assertEqual(request.call_count, 1)

class MalformedSearchTests(unittest.TestCase):
    def setUp(self): SEARCH_CACHE.clear()
    def test_invalid_match_shape_is_reported_without_crashing(self):
        response=Mock()
        response.json.return_value={'choices':[{'message':{'content':'{"matches":null}'}}]}
        result=search_scores('lyrical piano pieces',[{'id':'1','title':'Moon River'}],request=Mock(return_value=response))
        self.assertEqual(result['ids'],[])
        self.assertIn('warning',result)
    def test_http_error_without_response_is_reported(self):
        import requests
        result=search_scores('lyrical piano pieces',[{'id':'1','title':'Moon River'}],request=Mock(side_effect=requests.HTTPError('upstream')))
        self.assertEqual(result['ids'],[])
        self.assertIn('HTTP',result['warning'])

if __name__ == '__main__': unittest.main()
