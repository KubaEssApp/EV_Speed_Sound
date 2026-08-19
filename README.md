# EVDRIVE V12 · SPORT EXPERIENCE

This static web prototype extends EVDRIVE V11 with a new SPORT EXPERIENCE.

## New in V12

- **SPORT EXPERIENCE** drive mode with aggressive red HUD styling.
- Configurable activation announcement in **German or English**.
- Three browser-TTS character presets: **Devil**, **Digital Assistant**, **Female Performance**.
- Voice reactions during strong acceleration with low/medium/high reaction intensity.
- Automatic **0–100 km/h stopwatch** when SPORT is active and the car launches from standstill.
- Spoken 0–100 result after reaching 100 km/h.
- Local personal-best storage and “NEW BEST” feedback.
- SPORT demo cycle for testing without a moving vehicle.
- Original Drive Modes, Performance HUD and Trip Replay remain included.

## Important limitation

SPORT EXPERIENCE is an EVDRIVE app mode. This prototype does **not** read or change the Tesla vehicle's actual Sport/Acceleration setting.

## Run locally

For desktop testing:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

Sensor permissions work best over HTTPS, so deployment is recommended for iPhone/Tesla browser testing.

## Quick test

1. Open EVDRIVE.
2. Turn **DEMO ON**.
3. Tap **SPORT EXPERIENCE**.
4. Optionally tap **START SOUND** for the synthetic acceleration sound.
5. Choose a voice, language and reaction intensity.
6. Watch the automatic launch timer run from 0 to 100 km/h.

## Notes

- Browser speech voices differ between iPhone, Tesla browser, macOS and other platforms.
- Performance timing is an experimental GPS/browser estimate, not certified measurement equipment.
- Use acceleration testing only where safe and legal, and keep attention on the road.
