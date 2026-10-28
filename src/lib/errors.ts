/** Convertit une erreur Supabase / réseau en message compréhensible. */
export function toErrorMessage(err: unknown): string {
  const fallback = 'Une erreur inattendue est survenue. Réessayez.';
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    const msg = err.message;
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return 'Impossible de joindre le serveur. Vérifiez votre connexion internet.';
    }
    if (/Invalid login credentials/i.test(msg)) return 'Adresse e-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(msg)) return 'Confirmez votre adresse e-mail avant de vous connecter.';
    if (/User already registered/i.test(msg)) return 'Un compte existe déjà avec cette adresse e-mail.';
    if (/rate limit|too many requests/i.test(msg)) {
      return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
    }
    if (/Password should be/i.test(msg)) return 'Le mot de passe ne respecte pas les exigences de sécurité.';
    if (/JWT expired/i.test(msg)) return 'Votre session a expiré. Reconnectez-vous.';
    if (/permission denied|row-level security/i.test(msg)) {
      return "Vous n'avez pas l'autorisation d'effectuer cette action.";
    }
    if (/duplicate key/i.test(msg)) return 'Cet élément existe déjà.';
    return msg;
  }
  return fallback;
}
