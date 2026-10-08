import type { Announcement, AnnouncementEvent, AnnouncementStats } from './announcements.js';
import { isStrength, type ModelSetting } from './model-access.js';
import type { AutoKind } from './auto-messages.js';
import type { Commission, Gift, Partner, PartnerApplication, PartnerStatus, Payout, PayoutMethod, ProgramRules, Referral } from './partners.js';
import { AUTO_AUTHOR, type Delivery, type Notice, type NoticeEvent, type NoticeStats } from './notifications.js';
import type { Db, Queryable } from './db.js';
import type { QuotaState } from './quota.js';
import {
  hashToken,
  type Account,
  type AccountSummary,
  type AdminLogEntry,
  type ControlStore,
  type Device,
  type InstanceRecord,
  type LedgerResult,
  type MediaJob,
  type MediaHistoryEntry,
  type MediaLedgerEntry,
  type Plan,
  type UsageRecord,
} from './store.js';

// The durable store (decided 01/10/2026): what phase 0 kept in memory, in the
// `baarali` schema (db.ts). Plans stay in code, priced by catalog.ts.

const ms = (d: Date | null): number | null => (d === null ? null : d.getTime());
const date = (t: number | null): Date | null => (t === null ? null : new Date(t));

const PARTNER_COLUMNS = 'id, name, code, network, city, account_id, email, status, created_at, created_by, payout_method, payout_number';
interface PartnerRow {
  id: string;
  name: string;
  code: string;
  network: string | null;
  city: string | null;
  account_id: string | null;
  email: string | null;
  status: PartnerStatus;
  created_at: Date;
  created_by: string;
  payout_method: PayoutMethod | null;
  payout_number: string | null;
}
const toPartner = (r: PartnerRow): Partner => ({
  id: r.id, name: r.name, code: r.code, network: r.network, city: r.city, accountId: r.account_id, email: r.email, status: r.status,
  createdAt: r.created_at.getTime(), createdBy: r.created_by, payoutMethod: r.payout_method, payoutNumber: r.payout_number,
});
// pg returns bigint columns as strings: they hold credits, safe as numbers.
const num = (v: unknown): number => Number(v);

interface AccountRow {
  id: string;
  email: string | null;
  plan_id: string;
  created_at: Date;
  suspended_at: Date | null;
  email_opt_out_at: Date | null;
}

const ACCOUNT_COLUMNS = 'a.id, a.email, a.plan_id, a.created_at, a.suspended_at, a.email_opt_out_at';

interface DeviceRow {
  id: string;
  account_id: string;
  name: string;
  created_at: Date;
  last_seen_at: Date | null;
  revoked_at: Date | null;
}

const DEVICE_COLUMNS = 'id, account_id, name, created_at, last_seen_at, revoked_at';

const toDevice = (r: DeviceRow): Device => ({
  id: r.id,
  accountId: r.account_id,
  name: r.name,
  createdAt: r.created_at.getTime(),
  lastSeenAt: ms(r.last_seen_at),
  revokedAt: ms(r.revoked_at),
});

const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  email: r.email,
  planId: r.plan_id,
  createdAt: r.created_at.getTime(),
  ...(r.suspended_at ? { suspendedAt: r.suspended_at.getTime() } : {}),
  ...(r.email_opt_out_at ? { emailOptOutAt: new Date(r.email_opt_out_at).getTime() } : {}),
});

interface NoticeRow {
  id: string; title: string; body: string; button: string | null; target: Notice['target']; link: string | null;
  audience: Notice['audience']; account_id: string | null; app: boolean; email: boolean; send_at: Date | string;
  created_at: Date | string; created_by: string; sent_at: Date | string | null; cancelled_at: Date | string | null; test: boolean;
}

const NOTICE_COLUMNS = 'n.id, n.title, n.body, n.button, n.target, n.link, n.audience, n.account_id, n.app, n.email, n.send_at, n.created_at, n.created_by, n.sent_at, n.cancelled_at, n.test';

const t = (d: Date | string) => new Date(d).getTime();
const tn = (d: Date | string | null) => (d === null ? null : t(d));

const toNotice = (r: NoticeRow): Notice => ({
  id: r.id, title: r.title, body: r.body, button: r.button, target: r.target, link: r.link, audience: r.audience,
  accountId: r.account_id, app: r.app, email: r.email, sendAt: t(r.send_at), createdAt: t(r.created_at), createdBy: r.created_by,
  sentAt: tn(r.sent_at), cancelledAt: tn(r.cancelled_at), test: r.test,
});

async function balanceOf(q: Queryable, accountId: string): Promise<number> {
  const { rows } = await q.query<{ balance: unknown }>(
    'SELECT COALESCE(SUM(credits), 0) AS balance FROM baarali.media_ledger WHERE account_id = $1',
    [accountId],
  );
  return num(rows[0].balance);
}

