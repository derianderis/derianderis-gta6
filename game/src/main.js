// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, the job list and game over. Save data lives in localStorage.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import { createEntities } from './entities.js';
import { createMissions } from './missions.js';
import { createWorld } from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_HONK, ACTION_MISSIONS,
  ACTION_PAUSE, ACTION_RELOAD, ACTION_WEAPON_1, ACTION_WEAPON_2, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_MISSIONS, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = buildCity(random);
const entities = createEntities(city, random);
const missions = createMissions(city);
const world = createWorld(city, random, entities, missions);
const renderer = createRenderer(canvas, city);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    return save && typeof save.money === 'number' ? save : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSave()));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world, entities, city, missions);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { missions, hasSave: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let save = readSave();
  let missionAtDeath = 0;
  let extraKey = null;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyR' || event.code === 'KeyT' || event.code === 'KeyC') {
      if (!event.repeat) extraKey = event.code;
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
  window.addEventListener('keydown', () => audio.unlock(), { once: false });

  // Screen readers (and anyone watching the page's text) hear the changes.
  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    save = null;
    announce('Playing. Dana Reyes, Solmar Bay. First job: The First Fare.');
  }

  function continueGame() {
    const found = readSave();
    if (!found) {
      startNewGame();
      return;
    }
    world.loadSave(found);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Continuing your save.');
  }

  function retryAfterDeath() {
    const index = missionAtDeath;
    world.reset();
    if (index > 0 && index < 3) {
      missions.state.index = index;
      missions.state.stage = 0;
      missions.state.active = false;
      missions.begin();
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Trying again.');
  }

  function toTitle() {
    writeSave();
    screen = SCREEN_TITLE;
    save = readSave();
    announce('Title screen. Solmar Bay: Street Heat.');
  }

  function playEventSounds(events) {
    for (const event of events) {
      if (event === 'gunshot') audio.gunshot();
      else if (event === 'punch' || event === 'cop-punch') audio.punch();
      else if (event === 'crash' || event === 'ram') audio.crash();
      else if (event === 'pickup') audio.pickup();
      else if (event === 'honk') audio.honk();
      else if (event === 'mission-done') { audio.missionDone(); writeSave(); }
      else if (event === 'game-over') audio.fail();
      else if (event === 'skid') audio.skid();
      else if (event === 'ped-hit') audio.crash();
    }
  }

  function handleActions(actions) {
    const key = extraKey;
    extraKey = null;
    const dialogue = missions.state.dialogue;

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startNewGame();
      else if (key === 'KeyC' && save) continueGame();
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) retryAfterDeath();
      else if (key === 'KeyT') toTitle();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) screen = SCREEN_PLAY;
      else if (actions & ACTION_MISSIONS) screen = SCREEN_MISSIONS;
      else if (key === 'KeyR') startNewGame();
      else if (key === 'KeyT') toTitle();
      return;
    }
    if (screen === SCREEN_MISSIONS) {
      if (actions & (ACTION_MISSIONS | ACTION_PAUSE | ACTION_CONFIRM)) screen = SCREEN_PAUSED;
      else if (key === 'KeyT') toTitle();
      return;
    }
    // SCREEN_PLAY
    if (dialogue && (actions & ACTION_CONFIRM)) {
      missions.advanceDialogue();
      audio.click();
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_MISSIONS) {
      screen = SCREEN_MISSIONS;
    } else if ((actions & ACTION_CONFIRM) && !missions.state.active && !missions.state.finished) {
      missions.begin();
      audio.click();
    }
  }

  function step(actions) {
    const mouse = input.mouse();
    const view = renderer.view;
    const camera = world.state.camera;
    const mouseWorldX = mouse.x + camera.x - view.w / 2;
    const mouseWorldY = mouse.y + camera.y - view.h / 2;
    const stepInput = {
      move: input.move(),
      sprint: input.sprinting(),
      handbrake: input.handbrake(),
      enterCar: !!(actions & ACTION_ENTER_CAR),
      weapon1: !!(actions & ACTION_WEAPON_1),
      weapon2: !!(actions & ACTION_WEAPON_2),
      reload: !!(actions & ACTION_RELOAD),
      honk: !!(actions & ACTION_HONK),
      confirm: !!(actions & ACTION_CONFIRM),
      mouseClicked: missions.state.dialogue ? false : mouse.clicked,
      mouseWorldX,
      mouseWorldY,
      view: { w: view.w, h: view.h },
    };
    input.clearMouseClick();
    const events = world.step(STEP, stepInput);
    if (events.length > 0) playEventSounds(events);
    if (world.state.over) {
      missionAtDeath = missions.state.index;
      screen = SCREEN_OVER;
      writeSave();
      announce(world.state.overReason === 'busted' ? 'Busted by the police.' : 'Wasted. Dana is down.');
    }
    // Engine hum and sirens follow the action every frame.
    const player = world.state.player;
    audio.engine(player.inCar && player.car ? player.car.speed : 0, player.inCar);
    const policeNear = entities.policeCars().some((car) => {
      const dx = car.x - player.x;
      const dy = car.y - player.y;
      return dx * dx + dy * dy < 700 * 700;
    });
    audio.siren(policeNear, STEP);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        // One-shot presses (enter a car, reload, honk) act on the first step
        // only; the later steps of the same frame see them as already taken.
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_TITLE) {
      // The title screen's backdrop is a living city: traffic keeps moving.
      while (accumulator >= STEP) {
        const idle = {
          move: { x: 0, y: 0 }, sprint: false, handbrake: false,
          enterCar: false, weapon1: false, weapon2: false, reload: false,
          honk: false, confirm: false, mouseClicked: false,
          mouseWorldX: world.state.player.x, mouseWorldY: world.state.player.y,
          view: { w: renderer.view.w, h: renderer.view.h },
        };
        world.step(STEP, idle);
        accumulator -= STEP;
        if (world.state.over) break;
      }
      accumulator = 0;
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, { missions, hasSave: !!save });
  }

  // Leaving the tab pauses a running game rather than letting the city run on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  world.reset();
  announce('Solmar Bay: Street Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
