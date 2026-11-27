/** Link di invito all'app: il Super Admin lo condivide e chi lo apre nel browser si crea un account Cliente. */
export interface AppInvite {
  id: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  registrations: number;
  maxRegistrations: number;
}

/** Token presente nell'indirizzo (#/benvenuto?accesso=…), se ben formato. */
export function appInviteTokenFromUrl(href: string): string {
  return /[?&]accesso=([0-9a-f]{48})(?:[&#]|$)/.exec(href)?.[1] || '';
}

export function appInviteLink(origin: string, token: string): string {
  return `${origin}/#/benvenuto?accesso=${token}`;
}
