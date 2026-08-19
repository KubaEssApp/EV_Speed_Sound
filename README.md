# EVDRIVE V13 – Tesla Cockpit + Classic Diesel

## Neu in V13
- Tesla-Querformat-Cockpit: Tacho links dominant, Bedienung rechts kompakt, keine Seiten-Scrollerei im Desktop-/Tesla-Layout.
- 6 Drive Modes: SPORT EXPERIENCE, CYBER EV, POD RACER, V10 SYNTH, CLASSIC DIESEL, WARP.
- CLASSIC DIESEL mit dynamischer WebAudio-Synthese:
  - virtueller 4-Zylinder-/4-Takt-Verbrennungsrhythmus
  - Leerlauf und lastabhängige Drehzahl
  - 7 simulierte Gänge mit Drehzahlabfall beim Schalten
  - tiefer Abgas-/Rumble-Anteil
  - mechanisches Diesel-Nageln
  - Ansaug-/Turbo-Anteil abhängig von Last und Drehzahl
  - Live-Anzeige von RPM und virtuellem Gang
- Schnellere Lastreaktion über DeviceMotion, wenn vom Browser verfügbar.
- SPORT EXPERIENCE und 0–100-Logik aus V12.1 bleiben erhalten.

## Empfohlener Test
1. `index.html` über HTTPS hosten (z. B. GitHub Pages).
2. Im Tesla-Browser öffnen.
3. `DEMO ON` aktivieren.
4. `CLASSIC DIESEL` auswählen.
5. `START SOUND` drücken.
6. Master Volume zunächst bei 45–60 % testen.

## Hinweise
- Browser-Audio muss durch einen manuellen Klick freigegeben werden; deshalb ist `START SOUND` erforderlich.
- GPS-Update-Raten und DeviceMotion-Unterstützung unterscheiden sich je nach Browser/Hardware.
- Der Diesel-Sound wird vollständig in Echtzeit erzeugt und benötigt keine externen Audiodateien.
- Die App verändert keinen Tesla-Fahrmodus und greift nicht in Fahrzeugsteuerungen ein.
