import { useEffect, useState, type MouseEvent } from 'react';
import { BellRing, CheckCheck, MessageCircle, Reply, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { api, ApiError } from '../lib/api';
import { Dialog } from './board-ui';

type Notice = { id: number; post_id: number; title: string | null; kind: 'comment' | 'reply'; is_read: number; created_at: string };
type NoticePage = { rows: Notice[]; more: boolean; hasRead: boolean };
const path = '/api/board/notifications';
const date = new Intl.DateTimeFormat('ko-KR', { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Seoul' });
const showError = (error: unknown) => error instanceof Error ? error.message : '잠시 뒤 다시 시도해 주세요.';
const device = (action: string, subscription: PushSubscription, publicKey?: string) => api<{ enabled: boolean }>(`${path}/device`, {
  method:'POST', body:JSON.stringify({ action, endpoint:subscription.endpoint, ...subscription.toJSON().keys, publicKey }),
});
const appleMobile = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true);
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function DevicePush() {
  const [support] = useState(() => appleMobile() && !installed() ? '아이폰·아이패드는 홈 화면에 추가한 게시판에서 알림을 켤 수 있어요.' : !canPush() ? '이 브라우저에서는 푸시를 사용할 수 없어요. 게시판 안 알림은 계속 받을 수 있어요.' : '');
  const [setup, setSetup] = useState<{ registration: ServiceWorkerRegistration; publicKey: string } | null>(null);
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [attempt, retry] = useState(0);
  const [testing, setTesting] = useState(false), [result, setResult] = useState('');
  useEffect(() => {
    if (support) return;
    let active = true;
    async function prepare() {
      try {
        await navigator.serviceWorker.register('/sw.js', { updateViaCache:'none' });
        const [registration, { publicKey }] = await Promise.all([navigator.serviceWorker.ready, api<{ publicKey:string }>(`${path}/push-key`, { method:'POST' })]);
        const subscription = await registration.pushManager.getSubscription();
        const state = subscription ? await device('status', subscription) : { enabled:false };
        if (active) { setEnabled(state.enabled); setSetup({ registration, publicKey }); }
      } catch { if (active) setError(window.top !== window.self ? '미리보기에서 푸시를 켤 수 없으면 게시판을 별도 창에서 열어 주세요.' : '휴대폰 알림을 준비하지 못했어요. 다시 시도해 주세요.'); }
    }
    void prepare();
    return () => { active = false; };
  }, [attempt,support]);
  async function toggle() {
    if (!setup || busy) return;
    setBusy(true); setError(''); setResult('');
    const { registration, publicKey } = setup;
    try {
      if (enabled) {
        const sub = await registration.pushManager.getSubscription();
        if (sub) await device('disable',sub);
        setEnabled(false);
      } else {
        if (Notification.permission === 'denied') throw new Error('브라우저 설정에서 이 게시판의 알림을 허용한 뒤 다시 시도해 주세요.');
        const applicationServerKey = Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
        // Start subscribe directly from the tap so permission prompts work on iOS.
        const sub = await registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey }).catch(async (err: unknown) => {
          if (!(err instanceof DOMException) || err.name !== 'InvalidStateError') throw err;
          const stale = await registration.pushManager.getSubscription();
          if (!stale) throw err;
          await stale.unsubscribe();
          throw new Error('기기 알림 설정이 바뀌었어요. 한 번 더 눌러 켜 주세요.');
        });
        await device('enable',sub,publicKey);
        setEnabled(true);
      }
    } catch (err) {
      setError(err instanceof DOMException ? '알림을 켤 수 없어요. 브라우저의 알림 권한을 확인해 주세요.' : showError(err));
    } finally { setBusy(false); }
  }
  async function testPush() {
    if (!setup || !enabled || busy || testing) return;
    setTesting(true); setError(''); setResult('');
    let sub: PushSubscription | null = null;
    try {
      sub = await setup.registration.pushManager.getSubscription();
      if (!sub || Notification.permission !== 'granted') {
        setEnabled(false);
        throw new Error('이 기기에서 알림을 다시 허용하고 푸시를 켜 주세요.');
      }
      await api(`${path}/device`, { method:'POST', body:JSON.stringify({ action:'test', endpoint:sub.endpoint }) });
      setResult('테스트 푸시를 보냈어요. 안 보이면 기기의 알림 센터와 집중 모드 설정을 확인해 주세요.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        await sub?.unsubscribe().catch(() => {});
        setEnabled(false);
      }
      setError(showError(err));
    } finally { setTesting(false); }
  }
  return <section className="notice-device" aria-label="이 기기의 푸시 설정">
    <div className="notice-device-heading"><BellRing size={17} aria-hidden="true"/><h3>이 기기에서 푸시 받기</h3></div>
    <p>{support || '게시판을 닫아도 받을 수 있어요. 잠금 화면에는 댓글 내용이나 작성자 이름이 나오지 않아요.'}</p>
    {!support && <div className="sl-actions">
      {setup ? <button type="button" className="sl-button" disabled={busy || testing} onClick={() => void toggle()}>{busy ? '변경하는 중…' : enabled ? '푸시 끄기' : '푸시 켜기'}</button>
        : error ? <button type="button" className="sl-button" onClick={() => { setError(''); retry(n => n+1); }}>다시 시도</button> : <span role="status">준비하는 중…</span>}
      {enabled && <button type="button" className="sl-button" disabled={busy || testing} onClick={() => void testPush()}>{testing ? '보내는 중…' : '테스트 푸시 보내기'}</button>}
      {setup && <span className="notice-state" role="status">{enabled ? '켜짐' : '꺼짐'}</span>}
    </div>}
    {result && <p role="status">{result}</p>}
    {error && <p className="sl-error" role="alert">{error}</p>}
  </section>;
}

