# Finns Wecker – Web-App

Das ist eine neu entwickelte Wecker-App mit HTML, CSS und JavaScript. Sie nutzt keine externen Pakete und läuft direkt im Browser.

## Start

Einfach `index.html` doppelklicken.

Besser für Benachrichtigungen und Wake-Lock ist der Start über einen lokalen Server:

```bash
cd /Users/finnguttknecht/Documents/GitHub/Wecker
python3 -m http.server 8080
```

Dann im Browser öffnen:

```text
http://localhost:8080
```

## Funktionen

- große sichtbare Eingabefelder
- moderne responsive Oberfläche
- einmalige Alarme mit Datum
- tägliche Alarme
- Mo–Fr-Alarme
- Schnellwecker: +1, +5, +10, +30 Minuten
- Alarmton über Web Audio
- Snooze 5 oder 10 Minuten
- lokale Speicherung im Browser per localStorage
- Browser-Benachrichtigungen, falls erlaubt
- Wake-Lock-Funktion, falls vom Browser unterstützt

## Wichtige Einschränkung

Eine reine Web-App kann keinen Alarm auslösen, wenn der Browser geschlossen ist oder der Mac schläft. Der Tab muss offen bleiben. Für eine echte native Desktop-App wäre später Electron, Tauri oder SwiftUI sinnvoller.
