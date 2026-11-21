import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { copy, type CopyKey, type Account, type Post, type PostDetail, type ReactionCounts, type ReactionRow, type Reply, type CommentThread, type PostAuthor, type Deletion } from '../src/board-copy';
import { clean, sha256 } from './lib';
import { appearanceKey, builtInIcons, defaultAppearance, defaultSharePreview, normalizeAppearance } from '../src/appearance';
import { mountBoardNotifications, scheduleBoardPush, unreadCount } from './board-notifications';
import { mountBoardAuth, type BoardEnv, jsonInput as input, sessionTokens, clearSessionCookies, now, pendingOwnerKey } from './board-auth';

const app = new Hono<BoardEnv>().basePath('/api');
const invalid = { error: '입장 승인이 필요해요.' };
const actorAllowed = "EXISTS (SELECT 1 FROM accounts a WHERE a.id = ? AND a.status = 'approved' AND (a.id = target.author OR a.role IN ('owner','moderator')))";

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  c.header('X-Robots-Tag', 'noindex');
  c.header('Referrer-Policy', 'no-referrer');
  if (!['GET', 'HEAD'].includes(c.req.method) && (c.req.header('X-Board-Request') !== '1' || c.req.header('Sec-Fetch-Site') === 'cross-site')) return c.json({ error: '허용되지 않은 요청이에요.' }, 403);
  await next();
});
app.use('*', bodyLimit({ maxSize: 32_768, onError: c => c.json({ error: '내용이 너무 길어요.' }, 413) }));
app.get('/health', c => c.json({ ok: true }));

async function getAppearance(db: BoardEnv['Bindings']['DB']) {
  const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(appearanceKey).first<{ value: string }>();
  try { return row ? normalizeAppearance(JSON.parse(row.value)) ?? defaultAppearance : defaultAppearance; }
  catch { return defaultAppearance; }
}

app.get('/manifest.webmanifest', async c => {
  const [appearance, site] = await Promise.all([getAppearance(c.env.DB), c.env.DB.prepare("SELECT value FROM site_copy WHERE key='site'").first<{ value: string }>()]);
  const name = appearance.installName || site?.value || copy.site;
  const icons = appearance.iconUrl ? [{ src: appearance.iconUrl, sizes: '512x512', type: 'image/png', purpose: 'any' }] : [
    { src: builtInIcons.touch, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: builtInIcons.install, sizes: '512x512', type: 'image/png', purpose: 'any' },
  ];
  return c.json({ id: '/', name, short_name: name, lang: 'ko', start_url: '/', scope: '/', display: 'standalone', background_color: '#f8f7fc', theme_color: '#6539c4', icons }, 200, { 'Content-Type': 'application/manifest+json; charset=utf-8' });
});

mountBoardAuth(app);

app.use('*', async (c, next) => {
  const token = sessionTokens(c)[0];
  const user = token ? await c.env.DB.prepare('SELECT a.id,n.nickname,a.status,a.role,a.requested_at FROM sessions s JOIN accounts a ON a.id=s.account_id JOIN nickname_credentials n ON n.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha256(token), now()).first<Account>() : null;
  c.set('user', user);
  await next();
});
app.get('/state', async c => {
  const user = c.get('user');
  const [{ results }, appearance, unread] = await Promise.all([c.env.DB.prepare("SELECT key,value FROM site_copy WHERE key NOT IN ('boardWarning','boardGuideTitle','boardGuideBody') OR ?=1").bind(Number(user?.status === 'approved')).all<{ key: string; value: string }>(), getAppearance(c.env.DB), user?.status === 'approved' ? unreadCount(c.env,user.id) : 0]);
  const existingOwner = user?.role !== 'owner' ? await c.env.DB.prepare("SELECT n.nickname_key FROM accounts a LEFT JOIN nickname_credentials n ON n.account_id=a.id WHERE a.role='owner'").first<{ nickname_key: string | null }>() : null;
  const handover = existingOwner?.nickname_key === pendingOwnerKey;
  const setupNeeded = user?.role !== 'owner' && (!existingOwner || handover);
  const setupOpen = setupNeeded && (handover || (c.env.OPERATOR_SETUP_CODE?.length ?? 0) >= 24);
  return c.json({ user: user ? { role: user.role, status: user.status } : null, setupNeeded, setupOpen, appearance, unread:unread ?? 0, words: Object.fromEntries(results.map(({key,value}) => [key,value])) });
});
app.post('/auth/logout', async c => {
  const hashes = await Promise.all(sessionTokens(c).map(sha256));
  if (hashes.length) await c.env.DB.batch(hashes.map(hash => c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash)));
  clearSessionCookies(c);
  return c.json({ ok: true });
});
app.post('/admission', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: '먼저 로그인해 주세요.' }, 401);
  const change = await c.env.DB.prepare("UPDATE accounts SET status='pending',requested_at=? WHERE id=? AND status='new'").bind(new Date().toISOString(), u.id).run();
  if (!change.meta.changes && u.status !== 'pending') return c.json({ error: '현재 상태에서는 요청을 보낼 수 없어요.' }, 409);
  return c.json({ ok: true });
});

