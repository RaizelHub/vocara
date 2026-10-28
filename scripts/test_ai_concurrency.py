"""Real multi-connection checks on disposable 127.0.0.1:54322 ONLY. No Groq calls."""
import shutil
import uuid
from test_interview_concurrency import sql, race, start, questions


def main():
    if not shutil.which('psql'):
        raise SystemExit('psql is required; use a disposable local Supabase stack.')
    users = [str(uuid.uuid4()) for _ in range(2)]
    settings = sql('select max_active,requests_per_minute from public.ai_capacity_settings;').stdout.strip().split('|')
    assert len(settings) == 2 and all(value.isdigit() for value in settings)
    answers = []
    try:
        sql('update public.ai_capacity_settings set max_active=1,requests_per_minute=10000;')
        for uid in users:
            sid = str(uuid.uuid4()); qs = questions(1); aid = str(uuid.uuid4())
            sql(f"insert into auth.users(id,email) values('{uid}','{uid}@example.invalid');")
            sql(start(uid, sid, qs))
            sql(f"insert into public.interview_answers(id,user_id,session_id,question_id,audio_path,duration_seconds,audio_generation) values('{aid}','{uid}','{sid}','{qs[0]['id']}','synthetic.m4a',60,1);")
            answers.append(aid)
        operations = [str(uuid.uuid4()) for _ in users]
        statements = [f"select public.claim_answer_transcription('{aid}','{uid}','{op}');" for uid, aid, op in zip(users, answers, operations)]
        result = race(statements)
        assert sum(r.returncode == 0 for r in result) == 1, [r.stderr for r in result]
        loser = next(i for i, r in enumerate(result) if r.returncode)
        winner = 1 - loser
        assert 'AI_CAPACITY_BUSY' in result[loser].stderr
        assert sql(f"select transcription_attempt_count from public.interview_answers where id='{answers[loser]}';").stdout.strip() == '0'
        uid, op = users[winner], operations[winner]
        # Two simultaneous fetch authorizations for the same claim: exactly one wins.
        record = f"select public.record_ai_provider('transcription_requests','{op}','{uid}','{{\"provider_status\":\"sent\",\"model\":\"whisper-large-v3-turbo\",\"audio_seconds\":60}}');"
        duplicate = race([record, record])
        assert sum(r.returncode == 0 for r in duplicate) == 1
        assert any('AI_PROVIDER_ALREADY_SENT' in r.stderr for r in duplicate)
        print('PASS: concurrent global capacity, rollback of rejected retry, duplicate provider dispatch')
    finally:
        for uid in users:
            sql(f"delete from auth.users where id='{uid}';")
        sql(f'update public.ai_capacity_settings set max_active={settings[0]},requests_per_minute={settings[1]};')


if __name__ == '__main__':
    main()
