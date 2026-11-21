import { encryptNotification, vapidHeaders } from '@block65/webcrypto-web-push';
import type { Context, Hono } from 'hono';
import { jsonInput, now, sessionTokens, type BoardEnv } from './board-auth';
import { sha256 } from './lib';

const setting = 'board:push-key-v1';
const subject = 'https://dgpy.baze.cloud';
const encode = (data: Uint8Array) => btoa(String.fromCharCode(...data)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const text = new TextEncoder();

function pushEndpoint(value: unknown) {
  if (typeof value !== 'string' || value.length > 1500) return null;
  try {
    const url = new URL(value);
    if (url.href !== value || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.search) return null;
    const allowed = (url.hostname === 'fcm.googleapis.com' && url.pathname.startsWith('/fcm/send/')) ||
      (url.hostname === 'updates.push.services.mozilla.com' && /^\/wpush\/v[12]\//.test(url.pathname)) ||
      (url.hostname === 'web.push.apple.com' && url.pathname.startsWith('/Q')) ||
      (/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname) && url.pathname.startsWith('/'));
    return allowed ? url.href : null;
  } catch { return null; }
}

async function vapid(env: BoardEnv['Bindings'], initialize = false): Promise<{ subject:string; publicKey:string; privateKey:string } | null> {
  if (!env.OPERATOR_SETUP_CODE) return null;
  const seed = await crypto.subtle.importKey('raw', text.encode(env.OPERATOR_SETUP_CODE), 'HKDF', false, ['deriveKey']);
  const wrapping = await crypto.subtle.deriveKey({ name:'HKDF', hash:'SHA-256', salt:text.encode(subject), info:text.encode(setting) }, seed, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
  const get = () => env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(setting).first<{ value: string }>();
  const current = await get();
  if (current) {
    const { publicKey, iv, encrypted } = JSON.parse(current.value) as { publicKey: string; iv: string; encrypted: string };
    try {
      const raw = await crypto.subtle.decrypt({ name:'AES-GCM', iv:decode(iv), additionalData:text.encode(publicKey) }, wrapping, decode(encrypted));
      return { subject, publicKey, privateKey: new TextDecoder().decode(raw) };
    } catch { if (!initialize) return null; }
  }
  if (!initialize) return null;
  const pair = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);
  if (!('publicKey' in pair)) return null;
  const rawPublic = await crypto.subtle.exportKey('raw', pair.publicKey);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  if (!(rawPublic instanceof ArrayBuffer) || jwk instanceof ArrayBuffer || !jwk.d) return null;
  const publicKey = encode(new Uint8Array(rawPublic)), privateKey = jwk.d;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData:text.encode(publicKey) }, wrapping, text.encode(privateKey));
  const value = JSON.stringify({ publicKey, iv:encode(iv), encrypted:encode(new Uint8Array(encrypted)) });
  const written = current
    ? await env.DB.prepare('UPDATE settings SET value=? WHERE key=? AND value=?').bind(value, setting, current.value).run()
    : await env.DB.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind(setting, value).run();
  return written.meta.changes ? { subject, publicKey, privateKey } : vapid(env);
}

type Device = { endpoint: string; p256dh: string; auth: string; key_id: string };
async function deliverPush(env: BoardEnv['Bindings'], row: Device, keys: NonNullable<Awaited<ReturnType<typeof vapid>>>, test = false) {
  const endpoint = pushEndpoint(row.endpoint);
  if (!endpoint || row.key_id !== keys.publicKey) return 'expired';
  const provider = new URL(endpoint).hostname;
  try {
    const sub = { endpoint, expirationTime:null, keys:{ p256dh:row.p256dh, auth:row.auth } };
    const [{ headers }, body] = await Promise.all([
      vapidHeaders(sub, keys),
      encryptNotification(sub, text.encode(test ? 'board-test' : 'board-alert'), { pad:false }),
    ]);
    // Fixed generic messages don't need padding. Keep the encrypted request well below provider limits.
    const response = await fetch(endpoint, {
      method:'POST', headers:{ ...headers, 'content-encoding':'aes128gcm', 'content-type':'application/octet-stream', ttl:test ? '120' : '900', urgency:'high' },
      body, redirect:'manual', signal:AbortSignal.timeout(6500),
    });
    if (response.body) await response.body.cancel().catch(() => {});
    if (response.ok) return 'accepted';
    if (response.status === 404 || response.status === 410) {
      await env.DB.prepare('DELETE FROM board_push_devices WHERE endpoint=? AND key_id=? AND auth=?').bind(endpoint, row.key_id, row.auth).run();
      return 'expired';
    }
    console.warn('board_push_rejected', provider, response.status);
    return 'failed';
  } catch (error) {
    console.warn('board_push_delivery_failed', provider, error instanceof Error ? error.name : 'unknown');
    return 'failed';
  }
}