app.use('/board/*', async (c, next) => {
  if (c.get('user')?.status !== 'approved') return c.json(invalid, 403);
  await next();
});
mountBoardNotifications(app);
const pageAfter = (value?: string) => value && /^[1-9]\d{0,14}$/.test(value) ? Number(value) : Number.MAX_SAFE_INTEGER;
const postProjection = `p.id,p.title,p.body,p.created_at,(p.author=?1 OR ?2=1) AS can_delete,(p.author=?1) AS can_edit,
  EXISTS (SELECT 1 FROM board_edited_entries e WHERE e.post_id=p.id) AS edited,
  ((SELECT COUNT(*) FROM comments WHERE post_id=p.id)+(SELECT COUNT(*) FROM comment_replies WHERE post_id=p.id)) AS comment_count`;
// Private fields are never selected for other roles, including moderators.
const nicknameProjection = (role: Account['role'], source: 'p' | 'r' | 'cm') => role === 'owner'
  ? `,(SELECT n.nickname FROM nickname_credentials n WHERE n.account_id=${source}.author) AS nickname` : '';
app.get('/board/posts', async c => {
  const u = c.get('user')!;
  const { results } = await c.env.DB.prepare(`SELECT ${postProjection} FROM posts p WHERE p.id<? ORDER BY p.id DESC LIMIT 21`).bind(u.id, Number(u.role !== 'member'), pageAfter(c.req.query('before'))).all<Post>();
  return c.json({ rows: results.slice(0,20), more: results.length > 20 });
});
app.post('/board/posts', async c => {
  const b = await input(c.req), title = clean(b.title, 100), text = clean(b.body, 5000);
  if (!title || !text) return c.json({ error: '제목과 내용을 모두 입력해 주세요.' }, 400);
  const result = await c.env.DB.prepare("INSERT INTO posts (author,title,body) SELECT id,?,? FROM accounts WHERE id=? AND status='approved' RETURNING id").bind(title, text, c.get('user')!.id).first<{ id: number }>();
  return result ? c.json(result, 201) : c.json(invalid, 403);
});
const countReactions = `SELECT COUNT(*) FILTER (WHERE reaction='like') AS like_count,
  COUNT(*) FILTER (WHERE reaction='dislike') AS dislike_count FROM post_reactions WHERE post_id=`;
