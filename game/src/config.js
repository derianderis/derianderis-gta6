// Street Heat in Solmar Bay — all of the game's tuning lives in this file.
// Distances are pixels. The city is a 96-by-96 tile grid with 48 px tiles,
// and the streets follow a regular grid so traffic, the minimap and the
// missions can all share the same road layout.

export const TILE = 48;
export const MAP_TILES = 96;
export const WORLD = TILE * MAP_TILES;

// One fixed simulation step: the world advances in 1/60 s slices.
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  walkSpeed: 210,
  sprintSpeed: 330,
  health: 100,
  punchRange: 46,
  punchDamage: 25,
  pistolRange: 340,
  pistolDamage: 34,
  pistolAmmo: 60,
  regenPerSecond: 2,
};

export const CAR = {
  radius: 22,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 180,
  turnRate: 2.6,
  drag: 0.55,
  grip: 6.5,
};

export const POLICE = {
  accel: 460,
  maxSpeed: 560,
  ramDamage: 14,
  punchDamage: 8,
  viewRadius: 620,
};

// How much heat each crime adds, and how fast it cools off.
export const WANTED = {
  max: 5,
  decayDelay: 25,
  decayInterval: 10,
  hideMultiplier: 2,
  steal: 1,
  hitPed: 1,
  killPed: 2,
  shoot: 1,
  punchCop: 2,
};

// The in-game clock: one real second is one game minute, so a whole
// in-game day takes 24 real minutes.
export const CLOCK = {
  minutesPerSecond: 1,
  dawnStart: 6,
  dayStart: 8,
  duskStart: 17,
  nightStart: 20,
};

export const SAVE_KEY = 'solmar-bay.save.v1';

export const PALETTE = {
  grass: '#5d8a4a',
  grassDark: '#527c42',
  sand: '#d9c48a',
  water: '#2e6f8e',
  waterDeep: '#25607d',
  road: '#3a3d44',
  roadEdge: '#2c2e34',
  lane: '#e8d44d',
  sidewalk: '#9a9a92',
  buildingRoof: '#b0563f',
  buildingRoof2: '#4f6f8f',
  buildingRoof3: '#7a7f8a',
  buildingRoof4: '#8a6f4f',
  buildingEdge: '#2e2a26',
  parkTree: '#2f6b2f',
  parkTree2: '#3f7d33',
  player: '#ffd23f',
  playerCar: '#e8b13a',
  police: '#2b4fd8',
  policeLight: '#ff3b30',
  enemy: '#c22e4d',
  ped: '#e8e4da',
  cash: '#7ee787',
  marker: '#ffd23f',
  hudBg: 'rgba(12, 16, 24, 0.72)',
  text: '#f5f2e8',
  muted: '#b9b4a4',
  red: '#ff4d4d',
  night: 'rgba(8, 12, 40, 0.42)',
  dusk: 'rgba(64, 32, 64, 0.22)',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  enterCar: ['KeyE'],
  handbrake: ['Space'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  reload: ['KeyR'],
  pause: ['KeyP', 'Escape'],
  confirm: ['Enter', 'Space'],
  missionList: ['KeyM'],
  honk: ['KeyH'],
};
