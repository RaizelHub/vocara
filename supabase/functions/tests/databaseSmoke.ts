/** Isolated SQL smoke test, NOT a Supabase or multi-connection integration test.
 * Pinned test-only WASM PostgreSQL + actual pgTAP. No persistent database, network
 * calls, secrets, app dependency changes or real records. Auth/Storage bootstrap
 * is a minimal fixture; production service behavior must be tested separately.
 * deno run --no-config --no-lock --node-modules-dir=none --allow-read --allow-env=NODE_ENV --deny-net supabase/functions/tests/databaseSmoke.ts
 */
import { PGlite } from "npm:@electric-sql/pglite@0.5.12";
import { pgcrypto } from "npm:@electric-sql/pglite@0.5.12/contrib/pgcrypto";
import { pgtap } from "npm:@electric-sql/pglite-pgtap@0.0.13";

const db = new PGlite({ extensions: { pgcrypto, pgtap } });
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,
      owner_id text,metadata jsonb default '{}',created_at timestamptz default now());
    alter table storage.objects enable row level security;
    create function storage.filename(text) returns text language sql immutable as $$ select reverse(split_part(reverse($1),'/',1)) $$;
    create function storage.extension(text) returns text language sql immutable as $$ select reverse(split_part(reverse($1),'.',1)) $$;
    create function storage.foldername(text) returns text[] language sql immutable as $$
      select parts[1:array_length(parts,1)-1] from (select string_to_array($1,'/') parts) t
    $$;
    grant usage on schema auth,storage,extensions to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant all on all tables in schema storage to service_role;
    set search_path=public,extensions;
  `);
  const migrations: string[] = [];
  for await (const entry of Deno.readDir("supabase/migrations")) {
    if (entry.name.endsWith(".sql")) migrations.push(entry.name);
  }
  for (const name of migrations.sort()) {
    try {
      await db.exec(await Deno.readTextFile(`supabase/migrations/${name}`));
    } catch (error) {
      throw new Error(`Migration ${name}: ${(error as Error).message}`);
    }
    console.log(`Applied in memory: ${name}`);
  }
  let count = 0;
  for (const name of ["interview_reliability.test.sql", "ai_usage.test.sql", "privacy.test.sql", "retention.test.sql"]) {
    const results = await db.exec(
      await Deno.readTextFile(`supabase/tests/database/${name}`),
    );
    const lines = results.flatMap((result) =>
      result.rows.flatMap((row) =>
        Object.values(row as Record<string, unknown>)
      )
    )
      .filter((value): value is string =>
        typeof value === "string" && /^(ok |not ok |#|\d+\.\.)/.test(value)
      );
    console.log(`${name}:\n${lines.join("\n")}`);
    if (lines.some((line) => /^not ok |^# Looks like/.test(line))) {
      throw new Error(`${name} failed`);
    }
    count += lines.filter((line) => /^ok /.test(line)).length;
  }
  console.log(
    `PASS: ${migrations.length} migrations and ${count} pgTAP assertions in isolated single-connection PostgreSQL. Supabase/real concurrency validation remains required.`,
  );
} catch (error) {
  const detail = error as {message?:string;where?:string};
  console.error(detail.message, detail.where);
  throw error;
} finally {
  await db.close();
}
