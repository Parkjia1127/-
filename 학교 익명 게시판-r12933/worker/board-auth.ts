import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context, Hono } from 'hono';
import { passwordHint, validNewPassword, type Account } from '../src/board-copy';
import { sha256, type Bindings } from './lib';

export type BoardEnv = { Bindings: Bindings & { OPERATOR_SETUP_CODE?: string }; Variables: { user: Account | null } };
export const pendingOwnerKey = '@owner-handover';
const session = '__Host-school_session_v2';
const legacySession = '__Host-school_session';
const legacyCookie = { path: '/', secure: true, httpOnly: true, sameSite: 'Lax' } as const;
const cookie = { ...legacyCookie, sameSite: 'None', partitioned: true } as const;
export function sessionTokens(c: Context<BoardEnv>) {
  return [c.req.header('X-Board-Tab-Session'), getCookie(c, session), getCookie(c, legacySession)].filter((token): token is string => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token));
}
export function clearSessionCookies(c: Context<BoardEnv>) {
  deleteCookie(c, session, cookie);
  deleteCookie(c, legacySession, legacyCookie);
}
const ttl = 90 * 86400;
export const now = () => Math.floor(Date.now() / 1000);
const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const base64 = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value instanceof Uint8Array ? value.buffer : value)));
const encoder = new TextEncoder();
const initial = '1111';

export async function jsonInput(req: { json: () => Promise<unknown> }) {
  const data = await req.json().catch(() => null);
  return data !== null && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
}

function nicknameFrom(value: unknown) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const nickname = value.normalize('NFKC').trim();
  if (!/^[가-힣A-Za-z0-9_-]{2,20}$/.test(nickname)) return null;
  return { nickname, key: nickname.toLowerCase() };
}

const hostedHashPrefix = 'pbkdf2-sha256-100000:';
const dummySalt = 'AAAAAAAAAAAAAAAAAAAAAA==';
const emptyHash = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

async function derivePassword(password: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return base64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations, salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)) }, key, 256));
}

async function hashPassword(password: string, salt: string) {
  // Use the hosted Web Crypto work-factor ceiling for new credentials.
  return hostedHashPrefix + await derivePassword(password, salt, 100_000);
}

async function verifyPassword(password: string, salt: string, stored: string) {
  // Preview accounts and pending handovers already use the untagged format.
  const legacy = /^[A-Za-z0-9+/]{43}=$/.test(stored);
  const calculated = await (legacy ? derivePassword(password, salt, 600_000) : hashPassword(password, salt));
  return calculated.length === stored.length && crypto.subtle.timingSafeEqual(encoder.encode(calculated), encoder.encode(stored));
}

async function limited(c: Context<BoardEnv>, bucket: string, max: number) {
  const key = `auth:${bucket}:${await sha256(c.req.header('cf-connecting-ip') ?? 'local')}`;
  const tick = now();
  const row = await c.env.DB.prepare(`INSERT INTO rate_limit (key,count,window_start) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start <= ? THEN 1 ELSE MIN(count+1,?) END,
      window_start=CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END RETURNING count`)
    .bind(key, tick, tick - 900, max + 1, tick - 900).first<{ count: number }>();
  if (row?.count === 1 && bytes(1)[0] < 4) await c.env.DB.prepare('DELETE FROM rate_limit WHERE window_start < ?').bind(tick - 86400).run();
  return !row || row.count > max;
}

async function loginSession(c: Context<BoardEnv>, id: number, role: Account['role'], status: Account['status']) {
  const tab = c.req.path === '/api/auth/login' && c.req.header('X-Board-Session-Mode') === 'tab';
  const raw = Array.from(bytes(32), b => b.toString(16).padStart(2, '0')).join('');
  const db = c.env.DB;
  const stmts = [db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()), db.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await sha256(raw), id, now() + (tab ? 3600 : ttl))];
  for (const prior of sessionTokens(c)) stmts.push(db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(prior)));
  await db.batch(stmts);
  if (tab) return c.json({ user: { role, status }, tabSession: raw });
  setCookie(c, session, raw, { ...cookie, maxAge: ttl });
  return c.json({ user: { role, status } });
}

