import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Milestone G1: Supabase SQL migration & setup doc static analysis', () => {
  const sqlPath = path.resolve('supabase/migrations/0001_init.sql');
  const docPath = path.resolve('docs/supabase-setup.md');

  it('supabase/migrations/0001_init.sql exists and is non-empty', () => {
    assert.ok(fs.existsSync(sqlPath), '0001_init.sql must exist');
    const content = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(content.trim().length > 0, '0001_init.sql must not be empty');
  });

  it('number of "create table" statements equals "enable row level security" statements (both exactly 2, case-insensitive)', () => {
    const content = fs.readFileSync(sqlPath, 'utf8');
    const createTableMatches = content.match(/create\s+table/gi) ?? [];
    const rlsMatches = content.match(/enable\s+row\s+level\s+security/gi) ?? [];

    assert.strictEqual(
      createTableMatches.length,
      2,
      `Expected exactly 2 "create table" statements, found ${createTableMatches.length}`
    );
    assert.strictEqual(
      rlsMatches.length,
      2,
      `Expected exactly 2 "enable row level security" statements, found ${rlsMatches.length}`
    );
    assert.strictEqual(
      createTableMatches.length,
      rlsMatches.length,
      'Count of "create table" must equal "enable row level security"'
    );
  });

  it('contains exactly 5 "create policy" statements and every policy body references auth.uid()', () => {
    const content = fs.readFileSync(sqlPath, 'utf8');
    const createPolicyMatches = content.match(/create\s+policy\s+([a-zA-Z0-9_]+)\s+on\s+public\.([a-zA-Z0-9_]+)[\s\S]*?;/gi) ?? [];

    assert.strictEqual(
      createPolicyMatches.length,
      5,
      `Expected exactly 5 "create policy" statements, found ${createPolicyMatches.length}`
    );

    for (const policy of createPolicyMatches) {
      assert.ok(
        policy.includes('auth.uid()'),
        `Policy statement must reference auth.uid():\n${policy}`
      );
    }
  });

  it('contains "unique (owner, event_id)"', () => {
    const content = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(
      content.includes('unique (owner, event_id)'),
      'SQL must contain "unique (owner, event_id)"'
    );
  });

  it('does NOT contain "security definer" and does NOT contain "service_role" (case-insensitive)', () => {
    const content = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(
      !/security\s+definer/i.test(content),
      'SQL must not contain "security definer"'
    );
    assert.ok(
      !/service_role/i.test(content),
      'SQL must not contain "service_role"'
    );
  });

  it('contains at least 4 "revoke execute" statements, at least 4 "grant execute" statements, and at least 4 occurrences of "to authenticated"', () => {
    const content = fs.readFileSync(sqlPath, 'utf8');
    const revokeMatches = content.match(/revoke\s+execute/gi) ?? [];
    const grantMatches = content.match(/grant\s+execute/gi) ?? [];
    const toAuthMatches = content.match(/to\s+authenticated/gi) ?? [];

    assert.ok(
      revokeMatches.length >= 4,
      `Expected at least 4 "revoke execute" statements, found ${revokeMatches.length}`
    );
    assert.ok(
      grantMatches.length >= 4,
      `Expected at least 4 "grant execute" statements, found ${grantMatches.length}`
    );
    assert.ok(
      toAuthMatches.length >= 4,
      `Expected at least 4 occurrences of "to authenticated", found ${toAuthMatches.length}`
    );
  });

  it('contains the strings "accepted", "rejected", "retryable", "next_cursor" and "server_seq"', () => {
    const content = fs.readFileSync(sqlPath, 'utf8');
    const requiredStrings = ['accepted', 'rejected', 'retryable', 'next_cursor', 'server_seq'];
    for (const str of requiredStrings) {
      assert.ok(
        content.includes(str),
        `SQL must contain required string "${str}"`
      );
    }
  });

  it('docs/supabase-setup.md exists and does NOT contain "sb_secret" or "service_role" (case-insensitive)', () => {
    assert.ok(fs.existsSync(docPath), 'docs/supabase-setup.md must exist');
    const docContent = fs.readFileSync(docPath, 'utf8');
    assert.ok(
      !/sb_secret/i.test(docContent),
      'docs/supabase-setup.md must not contain "sb_secret"'
    );
    assert.ok(
      !/service_role/i.test(docContent),
      'docs/supabase-setup.md must not contain "service_role"'
    );
  });

  it('docs/supabase-setup.md mentions "0001_init.sql" and "Allow new users to sign up"', () => {
    const docContent = fs.readFileSync(docPath, 'utf8');
    assert.ok(
      docContent.includes('0001_init.sql'),
      'docs/supabase-setup.md must mention "0001_init.sql"'
    );
    assert.ok(
      docContent.includes('Allow new users to sign up'),
      'docs/supabase-setup.md must mention "Allow new users to sign up"'
    );
  });
});