export async function sendBoardPush(env: BoardEnv['Bindings'], recipient: number) {
  const { results } = await env.DB.prepare(`SELECT d.endpoint,d.p256dh,d.auth,d.key_id FROM sessions s JOIN board_push_devices d ON d.session_hash=s.token_hash
    JOIN accounts a ON a.id=s.account_id WHERE a.id=? AND a.status='approved' AND s.expires_at>? LIMIT 12`).bind(recipient, now()).all<Device>();
  if (!results.length) return;
  const keys = await vapid(env);
  if (!keys) return;
  await Promise.all(results.map(row => deliverPush(env, row, keys)));
}

export function unreadCount(env: BoardEnv['Bindings'], id: number) {
  return env.DB.prepare('SELECT COUNT(*) AS n FROM board_notifications WHERE recipient=? AND is_read=0').bind(id).first<number>('n');
}

export function mountBoardNotifications(app: Hono<BoardEnv>) {
  const noticeRows = `SELECT n.id,n.post_id,n.kind,n.is_read,n.created_at,p.title FROM board_notifications n
      LEFT JOIN posts p ON p.id=n.post_id WHERE n.recipient=? AND n.id<? ORDER BY n.id DESC LIMIT 21`;
  app.get('/board/notifications', async c => {
    const id = c.get('user')!.id, before = c.req.query('before');
    const [{ results }, read] = await c.env.DB.batch([
      c.env.DB.prepare(noticeRows).bind(id, before && /^[1-9]\d{0,14}$/.test(before) ? Number(before) : Number.MAX_SAFE_INTEGER),
      c.env.DB.prepare('SELECT 1 FROM board_notifications WHERE recipient=? AND is_read=1 LIMIT 1').bind(id),
    ]);
    return c.json({ rows:results.slice(0,20), more:results.length>20, hasRead:read.results.length>0 });
  });
  app.patch('/board/notifications/:id/read', async c => {
    const change = await c.env.DB.prepare('UPDATE board_notifications SET is_read=1 WHERE id=? AND recipient=?')
      .bind(c.req.param('id'), c.get('user')!.id).run();
    return change.meta.changes ? c.json({ ok:true }) : c.json({ error:'알림을 찾을 수 없어요.' },404);
  });
  app.patch('/board/notifications/read-all', async c => {
    const change = await c.env.DB.prepare('UPDATE board_notifications SET is_read=1 WHERE recipient=? AND is_read=0').bind(c.get('user')!.id).run();
    return c.json({ marked:change.meta.changes });
  });
  app.delete('/board/notifications/read', async c => {
    const id = c.get('user')!.id, db = c.env.DB;
    const [change, { results }] = await db.batch([
      db.prepare('DELETE FROM board_notifications WHERE recipient=? AND is_read=1').bind(id),
      db.prepare(noticeRows).bind(id, Number.MAX_SAFE_INTEGER),
    ]);
    return c.json({ removed:change.meta.changes, rows:results.slice(0,20), more:results.length>20, hasRead:false });
  });
  app.post('/board/notifications/push-key', async c => {
    const keys = await vapid(c.env, true);
    return keys ? c.json({ publicKey:keys.publicKey }) : c.json({ error:'지금은 휴대폰 알림을 켤 수 없어요.' },503);
  });
  app.post('/board/notifications/device', async c => {
    const b = await jsonInput(c.req), endpoint = pushEndpoint(b.endpoint), token = sessionTokens(c)[0];
    if (!endpoint || !token) return c.json({ error:'이 브라우저의 푸시 알림을 사용할 수 없어요.' },400);
    const session = await sha256(token), db = c.env.DB;
    if (b.action === 'test') {
      const row = await db.prepare('SELECT endpoint,p256dh,auth,key_id FROM board_push_devices WHERE endpoint=? AND session_hash=?').bind(endpoint, session).first<Device>();
      const keys = row ? await vapid(c.env) : null;
      if (!row || !keys || row.key_id !== keys.publicKey) return c.json({ error:'기기 등록이 만료됐어요. 푸시를 다시 켜 주세요.' },410);
      const tick = now();
      const key = `board:push-test:${c.get('user')!.id}`;
      const limit = await db.prepare(`INSERT INTO rate_limit(key,count,window_start) VALUES (?,1,?)
        ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start WHERE rate_limit.window_start<=?`)
        .bind(key,tick,tick-30).run();
      if (!limit.meta.changes) return c.json({ error:'테스트 푸시는 30초 뒤에 다시 보낼 수 있어요.' },429);
      const delivery = await deliverPush(c.env,row,keys,true);
      if (delivery === 'expired') return c.json({ error:'기기 등록이 만료됐어요. 푸시를 다시 켜 주세요.' },410);
      if (delivery === 'failed') return c.json({ error:'푸시를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.' },502);
      return c.json({ accepted:true });
    }
    if (b.action === 'status') {
      const row = await db.prepare('SELECT key_id FROM board_push_devices WHERE endpoint=? AND session_hash=?').bind(endpoint, session).first<string>('key_id');
      const keys = row ? await vapid(c.env) : null;
      return c.json({ enabled:!!keys && row === keys.publicKey });
    }
    if (b.action === 'disable') {
      await db.prepare('DELETE FROM board_push_devices WHERE endpoint=? AND session_hash=?').bind(endpoint, session).run();
      return c.json({ enabled:false });
    }
    const { p256dh, auth } = b;
    if (b.action !== 'enable' || typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(p256dh) || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(auth)) return c.json({ error:'기기 알림 정보를 다시 확인해 주세요.' },400);
    const keys = await vapid(c.env);
    if (!keys || b.publicKey !== keys.publicKey) return c.json({ error:'휴대폰 알림을 다시 켜 주세요.' },409);
    try { await crypto.subtle.importKey('raw', decode(p256dh), { name:'ECDH', namedCurve:'P-256' }, false, []); }
    catch { return c.json({ error:'기기 알림 정보를 다시 확인해 주세요.' },400); }
    const account = c.get('user')!.id;
    const saved = await db.prepare(`INSERT INTO board_push_devices(endpoint,session_hash,p256dh,auth,key_id)
      SELECT ?,s.token_hash,?,?,? FROM sessions s WHERE s.token_hash=? AND s.account_id=? AND s.expires_at>?
      AND ((SELECT COUNT(*) FROM board_push_devices d JOIN sessions ds ON ds.token_hash=d.session_hash WHERE ds.account_id=? AND ds.expires_at>?) < 6
        OR EXISTS (SELECT 1 FROM board_push_devices d WHERE d.endpoint=? AND d.session_hash=s.token_hash))
      ON CONFLICT(endpoint) DO UPDATE SET session_hash=excluded.session_hash,p256dh=excluded.p256dh,auth=excluded.auth,key_id=excluded.key_id
      WHERE board_push_devices.auth=excluded.auth AND board_push_devices.p256dh=excluded.p256dh`)
      .bind(endpoint,p256dh,auth,keys.publicKey,session,account,now(),account,now(),endpoint).run();
    return saved.meta.changes ? c.json({ enabled:true }) : c.json({ error:'이 기기에 푸시 알림을 등록하지 못했어요. 계정당 최대 6대까지 켤 수 있어요.' },409);
  });
}

export function scheduleBoardPush(c: Context<BoardEnv>, recipient?: number) {
  if (!recipient) return;
  c.executionCtx.waitUntil(sendBoardPush(c.env, recipient).catch(() => { console.warn('board_push_unavailable'); }));
}