export default function BoardNotifications({ unread, onClose, onRead, onOpenPost }: { unread: number; onClose: () => void; onRead: (all?: boolean) => void; onOpenPost: (id:number) => void }) {
  const [page,setPage] = useState<NoticePage | null>(null), [error,setError] = useState(''), [attempt,retry] = useState(0), [busy,setBusy] = useState(false);
  const [marking,setMarking] = useState(false), [deleting,setDeleting] = useState(false), [confirmDelete,setConfirmDelete] = useState(false);
  const [status,setStatus] = useState('');
  const locked = busy || marking || deleting || confirmDelete;
  useEffect(() => {
    let active = true;
    api<NoticePage>(path).then(value => { if (active) setPage(value); }).catch(err => { if (active) setError(showError(err)); });
    return () => { active = false; };
  }, [attempt]);
  async function more() {
    if (!page?.more || locked) return;
    setBusy(true); setError('');
    try {
      const next = await api<NoticePage>(`${path}?before=${page.rows.at(-1)?.id}`);
      setPage(old => ({ ...next, rows:[...(old?.rows ?? []), ...next.rows] }));
    } catch (err) { setError(showError(err)); }
    finally { setBusy(false); }
  }
  async function readAll() {
    if (locked) return;
    setMarking(true); setStatus(''); setError('');
    try {
      const { marked } = await api<{ marked:number }>(`${path}/read-all`, { method:'PATCH' });
      setPage(old => old && ({ ...old, hasRead:old.hasRead || marked > 0 || old.rows.length > 0, rows:old.rows.map(n => ({ ...n, is_read:1 })) }));
      setStatus('모두 읽음으로 표시했어요.');
      onRead(true);
    } catch (err) { setError(showError(err)); }
    finally { setMarking(false); }
  }
  async function removeRead() {
    if (deleting || !confirmDelete) return;
    setDeleting(true); setStatus(''); setError('');
    try {
      const { removed, ...remaining } = await api<NoticePage & { removed:number }>(`${path}/read`, { method:'DELETE' });
      setPage(remaining);
      setConfirmDelete(false);
      setStatus(removed ? `읽은 알림 ${removed.toLocaleString('ko-KR')}개를 삭제했어요.` : '삭제할 읽은 알림이 없어요.');
    } catch (err) { setError(showError(err)); }
    finally { setDeleting(false); }
  }
  async function open(row: Notice, event?: MouseEvent<HTMLAnchorElement>) {
    if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    event?.preventDefault();
    if (locked) return;
    setBusy(true);
    try {
      if (!row.is_read) {
        await api(`${path}/${row.id}/read`, { method:'PATCH' });
        setPage(old => old && ({ ...old, hasRead:true, rows:old.rows.map(n => n.id === row.id ? { ...n, is_read:1 } : n) }));
        onRead();
      }
      if (row.title !== null) onOpenPost(row.post_id);
    } catch (err) { setError(showError(err)); }
    finally { setBusy(false); }
  }
  return <Dialog title="내 알림" onClose={() => { if (!deleting) { if (confirmDelete) setConfirmDelete(false); else onClose(); } }}>
    <p className="notice-intro">내 글에 달린 댓글과 내 댓글에 달린 대댓글을 모아 봐요.</p>
    <div className="notice-toolbar"><button type="button" className="sl-button" disabled={locked || !page || (unread === 0 && !page.rows.some(n => !n.is_read))} onClick={() => void readAll()}><CheckCheck size={16} aria-hidden="true"/>{marking ? '처리하는 중…' : '모두 읽음'}</button>
      <button type="button" className="sl-button" disabled={locked || !page?.hasRead} onClick={() => { setConfirmDelete(true); setStatus(''); setError(''); }}><Trash2 size={16} aria-hidden="true"/>읽은 알림 삭제</button>
    </div>
    {confirmDelete && <section className="notice-cleanup" aria-label="읽은 알림 삭제 확인">
      <p>읽은 알림을 모두 삭제할까요? 안 읽은 알림은 남아요.</p>
      <div className="sl-actions"><button type="button" className="sl-danger" disabled={deleting} onClick={() => void removeRead()}>{deleting ? '삭제하는 중…' : '읽은 알림 모두 삭제'}</button>
        <button type="button" className="sl-button" disabled={deleting} onClick={() => { setConfirmDelete(false); setError(''); }}>취소</button></div>
    </section>}
    {status && <p role="status" className="notice-state notice-feedback">{status}</p>}
    {!page && !error && <p className="notice-empty" role="status">알림을 불러오는 중…</p>}
    {page?.rows.length === 0 && <p className="notice-empty">아직 받은 알림이 없어요.</p>}
    {!!page?.rows.length && <ul className="notice-list">{page.rows.map(row => {
      const Icon = row.kind === 'comment' ? MessageCircle : Reply;
      const label = row.kind === 'comment' ? '내 글에 댓글이 달렸어요' : '내 댓글에 대댓글이 달렸어요';
      const content = <><span className="notice-icon"><Icon size={18} aria-hidden="true"/></span><span className="notice-text"><strong>{label}{!row.is_read && <span className="notice-new">새 알림</span>}</strong><span>{row.title ?? '삭제된 글이에요'}</span><time dateTime={row.created_at}>{date.format(new Date(row.created_at))}</time></span></>;
      return <li key={row.id} data-unread={!row.is_read}>{row.title !== null
        ? <Link className="notice-item" to={`/posts/${row.post_id}`} onClick={e => void open(row,e)}>{content}</Link>
        : row.is_read ? <div className="notice-item">{content}</div> : <button type="button" className="notice-item" onClick={() => void open(row)}>{content}</button>}</li>;
    })}</ul>}
    {error && <p className="sl-error" role="alert">{error}</p>}
    {!page && error && <button type="button" className="sl-button" onClick={() => { setError(''); retry(n => n+1); }}>다시 시도</button>}
    {page?.more && <button type="button" className="sl-button" disabled={locked} onClick={() => void more()}>{busy ? '불러오는 중…' : '이전 알림 더 보기'}</button>}
    <DevicePush/>
    <button type="button" className="sl-primary" disabled={deleting} onClick={onClose}>닫기</button>
  </Dialog>;
}
