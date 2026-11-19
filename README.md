# Street Heat: Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/derianderis/derianderis-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/derianderis/derianderis-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Street Heat: Solmar Bay** is a complete open-world crime game in the spirit of GTA 6, built to run in a desktop browser from static files alone. The city, the cast and the story are all original — nothing in it comes from any commercial game.

## Story

Dana Reyes drives for hire in Solmar Bay, a sun-soaked coastal city of gridded streets, parks, a beach and a bay. She owes Marta Kline one last favour, and every job she takes gets a little hotter.

## What is in the game

- **A city to explore** — a large tile-built city, 96 × 96 tiles, with roads, city blocks, buildings, parks, parking lots and a waterfront. Walk it or drive it; the camera follows you everywhere.
- **Traffic and pedestrians** — cars drive the road grid and brake for each other; pedestrians stroll the sidewalks, run when they are scared, and do not forget being run over.
- **Cars to steal and drive** — walk up to any car and press E to take it. Driving means acceleration, steering, braking and a handbrake, with real collisions against buildings and other cars.
- **A wanted level and police** — five stars. Steal a car, hit a pedestrian or fight back and the stars climb; police cars chase and ram you, and officers step out to come after you on foot. Lay low — hide out in a park — and the heat cools off.
- **Missions and a story** — three jobs with dialogue, objectives and a mission tracker: *The First Fare* (pick up a package at the docks), *Borrowed Wheels* (steal a Comet sports car and lose the cops), and *Warehouse Heat* (stand up to Sal Moreno's enforcers and bring Marta's cash home). Jobs can be completed or failed, and the job list (M) lets you retry.
- **Combat** — fists and a pistol, aimed with the mouse, against enforcers and police officers, with health, ammo and pickups (cash, health, ammo) scattered around the city.
- **HUD with minimap** — health, money, wanted stars, weapon and ammo, speed and car condition, a live clock that moves through day, dusk and night, a mission tracker, and a canvas minimap that shows you, traffic, police and the mission marker.
- **Menus and save** — a title screen with the story intro, a pause menu, a job list, game over and restart, and a save kept in localStorage with a Continue option.
- **Polish** — a day/night cycle with dusk and night tints plus headlights, synthesised WebAudio sound (engine hum, sirens, gunshots, skids, honks, mission jingles — no audio files at all), particles, exhaust smoke and screen shake.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrow keys | Move on foot, drive the car |
| Mouse | Aim, click to attack (punch / shoot) |
| E | Get in / out of a car |
| Space | Handbrake (while driving) |
| Shift | Sprint |
| 1 / 2 | Fists / pistol |
| R | Reload |
| H | Honk |
| P / Esc | Pause |
| M | Job list |
| Enter | Start, advance dialogue, retry |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

To build the submission output — the same thing the grader runs:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` into the output directory and writes `dossier.json` using the vendored make.fun library. The game itself needs no build step and makes no network requests: `game/index.html` and the ES modules under `game/src/` are the entire game.

## Screenshots

`screenshots/` holds three real renders of the game running in a browser: the title screen (`1-start.jpg`), a police chase during the first job (`2-play.jpg`), and the game-over screen (`3-end.jpg`). They are staged with `?shot=start|play|end&seed=1`, which plays the real game forward with an autopilot.

---

Entered on [make.fun](https://make.fun/?ref=ztgpgx6c&utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
