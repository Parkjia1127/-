import { useEffect, useState } from 'react';
import { Dialog } from './board-ui';

const palettes = [
  { id: 'rose', name: '단파티' },
  { id: 'dragee', name: '드라제' },
  { id: 'custard-pudding', name: '커스타드 + 푸딩' },
  { id: 'shortcake', name: '쇼트케이크' },
  { id: 'creme-brulee', name: '크림 브륄레' },
  { id: 'ile-flottante', name: '일 플로랑트' },
  { id: 'brownie-cake', name: '브라우니 + 초코케이크' },
  { id: 'baumkuchen', name: '바움쿠헨' },
  { id: 'apple-juice', name: '사과주스' },
  { id: 'blueberry', name: '블루베리' },
  { id: 'jam-bread', name: '딸기잼빵' },
  { id: 'licorice', name: '감초젤리' },
  { id: 'melon-soda', name: '메론소다' },
  { id: 'cream-soda', name: '크림소다' },
  { id: 'bingsu', name: '빙수' },
  { id: 'lavender-ice', name: '라벤더 아이스크림' },
  { id: 'cookies-cream', name: '쿠앤크 아이스크림' },
] as const;
type Palette = (typeof palettes)[number]['id'];
const storageKey = 'school.personal-palette.v1';
const defaultPalette = palettes[0].id;
const toPalette = (value: string | null): Palette => palettes.find(p => p.id === value)?.id ?? defaultPalette;

export function usePersonalColors() {
  const [palette, setPalette] = useState<Palette>(() => {
    try { return toPalette(localStorage.getItem(storageKey)); }
    catch { return defaultPalette; }
  });
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      try { if (event.storageArea === localStorage) setPalette(toPalette(event.newValue)); } catch { /* Storage may be blocked. */ }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function choose(value: Palette) {
    setPalette(value);
    try { localStorage.setItem(storageKey, value); } catch { /* The choice remains active in this tab. */ }
  }
  return { palette, choose };
}

export function PersonalColors({ palette, choose, onClose }: { palette: Palette; choose: (value: Palette) => void; onClose: () => void }) {
  return <Dialog title="내 화면 색감" onClose={onClose}>
    <p className="personal-color-note">색감을 고르면 바로 바뀌어요. 이 브라우저에만 저장되고 다른 사람 화면은 바뀌지 않아요.</p>
    <fieldset className="personal-palettes">
      <legend className="sr-only">색감 선택</legend>
      {palettes.map(p => <label className="palette-choice" key={p.id}>
        <input type="radio" name="personal-palette" value={p.id} checked={palette === p.id} onChange={() => choose(p.id)}/>
        <span className="theme-sample" data-palette={p.id} aria-hidden="true"><span/><span/></span>
        <span className="palette-label">{p.name}{p.id === defaultPalette && <small>기본</small>}</span>
      </label>)}
    </fieldset>
    <button type="button" className="sl-primary" onClick={onClose}>완료</button>
  </Dialog>;
}
