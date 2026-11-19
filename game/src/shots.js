// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot that drives along the roads toward the mission marker, so
// the frame is what a short game really looks like and the same seed always
// gives the same frame.
import { STEP } from './config.js';
import { angleDelta } from './random.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 600;

/** A blank input, as the loop hands the world every step. */
function blankInput(view) {
  return {
    move: { x: 0, y: 0 }, sprint: false, handbrake: false,
    enterCar: false, weapon1: false, weapon2: false, reload: false,
    honk: false, confirm: false, mouseClicked: false,
    mouseWorldX: 0, mouseWorldY: 0, view,
  };
}

// Drive the player's car toward a point by hopping between intersections,
// staying on the roads: first reach the nearest road, then follow it to the
// next crossing, taking the road that closes the bigger gap first.
function createDriver(city) {
  let waypoint = null;
  // When the car barely moves while the driver is pushing forward, it is
  // wedged against a building: back straight out for a moment, then try the
  // road again from a different angle.
  let stuckSteps = 0;
  let unstickSteps = 0;
  return function drive(state, target, reckless) {
    const input = blankInput({ w: 1024, h: 768 });
    const car = state.player.car;
    if (!car) return input;
    const player = state.player;
    if (unstickSteps > 0) {
      unstickSteps -= 1;
      input.move.y = 1;
      input.move.x = 0;
      input.mouseWorldX = player.x + Math.cos(player.angle) * 100;
      input.mouseWorldY = player.y + Math.sin(player.angle) * 100;
      return input;
    }
    const roadX = city.nearestRoadX(car.x);
    const roadY = city.nearestRoadY(car.y);
    const onVertical = Math.abs(car.x - roadX) < 48;
    const onHorizontal = Math.abs(car.y - roadY) < 48;
    if (!waypoint || Math.hypot(waypoint.x - car.x, waypoint.y - car.y) < 80) {
      const dx = target.x - car.x;
      const dy = target.y - car.y;
      if (!onVertical && !onHorizontal) {
        // Off the roads: head for the nearer road centre line.
        waypoint = Math.abs(car.x - roadX) < Math.abs(car.y - roadY)
          ? { x: roadX, y: car.y }
          : { x: car.x, y: roadY };
      } else if (onVertical && onHorizontal) {
        // At a crossing: take the road that closes the bigger gap.
        waypoint = Math.abs(dx) > Math.abs(dy)
          ? { x: city.nearestRoadX(car.x + Math.sign(dx) * 400), y: roadY }
          : { x: roadX, y: city.nearestRoadY(car.y + Math.sign(dy) * 400) };
      } else if (onVertical) {
        waypoint = { x: roadX, y: city.nearestRoadY(car.y + Math.sign(dy) * 400) };
      } else {
        waypoint = { x: city.nearestRoadX(car.x + Math.sign(dx) * 400), y: roadY };
      }
    }
    const desired = Math.atan2(waypoint.y - car.y, waypoint.x - car.x);
    const delta = angleDelta(car.angle, desired);
    input.move.x = delta > 0.15 ? 1 : delta < -0.15 ? -1 : 0;
    if (reckless) {
      input.move.y = -1;
      input.handbrake = Math.abs(delta) > 2.4;
    } else if (Math.abs(delta) < 1.1) {
      input.move.y = -1;
    } else if (Math.abs(delta) > 2.2) {
      input.move.y = 1;
    } else {
      // Creep forward while turning, so the car can swing around.
      input.move.y = -1;
    }
    input.mouseWorldX = player.x + Math.cos(player.angle) * 100;
    input.mouseWorldY = player.y + Math.sin(player.angle) * 100;
    if (input.move.y < 0 && Math.abs(car.speed) < 30) stuckSteps += 1;
    else stuckSteps = 0;
    if (stuckSteps > 90) {
      stuckSteps = 0;
      unstickSteps = 48;
      waypoint = null;
    }
    return input;
  };
}

function putPlayerInCar(world, entities, city, x, y) {
  const car = entities.nearestCar(x, y, 2000, false);
  if (!car) return;
  world.state.player.x = car.x;
  world.state.player.y = car.y;
  world.state.player.inCar = true;
  world.state.player.car = car;
  car.driven = true;
  car.parked = false;
  world.state.carHp = 100;
}

function setClock(world, hour) {
  // The clock starts at 09:00; elapsed seconds are game minutes.
  world.state.elapsed = Math.max(0, hour * 60 - 540);
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start)
 * and return the screen to draw over it.
 */
export function stageShot(name, world, entities, city, missions) {
  const state = world.state;
  world.reset();
  const view = { w: 1024, h: 768 };
  if (name !== 'play' && name !== 'end') {
    setClock(world, 14);
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      const input = blankInput(view);
      input.mouseWorldX = state.player.x + 100;
      input.mouseWorldY = state.player.y;
      world.step(STEP, input);
    }
    return { screen: SCREEN_TITLE };
  }
  const driver = createDriver(city);
  if (name === 'play') {
    setClock(world, 17);
    const cafe = city.landmarks.cafe;
    putPlayerInCar(world, entities, city, cafe.x, cafe.y);
    world.addWanted(2, []);
    // The job is already under way: the package waits at the docks.
    missions.skipToStage(1);
    const marker = city.landmarks.docks;
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      if (state.over) break;
      world.step(STEP, driver(state, marker, false));
    }
    // Let the car get rolling again before the shutter, so the still shows a
    // moving chase rather than a car stopped mid-turn.
    let settle = 0;
    while (!state.over && settle < 180 && state.player.car && Math.abs(state.player.car.speed) < 150) {
      world.step(STEP, driver(state, marker, false));
      settle += 1;
    }
    return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY };
  }
  // end: a reckless driver, four stars, a bruised car and a low health bar.
  setClock(world, 21);
  const cafe = city.landmarks.cafe;
  putPlayerInCar(world, entities, city, cafe.x, cafe.y);
  world.addWanted(4, []);
  state.player.health = 25;
  state.carHp = 40;
  // The opening line is already spent: the end of the night is the panel.
  while (missions.state.dialogue) missions.advanceDialogue();
  const marker = city.landmarks.warehouse;
  for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
    if (state.over) break;
    world.step(STEP, driver(state, marker, true));
  }
  if (!state.over) {
    // The pilot survived the limit: the night still ends badly for Dana.
    state.player.health = 0;
    state.over = true;
    state.overReason = 'busted';
  }
  return { screen: SCREEN_OVER };
}
