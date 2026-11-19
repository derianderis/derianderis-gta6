// The other people in Solmar Bay: traffic cars that cruise the road grid,
// pedestrians strolling the sidewalks, and the police who show up when the
// wanted level rises. This module only moves things around; the world
// module decides what a collision means.
import { CAR, POLICE, WORLD } from './config.js';
import { angleDelta, clamp, distance, pick, range, rangeInt, wrapAngle } from './random.js';

const CAR_COLORS = ['#c23b2e', '#3f6fb5', '#d8d3c3', '#4a4a52', '#7a4a8f', '#3f8f6a', '#c28a2e'];
const TAXI_COLOR = '#f2c230';
const SPORT_COLORS = ['#d8232a', '#f2f2f2', '#2a2a2e'];
const SHIRT_COLORS = ['#e8e4da', '#b5c23f', '#c26a3f', '#6a8fb5', '#b56a9f', '#8a6f4f', '#4a4a52'];

function makeCar(random, city, x, y, police) {
  const kind = police ? 'police' : pick(random, ['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sport']);
  const color = police ? '#2b4fd8' : kind === 'taxi' ? TAXI_COLOR : kind === 'sport' ? pick(random, SPORT_COLORS) : pick(random, CAR_COLORS);
  return {
    x, y, angle: 0, speed: 0, color, kind, police,
    length: kind === 'truck' ? 64 : 46,
    width: kind === 'truck' ? 26 : 22,
    targetSpeed: kind === 'truck' ? 150 : kind === 'sport' ? 260 : 210,
    axis: 'v', dir: 1, lane: 1,
    targetX: x, targetY: y,
    lastRam: -10, honkTimer: range(random, 4, 12),
  };
}

function makePed(random, city, x, y, cop) {
  return {
    x, y, angle: random() * Math.PI * 2, speed: cop ? 150 : range(random, 45, 80),
    targetX: x, targetY: y, state: 'walk', downTimer: 0,
    color: cop ? '#24344d' : pick(random, SHIRT_COLORS), cop: !!cop,
    walkPhase: random() * Math.PI * 2,
  };
}

// Find the crossing next to (x, y) on the road grid, then step to the
// neighbouring one along the car's current street.
function nextIntersection(city, car, random) {
  const { roadsV, roadsH } = city;
  let vi = 0;
  let hi = 0;
  for (let i = 0; i < roadsV.length; i += 1) if (Math.abs(roadsV[i] - car.x) < Math.abs(roadsV[vi] - car.x)) vi = i;
  for (let j = 0; j < roadsH.length; j += 1) if (Math.abs(roadsH[j] - car.y) < Math.abs(roadsH[hi] - car.y)) hi = j;
  if (car.axis === 'v') {
    hi = clamp(hi + car.dir, 0, roadsH.length - 1);
    if (hi === 0 || hi === roadsH.length - 1) car.dir = -car.dir;
  } else {
    vi = clamp(vi + car.dir, 0, roadsV.length - 1);
    if (vi === 0 || vi === roadsV.length - 1) car.dir = -car.dir;
  }
  // At the crossing, sometimes turn onto the other street instead.
  if (random() < 0.3) {
    car.axis = car.axis === 'v' ? 'h' : 'v';
    car.dir = random() < 0.5 ? 1 : -1;
    car.lane = random() < 0.5 ? 1 : -1;
  }
  const tx = roadsV[vi];
  const ty = roadsH[hi];
  if (car.axis === 'v') return { x: tx + car.lane * 24, y: ty };
  return { x: tx, y: ty + car.lane * 24 };
}

