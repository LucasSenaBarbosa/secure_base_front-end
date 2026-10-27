/** Aviso de chuva: notificação do navegador (funciona como push no celular) + evento interno para o toast in-app. */

export interface RainEvent {
  pct: number;
  at: number;
}

type Listener = (e: RainEvent) => void;
const listeners = new Set<Listener>();

export function onRainEvent(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function emitRainEvent(pct: number) {
  const event: RainEvent = { pct, at: Date.now() };
  listeners.forEach((cb) => cb(event));
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied';
}

export async function requestRainNotifications(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function sendRainNotification(pct: number) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification('🌧️ Chuva na SecureBase', {
      body: `Sensor de vapor em ${pct}% · a janela está fechando automaticamente.`,
      tag: 'ks5009-rain',
    });
    n.onclick = () => window.focus();
  } catch {
    /* Safari/iOS sem PWA instalada pode recusar — o toast in-app já cobre o aviso. */
  }
}