export function mountBoardAuth(app: Hono<BoardEnv>) {
  app.post('/auth/register', async c => {
    if (await limited(c, 'register', 120)) return c.json({ error: '요청이 많아요. 잠시 뒤 다시 시도해 주세요.' }, 429);
    const b = await jsonInput(c.req), name = nicknameFrom(b.nickname), password = b.password;
    if (!name) return c.json({ error: '닉네임은 한글, 영문, 숫자, 밑줄, 하이픈으로 2~20자까지 쓸 수 있어요.' }, 400);
    const owner = b.setupCode !== undefined;
    if (!owner && b.initialPassword !== initial) return c.json({ error: '초기 비밀번호를 다시 확인해 주세요.' }, 400);
    const role = owner ? 'owner' : 'member', status = owner ? 'approved' : 'new';
    if (!validNewPassword(password, role)) return c.json({ error: passwordHint(role) }, 400);
    const db = c.env.DB, exists = () => db.prepare('SELECT 1 FROM nickname_credentials WHERE nickname_key=?').bind(name.key).first();
    if (await exists()) return c.json({ error: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.' }, 409);
    if (owner) {
      if (await limited(c, 'owner', 5)) return c.json({ error: '설정 시도가 많아요. 잠시 뒤 다시 시도해 주세요.' }, 429);
      if (typeof b.setupCode !== 'string' || b.setupCode.length < 24 || b.setupCode.length > 256) return c.json({ error: '운영자 설정 코드를 다시 확인해 주세요.' }, 403);
      const pending = await db.prepare("SELECT a.id,n.salt,n.password_hash FROM accounts a JOIN nickname_credentials n ON n.account_id=a.id WHERE a.role='owner' AND a.status='approved' AND n.nickname_key=?").bind(pendingOwnerKey).first<{ id: number; salt: string; password_hash: string }>();
      if (pending) {
        if (!await verifyPassword(b.setupCode, pending.salt, pending.password_hash)) return c.json({ error: '운영자 설정 코드를 다시 확인해 주세요.' }, 403);
        if (password === b.setupCode) return c.json({ error: '설정 코드와 다른 비밀번호를 정해 주세요.' }, 400);
        const salt = base64(bytes(16)), hash = await hashPassword(password, salt);
        const claimed = await db.prepare('UPDATE OR IGNORE nickname_credentials SET nickname=?,nickname_key=?,salt=?,password_hash=? WHERE account_id=? AND nickname_key=? AND password_hash=? RETURNING account_id').bind(name.nickname, name.key, salt, hash, pending.id, pendingOwnerKey, pending.password_hash).first();
        if (!claimed) return c.json({ error: '이미 인수했거나 사용 중인 닉네임이에요.' }, 409);
        return loginSession(c, pending.id, 'owner', 'approved');
      }
      if (await db.prepare("SELECT 1 FROM accounts WHERE role='owner'").first()) return c.json({ error: '이미 운영자 계정이 있어요. 기존 계정으로 로그인해 주세요.' }, 409);
      const code = c.env.OPERATOR_SETUP_CODE;
      if (!code || code.length < 24) return c.json({ error: '운영자 설정 코드가 아직 준비되지 않았어요.' }, 409);
      if (!crypto.subtle.timingSafeEqual(encoder.encode(await sha256(b.setupCode)), encoder.encode(await sha256(code)))) return c.json({ error: '운영자 설정 코드를 다시 확인해 주세요.' }, 403);
      if (password === b.setupCode) return c.json({ error: '설정 코드와 다른 비밀번호를 정해 주세요.' }, 400);
    }
    const ref = `nickname:${crypto.randomUUID()}`, salt = base64(bytes(16)), hash = await hashPassword(password, salt);
    let account: {id: number} | undefined;
    try {
      const [created] = await db.batch<{id: number}>([
        db.prepare("INSERT INTO accounts (google_sub,email,role,status) VALUES (?,'',?,?) RETURNING id").bind(ref, role, status),
        db.prepare('INSERT INTO nickname_credentials (account_id,nickname,nickname_key,salt,password_hash) SELECT id,?,?,?,? FROM accounts WHERE google_sub=?').bind(name.nickname, name.key, salt, hash, ref),
      ]);
      account = created.results[0];
    } catch (e) {
      if (await exists()) return c.json({ error: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.' }, 409);
      if (owner && await db.prepare("SELECT 1 FROM accounts WHERE role='owner'").first()) return c.json({ error: '이미 운영자 계정이 있어요. 기존 계정으로 로그인해 주세요.' }, 409);
      throw e;
    }
    if (!account) throw new Error('Account registration failed');
    return loginSession(c, account.id, role, status);
  });

  app.post('/auth/login', async c => {
    if (await limited(c, 'login', 180)) return c.json({ error: '로그인 시도가 많아요. 잠시 뒤 다시 시도해 주세요.' }, 429);
    const b = await jsonInput(c.req), name = nicknameFrom(b.nickname);
    const invalid = { error: '닉네임이나 비밀번호가 맞지 않아요.' };
    if (!name || typeof b.password !== 'string' || b.password.length < 12 || b.password.length > 128) return c.json(invalid, 401);
    if (await limited(c, `login-name:${await sha256(name.key)}`, 12)) return c.json({ error: '로그인 시도가 많아요. 잠시 뒤 다시 시도해 주세요.' }, 429);
    const row = await c.env.DB.prepare('SELECT a.id,a.role,a.status,n.salt,n.password_hash FROM nickname_credentials n JOIN accounts a ON a.id=n.account_id WHERE n.nickname_key=?').bind(name.key).first<Account & { salt: string; password_hash: string }>();
    const valid = await verifyPassword(b.password, row?.salt ?? dummySalt, row?.password_hash ?? hostedHashPrefix + emptyHash);
    if (!row || !valid) return c.json(invalid, 401);
    return loginSession(c, row.id, row.role, row.status);
  });
}