export function createEntities(city, random) {
  const cars = [];
  const peds = [];
  const officers = [];
  let spawnTimer = 0;

  function roadPointNear(x, y, minDist, maxDist) {
    for (let tries = 0; tries < 30; tries += 1) {
      const point = city.randomRoadPoint(random, 0, 0, WORLD, WORLD);
      const d = distance(point.x, point.y, x, y);
      if (d >= minDist && d <= maxDist) return point;
    }
    return null;
  }

  function addTrafficCar(x, y) {
    const car = makeCar(random, city, x, y, false);
    const target = nextIntersection(city, car, random);
    car.targetX = target.x;
    car.targetY = target.y;
    car.angle = Math.atan2(target.y - y, target.x - x);
    cars.push(car);
    return car;
  }

  function addPed(x, y, cop) {
    const ped = makePed(random, city, x, y, cop);
    const point = city.randomRoadPoint(random, 0, 0, WORLD, WORLD);
    ped.targetX = point.x + 60;
    ped.targetY = point.y + 60;
    peds.push(ped);
    return ped;
  }

  function spawnAround(player, count, what) {
    for (let i = 0; i < count; i += 1) {
      const point = roadPointNear(player.x, player.y, 350, 1500);
      if (!point) return;
      if (what === 'car') addTrafficCar(point.x, point.y);
      else addPed(point.x, point.y, false);
    }
  }

  function steerToward(car, tx, ty, dt, turnRate) {
    const wanted = Math.atan2(ty - car.y, tx - car.x);
    const delta = angleDelta(car.angle, wanted);
    const turn = clamp(delta, -turnRate * dt, turnRate * dt);
    car.angle = wrapAngle(car.angle + turn);
  }

  function updateCar(car, dt, player) {
    // Ease off for the car straight ahead, so traffic does not bunch up.
    let ahead = null;
    let aheadDist = 90;
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (forward > 0 && forward < aheadDist && side < 30) {
        ahead = other;
        aheadDist = forward;
      }
    }
    const targetSpeed = ahead ? Math.min(car.targetSpeed, ahead.speed * 0.9) : car.targetSpeed;
    car.speed += clamp(targetSpeed - car.speed, -300 * dt, 200 * dt);
    const arrived = distance(car.x, car.y, car.targetX, car.targetY) < 42;
    if (arrived) {
      const next = nextIntersection(city, car, random);
      car.targetX = next.x;
      car.targetY = next.y;
    }
    steerToward(car, car.targetX, car.targetY, dt, 2.2);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const body = { x: car.x, y: car.y, radius: CAR.radius };
    if (city.collideCircle(body)) {
      car.x = body.x;
      car.y = body.y;
      car.speed *= 0.5;
    }
    car.honkTimer -= dt;
  }

  function updatePoliceCar(car, dt, player, time) {
    const d = distance(car.x, car.y, player.x, player.y);
    const speedTarget = d > 140 ? POLICE.maxSpeed : POLICE.maxSpeed * 0.7;
    car.speed += clamp(speedTarget - car.speed, -400 * dt, POLICE.accel * dt);
    steerToward(car, player.x, player.y, dt, 3.4);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const body = { x: car.x, y: car.y, radius: CAR.radius };
    if (city.collideCircle(body)) {
      car.x = body.x;
      car.y = body.y;
      car.speed *= 0.6;
    }
    car.honkTimer -= dt;
  }

  function updatePed(ped, dt, player) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.speed = 260;
      }
      return;
    }
    const d = distance(ped.x, ped.y, ped.targetX, ped.targetY);
    if (d < 24) {
      const point = city.randomRoadPoint(random, 0, 0, WORLD, WORLD);
      ped.targetX = point.x + 60;
      ped.targetY = point.y + 60;
      return;
    }
    // A fleeing pedestrian runs away from the player; everyone else strolls
    // toward their destination.
    if (ped.state === 'flee') {
      ped.angle = Math.atan2(ped.y - player.y, ped.x - player.x);
    } else {
      ped.angle = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
    }
    ped.walkPhase += dt * 8;
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    const body = { x: ped.x, y: ped.y, radius: 12 };
    if (city.collideCircle(body)) {
      ped.x = body.x;
      ped.y = body.y;
      const point = city.randomRoadPoint(random, 0, 0, WORLD, WORLD);
      ped.targetX = point.x;
      ped.targetY = point.y;
    }
  }

  function updateOfficer(officer, dt, player) {
    if (officer.state === 'down') {
      officer.downTimer -= dt;
      if (officer.downTimer <= 0) officer.state = 'walk';
      return;
    }
    officer.angle = Math.atan2(player.y - officer.y, player.x - officer.x);
    officer.x += Math.cos(officer.angle) * officer.speed * dt;
    officer.y += Math.sin(officer.angle) * officer.speed * dt;
    const body = { x: officer.x, y: officer.y, radius: 12 };
    if (city.collideCircle(body)) {
      officer.x = body.x;
      officer.y = body.y;
    }
  }

  function policeCars() {
    return cars.filter((car) => car.police);
  }

  function update(dt, player, wanted, time) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = 1.2;
      const near = cars.filter((c) => distance(c.x, c.y, player.x, player.y) < 1500);
      if (near.length < 22) spawnAround(player, 3, 'car');
      const nearPeds = peds.filter((p) => distance(p.x, p.y, player.x, player.y) < 1200);
      if (nearPeds.length < 26) spawnAround(player, 4, 'ped');
    }
    // Drop anything that has drifted far from the player.
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      if (distance(car.x, car.y, player.x, player.y) > 1900) cars.splice(i, 1);
    }
    for (let i = peds.length - 1; i >= 0; i -= 1) {
      const ped = peds[i];
      if (distance(ped.x, ped.y, player.x, player.y) > 1700) peds.splice(i, 1);
    }
    for (let i = officers.length - 1; i >= 0; i -= 1) {
      const officer = officers[i];
      if (wanted === 0 || distance(officer.x, officer.y, player.x, player.y) > 900) {
        officers.splice(i, 1);
      }
    }
    for (const car of cars) {
      if (car.driven || car.parked) continue;
      if (car.police) updatePoliceCar(car, dt, player, time);
      else updateCar(car, dt, player);
    }
    for (const ped of peds) updatePed(ped, dt, player);
    for (const officer of officers) updateOfficer(officer, dt, player);
  }

  function ensurePolice(wanted, player) {
    const wantedCars = Math.min(4, wanted);
    const current = policeCars();
    if (current.length < wantedCars) {
      for (let i = current.length; i < wantedCars; i += 1) {
        const point = roadPointNear(player.x, player.y, 500, 1100) || { x: player.x + 600, y: player.y };
        const car = makeCar(random, city, point.x, point.y, true);
        car.angle = Math.atan2(player.y - point.y, player.x - point.x);
        cars.push(car);
      }
    } else if (current.length > wantedCars) {
      for (let i = current.length - 1; i >= wantedCars; i -= 1) {
        cars.splice(cars.indexOf(current[i]), 1);
      }
    }
    // On foot, the law comes on foot too: an officer steps out near the player.
    if (!player.inCar && wanted >= 1 && officers.length < Math.min(2, wanted)) {
      const point = roadPointNear(player.x, player.y, 150, 400) || { x: player.x + 200, y: player.y };
      const officer = makePed(random, city, point.x, point.y, true);
      officers.push(officer);
    }
  }

  function nearestCar(x, y, maxDist, policeOnly) {
    let best = null;
    let bestDist = maxDist;
    for (const car of cars) {
      if (policeOnly && !car.police) continue;
      if (!policeOnly && car.police) continue;
      const d = distance(x, y, car.x, car.y);
      if (d < bestDist) {
        best = car;
        bestDist = d;
      }
    }
    return best;
  }

  function reset(player) {
    cars.length = 0;
    peds.length = 0;
    officers.length = 0;
    spawnAround(player, 18, 'car');
    spawnAround(player, 24, 'ped');
  }

  return {
    cars, peds, officers,
    reset, update, ensurePolice, nearestCar, policeCars,
    addTrafficCar, addPed,
  };
}
