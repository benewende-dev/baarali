import type pg from 'pg';

// The control plane's Postgres (architecture §3.5; data model §2): its own
// `baarali` schema, with its own migration ladder, never Harbor's tables
// (UPSTREAM.md §2). Every statement names the schema, so nothing can land
// in another one by accident.

export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

/** A connection that can also run a transaction. */
export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

export function poolDb(pool: pg.Pool): Db {
  return {
    query: async <R>(text: string, params?: unknown[]) => {
      const res = await pool.query(text, params);
      return { rows: res.rows as R[] };
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: async <R>(text: string, params?: unknown[]) => ({ rows: (await client.query(text, params)).rows as R[] }),
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/**
 * Append only: a migration once deployed is never edited, the next change is
 * a new entry. Numbered from 1, applied in order, each in its own transaction.
 */
export const MIGRATIONS: string[] = [
  // 1 — accounts, quota, usage and media credits (decided 01/10/2026), the
  // in-memory store of phase 0 made durable. Plans stay in code (catalog.ts).
  `
  CREATE TABLE baarali.accounts (
    id text PRIMARY KEY,
    email text,
    plan_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  -- Bearer tokens, by SHA-256 only (security H12).
  CREATE TABLE baarali.access_tokens (
    token_hash text PRIMARY KEY,
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE baarali.quota_states (
    account_id text PRIMARY KEY REFERENCES baarali.accounts(id),
    session_start timestamptz,
    session_used bigint NOT NULL,
    week_start timestamptz NOT NULL,
    week_used bigint NOT NULL
  );

  CREATE TABLE baarali.usage_records (
    id bigserial PRIMARY KEY,
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    at timestamptz NOT NULL,
    path text NOT NULL,
    model text,
    requested_model text,
    status integer NOT NULL,
    credits bigint NOT NULL,
    estimated boolean NOT NULL,
    use_case text,
    agent_name text
  );
  CREATE INDEX usage_records_account_at ON baarali.usage_records (account_id, at);

  CREATE TABLE baarali.media_jobs (
    id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    model text NOT NULL,
    credits integer NOT NULL,
    charge_ref text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    url text,
    refunded boolean NOT NULL DEFAULT false
  );

  -- Append only, like every ledger (data model §1).
  CREATE TABLE baarali.media_ledger (
    id bigserial PRIMARY KEY,
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    at timestamptz NOT NULL,
    kind text NOT NULL CHECK (kind IN ('topup', 'charge', 'refund')),
    credits integer NOT NULL,
    reference text NOT NULL,
    UNIQUE (kind, reference)
  );
  CREATE INDEX media_ledger_account ON baarali.media_ledger (account_id);
  CREATE FUNCTION baarali.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '% is append only', TG_TABLE_NAME; END $$;
  CREATE TRIGGER media_ledger_append_only BEFORE UPDATE OR DELETE ON baarali.media_ledger
    FOR EACH ROW EXECUTE FUNCTION baarali.refuse_change();
  `,
  // 2 — sign-in codes (security §4.1, decided 01/10/2026): every send is
  // counted, to cap them per number or address; phone codes are kept hashed.
  // Better Auth's own tables are created by its migrator, in this schema too.
  `
  CREATE TABLE baarali.code_sends (
    id bigserial PRIMARY KEY,
    identifier text NOT NULL,
    at timestamptz NOT NULL
  );
  CREATE INDEX code_sends_identifier_at ON baarali.code_sends (identifier, at);

  CREATE TABLE baarali.phone_codes (
    phone_e164 text PRIMARY KEY,
    code_hash text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL
  );
  `,
  // 3 — one instance per account, reached through the control plane
  // (decided 01/10/2026; architecture §3.5 « Instances », security §2).
  // `user_id`: the sign-in user an account answers to, when it is not the
  // account's own id (the owner's account predates the sign-in server).
  // A device holds a key of its own, never the instance's: kept by hash,
  // revoked one by one.
  `
  ALTER TABLE baarali.accounts ADD COLUMN user_id text UNIQUE;

  CREATE TABLE baarali.instances (
    account_id text PRIMARY KEY REFERENCES baarali.accounts(id),
    app text NOT NULL,
    machine_id text,
    volume_id text,
    image text,
    managed boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE baarali.devices (
    id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    key_hash text NOT NULL UNIQUE,
    name text NOT NULL,
    created_at timestamptz NOT NULL,
    last_seen_at timestamptz,
    revoked_at timestamptz
  );
  CREATE INDEX devices_account ON baarali.devices (account_id);
  `,
  // 4 — the admin console (decided 03/10/2026): an account can be suspended
  // (its tokens stop opening /v1), and every console action is written down,
  // append only like the media ledger.
  `
  ALTER TABLE baarali.accounts ADD COLUMN suspended_at timestamptz;

  CREATE TABLE baarali.admin_log (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    account_id text,
    detail text NOT NULL DEFAULT ''
  );
  CREATE INDEX admin_log_at ON baarali.admin_log (at);
  CREATE INDEX admin_log_account ON baarali.admin_log (account_id, at);
  CREATE TRIGGER admin_log_append_only BEFORE UPDATE OR DELETE ON baarali.admin_log
    FOR EACH ROW EXECUTE FUNCTION baarali.refuse_change();
  `,
  // 5 — the models each plan sees, set from the admin console (decided
  // 03/10/2026). A row exists once the owner touched the model.
  `
  CREATE TABLE baarali.model_settings (
    model_id text PRIMARY KEY,
    enabled boolean NOT NULL,
    min_plan text,
    recommended boolean NOT NULL DEFAULT false,
    strength text,
    free_rank integer,
    updated_at timestamptz NOT NULL
  );
  `,
  // 6 — instance keys get generations (05/10/2026): the first ones were
  // seen in screenshots, so they change; every machine so far runs the first.
  `
  ALTER TABLE baarali.instances ADD COLUMN keys integer NOT NULL DEFAULT 1;
  `,
  // 7 — announcements (decided 07/10/2026): the banner at the top of the
  // Chat, written in the admin console. Events count each person once per
  // kind; a dismiss keeps the banner closed for that account.
  `
  CREATE TABLE baarali.announcements (
    id text PRIMARY KEY,
    text text NOT NULL,
    button text,
    target text NOT NULL CHECK (target IN ('none', 'plans', 'usage', 'voice', 'link')),
    link text,
    audience text NOT NULL CHECK (audience IN ('all', 'free', 'paid')),
    tone text NOT NULL CHECK (tone IN ('info', 'important')),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    created_by text NOT NULL,
    removed_at timestamptz
  );

  CREATE TABLE baarali.announcement_events (
    announcement_id text NOT NULL REFERENCES baarali.announcements(id),
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    kind text NOT NULL CHECK (kind IN ('view', 'click', 'dismiss')),
    at timestamptz NOT NULL,
    PRIMARY KEY (announcement_id, account_id, kind)
  );
  `,
  // 8 — Notifications (07/10/2026): a message from the admin console, each
  // person's copy with its read and click, and the email opt-out.
  `
  ALTER TABLE baarali.accounts ADD COLUMN email_opt_out_at timestamptz;

  CREATE TABLE baarali.notifications (
    id text PRIMARY KEY,
    title text NOT NULL,
    body text NOT NULL,
    button text,
    target text NOT NULL CHECK (target IN ('none', 'chat', 'plans', 'usage', 'link')),
    link text,
    audience text NOT NULL CHECK (audience IN ('all', 'free', 'paid', 'limit', 'inactive', 'account')),
    account_id text REFERENCES baarali.accounts(id),
    app boolean NOT NULL,
    email boolean NOT NULL,
    send_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    created_by text NOT NULL,
    sent_at timestamptz,
    cancelled_at timestamptz,
    test boolean NOT NULL DEFAULT false
  );

  CREATE TABLE baarali.notification_deliveries (
    notification_id text NOT NULL REFERENCES baarali.notifications(id),
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    delivered_at timestamptz NOT NULL,
    emailed_at timestamptz,
    read_at timestamptz,
    clicked_at timestamptz,
    PRIMARY KEY (notification_id, account_id)
  );
  CREATE INDEX notification_deliveries_account ON baarali.notification_deliveries (account_id, delivered_at DESC);
  `,
  // 9 — automatic messages (07/10/2026): a switch per kind set from the
  // console, and one row per message sent, so each leaves once per period.
  `
  CREATE TABLE baarali.auto_message_settings (
    kind text PRIMARY KEY,
    enabled boolean NOT NULL,
    updated_at timestamptz NOT NULL
  );

  CREATE TABLE baarali.auto_message_sends (
    kind text NOT NULL,
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    period text NOT NULL,
    at timestamptz NOT NULL,
    PRIMARY KEY (kind, account_id, period)
  );
  `,
  // 10 — the partner programme (07/10/2026): partners and their link's
  // clicks, the people they bring, the plans offered to those people, and
  // each payment's commission until it is paid out by mobile money.
  `
  CREATE TABLE baarali.partner_program (
    id integer PRIMARY KEY CHECK (id = 1),
    rules jsonb NOT NULL,
    updated_at timestamptz NOT NULL
  );

  CREATE TABLE baarali.partners (
    id text PRIMARY KEY,
    name text NOT NULL,
    code text NOT NULL UNIQUE,
    network text,
    city text,
    account_id text UNIQUE REFERENCES baarali.accounts(id),
    status text NOT NULL CHECK (status IN ('active', 'paused')),
    created_at timestamptz NOT NULL,
    created_by text NOT NULL,
    payout_method text CHECK (payout_method IN ('orange', 'wave', 'moov', 'mtn')),
    payout_number text
  );

  CREATE TABLE baarali.partner_clicks (
    partner_id text NOT NULL REFERENCES baarali.partners(id),
    day date NOT NULL,
    clicks integer NOT NULL,
    PRIMARY KEY (partner_id, day)
  );

  CREATE TABLE baarali.referrals (
    account_id text PRIMARY KEY REFERENCES baarali.accounts(id),
    partner_id text NOT NULL REFERENCES baarali.partners(id),
    at timestamptz NOT NULL,
    via text NOT NULL CHECK (via IN ('link', 'code'))
  );
  CREATE INDEX referrals_partner ON baarali.referrals (partner_id);

  CREATE TABLE baarali.gifts (
    id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    plan_id text NOT NULL,
    previous_plan_id text NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    reason text NOT NULL,
    ended_at timestamptz
  );
  CREATE INDEX gifts_open ON baarali.gifts (ends_at) WHERE ended_at IS NULL;

  CREATE TABLE baarali.partner_payouts (
    id text PRIMARY KEY,
    partner_id text NOT NULL REFERENCES baarali.partners(id),
    amount_xof bigint NOT NULL,
    method text NOT NULL,
    number text NOT NULL,
    reference text NOT NULL,
    at timestamptz NOT NULL,
    by text NOT NULL
  );

  CREATE TABLE baarali.commissions (
    id text PRIMARY KEY,
    partner_id text NOT NULL REFERENCES baarali.partners(id),
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    paid_at timestamptz NOT NULL,
    amount_xof bigint NOT NULL,
    rate numeric NOT NULL,
    commission_xof bigint NOT NULL,
    payable_at timestamptz NOT NULL,
    payout_id text REFERENCES baarali.partner_payouts(id)
  );
  CREATE INDEX commissions_partner ON baarali.commissions (partner_id);
  `,
  // 11 — applications to the partner programme (07/10/2026), from its public
  // page; one waiting per email.
  `
  CREATE TABLE baarali.partner_applications (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    network text NOT NULL,
    profile text NOT NULL,
    audience text NOT NULL,
    city text,
    message text,
    created_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('new', 'accepted', 'declined')),
    decided_at timestamptz,
    decided_by text
  );
  CREATE UNIQUE INDEX partner_applications_waiting ON baarali.partner_applications (email) WHERE status = 'new';

  ALTER TABLE baarali.partners ADD COLUMN email text;
  `,
  // 12 — Studio Motion exports (08/10/2026): the plan's minutes they used,
  // the credits they cost, refunded together when an export fails.
  `
  CREATE TABLE baarali.motion_renders (
    id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES baarali.accounts(id),
    at timestamptz NOT NULL,
    format text NOT NULL,
    fps integer NOT NULL,
    seconds integer NOT NULL,
    included integer NOT NULL,
    credits integer NOT NULL,
    charge_ref text NOT NULL,
    status text NOT NULL CHECK (status IN ('rendering', 'done', 'failed')),
    machine text,
    refunded boolean NOT NULL DEFAULT false,
    error text
  );
  CREATE INDEX motion_renders_account ON baarali.motion_renders (account_id, at);
  `,
  // 13 — The app's sidebar as the admin console published it (09/10/2026):
  // one row at most, gone when the console goes back to the default.
  `
  CREATE TABLE baarali.sidebar_layout (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    layout jsonb NOT NULL,
    published_at timestamptz NOT NULL,
    published_by text NOT NULL
  );
  `,
];

/** Brings the schema up to date. Safe on several machines at once: the lock serializes them. */
export async function migrate(db: Db): Promise<number> {
  // The product was renamed Baarali on 01/10/2026; its schema was `warell`.
  // Renamed in place, data and all, the first time a new version starts.
  // Triggers point to their function, not its name: nothing else to redo.
  await db.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'warell')
       AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'baarali') THEN
      ALTER SCHEMA warell RENAME TO baarali;
    END IF;
  END $$`);
  await db.query('CREATE SCHEMA IF NOT EXISTS baarali');
  await db.query(
    'CREATE TABLE IF NOT EXISTS baarali.schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  let applied = 0;
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    const done = await db.transaction(async (tx) => {
      // Arbitrary constant: one lock for this ladder, released at commit.
      await tx.query('SELECT pg_advisory_xact_lock(7262011)');
      const { rows } = await tx.query('SELECT 1 FROM baarali.schema_migrations WHERE version = $1', [version]);
      if (rows.length > 0) return false;
      await tx.query(MIGRATIONS[i]);
      await tx.query('INSERT INTO baarali.schema_migrations (version) VALUES ($1)', [version]);
      return true;
    });
    if (done) applied++;
  }
  return applied;
}
