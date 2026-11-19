// Keyboard and mouse state for Street Heat.
//
// Movement keys are tracked as a live set, read once per frame. Presses that
// must fire exactly once — getting in a car, pausing, reloading, stepping
// through dialogue — are collected into a bitmask and drained by the loop, so
// a tap that lands between two frames is neither lost nor double-counted.
// The pointer is followed in canvas pixels for mouse aiming.
import { KEYS } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_RELOAD = 8;
export const ACTION_WEAPON_1 = 16;
export const ACTION_WEAPON_2 = 32;
export const ACTION_MISSIONS = 64;
export const ACTION_HONK = 128;

function isKey(code, codes) {
  return codes.indexOf(code) !== -1;
}

export function createInput(canvas) {
  const heldDown = new Set();
  let queued = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerHeld = false;
  let pointerTapped = false;

  function queueOnce(bit, event) {
    if (!event.repeat) queued |= bit;
  }

  window.addEventListener('keydown', (event) => {
    const code = event.code;
    if (isKey(code, KEYS.up) || isKey(code, KEYS.down) ||
      isKey(code, KEYS.left) || isKey(code, KEYS.right) ||
      isKey(code, KEYS.sprint) || isKey(code, KEYS.handbrake)) {
      heldDown.add(code);
      event.preventDefault();
    } else if (isKey(code, KEYS.enterCar)) {
      queueOnce(ACTION_ENTER_CAR, event);
      event.preventDefault();
    } else if (isKey(code, KEYS.confirm)) {
      queueOnce(ACTION_CONFIRM, event);
    } else if (isKey(code, KEYS.pause)) {
      queueOnce(ACTION_PAUSE, event);
    } else if (isKey(code, KEYS.reload)) {
      queueOnce(ACTION_RELOAD, event);
    } else if (isKey(code, KEYS.weapon1)) {
      queueOnce(ACTION_WEAPON_1, event);
    } else if (isKey(code, KEYS.weapon2)) {
      queueOnce(ACTION_WEAPON_2, event);
    } else if (isKey(code, KEYS.missionList)) {
      queueOnce(ACTION_MISSIONS, event);
    } else if (isKey(code, KEYS.honk)) {
      queueOnce(ACTION_HONK, event);
    }
  });

  window.addEventListener('keyup', (event) => {
    heldDown.delete(event.code);
  });

  // Releasing a key while the tab is hidden never produces a keyup, so let
  // go of everything on blur: the player must never keep running alone.
  window.addEventListener('blur', () => {
    heldDown.clear();
    pointerHeld = false;
  });

  function followPointer(event) {
    const box = canvas.getBoundingClientRect();
    pointerX = event.clientX - box.left;
    pointerY = event.clientY - box.top;
  }

  canvas.addEventListener('pointermove', followPointer);
  canvas.addEventListener('pointerdown', (event) => {
    followPointer(event);
    pointerHeld = true;
    pointerTapped = true;
    queued |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    pointerHeld = false;
  });

  function anyHeld(codes) {
    for (const code of codes) {
      if (heldDown.has(code)) return true;
    }
    return false;
  }

  return {
    /** Movement direction as -1, 0 or 1 on each axis, from held keys. */
    move() {
      return {
        x: (anyHeld(KEYS.right) ? 1 : 0) - (anyHeld(KEYS.left) ? 1 : 0),
        y: (anyHeld(KEYS.down) ? 1 : 0) - (anyHeld(KEYS.up) ? 1 : 0),
      };
    },
    sprinting() {
      return anyHeld(KEYS.sprint);
    },
    handbrake() {
      return anyHeld(KEYS.handbrake);
    },
    mouse() {
      return { x: pointerX, y: pointerY, down: pointerHeld, clicked: pointerTapped };
    },
    clearMouseClick() {
      pointerTapped = false;
    },
    /** The one-shot presses queued since the previous call, as ACTION_* bits. */
    takeActions() {
      const taken = queued;
      queued = 0;
      return taken;
    },
  };
}
