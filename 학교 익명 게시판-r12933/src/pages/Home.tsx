import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Bell, ChevronDown, Clock3, CornerDownRight, LogOut, MessageCircle, Palette, Pencil, Plus, RotateCw, ShieldCheck, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react';
import { copy, type Account, type CommentThread, type CopyKey, type Deletion, type Post, type PostAuthor, type PostDetail, type Reaction, type ReactionCounts, type ReactionRow, type Reply, type Session } from '../board-copy';
import { api, ApiError } from '../lib/api';
import { Action, BrandIcon, CopyContext, Dialog, Gate, InstallIcon, Mark, PrivacyNotice, Text, useCopy } from './board-ui';
import AppearanceEditor from './AppearanceEditor';
import BoardNotifications from './BoardNotifications';
import { PersonalColors, usePersonalColors } from './PersonalColors';
import { builtInIcons, defaultAppearance, type Appearance } from '../appearance';
import NicknameLogin, { type AuthMode } from './NicknameLogin';
import './school.css';

type State = { user: Session | null; words: Partial<Record<CopyKey,string>>; appearance?: Appearance; setupNeeded?: boolean; setupOpen?: boolean; unread?: number };
type Page<T> = { rows: T[]; more: boolean };
const send = (path: string, method: string, body = {}) => api(path, { method, body: JSON.stringify(body) });
const errorText = (e: unknown) => e instanceof Error ? e.message : '잠시 뒤 다시 시도해 주세요.';
const format = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });
const date = (value: string) => format.format(new Date(value));