export class PgStore implements ControlStore {
  constructor(
    private readonly db: Db,
    private readonly catalog: Plan[],
  ) {}

  /**
   * Creates an account, or updates its email. The plan is set at creation
   * only: afterwards the admin console owns it (03/10/2026), and a restart
   * must not undo a change made there.
   */
  async upsertAccount(account: Account): Promise<void> {
    await this.db.query(
      `INSERT INTO baarali.accounts (id, email, plan_id, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [account.id, account.email, account.planId, new Date(account.createdAt)],
    );
  }

  /** Lets `token` act as the account. Kept hashed only. */
  async grantToken(token: string, accountId: string): Promise<void> {
    await this.db.query(
      'INSERT INTO baarali.access_tokens (token_hash, account_id) VALUES ($1, $2) ON CONFLICT (token_hash) DO UPDATE SET account_id = EXCLUDED.account_id',
      [hashToken(token), accountId],
    );
  }

  async revokeToken(token: string): Promise<void> {
    await this.db.query('DELETE FROM baarali.access_tokens WHERE token_hash = $1', [hashToken(token)]);
  }

  /**
   * Links an account that predates the sign-in server (the owner's) to the
   * user who signs in with its email, once Better Auth says that email is
   * verified: the same rule as linking two identities (architecture §3.5).
   * Does nothing until that user exists, nor once the account is linked.
   */
  async linkUserByVerifiedEmail(accountId: string, email: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE baarali.accounts a SET user_id = u.id FROM baarali.users u
       WHERE a.id = $1 AND a.user_id IS NULL AND lower(u.email) = lower($2) AND u."emailVerified"
         AND NOT EXISTS (SELECT 1 FROM baarali.accounts o WHERE o.user_id = u.id)
       RETURNING a.id`,
      [accountId, email],
    );
    return rows.length > 0;
  }

