import csv
from decimal import Decimal
import tempfile
import unittest
from ai_cost_report import estimate_interview, summarize_csv


class CostReportTests(unittest.TestCase):
    def test_scenario(self):
        self.assertAlmostEqual(estimate_interview(), Decimal('0.007248333333333333333333333333'))

    def test_minimum_billed_audio(self):
        self.assertEqual(estimate_interview(seconds=1), estimate_interview(seconds=10))

    def test_unknown_cost_is_not_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            path = directory + '/synthetic.csv'
            with open(path, 'w', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=['status', 'known_estimated_cost_usd', 'requests_with_unknown_cost'])
                writer.writeheader()
                writer.writerow({'status': 'completed', 'known_estimated_cost_usd': '0.01', 'requests_with_unknown_cost': '1'})
            self.assertIsNone(summarize_csv(path)['mean_cost_per_completed_interview_usd'])


if __name__ == '__main__':
    unittest.main()
