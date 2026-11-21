import { createContext, use, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, ChevronRight, Clock3, GraduationCap, LockKeyhole, LogIn, ShieldCheck, Smartphone } from 'lucide-react';
import { copy, type CopyKey, type Session } from '../board-copy';
import { builtInIcons, type Appearance } from '../appearance';

export const CopyContext = createContext({ words: {} as Partial<Record<CopyKey, string>>, editing: false, select: (_key: CopyKey) => {} });
export function useCopy() {
  const ctx = use(CopyContext);
  return { ...ctx, word: (key: CopyKey) => ctx.words[key] ?? copy[key] };
}
export function Text({ id }: { id: CopyKey }) {
  const { editing, word, select } = useCopy();
  return editing ? <button type="button" className="copy-inline" onClick={() => select(id)}>{word(id)}</button> : <>{word(id)}</>;
}
type ActionProps = { id: CopyKey; children?: ReactNode; suffix?: ReactNode; onClick?: () => void; className?: string; type?: 'button' | 'submit'; disabled?: boolean; expanded?: boolean };
export function Action({ id, children, suffix, onClick, className = 'sl-button', type = 'button', disabled, expanded }: ActionProps) {
  const { editing, word, select } = useCopy();
  return <button className={`${className} ${editing ? 'copy-action' : ''}`} type={editing ? 'button' : type} disabled={!editing && disabled} aria-expanded={editing ? undefined : expanded} onClick={editing ? () => select(id) : onClick}>{children}{word(id)}{suffix}</button>;
}
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), label = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="sl-dialog" aria-labelledby={label} onCancel={e => { e.preventDefault(); onClose(); }}><h2 id={label}>{title}</h2>{children}</dialog>;
}
export function Mark({ size = 23 }: { size?: number }) { return <GraduationCap size={size} strokeWidth={1.8} aria-hidden="true"/>; }
export function InstallIcon() { return <Smartphone size={16} aria-hidden="true"/>; }
function CustomImage({ url, className, fallback }: { url: string; className?: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  return !url || failed ? fallback : <img src={url} className={className} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>;
}
export function BrandIcon({ url }: { url: string }) {
  return <span className="brand-mark"><CustomImage key={url} url={url} fallback={<img src={builtInIcons.tab} width={43} height={43} alt=""/>}/></span>;
}
export function PrivacyNotice() {
  return <p className="identity-notice"><ShieldCheck size={16} aria-hidden="true"/><span><Text id="identityNotice"/></span></p>;
}

function HallArt() {
  return <svg className="hall-art" viewBox="0 0 515 211" fill="none" aria-hidden="true">
    <defs><pattern id="scribble" width="23" height="23" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#dacbff" opacity=".2"/></pattern></defs>
    <path d="M0 36h515v175H0z" fill="url(#scribble)"/>
    <path d="M0 168h515M0 199h515M44 211l110-53m99 53v-49m111 49-77-50m195 50-151-50" stroke="#b69af6" opacity=".2"/>
    <g stroke="#bba0fb" strokeWidth="1.3" opacity=".65"><path d="M35 166V95l54 20v49m-43 0v-54l33 12v42M91 165v-47l53 13v34m-41 0v-34l29 7v27m244 0v-50l48-15v65m11 0V96l53-20v89"/><path d="M387 165v-42l25-8v50m35 0v-60l29-11v71"/></g>
    <path d="M98 170c31-4 44-15 59-33 24-28 17-62 39-84 18-20 51-27 70-18 29 14 17 44 39 64 21 21 61 5 92 35 11 10 14 26 11 37H98Z" fill="#7452ca"/>
    <g transform="rotate(-9 216 111)"><path d="M161 133a14 14 0 0 1-14-14V78a14 14 0 0 1 14-14h120a14 14 0 0 1 14 14v41a14 14 0 0 1-14 14h-80l-28 20v-20h-12Z" fill="#cdb6ff" stroke="#ebdeff" strokeWidth="2"/><path d="M174 89h78m-78 17h51" stroke="#6038ba" strokeWidth="4" strokeLinecap="round"/></g>
    <g transform="rotate(9 308 142)"><path d="M274 112h69a12 12 0 0 1 12 12v27a12 12 0 0 1-12 12h-6v16l-24-16h-39a12 12 0 0 1-12-12v-27a12 12 0 0 1 12-12Z" fill="#f4eaff" stroke="#fff" strokeWidth="2"/><circle cx="290" cy="138" r="3" fill="#784ccc"/><circle cx="308" cy="138" r="3" fill="#784ccc"/><circle cx="326" cy="138" r="3" fill="#784ccc"/></g>
    <path d="M129 78v20m-10-10h20M369 67v22m-11-11h22M335 44v12m-6-6h12" stroke="#e2cfff" strokeWidth="2" strokeLinecap="round"/><circle cx="114" cy="131" r="4" fill="#ba9cf8"/>
  </svg>;
}

export function Gate({ user, busy, ready, openAuth, setupNeeded, request, refresh, error, appearance }: { user: Session | null; busy: boolean; ready: boolean; openAuth: (mode: 'login' | 'register' | 'owner') => void; setupNeeded?: boolean; request: () => void; refresh: () => void; error: string; appearance: Appearance }) {
  const status = user?.status;
  const pending = status === 'pending', blocked = status === 'rejected' || status === 'revoked';
  const index = pending ? 2 : user ? 1 : 0;
  return <main className="sl-shell gate-layout" id="main" tabIndex={-1}>
    <section className="gate-story" aria-label="학교 익명 커뮤니티 소개">
      <div className={`hero${appearance.hideIllustration ? ' hero-no-art' : ''}`}>
        <div className="hero-content"><div className="hero-tag"><span/><Text id="heroTag"/></div><h2><Text id="hero"/></h2><p><Text id="heroNote"/></p></div>
        {!appearance.hideIllustration && <CustomImage key={appearance.illustrationUrl} url={appearance.illustrationUrl} className="hall-art custom-art" fallback={<HallArt/>}/>}
      </div>
      <div className="privacy"><span className="soft-icon"><ShieldCheck size={21} aria-hidden="true"/></span><div><strong><Text id="privacyTitle"/></strong><p><Text id="privacyNote"/></p><PrivacyNotice/></div></div>
    </section>
    <section className="gate-card">
      <div className="gate-top"><span className="gate-icon">{pending ? <Clock3 size={27} aria-hidden="true"/> : <LockKeyhole size={27} aria-hidden="true"/>}</span><span className="gate-label"><Text id="privacyTag"/></span></div>
      <h1 aria-live="polite"><Text id={pending ? 'pending' : blocked ? status : 'gate'}/></h1>
      <p className="gate-note"><Text id={pending ? 'pendingNote' : status === 'rejected' ? 'rejectedNote' : status === 'revoked' ? 'revokedNote' : user ? 'signedNote' : 'gateNote'}/></p>
      {!blocked && <ol className="steps">{(['stepLogin', 'stepRequest', 'stepEnter'] as const).map((key,i) => <li key={key} data-active={i === index} data-done={i < index} aria-current={i === index ? 'step' : undefined}><span className="step-bubble" aria-hidden="true">{i < index ? <Check size={16}/> : i + 1}</span><span><Text id={key}/></span>{i < 2 && <ChevronRight className="step-arrow" size={14} aria-hidden="true"/>}</li>)}</ol>}
      {error && <p role="alert" className="sl-error">{error}</p>}
      <div className="gate-action">
        {!user ? <><Action id="login" className="sl-primary" onClick={() => openAuth('login')} disabled={busy || !ready}><LogIn size={19} aria-hidden="true"/></Action><div className="gate-alternates">{setupNeeded && <Action id="setupOwner" className="sl-quiet" onClick={() => openAuth('owner')} disabled={busy || !ready}/>}<Action id="firstUse" className="sl-quiet" onClick={() => openAuth('register')} disabled={busy || !ready}/></div></> : pending || blocked ? <Action id="refresh" className="sl-primary" onClick={refresh} disabled={busy}/> : <Action id="request" className="sl-primary" onClick={request} disabled={busy}><ArrowUpRight size={19} aria-hidden="true"/></Action>}
        {user && setupNeeded && <div className="gate-alternates"><Action id="setupOwner" className="sl-quiet" onClick={() => openAuth('owner')} disabled={busy || !ready}/></div>}
        <p className="gate-foot"><LockKeyhole size={13} aria-hidden="true"/><span><Text id="gateFoot"/></span></p>
      </div>
    </section>
  </main>;
}