  async accountByToken(token: string) {
    const { rows } = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM baarali.access_tokens t
       JOIN baarali.accounts a ON a.id = t.account_id WHERE t.token_hash = $1`,
      [hashToken(token)],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async account(id: string) {
    const { rows } = await this.db.query<AccountRow>(`SELECT ${ACCOUNT_COLUMNS} FROM baarali.accounts a WHERE a.id = $1`, [id]);
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async plan(planId: string) {
    return this.catalog.find((p) => p.id === planId) ?? null;
  }

  async plans() {
    return this.catalog;
  }

  async quotaState(accountId: string): Promise<QuotaState | null> {
    const { rows } = await this.db.query<{ session_start: Date | null; session_used: unknown; week_start: Date; week_used: unknown }>(
      'SELECT session_start, session_used, week_start, week_used FROM baarali.quota_states WHERE account_id = $1',
      [accountId],
    );
    const r = rows[0];
    if (!r) return null;
    return { sessionStart: ms(r.session_start), sessionUsed: num(r.session_used), weekStart: r.week_start.getTime(), weekUsed: num(r.week_used) };
  }

  async saveQuotaState(accountId: string, s: QuotaState) {
    await this.db.query(
      `INSERT INTO baarali.quota_states (account_id, session_start, session_used, week_start, week_used) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_id) DO UPDATE SET session_start = EXCLUDED.session_start, session_used = EXCLUDED.session_used,
         week_start = EXCLUDED.week_start, week_used = EXCLUDED.week_used`,
      [accountId, date(s.sessionStart), Math.round(s.sessionUsed), new Date(s.weekStart), Math.round(s.weekUsed)],
    );
  }

  async appendUsage(r: UsageRecord) {
    await this.db.query(
      `INSERT INTO baarali.usage_records (account_id, at, path, model, requested_model, status, credits, estimated, use_case, agent_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [r.accountId, new Date(r.at), r.path, r.model, r.requestedModel, r.status, Math.round(r.credits), r.estimated, r.useCase, r.agentName],
    );
  }

  async mediaJob(id: string): Promise<MediaJob | null> {
    const { rows } = await this.db.query<{
      id: string; account_id: string; model: string; credits: number; charge_ref: string; status: MediaJob['status']; url: string | null; refunded: boolean;
    }>('SELECT id, account_id, model, credits, charge_ref, status, url, refunded FROM baarali.media_jobs WHERE id = $1', [id]);
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, accountId: r.account_id, model: r.model, credits: r.credits, chargeRef: r.charge_ref, status: r.status, url: r.url, refunded: r.refunded };
  }

  async saveMediaJob(j: MediaJob) {
    await this.db.query(
      `INSERT INTO baarali.media_jobs (id, account_id, model, credits, charge_ref, status, url, refunded) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, url = EXCLUDED.url, refunded = EXCLUDED.refunded`,
      [j.id, j.accountId, j.model, j.credits, j.chargeRef, j.status, j.url, j.refunded],
    );
  }

  async mediaBalance(accountId: string) {
    return balanceOf(this.db, accountId);
  }

  async mediaHistory(accountId: string, limit: number): Promise<MediaHistoryEntry[]> {
    const { rows } = await this.db.query<{ at: Date | string; kind: MediaHistoryEntry['kind']; credits: number; model: string | null }>(
      `SELECT l.at, l.kind, l.credits, j.model
         FROM baarali.media_ledger l
         LEFT JOIN baarali.media_jobs j ON l.kind <> 'topup' AND j.charge_ref = l.reference
        WHERE l.account_id = $1
        ORDER BY l.at DESC, l.id DESC
        LIMIT $2`,
      [accountId, limit],
    );
    return rows.map((r) => ({ at: new Date(r.at).getTime(), kind: r.kind, credits: num(r.credits), model: r.model ?? null }));
  }

  async accountForUser(userId: string) {
    const { rows } = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM baarali.accounts a WHERE a.user_id = $1 OR a.id = $1
       ORDER BY (a.user_id IS NOT NULL AND a.user_id = $1) DESC LIMIT 1`,
      [userId],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async instance(accountId: string): Promise<InstanceRecord | null> {
    const { rows } = await this.db.query<{ account_id: string; app: string; machine_id: string | null; volume_id: string | null; image: string | null; managed: boolean; keys: number }>(
      'SELECT account_id, app, machine_id, volume_id, image, managed, keys FROM baarali.instances WHERE account_id = $1',
      [accountId],
    );
    const r = rows[0];
    return r ? { accountId: r.account_id, app: r.app, machineId: r.machine_id, volumeId: r.volume_id, image: r.image, managed: r.managed, keys: r.keys } : null;
  }

  async saveInstance(i: InstanceRecord) {
    await this.db.query(
      `INSERT INTO baarali.instances (account_id, app, machine_id, volume_id, image, managed, keys) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (account_id) DO UPDATE SET app = EXCLUDED.app, machine_id = EXCLUDED.machine_id, volume_id = EXCLUDED.volume_id,
         image = EXCLUDED.image, managed = EXCLUDED.managed, keys = EXCLUDED.keys`,
      [i.accountId, i.app, i.machineId, i.volumeId, i.image, i.managed, i.keys],
    );
  }

  async removeInstance(accountId: string) {
    await this.db.query('DELETE FROM baarali.instances WHERE account_id = $1', [accountId]);
  }

  async countInstances() {
    const { rows } = await this.db.query<{ n: unknown }>('SELECT count(*) AS n FROM baarali.instances');
    return num(rows[0].n);
  }

  async addDevice(d: Device, keyHash: string) {
    await this.db.query(
      'INSERT INTO baarali.devices (id, account_id, key_hash, name, created_at, last_seen_at, revoked_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [d.id, d.accountId, keyHash, d.name, new Date(d.createdAt), date(d.lastSeenAt), date(d.revokedAt)],
    );
  }

  async deviceByKey(key: string) {
    const { rows } = await this.db.query<DeviceRow>(
      `SELECT ${DEVICE_COLUMNS} FROM baarali.devices WHERE key_hash = $1 AND revoked_at IS NULL`,
      [hashToken(key)],
    );
    return rows[0] ? toDevice(rows[0]) : null;
  }

  async devices(accountId: string) {
    const { rows } = await this.db.query<DeviceRow>(
      `SELECT ${DEVICE_COLUMNS} FROM baarali.devices WHERE account_id = $1 ORDER BY created_at`,
      [accountId],
    );
    return rows.map(toDevice);
  }

  async touchDevice(id: string, at: number) {
    await this.db.query('UPDATE baarali.devices SET last_seen_at = $2 WHERE id = $1', [id, new Date(at)]);
  }

  async revokeDevice(accountId: string, id: string, at: number) {
    const { rows } = await this.db.query(
      'UPDATE baarali.devices SET revoked_at = $3 WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL RETURNING id',
      [id, accountId, new Date(at)],
    );
    return rows.length > 0;
  }

  async applyMediaEntry(e: MediaLedgerEntry): Promise<LedgerResult> {
    return this.db.transaction(async (tx) => {
      // Locking the account row serializes its ledger: two charges sent
      // together cannot both read the same balance.
      await tx.query('SELECT 1 FROM baarali.accounts WHERE id = $1 FOR UPDATE', [e.accountId]);
      const seen = await tx.query('SELECT 1 FROM baarali.media_ledger WHERE kind = $1 AND reference = $2', [e.kind, e.reference]);
      if (seen.rows.length > 0) return 'duplicate';
      if ((await balanceOf(tx, e.accountId)) + e.credits < 0) return 'insufficient';
      await tx.query(
        'INSERT INTO baarali.media_ledger (account_id, at, kind, credits, reference) VALUES ($1, $2, $3, $4, $5)',
        [e.accountId, new Date(e.at), e.kind, e.credits, e.reference],
      );
      return 'applied';
    });
  }

  async listAccounts(since: number): Promise<AccountSummary[]> {
    const { rows } = await this.db.query<AccountRow & {
      session_start: Date | null; session_used: unknown; week_start: Date | null; week_used: unknown;
      last_active: Date | string | null; recent: unknown; media: unknown;
    }>(
      `SELECT ${ACCOUNT_COLUMNS}, q.session_start, q.session_used, q.week_start, q.week_used,
              (SELECT max(u.at) FROM baarali.usage_records u WHERE u.account_id = a.id) AS last_active,
              (SELECT COALESCE(sum(u.credits), 0) FROM baarali.usage_records u WHERE u.account_id = a.id AND u.at >= $1) AS recent,
              (SELECT COALESCE(sum(l.credits), 0) FROM baarali.media_ledger l WHERE l.account_id = a.id) AS media
         FROM baarali.accounts a
         LEFT JOIN baarali.quota_states q ON q.account_id = a.id
        ORDER BY a.created_at DESC, a.id`,
      [new Date(since)],
    );
    return rows.map((r) => ({
      account: toAccount(r),
      quota: r.week_start
        ? { sessionStart: ms(r.session_start), sessionUsed: num(r.session_used), weekStart: r.week_start.getTime(), weekUsed: num(r.week_used) }
        : null,
      mediaBalance: num(r.media),
      lastActiveAt: r.last_active === null ? null : new Date(r.last_active).getTime(),
      recentCredits: num(r.recent),
    }));
  }

  async setPlan(accountId: string, planId: string) {
    const { rows } = await this.db.query('UPDATE baarali.accounts SET plan_id = $2 WHERE id = $1 RETURNING id', [accountId, planId]);
    return rows.length > 0;
  }

  async setSuspended(accountId: string, at: number | null) {
    const { rows } = await this.db.query('UPDATE baarali.accounts SET suspended_at = $2 WHERE id = $1 RETURNING id', [accountId, date(at)]);
    return rows.length > 0;
  }

  async setEmailOptOut(accountId: string, at: number | null) {
    const { rows } = await this.db.query('UPDATE baarali.accounts SET email_opt_out_at = $2 WHERE id = $1 RETURNING id', [accountId, date(at)]);
    return rows.length > 0;
  }

  async autoMessageSettings() {
    const { rows } = await this.db.query<{ kind: AutoKind; enabled: boolean }>('SELECT kind, enabled FROM baarali.auto_message_settings');
    return Object.fromEntries(rows.map((r) => [r.kind, r.enabled]));
  }

  async setAutoMessage(kind: AutoKind, enabled: boolean, at: number) {
    await this.db.query(
      `INSERT INTO baarali.auto_message_settings (kind, enabled, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (kind) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`,
      [kind, enabled, new Date(at)],
    );
  }

  async claimAutoMessage(kind: AutoKind, accountId: string, period: string, at: number) {
    const { rows } = await this.db.query(
      'INSERT INTO baarali.auto_message_sends (kind, account_id, period, at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING kind',
      [kind, accountId, period, new Date(at)],
    );
    return rows.length > 0;
  }

  async autoMessageCounts() {
    const { rows } = await this.db.query<{ kind: AutoKind; n: number }>('SELECT kind, count(*)::int AS n FROM baarali.auto_message_sends GROUP BY kind');
    return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
  }

  async programRules() {
    const { rows } = await this.db.query<{ rules: ProgramRules }>('SELECT rules FROM baarali.partner_program WHERE id = 1');
    return rows[0]?.rules ?? null;
  }

  async saveProgramRules(rules: ProgramRules, at: number) {
    await this.db.query(
      `INSERT INTO baarali.partner_program (id, rules, updated_at) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET rules = EXCLUDED.rules, updated_at = EXCLUDED.updated_at`,
      [JSON.stringify(rules), new Date(at)],
    );
  }

  private async partnerWhere(where: string, values: unknown[]): Promise<Partner[]> {
    const { rows } = await this.db.query<PartnerRow>(`SELECT ${PARTNER_COLUMNS} FROM baarali.partners ${where}`, values);
    return rows.map(toPartner);
  }

  async partners() {
    return this.partnerWhere('ORDER BY created_at, id', []);
  }

  async partnerByCode(code: string) {
    return (await this.partnerWhere('WHERE code = $1', [code]))[0] ?? null;
  }

  async partnerForAccount(accountId: string) {
    return (await this.partnerWhere('WHERE account_id = $1', [accountId]))[0] ?? null;
  }

  async savePartner(p: Partner) {
    try {
      await this.db.query(
        `INSERT INTO baarali.partners (id, name, code, network, city, account_id, email, status, created_at, created_by, payout_method, payout_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, network = EXCLUDED.network, city = EXCLUDED.city,
           account_id = EXCLUDED.account_id, email = EXCLUDED.email, status = EXCLUDED.status, payout_method = EXCLUDED.payout_method, payout_number = EXCLUDED.payout_number`,
        [p.id, p.name, p.code, p.network, p.city, p.accountId, p.email, p.status, new Date(p.createdAt), p.createdBy, p.payoutMethod, p.payoutNumber],
      );
      return true;
    } catch (err) {
      // The code (or the account) belongs to another partner.
      if ((err as { code?: string }).code === '23505') return false;
      throw err;
    }
  }

  async countPartnerClick(partnerId: string, day: string) {
    await this.db.query(
      `INSERT INTO baarali.partner_clicks (partner_id, day, clicks) VALUES ($1, $2, 1)
       ON CONFLICT (partner_id, day) DO UPDATE SET clicks = baarali.partner_clicks.clicks + 1`,
      [partnerId, day],
    );
  }

  async addReferral(r: Referral) {
    const { rows } = await this.db.query(
      'INSERT INTO baarali.referrals (account_id, partner_id, at, via) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING account_id',
      [r.accountId, r.partnerId, new Date(r.at), r.via],
    );
    return rows.length > 0;
  }

  async referralOf(accountId: string) {
    const { rows } = await this.db.query<{ account_id: string; partner_id: string; at: Date; via: Referral['via'] }>(
      'SELECT account_id, partner_id, at, via FROM baarali.referrals WHERE account_id = $1',
      [accountId],
    );
    const r = rows[0];
    return r ? { accountId: r.account_id, partnerId: r.partner_id, at: r.at.getTime(), via: r.via } : null;
  }

  async partnerFigures() {
    const { rows } = await this.db.query<{ id: string; clicks: number; signups: number }>(
      `SELECT p.id,
         COALESCE((SELECT sum(clicks)::int FROM baarali.partner_clicks c WHERE c.partner_id = p.id), 0) AS clicks,
         (SELECT count(*)::int FROM baarali.referrals r WHERE r.partner_id = p.id) AS signups
       FROM baarali.partners p`,
    );
    return Object.fromEntries(rows.filter((r) => r.clicks || r.signups).map((r) => [r.id, { clicks: r.clicks, signups: r.signups }]));
  }

  async addGift(g: Gift) {
    await this.db.query(
      `INSERT INTO baarali.gifts (id, account_id, plan_id, previous_plan_id, starts_at, ends_at, reason, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [g.id, g.accountId, g.planId, g.previousPlanId, new Date(g.startsAt), new Date(g.endsAt), g.reason, date(g.endedAt)],
    );
  }

  async openGifts() {
    const { rows } = await this.db.query<{ id: string; account_id: string; plan_id: string; previous_plan_id: string; starts_at: Date; ends_at: Date; reason: string }>(
      `SELECT id, account_id, plan_id, previous_plan_id, starts_at, ends_at, reason FROM baarali.gifts WHERE ended_at IS NULL ORDER BY ends_at, id`,
    );
    return rows.map((r) => ({
      id: r.id, accountId: r.account_id, planId: r.plan_id, previousPlanId: r.previous_plan_id,
      startsAt: r.starts_at.getTime(), endsAt: r.ends_at.getTime(), reason: r.reason, endedAt: null,
    }));
  }

  async endGift(id: string, at: number) {
    const { rows } = await this.db.query('UPDATE baarali.gifts SET ended_at = $2 WHERE id = $1 AND ended_at IS NULL RETURNING id', [id, new Date(at)]);
    return rows.length > 0;
  }

  async addCommission(c: Commission) {
    const { rows } = await this.db.query(
      `INSERT INTO baarali.commissions (id, partner_id, account_id, paid_at, amount_xof, rate, commission_xof, payable_at, payout_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING RETURNING id`,
      [c.id, c.partnerId, c.accountId, new Date(c.paidAt), c.amountXof, c.rate, c.commissionXof, new Date(c.payableAt), c.payoutId],
    );
    return rows.length > 0;
  }

  async commissions(partnerId?: string) {
    const { rows } = await this.db.query<{
      id: string; partner_id: string; account_id: string; paid_at: Date; amount_xof: string; rate: string; commission_xof: string; payable_at: Date; payout_id: string | null;
    }>(
      `SELECT id, partner_id, account_id, paid_at, amount_xof, rate, commission_xof, payable_at, payout_id FROM baarali.commissions
       ${partnerId ? 'WHERE partner_id = $1' : ''} ORDER BY paid_at, id`,
      partnerId ? [partnerId] : [],
    );
    return rows.map((r) => ({
      id: r.id, partnerId: r.partner_id, accountId: r.account_id, paidAt: r.paid_at.getTime(), amountXof: Number(r.amount_xof),
      rate: Number(r.rate), commissionXof: Number(r.commission_xof), payableAt: r.payable_at.getTime(), payoutId: r.payout_id,
    }));
  }

  async payCommissions(p: Payout, commissionIds: string[]) {
    // One statement: the payout exists only if it pays something, and a
    // commission is never paid twice, even by two clicks at once.
    const { rows } = await this.db.query<{ n: number }>(
      `WITH due AS (
         SELECT id FROM baarali.commissions WHERE partner_id = $2 AND payout_id IS NULL AND id = ANY($9::text[]) FOR UPDATE
       ), payout AS (
         INSERT INTO baarali.partner_payouts (id, partner_id, amount_xof, method, number, reference, at, by)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8 WHERE EXISTS (SELECT 1 FROM due) RETURNING id
       ), paid AS (
         UPDATE baarali.commissions SET payout_id = (SELECT id FROM payout) WHERE id IN (SELECT id FROM due) AND EXISTS (SELECT 1 FROM payout) RETURNING id
       )
       SELECT count(*)::int AS n FROM paid`,
      [p.id, p.partnerId, p.amountXof, p.method, p.number, p.reference, new Date(p.at), p.by, commissionIds],
    );
    return rows[0]?.n ?? 0;
  }

  async payouts(partnerId?: string) {
    const { rows } = await this.db.query<{ id: string; partner_id: string; amount_xof: string; method: PayoutMethod; number: string; reference: string; at: Date; by: string }>(
      `SELECT id, partner_id, amount_xof, method, number, reference, at, by FROM baarali.partner_payouts ${partnerId ? 'WHERE partner_id = $1' : ''} ORDER BY at DESC, id`,
      partnerId ? [partnerId] : [],
    );
    return rows.map((r) => ({ id: r.id, partnerId: r.partner_id, amountXof: Number(r.amount_xof), method: r.method, number: r.number, reference: r.reference, at: r.at.getTime(), by: r.by }));
  }

  async addPartnerApplication(a: PartnerApplication) {
    const { rows } = await this.db.query(
      `INSERT INTO baarali.partner_applications (id, name, email, phone, network, profile, audience, city, message, created_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new') ON CONFLICT DO NOTHING RETURNING id`,
      [a.id, a.name, a.email, a.phone, a.network, a.profile, a.audience, a.city, a.message, new Date(a.createdAt)],
    );
    return rows.length > 0;
  }

  async partnerApplications(limit: number) {
    const { rows } = await this.db.query<{
      id: string; name: string; email: string; phone: string | null; network: string; profile: string; audience: string; city: string | null;
      message: string | null; created_at: Date; status: PartnerApplication['status']; decided_at: Date | null; decided_by: string | null;
    }>(
      `SELECT id, name, email, phone, network, profile, audience, city, message, created_at, status, decided_at, decided_by
       FROM baarali.partner_applications ORDER BY created_at DESC, id DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, phone: r.phone, network: r.network, profile: r.profile, audience: r.audience, city: r.city,
      message: r.message, createdAt: r.created_at.getTime(), status: r.status, decidedAt: r.decided_at?.getTime() ?? null, decidedBy: r.decided_by,
    }));
  }

  async decidePartnerApplication(id: string, status: 'accepted' | 'declined', at: number, by: string) {
    const { rows } = await this.db.query(
      `UPDATE baarali.partner_applications SET status = $2, decided_at = $3, decided_by = $4 WHERE id = $1 AND status = 'new' RETURNING id`,
      [id, status, new Date(at), by],
    );
    return rows.length > 0;
  }

  async allInstances(): Promise<InstanceRecord[]> {
    const { rows } = await this.db.query<{ account_id: string; app: string; machine_id: string | null; volume_id: string | null; image: string | null; managed: boolean; keys: number }>(
      'SELECT account_id, app, machine_id, volume_id, image, managed, keys FROM baarali.instances ORDER BY created_at',
    );
    return rows.map((r) => ({ accountId: r.account_id, app: r.app, machineId: r.machine_id, volumeId: r.volume_id, image: r.image, managed: r.managed, keys: r.keys }));
  }

  async modelSettings(): Promise<ModelSetting[]> {
    const { rows } = await this.db.query<{ model_id: string; enabled: boolean; min_plan: string | null; recommended: boolean; strength: string | null; free_rank: number | null }>(
      'SELECT model_id, enabled, min_plan, recommended, strength, free_rank FROM baarali.model_settings',
    );
    return rows.map((r) => ({
      modelId: r.model_id,
      enabled: r.enabled,
      minPlan: r.min_plan,
      recommended: r.recommended,
      strength: isStrength(r.strength) ? r.strength : null,
      freeRank: r.free_rank,
    }));
  }

  async saveModelSettings(settings: ModelSetting[], at: number) {
    if (!settings.length) return;
    await this.db.transaction(async (q) => {
      for (const s of settings) {
        await q.query(
          `INSERT INTO baarali.model_settings (model_id, enabled, min_plan, recommended, strength, free_rank, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (model_id) DO UPDATE SET enabled = EXCLUDED.enabled, min_plan = EXCLUDED.min_plan,
             recommended = EXCLUDED.recommended, strength = EXCLUDED.strength, free_rank = EXCLUDED.free_rank, updated_at = EXCLUDED.updated_at`,
          [s.modelId, s.enabled, s.minPlan, s.recommended, s.strength, s.freeRank, new Date(at)],
        );
      }
    });
  }

  async appendAdminLog(e: AdminLogEntry) {
    await this.db.query(
      'INSERT INTO baarali.admin_log (at, actor, action, account_id, detail) VALUES ($1, $2, $3, $4, $5)',
      [new Date(e.at), e.actor, e.action, e.accountId, e.detail],
    );
  }

  async adminLog(limit: number, accountId?: string): Promise<AdminLogEntry[]> {
    const { rows } = await this.db.query<{ at: Date | string; actor: string; action: string; account_id: string | null; detail: string }>(
      `SELECT at, actor, action, account_id, detail FROM baarali.admin_log
        WHERE $2::text IS NULL OR account_id = $2
        ORDER BY at DESC, id DESC LIMIT $1`,
      [limit, accountId ?? null],
    );
    return rows.map((r) => ({ at: new Date(r.at).getTime(), actor: r.actor, action: r.action, accountId: r.account_id, detail: r.detail }));
  }

  async announcements(limit: number): Promise<Announcement[]> {
    const { rows } = await this.db.query<{
      id: string; text: string; button: string | null; target: Announcement['target']; link: string | null;
      audience: Announcement['audience']; tone: Announcement['tone']; starts_at: Date | string; ends_at: Date | string;
      created_at: Date | string; created_by: string; removed_at: Date | string | null;
    }>(
      `SELECT id, text, button, target, link, audience, tone, starts_at, ends_at, created_at, created_by, removed_at
         FROM baarali.announcements ORDER BY created_at DESC, id DESC LIMIT $1`,
      [limit],
    );
    const t = (d: Date | string) => new Date(d).getTime();
    return rows.map((r) => ({
      id: r.id, text: r.text, button: r.button, target: r.target, link: r.link, audience: r.audience, tone: r.tone,
      startsAt: t(r.starts_at), endsAt: t(r.ends_at), createdAt: t(r.created_at), createdBy: r.created_by,
      removedAt: r.removed_at === null ? null : t(r.removed_at),
    }));
  }

  async saveAnnouncement(a: Announcement) {
    await this.db.query(
      `INSERT INTO baarali.announcements (id, text, button, target, link, audience, tone, starts_at, ends_at, created_at, created_by, removed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, button = EXCLUDED.button, target = EXCLUDED.target, link = EXCLUDED.link,
         audience = EXCLUDED.audience, tone = EXCLUDED.tone, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
         removed_at = EXCLUDED.removed_at`,
      [a.id, a.text, a.button, a.target, a.link, a.audience, a.tone, new Date(a.startsAt), new Date(a.endsAt), new Date(a.createdAt), a.createdBy, date(a.removedAt)],
    );
  }

  async recordAnnouncementEvent(id: string, accountId: string, kind: AnnouncementEvent, at: number) {
    const { rows } = await this.db.query(
      `INSERT INTO baarali.announcement_events (announcement_id, account_id, kind, at)
       SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM baarali.announcements WHERE id = $1)
       ON CONFLICT DO NOTHING RETURNING announcement_id`,
      [id, accountId, kind, new Date(at)],
    );
    return rows.length > 0;
  }

  async announcementEventsOf(id: string, accountId: string): Promise<AnnouncementEvent[]> {
    const { rows } = await this.db.query<{ kind: AnnouncementEvent }>(
      'SELECT kind FROM baarali.announcement_events WHERE announcement_id = $1 AND account_id = $2',
      [id, accountId],
    );
    return rows.map((r) => r.kind);
  }

  async announcementStats(ids: string[]): Promise<Record<string, AnnouncementStats>> {
    const stats: Record<string, AnnouncementStats> = Object.fromEntries(ids.map((id) => [id, { view: 0, click: 0, dismiss: 0 }]));
    if (ids.length === 0) return stats;
    const { rows } = await this.db.query<{ announcement_id: string; kind: AnnouncementEvent; n: unknown }>(
      `SELECT announcement_id, kind, count(*) AS n FROM baarali.announcement_events
        WHERE announcement_id = ANY($1::text[]) GROUP BY announcement_id, kind`,
      [ids],
    );
    for (const r of rows) stats[r.announcement_id][r.kind] = num(r.n);
    return stats;
  }

  async notifications(limit: number): Promise<Notice[]> {
    const { rows } = await this.db.query<NoticeRow>(
      `SELECT ${NOTICE_COLUMNS} FROM baarali.notifications n WHERE n.created_by NOT LIKE $2 ORDER BY n.created_at DESC, n.id DESC LIMIT $1`,
      [limit, `${AUTO_AUTHOR}%`],
    );
    return rows.map(toNotice);
  }

  async saveNotification(n: Notice) {
    await this.db.query(
      `INSERT INTO baarali.notifications (id, title, body, button, target, link, audience, account_id, app, email, send_at, created_at, created_by, cancelled_at, test)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, button = EXCLUDED.button, target = EXCLUDED.target,
         link = EXCLUDED.link, audience = EXCLUDED.audience, account_id = EXCLUDED.account_id, app = EXCLUDED.app, email = EXCLUDED.email,
         send_at = EXCLUDED.send_at`,
      [n.id, n.title, n.body, n.button, n.target, n.link, n.audience, n.accountId, n.app, n.email, new Date(n.sendAt), new Date(n.createdAt), n.createdBy, date(n.cancelledAt), n.test],
    );
  }

  async claimNotification(id: string, at: number) {
    const { rows } = await this.db.query(
      'UPDATE baarali.notifications SET sent_at = $2 WHERE id = $1 AND sent_at IS NULL AND cancelled_at IS NULL RETURNING id',
      [id, new Date(at)],
    );
    return rows.length > 0;
  }

  async cancelNotification(id: string, at: number) {
    const { rows } = await this.db.query(
      'UPDATE baarali.notifications SET cancelled_at = $2 WHERE id = $1 AND sent_at IS NULL AND cancelled_at IS NULL RETURNING id',
      [id, new Date(at)],
    );
    return rows.length > 0;
  }

  async deliverNotification(id: string, accountIds: string[], at: number) {
    if (accountIds.length === 0) return;
    await this.db.query(
      `INSERT INTO baarali.notification_deliveries (notification_id, account_id, delivered_at)
       SELECT $1, a, $3 FROM unnest($2::text[]) AS a ON CONFLICT DO NOTHING`,
      [id, [...new Set(accountIds)], new Date(at)],
    );
  }

  async markEmailed(id: string, accountIds: string[], at: number) {
    if (accountIds.length === 0) return;
    await this.db.query(
      `UPDATE baarali.notification_deliveries SET emailed_at = $3
        WHERE notification_id = $1 AND account_id = ANY($2::text[]) AND emailed_at IS NULL`,
      [id, accountIds, new Date(at)],
    );
  }

  async inbox(accountId: string, limit: number) {
    const { rows } = await this.db.query<NoticeRow & { delivered_at: Date | string; emailed_at: Date | string | null; read_at: Date | string | null; clicked_at: Date | string | null }>(
      `SELECT ${NOTICE_COLUMNS}, d.delivered_at, d.emailed_at, d.read_at, d.clicked_at
         FROM baarali.notification_deliveries d JOIN baarali.notifications n ON n.id = d.notification_id
        WHERE d.account_id = $1 AND n.app
        ORDER BY d.delivered_at DESC, n.created_at DESC LIMIT $2`,
      [accountId, limit],
    );
    return rows.map((r) => ({
      notice: toNotice(r),
      delivery: { noticeId: r.id, accountId, deliveredAt: t(r.delivered_at), emailedAt: tn(r.emailed_at), readAt: tn(r.read_at), clickedAt: tn(r.clicked_at) } satisfies Delivery,
    }));
  }

  async recordNotificationEvent(id: string, accountId: string, kind: NoticeEvent, at: number) {
    // A click is a read too; true only when this kind is counted for the first time.
    const { rows } = await this.db.query<{ first: boolean }>(
      kind === 'read'
        ? `UPDATE baarali.notification_deliveries SET read_at = COALESCE(read_at, $3)
            WHERE notification_id = $1 AND account_id = $2
            RETURNING (read_at = $3) AS first`
        : `UPDATE baarali.notification_deliveries SET read_at = COALESCE(read_at, $3), clicked_at = COALESCE(clicked_at, $3)
            WHERE notification_id = $1 AND account_id = $2
            RETURNING (clicked_at = $3) AS first`,
      [id, accountId, new Date(at)],
    );
    return rows.length > 0 && rows[0].first === true;
  }

  async notificationStats(ids: string[]): Promise<Record<string, NoticeStats>> {
    const stats: Record<string, NoticeStats> = Object.fromEntries(ids.map((id) => [id, { delivered: 0, emailed: 0, read: 0, clicked: 0 }]));
    if (ids.length === 0) return stats;
    const { rows } = await this.db.query<{ notification_id: string; delivered: unknown; emailed: unknown; read: unknown; clicked: unknown }>(
      `SELECT notification_id, count(*) AS delivered, count(emailed_at) AS emailed, count(read_at) AS read, count(clicked_at) AS clicked
         FROM baarali.notification_deliveries WHERE notification_id = ANY($1::text[]) GROUP BY notification_id`,
      [ids],
    );
    for (const r of rows) stats[r.notification_id] = { delivered: num(r.delivered), emailed: num(r.emailed), read: num(r.read), clicked: num(r.clicked) };
    return stats;
  }
}
