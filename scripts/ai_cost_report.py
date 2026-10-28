"""Offline USD estimates; never connects to Groq, Supabase, or any remote service."""
import argparse
import csv
import json
from decimal import Decimal

DEFAULT_RATES = {'input_per_million': '0.15', 'output_per_million': '0.60', 'audio_per_hour': '0.04'}


def estimate_interview(questions=5, seconds=60, input_tokens=2000, output_tokens=600,
                       summary_input=2500, summary_output=400, rates=None):
    rates = {k: Decimal(str(v)) for k, v in (rates or DEFAULT_RATES).items()}
    return ((questions * input_tokens + summary_input) * rates['input_per_million'] +
            (questions * output_tokens + summary_output) * rates['output_per_million']) / 1_000_000 + \
        questions * max(10, seconds) * rates['audio_per_hour'] / 3600


def summarize_csv(path):
    """Accept the aggregate export from docs/AI_MONITORING.sql; no user content."""
    with open(path, newline='', encoding='utf-8-sig') as handle:
        rows = list(csv.DictReader(handle))
    completed = [r for r in rows if r.get('status') == 'completed']
    known_cost = sum((Decimal(r.get('known_estimated_cost_usd') or '0') for r in completed), Decimal(0))
    missing = sum(int(r.get('requests_with_unknown_cost') or '0') for r in completed)
    return {'completed_interviews': len(completed), 'known_estimated_cost_usd': str(known_cost),
            'requests_with_unknown_cost': missing,
            'mean_cost_per_completed_interview_usd': str(known_cost / len(completed)) if completed and missing == 0 else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rates-json', help='Optional JSON rate overrides (public rates only)')
    parser.add_argument('--usage-csv', help='Optional administrative aggregate export')
    parser.add_argument('--interviews-per-day', type=int, default=10)
    args = parser.parse_args()
    if args.interviews_per_day < 0:
        parser.error('interviews-per-day must be nonnegative')
    rates = DEFAULT_RATES
    if args.rates_json:
        with open(args.rates_json, encoding='utf-8') as handle:
            rates = json.load(handle)
        if set(rates) != set(DEFAULT_RATES) or any(Decimal(str(v)) < 0 for v in rates.values()):
            parser.error('Provide all three nonnegative rates')
    cost = estimate_interview(rates=rates)
    result = {'basis': 'ESTIMATE: 5 static questions; 60 seconds audio each; 2000 input / 600 output tokens per answer; 2500 input / 400 output summary tokens; no retries, generation, caching discounts or taxes.',
              'rate_source': 'https://console.groq.com/docs/models', 'rates_verified_on': '2026-10-28' if not args.rates_json else None,
              'rates_usd': rates, 'estimated_cost_per_interview_usd': str(cost),
              'projections_usd': {str(n): str(cost * n) for n in [10, 100, 1000, 10000]},
              'interviews_per_day': args.interviews_per_day,
              'estimated_daily_usd': str(cost * args.interviews_per_day),
              'estimated_30_day_usd': str(cost * args.interviews_per_day * 30)}
    if args.usage_csv:
        result['collected_usage'] = summarize_csv(args.usage_csv)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
