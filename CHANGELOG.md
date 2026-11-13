# Änderungen

Alle Versionen von Subdeck. Die Firefox-Fassung steht auf [addons.mozilla.org](https://addons.mozilla.org/addon/subdeck-f%C3%BCr-reddit/).

## 1.0.3 (13.11.2026)

- Reddit-Videos laufen jetzt mit Ton. Reddit liefert Bild und Ton getrennt aus. Subdeck setzt beides beim Abspielen zusammen. Lautstärke, Stummschalten und Vollbild gehen über die normalen Steuerelemente des Videos.
- Das Video lädt erst, wenn du auf Abspielen drückst.
- Sehr lange Videos (mehr als etwa 80 MB) laufen weiter ohne Ton. Darunter steht dann ein Hinweis.
- Der Einstellungen-Knopf unten links zeigt ein Zahnrad statt eines Symbols, das wie ein Hell-/Dunkel-Schalter aussah.

## 1.0.2 (12.11.2026)

- Die Schriften liegen jetzt im Paket. Subdeck lädt nichts mehr von Google Fonts oder anderen Anbietern.
- Die Lizenztexte der Schriften (SIL Open Font License) liegen im Ordner `fonts/`.
- Die README wurde überarbeitet und führt Firefox zuerst auf.
- Der Quellcode steht ab dieser Version auf GitHub.

## 1.0.1 (11.11.2026)

- Subdeck lädt die Daten über `api.reddit.com`. Reddit lehnt Abrufe per Skript über `www.reddit.com/….json` inzwischen ab, auch mit Anmeldung. Deshalb hat 1.0.0 nichts geladen.
- Lehnt Reddit einen Abruf ab, zeigt die Spalte „Anmeldung nötig“ und einen Knopf **Bei Reddit anmelden**.
- Kehrst du nach der Anmeldung zum Subdeck-Tab zurück, lädt er die betroffenen Spalten von selbst neu.

## 1.0.0 (9.11.2026)

- Erste Version: Subreddits, Suchen, Nutzer und die Startseite in Spalten nebeneinander, mit automatischer Aktualisierung.
- Detailansicht mit Bildern, Galerie, Video und Kommentaren.
- Tastenkürzel.
- Filter für NSFW, angepinnte Beiträge und stummgeschaltete Begriffe.
- Spalten sichern und umziehen.
