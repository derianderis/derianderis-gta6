// The rules and the state of the game, with no drawing and no browser in
// it: Dana on foot and behind the wheel, collisions with traffic, the
// wanted level, the police, combat, missions, the clock and the particles.
// step() moves the world one fixed step and hands back named events, so the
// caller can play sounds and show banners without the world knowing about
// audio or screens.
import { CAR, CLOCK, PLAYER, POLICE, STEP, TILE, WANTED, WORLD } from './config.js';
import { angleDelta, clamp, distance, pick, range, wrapAngle } from './random.js';

const PICKUP_CASH = 'cash';
const PICKUP_HEALTH = 'health';
const PICKUP_AMMO = 'ammo';

function circleHit(ax, ay, ar, bx, by, br) {
  return distance(ax, ay, bx, by) < ar + br;
}

export function createWorld(city, random, entities, missions) {
  const state = {
    player: {
      x: 0, y: 0, angle: 0, health: PLAYER.health, ammo: PLAYER.pistolAmmo,
      weapon: 'pistol', inCar: false, car: null, invulnerable: 0,
      attackCooldown: 0, moving: false,
    },
    money: 0,
    wanted: 0,
    crimeTimer: 0,
    decayTimer: 0,
    elapsed: 0,
    day: 1,
    enemies: [],
    enemiesSpawned: false,
    pickups: [],
    particles: [],
    camera: { x: 0, y: 0 },
    shake: 0,
    carHp: 100,
    over: false,
    overReason: '',
    cashTimer: 0,
    timeMinutes: 540,
    night: false,
    dusk: false,
    entitiesCars: entities.cars,
    entitiesPeds: entities.peds,
    entitiesOfficers: entities.officers,
  };

  function timeMinutes() {
    return (540 + state.elapsed * CLOCK.minutesPerSecond) % 1440;
  }

  function hour() {
    return Math.floor(timeMinutes() / 60);
  }

  function isNight() {
    const h = hour();
    return h >= CLOCK.nightStart || h < CLOCK.dawnStart;
  }

  function isDusk() {
    const h = hour();
    return (h >= CLOCK.duskStart && h < CLOCK.nightStart) || (h >= CLOCK.dawnStart && h < CLOCK.dayStart);
  }

  function addParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = range(random, speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: range(random, life * 0.5, life), maxLife: life,
        color, size: range(random, size * 0.6, size * 1.4),
      });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  function addWanted(amount, events) {
    if (amount <= 0) return;
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.crimeTimer = 0;
    state.decayTimer = 0;
    if (state.wanted > before) events.push('wanted-up');
  }

  function damagePlayer(amount, events) {
    if (state.player.invulnerable > 0 || state.over) return;
    state.player.health -= amount;
    state.player.invulnerable = 0.4;
    state.shake = Math.max(state.shake, 6);
    if (state.player.health <= 0) {
      state.player.health = 0;
      state.over = true;
      state.overReason = state.wanted > 0 ? 'busted' : 'wasted';
      events.push('game-over');
    }
  }

  function spawnPickups() {
    for (let i = 0; i < 10; i += 1) {
      const point = city.randomRoadPoint(random, 0, 0, WORLD, WORLD);
      state.pickups.push({ x: point.x, y: point.y, kind: PICKUP_CASH, amount: 50 + Math.floor(random() * 3) * 50 });
    }
    for (const name of ['cafe', 'garage', 'plaza']) {
      const at = city.landmarks[name];
      state.pickups.push({ x: at.x + 80, y: at.y + 40, kind: PICKUP_HEALTH, amount: 40 });
      state.pickups.push({ x: at.x - 80, y: at.y - 40, kind: PICKUP_AMMO, amount: 30 });
    }
  }

  function reset() {
    const cafe = city.landmarks.cafe;
    const player = state.player;
    player.x = cafe.x + 40;
    player.y = cafe.y + 120;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.ammo = PLAYER.pistolAmmo;
    player.weapon = 'pistol';
    player.inCar = false;
    player.car = null;
    player.invulnerable = 0;
    player.attackCooldown = 0;
    state.money = 0;
    state.wanted = 0;
    state.crimeTimer = 0;
    state.decayTimer = 0;
    state.elapsed = 0;
    state.day = 1;
    state.enemies = [];
    state.enemiesSpawned = false;
    state.pickups = [];
    state.particles = [];
    state.camera.x = player.x;
    state.camera.y = player.y;
    state.shake = 0;
    state.carHp = 100;
    state.over = false;
    state.overReason = '';
    state.cashTimer = 0;
    entities.reset(player);
    spawnPickups();
    missions.state.index = 0;
    missions.state.stage = 0;
    missions.state.active = false;
    missions.state.finished = false;
    missions.state.dialogue = null;
    missions.state.enemiesLeft = 0;
    missions.state.targetCar = null;
    missions.begin();
  }

  function enterCar(events) {
    const player = state.player;
    if (player.inCar) {
      const car = player.car;
      player.inCar = false;
      player.car = null;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
      player.angle = car.angle;
      car.driven = false;
      car.parked = true;
      car.speed = 0;
      events.push('exit-car');
      return;
    }
    const car = entities.nearestCar(player.x, player.y, 80, false);
    if (!car) return;
    player.inCar = true;
    player.car = car;
    car.driven = true;
    car.parked = false;
    state.carHp = 100;
    events.push('enter-car');
    if (car === missions.state.targetCar) addWanted(2, events);
    else addWanted(WANTED.steal, events);
  }

  function playerShoot(events, targetX, targetY) {
    const player = state.player;
    if (player.weapon === 'fists') {
      playerAttackMelee(events);
      return;
    }
    if (player.ammo <= 0) {
      events.push('dry-fire');
      return;
    }
    player.ammo -= 1;
    events.push('gunshot');
    addWanted(WANTED.shoot, events);
    const aim = Math.atan2(targetY - player.y, targetX - player.x);
    const rangePx = PLAYER.pistolRange;
    const muzzleX = player.x + Math.cos(aim) * 22;
    const muzzleY = player.y + Math.sin(aim) * 22;
    addParticles(muzzleX, muzzleY, 4, '#ffd23f', 120, 0.12, 3);
    const targets = [];
    for (const enemy of state.enemies) if (enemy.health > 0) targets.push(enemy);
    for (const officer of entities.officers) if (officer.state !== 'down') targets.push(officer);
    for (const ped of entities.peds) if (ped.state !== 'down') targets.push(ped);
    let best = null;
    let bestScore = Infinity;
    for (const target of targets) {
      const d = distance(player.x, player.y, target.x, target.y);
      if (d > rangePx) continue;
      const delta = Math.abs(angleDelta(aim, Math.atan2(target.y - player.y, target.x - player.x)));
      const score = d + delta * 300;
      if (delta < 0.35 && score < bestScore) {
        best = target;
        bestScore = score;
      }
    }
    if (best) {
      addParticles(best.x, best.y, 6, '#ff4d4d', 160, 0.3, 3);
      hurtTarget(best, PLAYER.pistolDamage, events);
    }
    // A tracer line the renderer draws for a single frame.
    state.particles.push({
      x: muzzleX, y: muzzleY, vx: 0, vy: 0, life: 0.06, maxLife: 0.06,
      color: '#fff2a0', size: 2, tracer: { x: muzzleX + Math.cos(aim) * rangePx, y: muzzleY + Math.sin(aim) * rangePx },
    });
  }

  function playerAttackMelee(events) {
    const player = state.player;
    events.push('punch');
    const aim = player.angle;
    const reach = PLAYER.punchRange;
    const targets = [];
    for (const enemy of state.enemies) if (enemy.health > 0) targets.push(enemy);
    for (const officer of entities.officers) if (officer.state !== 'down') targets.push(officer);
    for (const ped of entities.peds) if (ped.state !== 'down') targets.push(ped);
    for (const target of targets) {
      const d = distance(player.x, player.y, target.x, target.y);
      if (d > reach + 14) continue;
      const delta = Math.abs(angleDelta(aim, Math.atan2(target.y - player.y, target.x - player.x)));
      if (delta > 1.1) continue;
      addParticles(target.x, target.y, 5, '#ffffff', 140, 0.25, 3);
      hurtTarget(target, PLAYER.punchDamage, events);
    }
  }

  function hurtTarget(target, damage, events) {
    if (target.health !== undefined) {
      target.health -= damage;
      if (target.health <= 0) {
        target.health = 0;
        events.push('enemy-down');
        state.pickups.push({ x: target.x, y: target.y, kind: PICKUP_CASH, amount: 100 });
      }
      return;
    }
    // Pedestrians and officers have no health pool: they go down instead.
    if (target.cop) {
      target.state = 'down';
      target.downTimer = 4;
      addWanted(WANTED.punchCop, events);
    } else {
      target.state = 'down';
      target.downTimer = 3;
    }
  }

  function updatePlayerOnFoot(dt, input, events) {
    const player = state.player;
    const move = input.move;
    const len = Math.hypot(move.x, move.y);
    const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    player.moving = len > 0;
    if (len > 0) {
      player.x += (move.x / len) * speed * dt;
      player.y += (move.y / len) * speed * dt;
    }
    player.angle = Math.atan2(input.mouseWorldY - player.y, input.mouseWorldX - player.x);
    const body = { x: player.x, y: player.y, radius: PLAYER.radius };
    if (city.collideCircle(body)) {
      player.x = body.x;
      player.y = body.y;
    }
    if (player.attackCooldown > 0) player.attackCooldown -= dt;
    if (input.mouseClicked && player.attackCooldown <= 0) {
      player.attackCooldown = player.weapon === 'fists' ? 0.35 : 0.28;
      playerShoot(events, input.mouseWorldX, input.mouseWorldY);
    }
    if (input.reload && player.weapon === 'pistol') {
      const need = PLAYER.pistolAmmo - player.ammo;
      if (need > 0) {
        player.ammo = PLAYER.pistolAmmo;
        events.push('reload');
      }
    }
  }

  function updateDriving(dt, input, events) {
    const player = state.player;
    const car = player.car;
    if (!car) {
      player.inCar = false;
      return;
    }
    const move = input.move;
    const forward = move.y < 0 ? 1 : move.y > 0 ? -0.6 : 0;
    const steering = move.x;
    if (forward > 0) car.speed += CAR.accel * dt;
    else if (forward < 0) car.speed -= CAR.reverseAccel * dt;
    if (input.handbrake) {
      car.speed -= Math.sign(car.speed) * CAR.brake * dt;
      if (Math.abs(car.speed) > 200) {
        addParticles(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 2, '#c9c9c9', 60, 0.5, 4);
        events.push('skid');
      }
    }
    car.speed -= car.speed * CAR.drag * dt;
    if (Math.abs(car.speed) < 4 && forward === 0) car.speed = 0;
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    // Steering still bites a little at a standstill, so a car that starts
    // facing the wrong way can turn around instead of stalling.
    const steerFactor = Math.max(0.35, Math.min(1, Math.abs(car.speed) / 120));
    const steerAmount = steering * CAR.turnRate * dt * steerFactor * (car.speed < 0 ? -1 : 1);
    car.angle = wrapAngle(car.angle + steerAmount);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const body = { x: car.x, y: car.y, radius: CAR.radius };
    if (city.collideCircle(body)) {
      const impact = Math.abs(car.speed);
      car.x = body.x;
      car.y = body.y;
      car.speed *= -0.25;
      if (impact > 180) {
        state.carHp -= 6;
        state.shake = Math.max(state.shake, 5);
        events.push('crash');
        addParticles(car.x, car.y, 8, '#ffb347', 180, 0.4, 3);
      }
    }
    // Running over pedestrians.
    for (const ped of entities.peds) {
      if (ped.state === 'down') continue;
      if (circleHit(car.x, car.y, CAR.radius, ped.x, ped.y, 12)) {
        if (Math.abs(car.speed) > 120) {
          ped.state = 'down';
          ped.downTimer = 4;
          addWanted(WANTED.hitPed, events);
          events.push('ped-hit');
          addParticles(ped.x, ped.y, 6, '#ff4d4d', 120, 0.4, 3);
          car.speed *= 0.85;
        } else {
          ped.state = 'flee';
        }
      }
    }
    // Bumping traffic cars.
    for (const other of entities.cars) {
      if (other === car || other.police) continue;
      if (circleHit(car.x, car.y, CAR.radius, other.x, other.y, CAR.radius)) {
        other.x += Math.cos(car.angle) * 30 * dt * 10;
        other.y += Math.sin(car.angle) * 30 * dt * 10;
        if (Math.abs(car.speed) > 200) {
          events.push('crash');
          state.carHp -= 4;
        }
        car.speed *= 0.9;
      }
    }
    if (input.honk) events.push('honk');
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (Math.abs(car.speed) > 20 && random() < 0.3) {
      addParticles(
        car.x - Math.cos(car.angle) * 24, car.y - Math.sin(car.angle) * 24,
        1, 'rgba(200,200,200,0.5)', 30, 0.6, 5,
      );
    }
    if (state.carHp <= 0) {
      addParticles(car.x, car.y, 10, '#555555', 90, 1, 6);
      events.push('car-wrecked');
      state.carHp = 100;
      enterCar(events);
    }
  }

  function updateEnemies(dt, events) {
    const player = state.player;
    for (const enemy of state.enemies) {
      if (enemy.health <= 0) continue;
      const d = distance(enemy.x, enemy.y, player.x, player.y);
      enemy.shootTimer -= dt;
      if (d < 520) {
        const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        enemy.angle = aim;
        if (d > 60) {
          enemy.x += Math.cos(aim) * enemy.speed * dt;
          enemy.y += Math.sin(aim) * enemy.speed * dt;
        }
        if (d < 320 && enemy.shootTimer <= 0) {
          enemy.shootTimer = 1.4 + random() * 0.8;
          events.push('enemy-shot');
          addParticles(enemy.x + Math.cos(aim) * 20, enemy.y + Math.sin(aim) * 20, 3, '#ffd23f', 120, 0.1, 3);
          if (random() < 0.55) damagePlayer(6 + Math.floor(random() * 5), events);
        }
        if (d < 40) {
          enemy.punchTimer -= dt;
          if (enemy.punchTimer <= 0) {
            enemy.punchTimer = 1;
            damagePlayer(8, events);
          }
        }
      }
      const body = { x: enemy.x, y: enemy.y, radius: 13 };
      if (city.collideCircle(body)) {
        enemy.x = body.x;
        enemy.y = body.y;
      }
    }
    state.enemies = state.enemies.filter((enemy) => enemy.health > 0 || enemy.deadTimer > 0);
  }

  function updatePolice(dt, events) {
    const player = state.player;
    entities.ensurePolice(state.wanted, player);
    for (const cop of entities.policeCars()) {
      if (player.inCar && player.car) {
        if (circleHit(cop.x, cop.y, CAR.radius, player.car.x, player.car.y, CAR.radius)) {
          if (state.elapsed - cop.lastRam > 0.8) {
            cop.lastRam = state.elapsed;
            state.carHp -= POLICE.ramDamage;
            damagePlayer(2, events);
            state.shake = Math.max(state.shake, 7);
            events.push('ram');
            addParticles(player.car.x, player.car.y, 8, '#ffb347', 200, 0.4, 3);
            cop.speed *= 0.5;
          }
        }
      }
    }
    for (const officer of entities.officers) {
      if (officer.state === 'down') continue;
      const d = distance(officer.x, officer.y, player.x, player.y);
      if (d < 34) {
        officer.punchTimer = (officer.punchTimer || 0) - dt;
        if (officer.punchTimer <= 0) {
          officer.punchTimer = 1;
          damagePlayer(POLICE.punchDamage, events);
          events.push('cop-punch');
        }
      }
    }
  }

  function updateWanted(dt) {
    state.crimeTimer += dt;
    if (state.wanted === 0) return;
    if (state.crimeTimer < WANTED.decayDelay) return;
    const hiding = city.inPark(state.player.x, state.player.y);
    state.decayTimer += dt * (hiding ? WANTED.hideMultiplier : 1);
    if (state.decayTimer >= WANTED.decayInterval) {
      state.decayTimer = 0;
      state.wanted -= 1;
    }
  }

  function updatePickups(dt, events) {
    const player = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      if (distance(player.x, player.y, pickup.x, pickup.y) < (player.inCar ? 44 : 36)) {
        if (pickup.kind === PICKUP_CASH) {
          state.money += pickup.amount;
          events.push('pickup');
        } else if (pickup.kind === PICKUP_HEALTH) {
          player.health = Math.min(PLAYER.health, player.health + pickup.amount);
          events.push('pickup');
        } else if (pickup.kind === PICKUP_AMMO) {
          player.ammo = Math.min(PLAYER.pistolAmmo, player.ammo + pickup.amount);
          events.push('pickup');
        }
        addParticles(pickup.x, pickup.y, 8, '#7ee787', 120, 0.4, 3);
        state.pickups.splice(i, 1);
      }
    }
    state.cashTimer += dt;
    if (state.cashTimer > 20 && state.pickups.filter((p) => p.kind === PICKUP_CASH).length < 8) {
      state.cashTimer = 0;
      const point = city.randomRoadPoint(random, 0, 0, WORLD, WORLD);
      state.pickups.push({ x: point.x, y: point.y, kind: PICKUP_CASH, amount: 50 + Math.floor(random() * 3) * 50 });
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2 * dt;
      p.vy *= 1 - 2 * dt;
    }
  }

  function updateCamera(dt, view) {
    const player = state.player;
    const targetX = player.x;
    const targetY = player.y;
    const t = 1 - Math.pow(0.001, dt);
    state.camera.x += (targetX - state.camera.x) * t;
    state.camera.y += (targetY - state.camera.y) * t;
    const halfW = view.w / 2;
    const halfH = view.h / 2;
    state.camera.x = clamp(state.camera.x, Math.min(halfW, WORLD / 2), Math.max(halfW, WORLD - halfW));
    state.camera.y = clamp(state.camera.y, Math.min(halfH, WORLD / 2), Math.max(halfH, WORLD - halfH));
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
  }

  function step(dt, input) {
    const events = [];
    if (state.over) return events;
    state.elapsed += dt;
    state.timeMinutes = timeMinutes();
    state.night = isNight();
    state.dusk = isDusk();
    const player = state.player;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.health < PLAYER.health && state.wanted === 0) {
      player.health = Math.min(PLAYER.health, player.health + PLAYER.regenPerSecond * dt);
    }

    if (input.enterCar) enterCar(events);
    if (input.weapon1) player.weapon = 'fists';
    if (input.weapon2) player.weapon = 'pistol';

    if (player.inCar) updateDriving(dt, input, events);
    else updatePlayerOnFoot(dt, input, events);

    // Mission stage bookkeeping: spawn the combat crew and the target car.
    const stage = missions.stageDef();
    if (missions.state.active && stage) {
      if (stage.type === 'combat' && !state.enemiesSpawned) {
        state.enemiesSpawned = true;
        const at = city.landmarks.warehouse;
        for (let i = 0; i < stage.enemies; i += 1) {
          state.enemies.push({
            x: at.x + range(random, -160, 160), y: at.y + range(random, -120, 120),
            angle: 0, health: 50, speed: 130, shootTimer: range(random, 0.5, 1.5),
            punchTimer: 0, deadTimer: 0,
          });
        }
      }
      if (stage.type === 'steal' && !missions.state.targetCar) {
        const at = city.landmarks.dealership;
        const car = entities.addTrafficCar(at.x + 60, at.y + 30);
        car.kind = 'sport';
        car.color = '#d8232a';
        car.parked = true;
        missions.state.targetCar = car;
      }
    }

    const missionEvents = missions.update({
      x: player.x, y: player.y, inCar: player.inCar, car: player.car,
      wanted: state.wanted, enemiesAlive: state.enemies.filter((e) => e.health > 0).length,
      enemiesSpawned: state.enemiesSpawned, nearPress: input.confirm,
    });
    for (const event of missionEvents) {
      if (event.type === 'mission-complete') {
        state.money += event.mission.reward;
        events.push('mission-done');
        missions.showBanner(`${event.mission.title} complete — $${event.mission.reward}`);
        state.enemiesSpawned = false;
        state.enemies = [];
      } else if (event.type === 'stage') {
        events.push('stage');
      } else if (event.type === 'pickup') {
        events.push('pickup');
      }
    }

    entities.update(dt, player, state.wanted, state.elapsed);
    updateEnemies(dt, events);
    updatePolice(dt, events);
    updateWanted(dt);
    updatePickups(dt, events);
    updateParticles(dt);
    updateCamera(dt, input.view);
    return events;
  }

  function getSave() {
    const player = state.player;
    return {
      money: state.money,
      wanted: state.wanted,
      health: player.health,
      ammo: player.ammo,
      x: player.x, y: player.y,
      elapsed: state.elapsed,
      missionIndex: missions.state.index,
      missionStage: missions.state.stage,
      missionActive: missions.state.active,
      finished: missions.state.finished,
    };
  }

  function loadSave(save) {
    reset();
    state.money = save.money || 0;
    state.wanted = save.wanted || 0;
    state.elapsed = save.elapsed || 0;
    state.player.x = save.x;
    state.player.y = save.y;
    state.player.health = save.health ?? PLAYER.health;
    state.player.ammo = save.ammo ?? PLAYER.pistolAmmo;
    missions.state.index = save.missionIndex || 0;
    missions.state.stage = save.missionStage || 0;
    missions.state.active = !!save.missionActive;
    missions.state.finished = !!save.finished;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
  }

  return {
    state, reset, step, timeMinutes, hour, isNight, isDusk,
    getSave, loadSave, enterCar, addWanted,
  };
}
