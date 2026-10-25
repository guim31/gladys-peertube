// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, the command
// errors and the sentence of the scene action. Four languages, the four of the
// Gladys interface; German says "du", Spanish "usted". test/i18n.test.js
// checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './peertube/client.js';

export const pick = (text, language) => text?.[language] ?? text?.en ?? '';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noInstance: {
    en: 'Enter the address of a PeerTube instance in the configuration.',
    fr: "Saisissez l'adresse d'une instance PeerTube dans la configuration.",
    de: 'Gib die Adresse einer PeerTube-Instanz in der Konfiguration ein.',
    es: 'Introduzca la dirección de una instancia PeerTube en la configuración.',
  },
  invalid: {
    en: 'The address of the instance is not valid (e.g. https://framatube.org).',
    fr: "L'adresse de l'instance n'est pas valide (ex. https://framatube.org).",
    de: 'Die Adresse der Instanz ist ungültig (z. B. https://framatube.org).',
    es: 'La dirección de la instancia no es válida (p. ej. https://framatube.org).',
  },
  channelNotFound: (handle) => ({
    en: `Channel ${handle} not found on this instance: check its handle.`,
    fr: `Chaîne ${handle} introuvable sur cette instance : vérifiez son identifiant.`,
    de: `Kanal ${handle} auf dieser Instanz nicht gefunden: Prüfe seine Kennung.`,
    es: `Canal ${handle} no encontrado en esta instancia: compruebe su identificador.`,
  }),
  invalidChannel: (text) => ({
    en: `“${text}” is not a channel handle (e.g. joinpeertube or name@host).`,
    fr: `« ${text} » n'est pas un identifiant de chaîne (ex. joinpeertube ou nom@hôte).`,
    de: `„${text}“ ist keine Kanalkennung (z. B. joinpeertube oder name@host).`,
    es: `«${text}» no es un identificador de canal (p. ej. joinpeertube o nombre@host).`,
  }),
};

// One explanation per error kind (src/peertube/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'PeerTube does not answer: check the address of the instance.',
    fr: "PeerTube ne répond pas : vérifiez l'adresse de l'instance.",
    de: 'PeerTube antwortet nicht: Prüfe die Adresse der Instanz.',
    es: 'PeerTube no responde: compruebe la dirección de la instancia.',
  },
  [ERROR_KINDS.TLS]: {
    en: 'Certificate refused: use the http:// address on your network.',
    fr: 'Certificat refusé : utilisez l’adresse en http:// de votre réseau.',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk.',
    es: 'Certificado rechazado: use la dirección http:// de su red.',
  },
  [ERROR_KINDS.NOT_PEERTUBE]: {
    en: 'No PeerTube at this address: enter the address of the instance.',
    fr: "Aucun PeerTube à cette adresse : saisissez l'adresse de l'instance.",
    de: 'Kein PeerTube unter dieser Adresse: Gib die Adresse der Instanz ein.',
    es: 'No hay ningún PeerTube en esta dirección: introduzca la de la instancia.',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'The address redirects: enter the final address (often https://).',
    fr: "L'adresse redirige : saisissez l'adresse finale (souvent en https://).",
    de: 'Die Adresse leitet um: Gib die endgültige Adresse ein (oft https://).',
    es: 'La dirección redirige: introduzca la dirección final (a menudo https://).',
  },
  [ERROR_KINDS.RATE_LIMITED]: {
    en: 'The instance limits the requests: choose a longer refresh interval.',
    fr: "L'instance limite les requêtes : choisissez un intervalle plus long.",
    de: 'Die Instanz begrenzt die Anfragen: Wähle ein längeres Intervall.',
    es: 'La instancia limita las peticiones: elija un intervalo más largo.',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Unexpected answer from PeerTube, see the logs of the integration.',
    fr: "Réponse inattendue de PeerTube, voir les logs de l'intégration.",
    de: 'Unerwartete Antwort von PeerTube, sieh in den Protokollen der Integration nach.',
    es: 'Respuesta inesperada de PeerTube, consulte los registros de la integración.',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'Channel not found on this instance: check its handle.',
    fr: 'Chaîne introuvable sur cette instance : vérifiez son identifiant.',
    de: 'Kanal auf dieser Instanz nicht gefunden: Prüfe seine Kennung.',
    es: 'Canal no encontrado en esta instancia: compruebe su identificador.',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'PeerTube refused the user name or the password of the account.',
    fr: "PeerTube a refusé l'identifiant ou le mot de passe du compte.",
    de: 'PeerTube hat Benutzername oder Passwort des Kontos abgelehnt.',
    es: 'PeerTube ha rechazado el usuario o la contraseña de la cuenta.',
  },
  [ERROR_KINDS.TWO_FACTOR]: {
    en: 'The account uses two-factor authentication: not supported, leave it empty.',
    fr: 'Le compte a la double authentification : non prise en charge, laissez vide.',
    de: 'Das Konto nutzt Zwei-Faktor-Authentifizierung: nicht unterstützt, leer lassen.',
    es: 'La cuenta usa autenticación en dos pasos: no compatible, déjela vacía.',
  },
};

// Errors of the scene action and of "Test the connection".
export const ACTION_TEXT = {
  noInstance: CONNECTION_TEXT.noInstance,
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (name, version) => `OK, ${name} (PeerTube ${version})`,
    channels: (found, total) => `${found}/${total} channel(s) found`,
    account: (handle) => `account ${handle} connected`,
  },
  fr: {
    ok: (name, version) => `OK, ${name} (PeerTube ${version})`,
    channels: (found, total) => `${found}/${total} chaîne(s) trouvée(s)`,
    account: (handle) => `compte ${handle} connecté`,
  },
  de: {
    ok: (name, version) => `OK, ${name} (PeerTube ${version})`,
    channels: (found, total) => `${found}/${total} Kanal/Kanäle gefunden`,
    account: (handle) => `Konto ${handle} verbunden`,
  },
  es: {
    ok: (name, version) => `OK, ${name} (PeerTube ${version})`,
    channels: (found, total) => `${found}/${total} canal(es) encontrado(s)`,
    account: (handle) => `cuenta ${handle} conectada`,
  },
};

// The sentence of the "Read the latest videos" scene action.
export const SUMMARY_TEXT = {
  en: {
    colon: ': ',
    semicolon: '; ',
    live: 'live now',
    latest: 'latest videos',
    video: (title, channel) => `“${title}” (${channel})`,
    none: 'no video yet',
    down: 'PeerTube does not answer.',
  },
  fr: {
    colon: ' : ',
    semicolon: ' ; ',
    live: 'en direct',
    latest: 'dernières vidéos',
    video: (title, channel) => `« ${title} » (${channel})`,
    none: 'aucune vidéo pour le moment',
    down: 'PeerTube ne répond pas.',
  },
  de: {
    colon: ': ',
    semicolon: '; ',
    live: 'jetzt live',
    latest: 'neueste Videos',
    video: (title, channel) => `„${title}“ (${channel})`,
    none: 'noch kein Video',
    down: 'PeerTube antwortet nicht.',
  },
  es: {
    colon: ': ',
    semicolon: '; ',
    live: 'en directo',
    latest: 'últimos vídeos',
    video: (title, channel) => `«${title}» (${channel})`,
    none: 'todavía ningún vídeo',
    down: 'PeerTube no responde.',
  },
};
