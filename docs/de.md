# PeerTube

[PeerTube](https://joinpeertube.org/) ist die freie, föderierte
Videoplattform von Framasoft. Diese Integration folgt einer Instanz (deiner
oder einer beliebigen öffentlichen) und den Kanälen deiner Wahl in Gladys: neue
Videos, laufende Livestreams, die Zahlen der Instanz und, mit deinem Konto,
deine ungelesenen Benachrichtigungen. Die Integration liest nur:
Kein Beitrag, kein Kommentar, keine Änderung auf PeerTube.

Echt getestet mit PeerTube 7.3.0 (in Docker, mit einem Konto, einem Kanal,
hochgeladenen Videos und einem RTMP-Livestream) und mit framatube.org
(PeerTube 8.3.1).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Die Adresse einer PeerTube-Instanz: deine in deinem Netzwerk
  (`http://192.168.1.20:9000`) oder eine öffentliche (`https://framatube.org`).
- Die Kennungen der zu folgenden Kanäle. Die Kennung ist das Ende der Adresse
  der Kanalseite: `https://framatube.org/c/joinpeertube` ergibt
  `joinpeertube`. Ein Kanal einer anderen Instanz wird `name@host` geschrieben
  (`blender_channel@video.blender.org`): Die konfigurierte Instanz muss ihn
  kennen (Föderation), was bei einem Kanal, dem sie oder einer ihrer Benutzer
  folgt, immer der Fall ist.
- Optional: Benutzername und Passwort deines Kontos auf dieser Instanz.

## Einrichtung

1. Öffne in Gladys **Integrationen**, installiere **PeerTube** und öffne dann
   den Tab **Konfiguration**.
2. **Adresse der Instanz**: die Adresse der PeerTube-Seite, wie im Browser. Eine
   bloße Adresse wird verstanden: `framatube.org` (HTTPS), `192.168.1.20:9000`
   (HTTP in deinem Netzwerk).
3. **Zu folgende Kanäle**: die Kennungen, durch Kommas getrennt (höchstens 20).
   Die Adresse einer Kanalseite geht auch.
4. **Konto (optional)**: dein **Benutzername** und dein **Passwort**. Lass sie
   leer, um nur die öffentlichen Seiten zu lesen.
5. **Aktualisierungsintervall**: 1, 2 (Standard), 5 oder 10 Minuten. Jede
   Abfrage macht zwei leichte Anfragen pro Kanal und eine oder zwei für das
   Konto. Ein Livestream wird höchstens so spät erkannt.
6. **Sprache der Namen**: die Sprache der Funktionsnamen (beim Anlegen eines
   Geräts festgelegt), der Daten und des Satzes der Szenenaktion.
7. Speichere und nutze dann **Verbindung testen**: Die Antwort nennt Name und
   Version der Instanz, die gefundenen Kanäle und das Konto.
8. Öffne den Tab **Entdecken** und füge die gewünschten Geräte hinzu.

## Die Geräte

Alle Geräte sind schreibgeschützt. Gladys fragt sie nie ab: Die Integration
liest PeerTube mit ihrem eigenen Timer, im gewählten Intervall.

### Die Instanz

**PeerTube** gefolgt vom Namen der Instanz:

- **Online**: Die Instanz antwortet.
- **Lokale Videos**: die auf der Instanz selbst veröffentlichten Videos.
- **Aufrufe der lokalen Videos**: ihre Aufrufe, alle zusammen.
- **Benutzer**: die Konten der Instanz.
- **Gefolgte Instanzen**: die anderen Instanzen, denen sie folgt.

PeerTube berechnet diese Zahlen alle paar Minuten neu, daher ändern sie sich in
Stufen.

### Die Kanäle

Ein Gerät pro Kanal, benannt wie der Kanal:

- **Live auf Sendung**: Der Kanal ist gerade live.
- **Zuschauer des Livestreams**: die Zuschauer seines Livestreams (0 ohne
  Livestream).
- **Letztes Video**: der Titel seines neuesten Videos.
- **Letztes Video veröffentlicht am**: dessen Datum und Uhrzeit.
- **Abonnenten**: die Abonnenten des Kanals.
- **Videos**: seine Videos (ohne laufende Livestreams).

### Das Konto

Mit einem Konto **PeerTube** gefolgt von deiner Kennung (`name@host`):

- **Ungelesene Benachrichtigungen**: was die Glocke von PeerTube anzeigt (neue
  Kommentare, neue Abonnenten, Videos deiner Abos usw.).
- **Abonnenten**: die Abonnenten all deiner Kanäle zusammen.

## Dashboard

Das Widget **PeerTube-Videos** zeigt von oben nach unten: deine ungelesenen
Benachrichtigungen (mit Konto), eine Zeile pro laufendem Livestream (Kanal,
Titel, Zuschauer), dann die sechs neuesten Videos der gefolgten Kanäle als
Posterraster (Vorschaubild, Titel, Kanal, Datum). Tippe auf ein Video, um seine
Details zu öffnen; bei einer Instanz mit HTTPS öffnet ein Link **Ansehen** es
auf PeerTube. Die Vorschaubilder liefert die Integration: Dein Browser lädt nie
etwas von der Instanz.

## Szenen

### Auslöser

- **Neues PeerTube-Video**: Ein gefolgter Kanal hat ein neues Video
  veröffentlicht. Filter: der Kanal (leer: beliebig). Variablen: der Kanal,
  seine Kennung, der Titel, die Adresse des Videos, seine Dauer (Minuten) und
  sein Veröffentlichungsdatum.
- **PeerTube-Livestream gestartet**: Ein gefolgter Kanal ist live. Filter: der
  Kanal. Variablen: der Kanal, seine Kennung, Titel und Adresse des
  Livestreams.
- **PeerTube-Livestream beendet**: Ein Livestream eines gefolgten Kanals ist
  vorbei. Filter: der Kanal. Variablen: der Kanal, seine Kennung, der Titel, die
  Adresse, die Dauer (Minuten, gezählt ab der ersten Abfrage, die ihn gesehen
  hat) und die Zuschauerspitze.

Für schon Vorhandenes wird nichts gemeldet: Die erste Abfrage eines Kanals lernt
nur seine Videos kennen, und das Gesehene bleibt über Neustarts erhalten.

### Aktionen

- **Neueste PeerTube-Videos lesen**: liest PeerTube jetzt und liefert einen Satz
  für eine Nachricht oder eine Sprachansage („PeerTube: jetzt live: …; neueste
  Videos: …“), für alle Kanäle oder einen, mit 1, 3 oder 5 genannten Videos.
  Ausgaben: der Satz, ob ein Livestream läuft, der Titel des Livestreams, Titel,
  Kanal und Adresse des letzten Videos.

### Szenenideen

- **Neues PeerTube-Video** auf deinem Lieblingskanal → schick dir eine Nachricht
  mit `{{triggerEvent.data.title}}` und `{{triggerEvent.data.url}}`.
- **PeerTube-Livestream gestartet** → dimm das Wohnzimmerlicht und sag „Der
  Livestream von {{triggerEvent.data.channel_name}} hat begonnen“ auf dem
  Lautsprecher an.
- Jeden Abend um 19 Uhr → **Neueste PeerTube-Videos lesen**, dann den Satz per
  Nachricht schicken.
- **Ungelesene Benachrichtigungen** größer als 0 → eine Lampe blau schalten.

## Fehlerbehebung

- **PeerTube antwortet nicht**: Prüfe Adresse und Port (9000 bei einer
  einfachen Docker-Installation, keiner hinter einem Reverse-Proxy). Der
  Container der Integration muss diese Adresse erreichen.
- **Kein PeerTube unter dieser Adresse**: Gemeint ist die Adresse der Seite,
  nicht die einer eingebetteten Seite oder eines Objektspeichers.
- **Kanal … nicht gefunden**: Prüfe die Kennung auf der Kanalseite. Ein
  entfernter Kanal muss der Instanz bekannt sein: Öffne seine Seite einmal von
  der Instanz aus (Suche nach `name@host`) oder folge ihm.
- **Die Instanz begrenzt die Anfragen**: Wähle ein längeres Intervall oder
  weniger Kanäle. Öffentliche Instanzen begrenzen die API pro Adresse.
- **Anmeldung abgelehnt**: Prüfe Benutzername und Passwort in der Weboberfläche
  derselben Instanz. Konten mit Zwei-Faktor-Authentifizierung sowie Anmeldungen
  über OpenID Connect oder SAML werden nicht unterstützt: Lass das Konto leer und
  nutze den öffentlichen Teil.
- Für alles andere setze `LOG_LEVEL=debug` und eröffne ein Issue:
  https://github.com/guim31/gladys-peertube/issues

## Grenzen

- Nur lesen: kein Hochladen, kein Kommentar, kein Abo aus Gladys.
- Ein Livestream wird bei der nächsten Abfrage erkannt, und seine Dauer beginnt
  dort. Ein Livestream, der zwischen zwei Abfragen stoppt und weiterläuft, gilt
  nicht als beendet.
- Höchstens 5 neue Videos eines Kanals werden pro Abfrage gemeldet (die
  neuesten): Ein größerer Schwung auf einmal wird gezählt, aber nicht ganz
  gemeldet.
- Vorschaubild und Link eines Videos kommen von der konfigurierten Instanz: Ein
  entfernter Kanal erscheint so, wie diese Instanz ihn kennt.
- Kein Webhook: Die Sandbox von Gladys hat keinen eingehenden Port, daher wird
  PeerTube regelmäßig gelesen.
- Nicht mit Framasoft oder dem PeerTube-Projekt verbunden.
