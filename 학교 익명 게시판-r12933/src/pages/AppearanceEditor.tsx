import { useRef, useState, type FormEvent } from 'react';
import { defaultAppearance, defaultSharePreview, normalizeAppearance, shareLimits, type Appearance } from '../appearance';
import { api } from '../lib/api';
import { Dialog } from './board-ui';

function checkImage(src: string) {
  return new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image();
    const done = (ok: boolean) => { window.clearTimeout(timer); image.onload = image.onerror = null; resolve(ok ? image : null); };
    const timer = window.setTimeout(() => { done(false); image.removeAttribute('src'); }, 6500);
    image.referrerPolicy = 'no-referrer';
    image.onload = () => done(image.naturalWidth > 0);
    image.onerror = () => done(false);
    image.src = src;
  });
}

export default function AppearanceEditor({ appearance, siteName, onClose, onSaved }: {
  appearance: Appearance; siteName: string; onClose: () => void; onSaved: (value: Appearance) => void;
}) {
  const [draft, setDraft] = useState(appearance), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  const update = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setDraft(old => ({ ...old, [key]: value }));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    setError('');
    const settings = normalizeAppearance(draft);
    if (!settings) { setError('설치 이름은 48자 이내, 공유 제목은 30자, 소개는 60자 이내로 입력해 주세요. 이미지는 공개 HTTPS 주소로, 아이콘 주소는 .png로 끝나야 해요.'); return; }
    saving.current = true; setBusy(true);
    try {
      const checkIcon = settings.iconUrl && settings.iconUrl !== appearance.iconUrl;
      const checkArt = !settings.hideIllustration && settings.illustrationUrl && (settings.illustrationUrl !== appearance.illustrationUrl || appearance.hideIllustration);
      const [icon, art] = await Promise.all([checkIcon ? checkImage(settings.iconUrl) : null, checkArt ? checkImage(settings.illustrationUrl) : null]);
      if (checkIcon && (!icon || icon.naturalWidth !== 512 || icon.naturalHeight !== 512)) throw new Error('앱 아이콘은 열 수 있는 512×512 PNG 이미지 주소를 넣어 주세요.');
      if (checkArt && !art) throw new Error('일러스트를 열 수 없어요. 로그인 없이 바로 열리는 이미지 주소인지 확인해 주세요.');
      const response = await api<{ appearance: Appearance }>('/api/owner/appearance', { method: 'PUT', body: JSON.stringify(settings) });
      onSaved(response.appearance);
    } catch (err) { setError(err instanceof Error ? err.message : '저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { saving.current = false; setBusy(false); }
  }

  return <Dialog title="앱 꾸미기" onClose={() => { if (!saving.current) onClose(); }}>
    <p className="appearance-note">꾸미기 설정을 바꿔도 게시판 주소는 그대로예요.</p>
    <form className="sl-form appearance-form" onSubmit={e => void save(e)}>
      <fieldset disabled={busy}>
        <div className="appearance-fields">
          <label htmlFor="install-name">홈 화면에 설치할 이름</label>
          <input id="install-name" name="installName" autoComplete="off" maxLength={48} placeholder={siteName} value={draft.installName} onChange={e => update('installName', e.target.value)} aria-describedby="install-name-help"/>
          <small id="install-name-help">비워 두면 현재 게시판 이름을 사용해요.</small>
          <label htmlFor="app-icon-url">앱 아이콘 이미지 주소</label>
          <input id="app-icon-url" name="iconUrl" type="url" autoComplete="off" spellCheck={false} maxLength={2048} value={draft.iconUrl} onChange={e => update('iconUrl', e.target.value)} aria-describedby="icon-url-help"/>
          <small id="icon-url-help">공개 512×512 PNG 이미지의 HTTPS 주소를 넣어 주세요. 비워 두면 기본 아이콘을 사용해요.</small>
          <label htmlFor="illustration-url">입장 화면 일러스트 주소</label>
          <input id="illustration-url" name="illustrationUrl" type="url" autoComplete="off" spellCheck={false} maxLength={2048} value={draft.illustrationUrl} disabled={draft.hideIllustration} onChange={e => update('illustrationUrl', e.target.value)} aria-describedby="illustration-help"/>
          <small id="illustration-help">공개 이미지의 HTTPS 주소를 넣어 주세요. 비워 두면 기본 일러스트가 나와요.</small>
          <label className="appearance-checkbox"><input type="checkbox" checked={draft.hideIllustration} onChange={e => update('hideIllustration', e.target.checked)}/> 입장 화면 일러스트 숨기기</label>
        </div>
        <section className="share-editor" aria-labelledby="share-editor-heading">
          <h3 id="share-editor-heading">링크 공유 미리보기</h3>
          <p className="appearance-note">카카오톡 등에서 공유할 때 누구나 보는 문구예요. 비워 두면 기본 문구를 사용해요.</p>
          <div className="appearance-fields">
            <label htmlFor="share-title">공유 제목</label>
            <input id="share-title" name="shareTitle" maxLength={shareLimits.title} autoComplete="off" placeholder={defaultSharePreview.title} value={draft.shareTitle ?? ''} onChange={e => update('shareTitle', e.target.value)}/>
            <label htmlFor="share-description">공유 소개</label>
            <input id="share-description" name="shareDescription" maxLength={shareLimits.description} autoComplete="off" placeholder={defaultSharePreview.description} value={draft.shareDescription ?? ''} onChange={e => update('shareDescription', e.target.value)}/>
          </div>
          <div className="share-example" aria-label="공유 카드 예시">
            <img src="/og.png" alt="" width={800} height={400}/>
            <div><strong>{draft.shareTitle?.trim() || defaultSharePreview.title}</strong><p>{draft.shareDescription?.trim() || defaultSharePreview.description}</p><small>dgpy.baze.cloud</small></div>
          </div>
        </section>
      </fieldset>
      {error && <p className="sl-error" role="alert">{error}</p>}
      <div className="sl-actions"><button type="submit" disabled={busy} className="sl-primary">{busy ? '저장하는 중…' : '저장'}</button><button type="button" disabled={busy} className="sl-button" onClick={onClose}>취소</button><button type="button" disabled={busy} className="sl-button" onClick={() => { setDraft(defaultAppearance); setError(''); }}>기본값 불러오기</button></div>
    </form>
  </Dialog>;
}
