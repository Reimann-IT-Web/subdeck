# Änderungen

Alle Versionen von Subdeck. Die Firefox-Fassung steht auf [addons.mozilla.org](https://addons.mozilla.org/addon/subdeck-f%C3%BCr-reddit/).

## 1.2.2 (21.11.2026)

- Die Spalten bleiben stehen, wenn du einen Beitrag öffnest. Mit Firefox 160.0.1 sprang das Deck bei jedem Klick auf einen Beitrag zur Seite, weil Firefox die Spalte des Beitrags an den linken Rand zog, auch wenn sie ganz zu sehen war. Beim Schließen kam das Deck nicht an seinen alten Platz zurück, mit jedem Beitrag wanderte es weiter. Beim Blättern mit `J` und `K` ruckelte es hin und her.
- Verdeckt die Detailansicht die Spalte des Beitrags, rückt das Deck wie bisher zur Seite. Beim Schließen gleitet es jetzt genau an die Stelle zurück, an der es vorher stand.

## 1.2.1 (17.11.2026)

- Twitch-Clips laufen direkt in der Detailansicht, mit Ton und in voller Länge. Bisher spielte Subdeck die stumme, oft gekürzte Kopie, die Reddit zu Clips mitliefert. Erkannt werden Links auf `clips.twitch.tv`, `twitch.tv/<Kanal>/clip/…` und `m.twitch.tv/clip/…`. Clips im Hochformat erscheinen hochkant.
- Wie bei YouTube zeigt Subdeck bis zum Klick auf **Clip abspielen** nur das Vorschaubild von Reddit. Twitch erfährt vorher nichts.
- Beim ersten Abspielen fragt Firefox einmal, ob Subdeck auf `clips.twitch.tv` zugreifen darf. Der Grund: Twitch lässt sich nur auf Webseiten einbetten, die im Aufruf genannt sind, Erweiterungen gehören nicht dazu. Bei seinen eigenen Player-Aufrufen erlaubt Subdeck das Einbetten deshalb auch in Erweiterungen. In `about:addons` kannst du die Erlaubnis wieder entziehen.

## 1.2.0 (16.11.2026)

- Neu: YouTube-Videos laufen direkt in der Detailansicht. Das gilt für Links auf youtube.com, youtu.be, Shorts und Livestreams. Steht im Link eine Startzeit (`t=1m30s`), beginnt das Video dort. Shorts erscheinen im Hochformat.
- Bis zum Klick auf **Video abspielen** zeigt Subdeck nur das Vorschaubild von Reddit, YouTube erfährt vorher nichts. Der Player kommt von `youtube-nocookie.com`, dem Modus von YouTube mit erweitertem Datenschutz. Schließt du die Detailansicht, verschwindet der Player, und der Ton läuft nicht weiter.
- Beim ersten Abspielen fragt Firefox einmal, ob Subdeck auf `www.youtube-nocookie.com` zugreifen darf. Der Grund: Aus einer Erweiterung schickt der Browser keine Herkunft (Referer) mit, und ohne Herkunft zeigt YouTube nur „Fehler 153“. Subdeck setzt die Herkunft deshalb selbst, aber nur bei seinen eigenen Player-Aufrufen. In `about:addons` kannst du die Erlaubnis wieder entziehen.
- In der Spalte tragen YouTube-Beiträge wie Reddit-Videos das Abspiel-Symbol.

## 1.1.3 (16.11.2026)

- Die Detailansicht nimmt den halben Bildschirm ein. Bilder und Videos erscheinen dadurch deutlich größer, Texte und Kommentare bleiben in einer gut lesbaren Breite.
- Der Pfeil-Knopf oben in der Detailansicht schaltet zurück auf die schmale Fassung, dauerhaft geht das unter Einstellungen → Detailansicht. In Fenstern unter etwa 1240 Pixel Breite bleibt die Detailansicht schmal.
- Liegt die Detailansicht über der Spalte des geöffneten Beitrags, rückt das Deck nach links, bis die Spalte daneben ganz zu sehen ist. Beim Schließen gleitet es an seinen alten Platz zurück.

## 1.1.2 (16.11.2026)

- Fotos in Kommentaren und Textbeiträgen erscheinen als Bild statt als Link. Das gilt auch, wenn Reddit eine Bildunterschrift oder `<image>` als Linktext mitschickt. Die Bildunterschrift steht klein unter dem Bild, ein Klick öffnet das Bild in voller Größe.
- GIFs in Kommentaren laufen direkt in Subdeck. Emotes und Reddit-Emojis stehen im Text, bisher fehlten sie ganz.
- Bildbeiträge zeigen ihr Bild auch dann, wenn Reddit keine Vorschau mitschickt. Bisher stand dort nur ein Link.
- Textbeiträge mit eingebetteten Bildern bekommen in der Spalte ein Vorschaubild. Die Bildadressen tauchen nicht mehr im Vorschautext auf.

## 1.1.1 (16.11.2026)

- Flairs bleiben beim Darüberfahren lesbar. Farbige Flairs verloren bisher ihre Farbe, wenn die Maus über dem Beitrag lag, und weiße Schrift stand dann auf weißem Grund (im dunklen Design dunkle Schrift auf dunklem Grund). Jetzt behalten sie ihre Farbe.
- Flairs ohne eigene Farbe heben sich in jedem Zustand vom Beitrag ab: in Ruhe, beim Darüberfahren, bei neuen Beiträgen und beim gerade geöffneten Beitrag. Sie blinken beim Wegbewegen der Maus nicht mehr kurz weg.

## 1.1.0 (14.11.2026)

- Neu: Abstimmen und Kommentieren direkt in Subdeck. Jeder Beitrag und jeder Kommentar hat Pfeile für hoch und runter, noch einmal derselbe Pfeil nimmt die Stimme zurück. In der Detailansicht schreibst du über den Kommentaren einen eigenen Kommentar und antwortest mit „Antworten“ unter jedem Kommentar. Strg+Enter sendet.
- Tasten: `A` und `Z` stimmen hoch und runter, `C` springt zum Kommentarfeld.
- Subdeck nutzt dafür deine Reddit-Anmeldung im Browser, wie beim Laden. Geschrieben wird nur nach deinem Klick oder Tastendruck. Neue Beiträge schreibst du weiter auf Reddit.
- Firefox fragt vor der ersten Stimme und vor dem ersten Kommentar einmal um deine Erlaubnis. Lehnst du ab, schickt Subdeck nichts. In `about:addons` kannst du die Erlaubnis bei Subdeck wieder entziehen.

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
