// Traduction des erreurs techniques en messages compréhensibles.
export class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
    this.userMessage = message;
  }
}

export function friendlyError(err) {
  if (!err) return 'Une erreur inattendue est survenue.';
  if (err.userMessage) return err.userMessage;
  const code = err.code ?? err.statusCode ?? '';
  const message = String(err.message ?? err.error ?? err);

  if (err.name === 'TypeError' && /fetch/i.test(message)) return 'Connexion impossible. Vérifiez votre accès à Internet puis réessayez.';
  if (/Failed to fetch|NetworkError|network/i.test(message)) return 'Connexion impossible. Vérifiez votre accès à Internet puis réessayez.';
  if (code === 'P0001') return message; // messages métier rédigés en français dans la base
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'Action refusée : vous n’avez pas l’autorisation nécessaire, ou la limite d’import du jour est atteinte.';
  }
  if (code === '23505') return 'Cet élément existe déjà.';
  if (code === '23503') return 'Cet élément est lié à un contenu qui n’existe plus. Actualisez la page.';
  if (code === '23514' || code === '22001') return 'Certaines informations ne respectent pas le format attendu (longueur ou valeur).';
  if (code === 'PGRST301' || /JWT|token/i.test(message)) return 'Votre session a expiré. Reconnectez-vous.';
  if (/payload too large|maximum allowed size|exceeded/i.test(message)) return 'Le fichier est trop volumineux.';
  if (/mime type|invalid_mime/i.test(message)) return 'Format de fichier non accepté. Utilisez JPEG, PNG ou WebP.';
  return 'L’opération n’a pas abouti. Réessayez dans un instant.';
}