export default function Home() {
  const [state, setState] = useState<State>({ user: null, words: {} });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [mode, setMode] = useState(false), [key, setKey] = useState<CopyKey | null>(null), [catalog, setCatalog] = useState(false), [install, setInstall] = useState(false);
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const [appearanceEditor, setAppearanceEditor] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { palette, choose } = usePersonalColors();
  const [entryView, setEntryView] = useState<'visitor' | 'pending' | null>(null);
  const req = useRef(0);
  const nav = useNavigate(), loc = useLocation(), { postId } = useParams();
  const fromPush = new URLSearchParams(loc.search).get('notifications') === '1';
  const closeNotifications = () => { setNotificationsOpen(false); if (fromPush) nav(loc.pathname, { replace:true }); };
  const unread = state.unread ?? 0;
  const approved = state.user?.status === 'approved', owner = approved && state.user?.role === 'owner';
  const appearance = state.appearance ?? defaultAppearance;
  const siteName = state.words.site ?? copy.site;
  const previewingEntry = !!owner && entryView !== null;
  const editing = !!owner && (mode || previewingEntry);
  const gateUser: Session | null = previewingEntry ? (entryView === 'pending' ? { role: 'member', status: 'pending' } : null) : state.user;
  const leaveEntry = () => { setEntryView(null); setKey(null); setCatalog(false); };
  const reload = useCallback(async (quiet = false) => {
    const seq = ++req.current;
    try { const data = await api<State>('/api/state'); if (req.current === seq) { setState(data); setReady(true); if (!quiet) setError(''); } }
    catch (e) { if (req.current === seq && !quiet) setError(errorText(e)); }
  }, []);
  useEffect(() => {
    void reload();
    const check = () => { if (!document.hidden) void reload(true); };
    const timer = window.setInterval(check, 10000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [reload]);
  useEffect(() => { document.title = siteName; }, [siteName]);
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('#school-favicon'), touch = document.querySelector<HTMLLinkElement>('#school-touch-icon');
    const title = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (icon) icon.href = appearance.iconUrl || builtInIcons.tab;
    if (touch) touch.href = appearance.iconUrl || builtInIcons.touch;
    if (title) title.content = appearance.installName || siteName;
  }, [appearance.iconUrl, appearance.installName, siteName]);
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await work(); await reload(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  return <CopyContext value={{ words: state.words, editing, select: setKey }}><div className="school-app" data-palette={palette}>
    {!editing && <a className="sl-skip" href="#main">{state.words.skip ?? copy.skip}</a>}
    <header className="sl-header"><div className="sl-shell topbar">
      <div className="brand"><BrandIcon url={appearance.iconUrl}/><div><strong><Text id="site"/></strong><span><Text id="subtitle"/></span></div></div>
      <nav className="sl-actions" aria-label="주 메뉴">
        {approved && !previewingEntry && <Action id="board" onClick={() => nav('/')}/>}
        {owner && !previewingEntry && <Action id="manage" onClick={() => nav('/admin')}/>}
        {approved && !previewingEntry && <button type="button" className="sl-button" aria-haspopup="dialog" aria-label={unread ? `알림, 안 읽은 알림 ${unread}개` : '알림'} onClick={() => setNotificationsOpen(true)}><Bell size={16} aria-hidden="true"/>알림{unread > 0 && <span className="notice-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}</button>}
        <Action id="install" className="sl-install" onClick={() => setInstall(true)}><InstallIcon/></Action>
        <button type="button" className="sl-button" aria-haspopup="dialog" onClick={() => setColorsOpen(true)}><Palette size={16} aria-hidden="true"/>내 화면 색감</button>
        {gateUser && <Action id="logout" onClick={() => void act(async () => { await send('/api/auth/logout','POST'); setState(s => ({ ...s, user: null })); setMode(false); leaveEntry(); nav('/'); })} disabled={busy}><LogOut size={15} aria-hidden="true"/></Action>}
      </nav>
    </div></header>
    {owner && <aside className="sl-shell editbar">
      {previewingEntry ? <>
        <button type="button" className="sl-button" onClick={leaveEntry}><ArrowLeft size={15} aria-hidden="true"/>{state.words.exitEntry ?? copy.exitEntry}</button>
        <div className="sl-actions" role="group" aria-label={state.words.entryViews ?? copy.entryViews}>
          <button type="button" className={entryView === 'visitor' ? 'sl-primary' : 'sl-button'} aria-pressed={entryView === 'visitor'} onClick={() => setEntryView('visitor')}>{state.words.gate ?? copy.gate}</button>
          <button type="button" className={entryView === 'pending' ? 'sl-primary' : 'sl-button'} aria-pressed={entryView === 'pending'} onClick={() => setEntryView('pending')}>{state.words.pending ?? copy.pending}</button>
        </div>
      </> : <>
        <button type="button" className="sl-button" aria-pressed={mode} onClick={() => setMode(v => !v)}><Pencil size={15} aria-hidden="true"/>{state.words[mode ? 'exitEdit' : 'edit'] ?? copy[mode ? 'exitEdit' : 'edit']}</button>
        <button type="button" className="sl-button" onClick={() => { setKey(null); setEntryView('visitor'); }}>{state.words.editEntry ?? copy.editEntry}</button>
        <button type="button" className="sl-button" onClick={() => { setCatalog(false); setKey('boardWarning'); }}><TriangleAlert size={15} aria-hidden="true"/>{state.words.editWarning ?? copy.editWarning}</button>
        <button type="button" className="sl-button" onClick={() => { setCatalog(false); setKey('boardGuideBody'); }}><Pencil size={15} aria-hidden="true"/>추가 안내 본문 설정</button>
        <button type="button" className="sl-button" onClick={() => { setCatalog(false); setKey(null); setAppearanceEditor(true); }}><Palette size={15} aria-hidden="true"/>앱 꾸미기</button>
      </>}
      {editing && <><p><Text id="editHint"/></p><button type="button" className="sl-button" onClick={() => setCatalog(true)}>{state.words.allCopy ?? copy.allCopy}</button></>}
    </aside>}
    {!approved || previewingEntry ? <Gate user={gateUser} busy={busy} ready={ready} openAuth={setAuth} setupNeeded={!previewingEntry && state.setupNeeded} request={() => void act(() => send('/api/admission','POST'))} refresh={() => void act(async () => {})} error={previewingEntry ? '' : error} appearance={appearance}/>
      : <main className="sl-shell board-layout" id="main" tabIndex={-1}>{error && <p className="sl-error" role="alert">{error}</p>}{loc.pathname === '/admin' && owner ? <OwnerPanel/> : <Board key={`${state.user?.role}:${postId ?? 'list'}`} postId={postId} owner={owner} accessChanged={() => void reload(true)}/>}</main>}
    <footer className="sl-shell sl-footer"><div><Mark size={18}/><Text id="footer"/></div><div><ShieldCheck size={15} aria-hidden="true"/><Text id="privateSpace"/></div></footer>
    {install && <Install onClose={() => setInstall(false)}/>}
    {colorsOpen && <PersonalColors palette={palette} choose={choose} onClose={() => setColorsOpen(false)}/>}
    {approved && !previewingEntry && (notificationsOpen || fromPush) && <BoardNotifications unread={unread} onClose={closeNotifications} onRead={all => { if (all) setState(s => ({ ...s, unread:0 })); void reload(true); }} onOpenPost={id => { setNotificationsOpen(false); nav(`/posts/${id}`, { replace:fromPush }); }}/>}
    {owner && appearanceEditor && <AppearanceEditor appearance={appearance} siteName={siteName} onClose={() => setAppearanceEditor(false)} onSaved={value => { req.current++; setState(old => ({ ...old, appearance: value })); setAppearanceEditor(false); }}/>}
    {auth === 'owner' && (!state.setupOpen || state.user)
      ? <Dialog title={state.words.setupOwner ?? copy.setupOwner} onClose={() => { if (!busy) setAuth(null); }}>
        <p className="auth-note"><Text id={state.setupOpen ? 'setupSwitchNote' : 'setupMissingNote'}/></p>
        {error && <p className="sl-error" role="alert">{error}</p>}
        <div className="sl-actions">{state.setupOpen && state.user && <Action id="logoutSetup" className="sl-primary" disabled={busy} onClick={() => void act(async () => { await send('/api/auth/logout','POST'); setState(s => ({ ...s, user: null })); nav('/'); })}/>}<Action id="close" disabled={busy} onClick={() => setAuth(null)}/></div>
      </Dialog>
      : auth && !state.user && <NicknameLogin mode={auth} onClose={() => setAuth(null)} onSuccess={user => { setAuth(null); setState(s => ({ ...s, user })); void reload(); }} />}
    {editing && catalog && !key && <Catalog onClose={() => setCatalog(false)} onSelect={setKey}/>}
    {key && (editing || (owner && (key === 'boardWarning' || key === 'boardGuideBody'))) && <CopyEditor id={key} onClose={() => setKey(null)} onSaved={(id, value) => { req.current++; setState(s => ({ ...s, words: { ...s.words, [id]: value } })); setKey(null); }}/>}
  </div></CopyContext>;
}

function Install({ onClose }: { onClose: () => void }) {
  const { word } = useCopy();
  return <Dialog title={word('installTitle')} onClose={onClose}><p><Text id="installNote"/></p><dl className="install-list"><dt><Text id="ios"/></dt><dd><Text id="iosSteps"/></dd><dt><Text id="android"/></dt><dd><Text id="androidSteps"/></dd></dl><button className="sl-primary" type="button" onClick={onClose}>{word('close')}</button></Dialog>;
}

function Catalog({ onClose, onSelect }: { onClose: () => void; onSelect: (id: CopyKey) => void }) {
  const { word } = useCopy();
  return <Dialog title={word('allCopy')} onClose={onClose}><ul className="copy-list">{(Object.keys(copy) as CopyKey[]).map(id => <li key={id}><button type="button" className="sl-button" onClick={() => onSelect(id)}>{id === 'boardWarning' ? word('warningTitle') : id === 'boardGuideTitle' ? '추가 안내 제목' : id === 'boardGuideBody' ? '추가 안내 본문' : word(id)}<Pencil size={14} aria-hidden="true"/></button></li>)}</ul><button type="button" className="sl-button" onClick={onClose}>{word('close')}</button></Dialog>;
}

function CopyEditor({ id, onClose, onSaved }: { id: CopyKey; onClose: () => void; onSaved: (id: CopyKey, value: string) => void }) {
  const { word } = useCopy(), [value, setValue] = useState(word(id)), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const warning = id === 'boardWarning';
  async function save(value: string | null) {
    if (busy) return;
    setBusy(true); setError('');
    try { const r = await api<{ value: string }>(`/api/owner/copy/${id}`, { method: 'PUT', body: JSON.stringify({ value }) }); onSaved(id, r.value); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  return <Dialog title={id === 'boardGuideBody' ? '추가 안내 본문 설정' : id === 'boardGuideTitle' ? '추가 안내 제목 수정' : word(warning ? 'editWarning' : 'editTitle')} onClose={() => { if (!busy) onClose(); }}>
    {warning && <p className="auth-note">저장하면 승인된 회원에게 게시글 목록과 글 상세 상단에 표시돼요.</p>}
    <form className="sl-form" onSubmit={e => { e.preventDefault(); void save(value); }}><label>{word(warning ? 'warningTitle' : 'editValue')}<textarea rows={4} required maxLength={240} value={value} onChange={e => setValue(e.target.value)}/></label>{error && <p role="alert" className="sl-error">{error}</p>}<div className="sl-actions"><button type="submit" disabled={busy} className="sl-primary">{word('save')}</button><button type="button" disabled={busy} className="sl-button" onClick={onClose}>{word('cancel')}</button>{(!warning || word(id)) && <button type="button" disabled={busy} className="sl-button" onClick={() => void save(null)}>{word(warning ? 'hideWarning' : 'reset')}</button>}</div></form>
  </Dialog>;
}

function BoardGuide() {
  const { word } = useCopy();
  return <details className="board-guide">
    <summary>{word('boardGuideTitle')}<ChevronDown size={18} aria-hidden="true"/></summary>
    <p><Text id="boardGuideBody"/></p>
  </details>;
}

async function readPages<T extends { id: number }>(read: (before?: number) => Promise<Page<T>>, before?: number, retainCount = 0) {
  let page = await read(before);
  const rows = [...page.rows];
  while (rows.length < retainCount && page.more && page.rows.length) {
    page = await read(page.rows.at(-1)!.id);
    rows.push(...page.rows);
  }
  return { rows, more: page.more };
}
async function finishBoardReads(...reads: (Promise<unknown> | null)[]) {
  const failed = (await Promise.allSettled(reads)).filter(result => result.status === 'rejected');
  if (failed.length) throw (failed.find(r => r.reason instanceof ApiError && r.reason.status === 403) ?? failed[0]).reason;
}

type EditEntry = ({ kind: 'posts'; title: string } | { kind: 'comments' | 'replies' }) & { id: number; body: string };
const editLabel = { posts: '게시글 수정', comments: '댓글 수정', replies: '대댓글 수정' } as const;

function EntryActions({ target, allowEdit, allowDelete, onEdit, onDelete }: { target: EditEntry; allowEdit: number; allowDelete: number; onEdit: () => void; onDelete: () => void }) {
  const { editing } = useCopy();
  if (!allowEdit && !allowDelete) return null;
  return <div className="sl-actions entry-actions">
    {!!allowEdit && !editing && <button type="button" className="sl-button" aria-label={editLabel[target.kind]} onClick={onEdit}><Pencil size={14} aria-hidden="true"/>수정</button>}
    {!!allowDelete && <Action id="remove" className="sl-danger" onClick={onDelete}/>}
  </div>;
}

function EntryEditor({ target, busy, error, onClose, onSave }: { target: EditEntry; busy: boolean; error: string; onClose: () => void; onSave: (data: Record<string, FormDataEntryValue>) => void }) {
  const { word } = useCopy();
  return <Dialog title={editLabel[target.kind]} onClose={onClose}>
    <p className="post-meta entry-edit-note">내용을 바꿔 저장하면 다른 회원에게도 ‘수정됨’으로 표시돼요.</p>
    <form className="sl-form" onSubmit={e => { e.preventDefault(); onSave(Object.fromEntries(new FormData(e.currentTarget))); }}>
      {target.kind === 'posts' && <label>{word('title')} *<input name="title" defaultValue={target.title} required maxLength={100} autoComplete="off"/></label>}
      <label>{word('body')} *<textarea name="body" defaultValue={target.body} required rows={target.kind === 'posts' ? 6 : 4} maxLength={target.kind === 'posts' ? 5000 : 1000} autoComplete="off"/></label>
      {error && <p className="sl-error" role="alert">{error}</p>}
      <div className="sl-actions"><button type="submit" className="sl-primary" disabled={busy}>{busy ? '저장하는 중…' : word('save')}</button><button type="button" className="sl-button" disabled={busy} onClick={onClose}>{word('cancel')}</button></div>
    </form>
  </Dialog>;
}

const reactions = [{ value:'like', label:'좋아요', Icon:ThumbsUp }, { value:'dislike', label:'싫어요', Icon:ThumbsDown }] as const;
const formatCount = new Intl.NumberFormat('ko-KR');

function ReactionDetails({ postId, onClose }: { postId: number; onClose: () => void }) {
  const [page, setPage] = useState<Page<ReactionRow> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const url = `/api/owner/posts/${postId}/reactions`;
  const load = (before?: number) => api<Page<ReactionRow>>(before ? `${url}?before=${before}` : url);
  useEffect(() => {
    let active = true;
    void api<Page<ReactionRow>>(url).then(value => { if (active) setPage(value); }, err => { if (active) setError(errorText(err)); });
    return () => { active = false; };
  }, [url]);
  async function fetchPage(before?: number) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const next = await load(before);
      setPage(old => ({ ...next, rows: before ? [...(old?.rows ?? []), ...next.rows] : next.rows }));
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  return <Dialog title="반응 내역" onClose={onClose}>
    <p className="reaction-note">운영자만 반응과 가입 닉네임을 볼 수 있어요.</p>
    {!page && !error && <p role="status" className="reaction-note">불러오는 중…</p>}
    {page && (page.rows.length ? <ul className="reaction-list">{page.rows.map(row => <li key={row.id}><strong>{row.nickname ?? '닉네임 없는 계정'}</strong><span className="entry-edited">{row.reaction === 'like' ? '좋아요' : '싫어요'}</span></li>)}</ul> : <p className="reaction-note">아직 반응이 없어요.</p>)}
    {error && <p className="sl-error" role="alert">{error}</p>}
    <div className="sl-actions reaction-dialog-actions">
      {page?.more && <button className="sl-button" type="button" disabled={busy} onClick={() => void fetchPage(page.rows.at(-1)?.id)}>반응 더 보기</button>}
      {!page && error && <button className="sl-button" type="button" onClick={() => void fetchPage()}>다시 시도</button>}
      <button className="sl-primary" type="button" onClick={onClose}>닫기</button>
    </div>
  </Dialog>;
}

function Board({ postId, owner, accessChanged }: { postId?: string; owner: boolean; accessChanged: () => void }) {
  const nav = useNavigate(), { word, editing, select } = useCopy();
  const [posts, setPosts] = useState<Post[]>([]), [post, setPost] = useState<PostDetail | null>(null), [comments, setComments] = useState<CommentThread[]>([]);
  const [showReactions, setShowReactions] = useState(false);
  const [more, setMore] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [refreshStatus, setRefreshStatus] = useState<'loadingBoard' | 'refreshedBoard' | null>(null);
  const [write, setWrite] = useState(false), [deleting, setDeleting] = useState<{ kind: 'posts' | 'comments' | 'replies'; id: number; hasReplies?: boolean } | null>(null);
  const [editTarget, setEditTarget] = useState<EditEntry | null>(null);
  const [replies, setReplies] = useState<(Page<Reply> & { parent: number }) | null>(null);
  const [compose, setCompose] = useState<{ parent: number; value: string } | null>(null);
  const working = useRef(false);
  const accessRef = useRef(accessChanged); accessRef.current = accessChanged;
  const postUrl = `/api/board/posts${postId ? `/${encodeURIComponent(postId)}` : ''}`;
  const load = useCallback(async (before?: number, retainCount = 0) => {
    const url = (cursor?: number) => `${postUrl}${cursor ? `?before=${cursor}` : ''}`;
    if (postId) {
      let latest: PostDetail | undefined;
      const r = await readPages(async cursor => {
        const result = await api<{ post: PostDetail; comments: CommentThread[]; more: boolean }>(url(cursor));
        latest ??= result.post;
        return { rows: result.comments, more: result.more };
      }, before, retainCount);
      if (latest) setPost(latest);
      setComments(old => before ? [...old, ...r.rows] : r.rows);
      setMore(r.more);
    } else {
      const r = await readPages(cursor => api<Page<Post>>(url(cursor)), before, retainCount);
      setPosts(old => before ? [...old, ...r.rows] : r.rows);
      setMore(r.more);
    }
    setReady(true);
  }, [postId, postUrl]);
  const fail = useCallback((e: unknown) => {
    setError(errorText(e));
    if (e instanceof ApiError && e.status === 403) {
      setPost(null); setPosts([]); setComments([]); setReplies(null); accessRef.current();
    }
  }, []);
  useEffect(() => {
    let current = true;
    working.current = true; setBusy(true);
    void load().catch(e => { if (current) fail(e); }).finally(() => { if (current) { working.current = false; setBusy(false); } });
    return () => { current = false; };
  }, [load, fail]);
  const replyUrl = (parent: number) => `${postUrl}/comments/${parent}/replies`;
  async function loadReplies(parent: number, before?: number, retainCount = 0) {
    const r = await readPages(cursor => api<Page<Reply>>(`${replyUrl(parent)}${cursor ? `?before=${cursor}` : ''}`), before, retainCount);
    setReplies(old => ({ parent, rows: before && old?.parent === parent ? [...old.rows, ...r.rows] : r.rows, more: r.more }));
  }
  function refreshBoard() {
    void run(async () => {
      setRefreshStatus('loadingBoard');
      await finishBoardReads(load(undefined, postId ? comments.length : posts.length), replies && loadReplies(replies.parent, undefined, replies.rows.length));
      setRefreshStatus('refreshedBoard');
    });
  }
  async function run(work: () => Promise<unknown>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setRefreshStatus(null);
    try { await work(); }
    catch (e) { setRefreshStatus(null); fail(e); }
    finally { working.current = false; setBusy(false); }
  }
  function submit(e: FormEvent<HTMLFormElement>, isComment: boolean) {
    e.preventDefault(); if (editing || busy) return;
    const form = e.currentTarget, data = Object.fromEntries(new FormData(form));
    void run(async () => {
      if (isComment) { await send(`${postUrl}/comments`, 'POST', data); form.reset(); await load(undefined, comments.length); }
      else { const r = await api<{ id: number }>('/api/board/posts', { method: 'POST', body: JSON.stringify(data) }); setWrite(false); nav(`/posts/${r.id}`); }
    });
  }
  function submitReply(e: FormEvent<HTMLFormElement>, parent: number) {
    e.preventDefault(); if (editing || busy || compose?.parent !== parent) return;
    void run(async () => {
      await send(replyUrl(parent), 'POST', { body: compose.value });
      setCompose(null);
      await finishBoardReads(load(undefined, comments.length), loadReplies(parent));
    });
  }
  const visibleThreads: CommentThread[] = compose && !comments.some(cm => cm.id === compose.parent)
    ? [...comments, { id: compose.parent, deleted: 1, can_delete: 0, reply_count: replies?.parent === compose.parent ? replies.rows.length : 0 }]
    : comments;
  const refresh = <Action id="boardRefresh" onClick={refreshBoard} disabled={busy}><RotateCw size={16} aria-hidden="true"/></Action>;
  const entryActions = (target: EditEntry, row: { can_edit: number; can_delete: number }, hasReplies?: boolean) => <EntryActions target={target} allowEdit={row.can_edit} allowDelete={row.can_delete}
    onEdit={() => { setError(''); setEditTarget(target); }} onDelete={() => { setError(''); setDeleting({ kind: target.kind, id: target.id, hasReplies }); }}/>;
  return <>
    {postId ? <div className="board-heading"><Action id="back" onClick={() => nav('/')}><ArrowLeft size={17} aria-hidden="true"/></Action>{refresh}</div> : <div className="board-heading"><div><h1><Text id="board"/></h1><p><Text id="boardNote"/></p></div><div className="sl-actions">{refresh}<Action id="write" className="sl-primary" onClick={() => setWrite(true)}><Plus size={19} aria-hidden="true"/></Action></div></div>}
    {word('boardWarning').trim() && <aside className="board-warning" aria-label={word('warningTitle')}><TriangleAlert size={20} aria-hidden="true"/><div><strong><Text id="warningTitle"/></strong><p><Text id="boardWarning"/></p></div></aside>}
    <BoardGuide/>
    <PrivacyNotice/>
    {((!ready && !error) || refreshStatus) && <p className="post-meta" role="status"><Text id={refreshStatus ?? 'loadingBoard'}/></p>}
    {!write && !deleting && !editTarget && error && <p role="alert" className="sl-error">{error}</p>}
    {!postId && <section className="sl-panel">{ready && !posts.length && <p className="sl-empty"><Text id="empty"/></p>}{posts.map(p => <article className="post-summary" key={p.id}>
      {editing ? <h2>{p.title}</h2> : <h2><a href={`/posts/${p.id}`} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); nav(`/posts/${p.id}`); } }}>{p.title}</a></h2>}
      <p className="post-excerpt">{p.body}</p><Meta value={p.created_at} edited={p.edited}/><span className="comment-count"><MessageCircle size={15} aria-hidden="true"/><span><Text id="comment"/> {p.comment_count}</span></span>
    </article>)}</section>}
    {post && <><article className="sl-panel thread"><div className="board-heading"><h1>{post.title}</h1>{entryActions({ kind: 'posts', id: post.id, title: post.title, body: post.body }, post)}</div><Meta value={post.created_at} nickname={post.nickname} edited={post.edited}/><p className="post-body">{post.body}</p>
      {!editing && <div className="post-reactions"><div className="sl-actions" role="group" aria-label="게시글 반응">
        {reactions.map(({ value, label, Icon }) => <button key={value} type="button" className="sl-button reaction-button" aria-label={`${label} ${formatCount.format(post[`${value}_count`])}개`} aria-pressed={post.my_reaction === value} disabled={busy} onClick={() => void run(async () => {
          const { reaction, ...counts } = await api<ReactionCounts & { reaction: Reaction | null }>(`${postUrl}/reaction`, { method:'PUT', body:JSON.stringify({ reaction: post.my_reaction === value ? null : value }) });
          setPost(current => current && { ...current, ...counts, my_reaction:reaction });
        })}><Icon size={16} aria-hidden="true"/>{label} <span className="reaction-count" aria-hidden="true">{formatCount.format(post[`${value}_count`])}</span></button>)}
        {owner && <button className="sl-button owner-reactions" type="button" aria-haspopup="dialog" onClick={() => setShowReactions(true)}><ShieldCheck size={16} aria-hidden="true"/>반응 내역 보기</button>}
      </div></div>}
    </article>
    {owner && showReactions && <ReactionDetails postId={post.id} onClose={() => setShowReactions(false)}/>}
      <section className="sl-panel thread"><h2><Text id="comment"/> {post.comment_count}</h2><form className="sl-form" onSubmit={e => submit(e, true)}><div className="sl-field"><label htmlFor="comment-body">{word('commentField')} *</label>{editing && <button type="button" className="copy-inline" onClick={() => select('commentField')} aria-label={`${word('editTitle')}: ${word('commentField')}`}><Pencil size={15}/></button>}</div><textarea id="comment-body" name="body" required rows={3} maxLength={1000}/><Action id="sendComment" type="submit" className="sl-primary" disabled={busy}/></form>
        {visibleThreads.map(cm => {
          const opened = replies?.parent === cm.id ? replies : null;
          const draft = compose?.parent === cm.id ? compose : null;
          return <article key={cm.id} className="comment-thread">
            <div className="comment-row">{cm.deleted ? <p className="post-meta"><Text id="deletedComment"/></p> : <><div><Meta value={cm.created_at} byWriter={cm.by_writer} nickname={cm.nickname} edited={cm.edited}/><p className="post-body">{cm.body}</p></div>
              {entryActions({ kind: 'comments', id: cm.id, body: cm.body }, cm, cm.reply_count > 0)}</>}</div>
            <div className="sl-actions thread-actions">
              {!cm.deleted && !draft && <Action id="reply" disabled={busy || compose !== null} onClick={() => { setError(''); setCompose({ parent: cm.id, value: '' }); }}><CornerDownRight size={16} aria-hidden="true"/></Action>}
              {(cm.reply_count > 0 || opened) && <Action id={opened ? 'hideReplies' : 'showReplies'} expanded={!!opened} disabled={busy} suffix={<span aria-label={`${cm.reply_count}개`}>{cm.reply_count}</span>} onClick={() => { if (opened) setReplies(null); else void run(() => loadReplies(cm.id)); }}/>}
            </div>
            {opened && <div className="reply-list">
              {[...opened.rows].reverse().map(reply => <div className="reply-row" key={reply.id}><div><Meta value={reply.created_at} byWriter={reply.by_writer} nickname={reply.nickname} edited={reply.edited}/><p className="post-body">{reply.body}</p></div>{entryActions({ kind: 'replies', id: reply.id, body: reply.body }, reply)}</div>)}
              {opened.more && <Action id="moreReplies" disabled={busy} onClick={() => void run(() => loadReplies(cm.id, opened.rows.at(-1)?.id))}/>}
            </div>}
            {draft && <form className="sl-form reply-form" onSubmit={e => submitReply(e, cm.id)}><label htmlFor={`reply-${cm.id}`}>{word('replyField')} *</label><textarea id={`reply-${cm.id}`} name="body" autoComplete="off" value={draft.value} required rows={3} maxLength={1000} onChange={e => setCompose({ parent: cm.id, value: e.target.value })}/><div className="sl-actions"><Action id="sendReply" type="submit" className="sl-primary" disabled={busy || !!cm.deleted}/><Action id="cancel" disabled={busy} onClick={() => setCompose(null)}/></div></form>}
          </article>;
        })}
      </section></>}
    {more && <Action id="more" onClick={() => void run(() => load((postId ? comments : posts).at(-1)?.id))} disabled={busy}/>}
    {write && <Dialog title={word('write')} onClose={() => { setWrite(false); setError(''); }}><form className="sl-form" onSubmit={e => submit(e, false)}><label>{word('title')} *<input name="title" required maxLength={100}/></label><label>{word('body')} *<textarea name="body" required rows={6} maxLength={5000}/></label>{error && <p className="sl-error" role="alert">{error}</p>}<div className="sl-actions"><Action id="publish" type="submit" className="sl-primary" disabled={busy}/><button type="button" className="sl-button" onClick={() => { setWrite(false); setError(''); }}>{word('cancel')}</button></div></form></Dialog>}
    {editTarget && <EntryEditor target={editTarget} busy={busy} error={error} onClose={() => { if (!working.current) { setEditTarget(null); setError(''); } }} onSave={data => void run(async () => {
      await send(`/api/board/${editTarget.kind}/${editTarget.id}`, 'PATCH', data);
      setEditTarget(null);
      if (editTarget.kind === 'replies' && replies) await loadReplies(replies.parent, undefined, replies.rows.length);
      else await load(undefined, comments.length);
    })}/>}
    {deleting && <Dialog title={word(deleting.kind === 'posts' ? 'confirmPost' : deleting.kind === 'replies' ? 'confirmReply' : deleting.hasReplies ? 'confirmRoot' : 'confirmComment')} onClose={() => { setDeleting(null); setError(''); }}>{error && <p className="sl-error" role="alert">{error}</p>}<div className="sl-actions"><Action id="remove" className="sl-danger" disabled={busy} onClick={() => void run(async () => { await send(`/api/board/${deleting.kind}/${deleting.id}`, 'DELETE'); setDeleting(null); if (deleting.kind === 'posts') nav('/'); else await finishBoardReads(load(undefined, comments.length), replies && loadReplies(replies.parent, undefined, replies.rows.length)); })}/><button type="button" className="sl-button" onClick={() => { setDeleting(null); setError(''); }}>{word('cancel')}</button></div></Dialog>}
  </>;
}

function Meta({ value, byWriter, nickname, edited }: { value: string; byWriter?: number; nickname?: string | null; edited?: number }) {
  const privateName = nickname !== undefined;
  return <span className="post-meta">
    {byWriter ? <strong className="writer-badge"><Text id="writerBadge"/></strong> : !privateName && <Text id="anonymousLabel"/>}
    {privateName && <span className="author-chip"><Text id="nicknameLabel"/>: <strong>{nickname ?? <Text id="unknownAuthor"/>}</strong></span>}
    {' '}<span aria-hidden="true">·</span> <time dateTime={value}>{date(value)}</time>
    {!!edited && <span className="entry-edited">수정됨</span>}
  </span>;
}

function OwnerPanel() {
  const [group, setGroup] = useState<'requests' | 'members' | 'decisions' | 'audit' | 'postAuthors'>('requests');
  const [page, setPage] = useState<({ group: typeof group } & Page<Account | Deletion | PostAuthor>) | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async (before?: number) => {
    const run = ++seq.current;
    const path = group === 'audit' ? 'audit?' : group === 'postAuthors' ? 'post-authors?' : `accounts?group=${group}&`;
    try { const r = await api<Page<Account | Deletion | PostAuthor>>(`/api/owner/${path}${before ? `before=${before}` : ''}`); if (run === seq.current) setPage(p => ({ group, rows: before && p?.group === group ? [...p.rows, ...r.rows] : r.rows, more: r.more })); }
    catch (e) { if (run === seq.current) setError(errorText(e)); }
  }, [group]);
  useEffect(() => { void load(); return () => { seq.current++; }; }, [load]);
  async function update(id: number, action: 'approve' | 'reject' | 'revoke' | 'grant' | 'demote') {
    setBusy(true); setError('');
    try { await send(`/api/owner/accounts/${id}`, 'PATCH', { action }); await load(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  const rows = page?.group === group ? page.rows : null;
  const empty = { requests: 'noRequests', members: 'noMembers', decisions: 'noDecisions', audit: 'noAudit', postAuthors: 'noPostAuthors' } as const;
  return <><div className="board-heading"><div><h1><Text id="manage"/></h1><p><Text id="manageNote"/></p></div></div><div className="sl-actions owner-menu">{(['requests','members','decisions','audit','postAuthors'] as const).map(g => <Action key={g} id={g} className={group === g ? 'sl-primary' : 'sl-button'} disabled={busy} onClick={() => { setError(''); if (g === group) void load(); else setGroup(g); }}/>)}</div>
    {error && <p className="sl-error" role="alert">{error}</p>}
    <section className="sl-panel">
      {!rows && !error && <p className="sl-empty" role="status"><Text id="loadingBoard"/></p>}
      {rows?.length === 0 && <p className="sl-empty"><Text id={empty[group]}/></p>}
      {rows?.map(row => 'title' in row ? <article className="owner-row" key={row.id}><div><Link className="owner-post-link" to={`/posts/${row.id}`}>{row.title}</Link><p><Text id="nicknameLabel"/>: <strong>{row.nickname ?? <Text id="unknownAuthor"/>}</strong> · <time dateTime={row.created_at}>{date(row.created_at)}</time></p></div></article>
        : 'kind' in row ? <article className="owner-row" key={row.id}><div><strong>{row.kind === 'post' ? '글' : row.kind === 'reply' ? '답글' : '댓글'} #{row.item_id}</strong><p>{row.actor_nickname} · <time dateTime={row.created_at}>{date(row.created_at)}</time></p></div></article>
        : <article className="owner-row" key={row.id}><div><strong>{row.nickname}</strong><p>{group === 'members' ? <Text id={row.role}/> : group === 'decisions' ? <Text id={row.status === 'revoked' ? 'revoked' : 'rejected'}/> : row.requested_at && <time dateTime={row.requested_at}><Clock3 size={14} aria-hidden="true"/> {date(row.requested_at)}</time>}</p></div><div className="sl-actions">{row.status === 'approved' ? <><Action id={row.role === 'moderator' ? 'demote' : 'grant'} disabled={busy} onClick={() => void update(row.id, row.role === 'moderator' ? 'demote' : 'grant')}/><Action id="revoke" className="sl-danger" disabled={busy} onClick={() => void update(row.id, 'revoke')}/></> : <><Action id="approve" className="sl-primary" disabled={busy} onClick={() => void update(row.id,'approve')}/>{row.status === 'pending' && <Action id="reject" className="sl-danger" disabled={busy} onClick={() => void update(row.id,'reject')}/>}</>}</div></article>)}
    </section>
    {rows && page?.more && <Action id="more" onClick={() => void load(rows.at(-1)?.id)}/>}
  </>;
}
