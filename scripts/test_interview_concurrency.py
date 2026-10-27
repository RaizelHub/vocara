"""Integration tests against ONLY the disposable Supabase local DB (127.0.0.1:54322).

Requires psql on PATH and migrations applied. No external connections, Groq calls,
or real accounts. Each test uses a random synthetic user, removed in finally.
Run: python scripts/test_interview_concurrency.py
"""
import concurrent.futures
import json
import os
import shutil
import subprocess
import threading
import uuid


def sql(statement, check=True):
    result = subprocess.run(
        ["psql", "-X", "-w", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres",
         "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"],
        input=statement, text=True, capture_output=True, timeout=30,
        env={**os.environ, "PGPASSWORD": "postgres", "PGSSLMODE": "disable"},
    )
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


def start(uid, sid, questions):
    payload = json.dumps(questions)
    return (f"begin; set local role authenticated; select set_config('request.jwt.claim.sub','{uid}',true);"
            f"select id from public.create_reserved_interview('{sid}','Developer','standard',"
            f"'intermediate','balanced','{payload}'::jsonb); select pg_sleep(0.25); commit;")


def questions(count):
    return [{"id": str(uuid.uuid4()), "text": f"Synthetic question {n}"} for n in range(count)]


def race(statements):
    barrier = threading.Barrier(len(statements))
    def run(statement):
        barrier.wait(timeout=10)
        return sql(statement, check=False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(statements)) as executor:
        return list(executor.map(run, statements))


def usage(uid):
    return int(sql(f"select coalesce(sum(usage_count),0) from public.feature_usage where user_id='{uid}' and feature='ai_feedback';").stdout.strip())


def main():
    if not shutil.which("psql"):
        raise SystemExit("psql is required; start a disposable local Supabase stack and add PostgreSQL client tools to PATH.")
    uid = str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{uid}','{uid}@example.invalid');")
    try:
        too_large = sql(start(uid, str(uuid.uuid4()), questions(6)), check=False)
        assert too_large.returncode and "VOCARA_FEATURE_LIMIT_REACHED" in too_large.stderr
        assert usage(uid) == 0, "partial reservation must roll back"
        result = race([start(uid, str(uuid.uuid4()), questions(3)) for _ in range(2)])
        assert sum(r.returncode == 0 for r in result) == 1, [r.stderr for r in result]
        assert any("VOCARA_FEATURE_LIMIT_REACHED" in r.stderr for r in result)
        assert usage(uid) == 3, "concurrent starts must not overspend"
        sid = str(uuid.uuid4())
        statement = start(uid, sid, questions(2))
        result = race([statement, statement])
        assert all(r.returncode == 0 for r in result), [r.stderr for r in result]
        assert usage(uid) == 5, "concurrent duplicate starts must charge once"
        assert sql(statement, check=False).returncode == 0, "lost response retry must succeed at zero allowance"
        assert usage(uid) == 5
        # A different consumer shares the same server lock and allowance.
        competing = sql(f"select public.check_feature_access('{uid}','ai_feedback','synthetic-speaking');", check=False)
        assert competing.returncode and "VOCARA_FEATURE_LIMIT_REACHED" in competing.stderr
        assert usage(uid) == 5
        print("PASS: atomic rollback, concurrent boundary, duplicate starts, lost response, shared allowance")
    finally:
        sql(f"delete from auth.users where id='{uid}';")


if __name__ == "__main__":
    main()