app.get('/board/posts/:id', async c => {
  const u = c.get('user')!, id = c.req.param('id'), staff = Number(u.role !== 'member');
  const [posts, comments] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT ${postProjection}${nicknameProjection(u.role, 'p')},
      (SELECT r.reaction FROM post_reactions r WHERE r.post_id=p.id AND r.account_id=?1) AS my_reaction,
      totals.like_count, totals.dislike_count
      FROM posts p CROSS JOIN (${countReactions}?3) totals WHERE p.id=?3`).bind(u.id, staff, id),
    c.env.DB.prepare(`WITH threads AS (
      SELECT cm.id,cm.body,cm.created_at,(cm.author=?1 OR ?2=1) AS can_delete,(cm.author=?1) AS can_edit,
        EXISTS (SELECT 1 FROM board_edited_entries e WHERE e.comment_id=cm.id) AS edited,(cm.author=p.author) AS by_writer,0 AS deleted${nicknameProjection(u.role, 'cm')}
      FROM comments cm JOIN posts p ON p.id=cm.post_id WHERE cm.post_id=? AND cm.id<?
      UNION ALL
      SELECT DISTINCT r.parent_id,NULL,NULL,0,0,0,0,1${u.role === 'owner' ? ',NULL' : ''} FROM comment_replies r
      WHERE r.post_id=? AND r.parent_id<? AND NOT EXISTS (SELECT 1 FROM comments cm WHERE cm.id=r.parent_id)
    ) SELECT t.*,(SELECT COUNT(*) FROM comment_replies r WHERE r.post_id=? AND r.parent_id=t.id) AS reply_count
      FROM threads t ORDER BY t.id DESC LIMIT 51`).bind(u.id, staff, id, pageAfter(c.req.query('before')), id, pageAfter(c.req.query('before')), id),
  ]);
  const post = posts.results[0] as PostDetail | undefined;
  return post ? c.json({ post, comments: (comments.results as CommentThread[]).slice(0,50), more: comments.results.length > 50 }) : c.json({ error: '글을 찾을 수 없어요.' }, 404);
});
app.put('/board/posts/:id/reaction', async c => {
  const { reaction } = await input(c.req);
  if (reaction !== 'like' && reaction !== 'dislike' && reaction !== null) return c.json({ error: '좋아요 또는 싫어요를 선택해 주세요.' }, 400);
  const db = c.env.DB, post = c.req.param('id'), actor = c.get('user')!.id;
  const [access, , totals] = await db.batch<Partial<ReactionCounts & { present: number; approved: number }>>([
    db.prepare("SELECT EXISTS(SELECT 1 FROM posts WHERE id=?) AS present, EXISTS(SELECT 1 FROM accounts WHERE id=? AND status='approved') AS approved").bind(post,actor),
    reaction === null
      ? db.prepare("DELETE FROM post_reactions WHERE post_id=? AND account_id IN (SELECT id FROM accounts WHERE id=? AND status='approved')").bind(post,actor)
      : db.prepare(`INSERT INTO post_reactions(post_id,account_id,reaction)
        SELECT p.id,a.id,? FROM posts p JOIN accounts a ON a.id=? AND a.status='approved' WHERE p.id=?
        ON CONFLICT(post_id,account_id) DO UPDATE SET reaction=excluded.reaction`).bind(reaction,actor,post),
    db.prepare(`${countReactions}?`).bind(post),
  ]);
  if (!access.results[0]?.approved) return c.json(invalid,403);
  if (!access.results[0]?.present) return c.json({ error: '글을 찾을 수 없어요.' },404);
  return c.json({ reaction, like_count:totals.results[0]?.like_count ?? 0, dislike_count:totals.results[0]?.dislike_count ?? 0 });
});
app.post('/board/posts/:id/comments', async c => {
  const b = await input(c.req), text = clean(b.body, 1000);
  if (!text) return c.json({ error: '댓글 내용을 입력해 주세요.' }, 400);
  const actor = c.get('user')!.id, post = c.req.param('id'), db = c.env.DB;
  const [result, alert] = await db.batch<{ id?: number; recipient?: number }>([
    db.prepare("INSERT INTO comments (post_id,author,body) SELECT p.id,a.id,? FROM posts p JOIN accounts a ON a.id=? AND a.status='approved' WHERE p.id=? RETURNING id").bind(text, actor, post),
    db.prepare("INSERT INTO board_notifications(recipient,post_id,kind) SELECT p.author,p.id,'comment' FROM posts p JOIN accounts a ON a.id=p.author AND a.status='approved' WHERE changes()=1 AND p.id=? AND p.author<>? RETURNING recipient").bind(post, actor),
  ]);
  scheduleBoardPush(c, alert.results[0]?.recipient);
  return result.results.length ? c.json({ ok: true }, 201) : c.json({ error: '글이 없거나 입장 권한이 바뀌었어요.' }, 409);
});
app.get('/board/posts/:id/comments/:parent/replies', async c => {
  const u = c.get('user')!, { id, parent } = c.req.param();
  const { results } = await c.env.DB.prepare(`SELECT r.id,r.body,r.created_at,(r.author=?1 OR ?2=1) AS can_delete,(r.author=?1) AS can_edit,
    EXISTS (SELECT 1 FROM board_edited_entries e WHERE e.reply_id=r.id) AS edited,(r.author=p.author) AS by_writer${nicknameProjection(u.role, 'r')}
    FROM comment_replies r JOIN posts p ON p.id=r.post_id WHERE r.post_id=? AND r.parent_id=? AND r.id<? ORDER BY r.id DESC LIMIT 21`)
    .bind(u.id, Number(u.role !== 'member'), id, parent, pageAfter(c.req.query('before'))).all<Reply>();
  return c.json({ rows: results.slice(0,20), more: results.length > 20 });
});
app.post('/board/posts/:id/comments/:parent/replies', async c => {
  const { body } = await input(c.req), text = clean(body, 1000), { id, parent } = c.req.param();
  if (!text) return c.json({ error: '답글 내용을 입력해 주세요.' }, 400);
  const actor = c.get('user')!.id, db = c.env.DB;
  const [result, alert] = await db.batch<{ id?: number; recipient?: number }>([
    db.prepare(`INSERT INTO comment_replies (post_id,parent_id,author,body)
      SELECT cm.post_id,cm.id,a.id,? FROM comments cm JOIN accounts a ON a.id=? AND a.status='approved'
      WHERE cm.post_id=? AND cm.id=? RETURNING id`).bind(text, actor, id, parent),
    db.prepare("INSERT INTO board_notifications(recipient,post_id,kind) SELECT cm.author,cm.post_id,'reply' FROM comments cm JOIN accounts a ON a.id=cm.author AND a.status='approved' WHERE changes()=1 AND cm.post_id=? AND cm.id=? AND cm.author<>? RETURNING recipient").bind(id, parent, actor),
  ]);
  scheduleBoardPush(c, alert.results[0]?.recipient);
  return result.results[0] ? c.json(result.results[0], 201) : c.json({ error: '원댓글이 삭제됐거나 답글을 달 수 없어요.' }, 409);
});
app.patch('/board/:kind/:id', async c => {
  const { kind, id } = c.req.param();
  if (kind !== 'posts' && kind !== 'comments' && kind !== 'replies') return c.json({ error: '수정할 항목이 없어요.' }, 404);
  const table = kind === 'replies' ? 'comment_replies' : kind;
  const column = kind === 'posts' ? 'post_id' : kind === 'comments' ? 'comment_id' : 'reply_id';
  const data = await input(c.req), body = clean(data.body, kind === 'posts' ? 5000 : 1000);
  const title = kind === 'posts' ? clean(data.title, 100) : '';
  if (!body || (kind === 'posts' && !title)) return c.json({ error: kind === 'posts' ? '제목과 내용을 모두 입력해 주세요.' : '내용을 입력해 주세요.' }, 400);
  const db = c.env.DB, actor = c.get('user')!.id;
  const owned = `id=? AND author IN (SELECT id FROM accounts WHERE id=? AND status='approved')`;
  const update = kind === 'posts'
    ? db.prepare(`UPDATE posts SET title=?,body=? WHERE ${owned} AND (title<>? OR body<>?)`).bind(title,body,id,actor,title,body)
    : db.prepare(`UPDATE ${table} SET body=? WHERE ${owned} AND body<>?`).bind(body,id,actor,body);
  // A failed or unchanged write must not mark the entry as edited.
  const [result] = await db.batch([update, db.prepare(`INSERT OR IGNORE INTO board_edited_entries(${column}) SELECT id FROM ${table} WHERE changes()=1 AND ${owned}`).bind(id,actor)]);
  if (result.meta.changes) return c.json({ ok: true, changed: true });
  const exists = await db.prepare(`SELECT 1 FROM ${table} WHERE ${owned}`).bind(id,actor).first();
  return exists ? c.json({ ok: true, changed: false }) : c.json({ error: '이미 삭제됐거나 내가 작성한 항목이 아니에요.' }, 404);
});
app.delete('/board/:kind/:id', async c => {
  const plural = c.req.param('kind');
  if (plural !== 'posts' && plural !== 'comments' && plural !== 'replies') return c.json({ error: '삭제할 항목이 없어요.' }, 404);
  const table = plural === 'replies' ? 'comment_replies' : plural;
  const id = c.req.param('id'), u = c.get('user')!, kind = plural === 'posts' ? 'post' : plural === 'replies' ? 'reply' : 'comment';
  const [, result] = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO deletion_log(kind,item_id,post_id,actor_email) SELECT ?,target.id,target.${kind === 'post' ? 'id' : 'post_id'},n.nickname FROM ${table} target JOIN accounts a ON a.id=? AND a.status='approved' AND a.role IN ('owner','moderator') JOIN nickname_credentials n ON n.account_id=a.id WHERE target.id=?`).bind(kind, u.id, id),
    c.env.DB.prepare(`DELETE FROM ${table} AS target WHERE target.id=? AND ${actorAllowed}`).bind(id, u.id),
  ]);
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: '삭제할 수 없거나 이미 삭제됐어요.' }, 403);
});

