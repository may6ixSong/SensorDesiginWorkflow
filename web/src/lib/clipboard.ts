import { toast } from '@/store/toastStore';

/**
 * 클립보드 복사 + 결과 알림. navigator.clipboard는 https/secure context에서만 있어서 없거나
 * 거절되면 임시 textarea + execCommand로 한 번 더 시도한다. 성공했을 때만 "복사됨"을 알린다.
 */
export async function copyText(value: string, label = 'Text'): Promise<boolean> {
  let ok = false;
  try {
    await navigator.clipboard.writeText(value);
    ok = true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      ok = false;
    }
  }
  toast(ok ? `${label} copied` : 'Could not copy — select and copy manually');
  return ok;
}
