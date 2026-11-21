import { useEffect, useRef, useState, type FormEvent } from 'react';
import { passwordHint, validNewPassword, type Session } from '../board-copy';
import { api, setTabSession } from '../lib/api';
import { Dialog, useCopy } from './board-ui';

export type AuthMode = 'login' | 'register' | 'owner';

export default function NicknameLogin({ mode, onClose, onSuccess }: { mode: AuthMode; onClose: () => void; onSuccess: (user: Session) => void }) {
  const { word } = useCopy();
  const [draft, setDraft] = useState<{ nickname: string; initialPassword: string; setupCode?: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sessionBlocked, setSessionBlocked] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const isLogin = mode === 'login';
  const role = mode === 'owner' ? 'owner' : 'member';
  useEffect(() => { if (draft) passwordRef.current?.focus(); }, [draft]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setSessionBlocked(false);
    const data = new FormData(e.currentTarget);
    if (!isLogin && !draft) {
      const nickname = String(data.get('nickname') ?? '').normalize('NFKC').trim();
      const initialPassword = String(data.get('initialPassword') ?? '');
      if (!/^[가-힣A-Za-z0-9_-]{2,20}$/.test(nickname)) return setError('닉네임은 한글, 영문, 숫자, 밑줄, 하이픈으로 2~20자까지 쓸 수 있어요.');
      if (mode === 'register' && initialPassword !== '1111') return setError('초기 비밀번호를 다시 확인해 주세요.');
      setDraft({ nickname, initialPassword, ...(mode === 'owner' ? { setupCode: String(data.get('setupCode') ?? '') } : {}) });
      return;
    }
    const password = String(data.get('password') ?? '');
    if (draft && !validNewPassword(password, role)) return setError(passwordHint(role));
    if (draft && password !== data.get('confirmation')) return setError('새 비밀번호와 확인란이 서로 달라요.');
    setBusy(true);
    try {
      const body = draft ? { ...draft, password } : { nickname: data.get('nickname'), password };
      await api(`/api/auth/${isLogin ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(body) });
      let { user } = await api<{ user: Session | null }>('/api/state');
      if (!user) {
        const result = await api<{ tabSession?: string }>('/api/auth/login', {
          method: 'POST', headers: { 'X-Board-Session-Mode': 'tab' }, body: JSON.stringify({ nickname: body.nickname, password }),
        });
        if (result.tabSession && /^[a-f0-9]{64}$/.test(result.tabSession)) {
          setTabSession(result.tabSession);
          ({ user } = await api<{ user: Session | null }>('/api/state'));
        }
      }
      if (!user) {
        setSessionBlocked(true);
        setError(isLogin ? '이 화면에서 로그인 상태를 유지하지 못했어요. 새 탭에서 다시 로그인해 주세요.' : '계정은 만들었어요. 새 탭을 열고 방금 정한 비밀번호로 로그인해 주세요.');
        return;
      }
      onSuccess(user);
    } catch (e) { setError(e instanceof Error ? e.message : '잠시 뒤 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }

  const close = () => { if (!busy) onClose(); };
  return <Dialog title={word(draft ? 'changePassword' : isLogin ? 'login' : mode === 'owner' ? 'setupOwner' : 'firstUse')} onClose={close}>
    {mode === 'owner' && !draft && <p className="auth-note">{word('setupReadyNote')}</p>}
    {!isLogin && (draft || mode === 'register') && <p className="auth-note">{word(draft ? role === 'owner' ? 'ownerChangeNote' : 'changeNote' : 'firstUseNote')}</p>}
    {mode === 'register' && <p className="auth-note signup-privacy">게시글·댓글·대댓글 작성자의 가입 닉네임은 운영자만 볼 수 있어요.</p>}
    <form key={draft ? 'password' : 'start'} className="sl-form auth-form" onSubmit={submit}>
      {draft ? <>
        <input hidden type="text" name="username" autoComplete="username" value={draft.nickname} readOnly/>
        <label>{word('newPassword')} *<input ref={passwordRef} type="password" name="password" autoComplete="new-password" required maxLength={128}/></label>
        <label>{word('confirmPassword')} *<input type="password" name="confirmation" autoComplete="new-password" required maxLength={128}/></label>
      </> : <>
        <label>{word('nickname')} *<input name="nickname" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64}/></label>
        {isLogin ? <label>{word('password')} *<input type="password" name="password" autoComplete="current-password" required maxLength={128}/></label>
          : mode === 'register' && <label>{word('initialPassword')} *<input type="password" name="initialPassword" autoComplete="off" inputMode="numeric" required maxLength={4}/></label>}
        {mode === 'owner' && <label>{word('setupCode')} *<input type="password" name="setupCode" autoComplete="off" required minLength={24} maxLength={256}/><small>{word('setupNote')}</small></label>}
      </>}
      {error && <p role="alert" className="sl-error">{error}</p>}
      {sessionBlocked && <a href="/" target="_blank" rel="noopener noreferrer" className="sl-button">{word('openLoginTab')}</a>}
      <div className="sl-actions auth-actions"><button type="submit" className="sl-primary" disabled={busy}>{busy ? `${word(isLogin ? 'login' : 'save')}…` : word(draft ? 'savePassword' : isLogin ? 'login' : 'next')}</button>
        {draft && <button type="button" className="sl-button" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>{word('back')}</button>}
        <button type="button" className="sl-button" disabled={busy} onClick={close}>{word('cancel')}</button></div>
    </form>
  </Dialog>;
}