app.use('/owner/*', async (c, next) => {
  const u = c.get('user');
  if (u?.role !== 'owner' || u.status !== 'approved') return c.json({ error: '운영자만 할 수 있어요.' }, 403);
  await next();
});
app.get('/owner/posts/:id/reactions', async c => {
  const id = c.req.param('id'), db = c.env.DB;
  const [post, rows] = await db.batch<ReactionRow>([
    db.prepare('SELECT id FROM posts WHERE id=?').bind(id),
    db.prepare(`SELECT r.account_id AS id,n.nickname,r.reaction FROM post_reactions r
      LEFT JOIN nickname_credentials n ON n.account_id=r.account_id
      WHERE r.post_id=? AND r.account_id<? ORDER BY r.account_id DESC LIMIT 31`).bind(id,pageAfter(c.req.query('before'))),
  ]);
  if (!post.results.length) return c.json({ error: '글을 찾을 수 없어요.' },404);
  return c.json({ rows: rows.results.slice(0,30), more: rows.results.length > 30 });
});
app.put('/owner/appearance', async c => {
  const appearance = normalizeAppearance(await input(c.req));
  if (!appearance) return c.json({ error: '설치 이름은 48자, 공유 제목은 30자, 소개는 60자 이내로 입력해 주세요. 이미지는 공개 HTTPS 주소를 사용해 주세요.' }, 400);
  await c.env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(appearanceKey, JSON.stringify(appearance)).run();
  return c.json({ appearance });
});
app.get('/owner/accounts', async c => {
  const group = c.req.query('group');
  const filter = group === 'members' ? "status='approved'" : group === 'decisions' ? "status IN ('rejected','revoked')" : "status='pending'";
  const { results } = await c.env.DB.prepare(`SELECT a.id,n.nickname,a.status,a.role,a.requested_at FROM accounts a JOIN nickname_credentials n ON n.account_id=a.id WHERE ${filter} AND role!='owner' AND a.id<? ORDER BY a.id DESC LIMIT 51`).bind(pageAfter(c.req.query('before'))).all<Account>();
  return c.json({ rows: results.slice(0,50), more: results.length > 50 });
});
app.get('/owner/post-authors', async c => {
  const { results } = await c.env.DB.prepare(`SELECT p.id,p.title,p.created_at,n.nickname FROM posts p
    LEFT JOIN nickname_credentials n ON n.account_id=p.author AND n.nickname_key!=?
    WHERE p.id<? ORDER BY p.id DESC LIMIT 51`).bind(pendingOwnerKey, pageAfter(c.req.query('before'))).all<PostAuthor>();
  return c.json({ rows: results.slice(0,50), more: results.length > 50 });
});
app.patch('/owner/accounts/:id', async c => {
  const { action } = await input(c.req);
  const change = action === 'approve' ? ["status='approved',role='member'", "status IN ('pending','rejected','revoked')"] : action === 'reject' ? ["status='rejected'", "status='pending'"] : action === 'revoke' ? ["status='revoked',role='member'", "status='approved'"] : action === 'grant' ? ["role='moderator'", "status='approved' AND role='member'"] : action === 'demote' ? ["role='member'", "status='approved' AND role='moderator'"] : null;
  if (!change) return c.json({ error: '할 수 없는 작업이에요.' }, 400);
  const result = await c.env.DB.prepare(`UPDATE accounts SET ${change[0]} WHERE id=? AND role!='owner' AND ${change[1]}`).bind(c.req.param('id')).run();
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: '이미 처리됐거나 해당 계정을 찾을 수 없어요.' }, 409);
});
app.get('/owner/audit', async c => {
  const { results } = await c.env.DB.prepare("SELECT id,kind,item_id,post_id,CASE WHEN instr(actor_email,'@')=0 THEN actor_email ELSE '이전 계정' END AS actor_nickname,created_at FROM deletion_log WHERE id<? ORDER BY id DESC LIMIT 51").bind(pageAfter(c.req.query('before'))).all<Deletion>();
  return c.json({ rows: results.slice(0,50), more: results.length > 50 });
});
app.put('/owner/copy/:key', async c => {
  const key = c.req.param('key');
  if (!Object.hasOwn(copy, key)) return c.json({ error: '수정할 수 없는 문구예요.' }, 404);
  const { value } = await input(c.req);
  if (value === null) {
    await c.env.DB.prepare('DELETE FROM site_copy WHERE key=?').bind(key).run();
    return c.json({ value: copy[key as CopyKey] });
  }
  if (typeof value !== 'string' || !value.trim() || value.length > 240) return c.json({ error: '문구를 1~240자로 입력해 주세요.' }, 400);
  const trimmed = value.trim();
  await c.env.DB.prepare('INSERT INTO site_copy VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, trimmed).run();
  return c.json({ value: trimmed });
});
app.notFound(c => c.json({ error: '찾을 수 없는 화면이에요.' }, 404));
app.onError((err, c) => {
  console.error('Board request failed', err.name, c.req.method);
  return c.json({ error: '잠시 뒤 다시 시도해 주세요.' }, 500);
});
const canonical = 'https://dgpy.baze.cloud';
const escapeAttr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export default {
  async fetch(request: Request, env: BoardEnv['Bindings'], ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/api') return app.fetch(request, env, ctx);
    const isSharePage = url.pathname === '/' || url.pathname === '/admin' || /^\/posts\/[1-9]\d{0,14}\/?$/.test(url.pathname);
    if (!isSharePage || (request.method !== 'GET' && request.method !== 'HEAD')) return env.ASSETS.fetch(request);
    // Only the public board-wide text belongs in HTML. Never query or expose post or member data here.
    const [shell, appearance] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL('/', url), { method: request.method })),
      getAppearance(env.DB).catch(() => defaultAppearance),
    ]);
    if (!shell.ok || !shell.headers.get('content-type')?.includes('text/html')) return shell;
    const title = appearance.shareTitle || defaultSharePreview.title;
    const description = appearance.shareDescription || defaultSharePreview.description;
    const headers = new Headers(shell.headers);
    for (const name of ['etag', 'last-modified', 'content-length']) headers.delete(name);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex');
    const response = new Response(shell.body, { status: shell.status, headers });
    if (request.method === 'HEAD') return response;
    const rewriter = new HTMLRewriter();
    for (const [attribute, key, value] of [
      ['property', 'og:title', title], ['property', 'og:description', description],
      ['property', 'og:url', `${canonical}${url.pathname}`],
      ['name', 'twitter:title', title], ['name', 'twitter:description', description], ['name', 'description', description],
    ]) {
      rewriter.on(`meta[${attribute}="${key}"]`, { element: element => { element.replace(`<meta ${attribute}="${key}" content="${escapeAttr(value)}" />`, { html: true }); } });
    }
    return rewriter.transform(response);
  },
};
