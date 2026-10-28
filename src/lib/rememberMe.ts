/**
 * « Se souvenir de moi » : sans cette option, la session se ferme à la
 * fermeture du navigateur (le marqueur de sessionStorage disparaît alors).
 */
const REMEMBER_KEY = 'drivest_remember';
const ALIVE_KEY = 'drivest_session_alive';

export function setRememberMe(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    sessionStorage.setItem(ALIVE_KEY, '1');
  } catch {
    // Stockage indisponible (navigation privée) : la session reste celle de Supabase
  }
}

/** Vrai si l'utilisateur n'a pas demandé à rester connecté et que le navigateur a été fermé depuis. */
export function sessionShouldExpire(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === '0' && sessionStorage.getItem(ALIVE_KEY) !== '1';
  } catch {
    return false;
  }
}
