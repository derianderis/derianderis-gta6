// Drawing only: world state and the current screen go in, pixels come out.
// The camera trails the player across the city; the HUD, the minimap and the
// menus are painted in screen space over the top. Flat shapes and canvas
// text only, no images, so the game needs no assets at all.
import { FONT, PALETTE, TILE, WORLD } from './config.js';
import { clamp, lerp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSIONS = 'missions';

const MINIMAP = 190;

export function createRenderer(canvas, city) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 720, dpr: 1 };
  const fontCache = new Map();

  function resize() {
    view.dpr = window.devicePixelRatio || 1;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = `${view.w}px`;
    canvas.style.height = `${view.h}px`;
  }

  function font(size, bold) {
    const key = `${size}:${bold ? 'b' : ''}`;
    if (!fontCache.has(key)) fontCache.set(key, `${bold ? 'bold ' : ''}${size}px ${FONT}`);
    return fontCache.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    ctx.font = font(size, bold);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(12, 16, 24, ${alpha ?? 0.72})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(245, 242, 232, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  function worldToScreen(wx, wy, state) {
    const cam = state.camera;
    const shakeX = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
    return { x: wx - cam.x + view.w / 2 + shakeX, y: wy - cam.y + view.h / 2 + shakeY };
  }

  function drawCity(state) {
    const cam = state.camera;
    const left = cam.x - view.w / 2 - 60;
    const top = cam.y - view.h / 2 - 60;
    const right = cam.x + view.w / 2 + 60;
    const bottom = cam.y + view.h / 2 + 60;

    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, view.w, view.h);
    // Mown stripes give the grass a little texture.
    ctx.fillStyle = PALETTE.grassDark;
    const stripe = TILE * 4;
    for (let y = Math.floor(top / stripe) * stripe; y < bottom; y += stripe * 2) {
      const sy = y - top;
      if (sy > -stripe) ctx.fillRect(0, sy, view.w, stripe);
    }

    function paintRect(x, y, w, h, color) {
      const s = worldToScreen(x, y, state);
      ctx.fillStyle = color;
      ctx.fillRect(s.x, s.y, w, h);
    }

    for (const beach of city.beach) {
      if (beach.y + beach.h < top || beach.y > bottom) continue;
      paintRect(beach.x, beach.y, beach.w, beach.h, PALETTE.sand);
    }
    for (const sea of city.water) {
      if (sea.y + sea.h < top || sea.y > bottom) continue;
      paintRect(sea.x, sea.y, sea.w, sea.h, PALETTE.water);
      ctx.fillStyle = PALETTE.waterDeep;
      const s = worldToScreen(0, sea.y, state);
      for (let x = 0; x < view.w; x += 90) {
        const waveY = s.y + 26 + Math.sin((x + state.elapsed * 30) * 0.02) * 4;
        ctx.fillRect(x, waveY, 46, 3);
      }
    }

    // Sidewalks, then roads, then lane markings.
    for (const cx of city.roadsV) {
      if (cx < left - 120 || cx > right + 120) continue;
      paintRect(cx - 60, Math.max(top, 0), 120, bottom - Math.max(top, 0), PALETTE.sidewalk);
    }
    for (const cy of city.roadsH) {
      if (cy < top - 120 || cy > bottom + 120) continue;
      paintRect(Math.max(left, 0), cy - 60, right - Math.max(left, 0), 120, PALETTE.sidewalk);
    }
    for (const cx of city.roadsV) {
      if (cx < left - 120 || cx > right + 120) continue;
      paintRect(cx - 48, Math.max(top, 0), 96, bottom - Math.max(top, 0), PALETTE.road);
    }
    for (const cy of city.roadsH) {
      if (cy < top - 120 || cy > bottom + 120) continue;
      paintRect(Math.max(left, 0), cy - 48, right - Math.max(left, 0), 96, PALETTE.road);
    }
    ctx.fillStyle = PALETTE.lane;
    for (const cx of city.roadsV) {
      if (cx < left - 120 || cx > right + 120) continue;
      for (let y = Math.floor(top / 64) * 64; y < bottom; y += 64) {
        const s = worldToScreen(cx, y, state);
        ctx.fillRect(s.x - 2, s.y, 4, 30);
      }
    }
    for (const cy of city.roadsH) {
      if (cy < top - 120 || cy > bottom + 120) continue;
      for (let x = Math.floor(left / 64) * 64; x < right; x += 64) {
        const s = worldToScreen(x, cy, state);
        ctx.fillRect(s.x, s.y - 2, 30, 4);
      }
    }

    for (const lot of city.lots) {
      if (lot.x > right || lot.x + lot.w < left || lot.y > bottom || lot.y + lot.h < top) continue;
      paintRect(lot.x, lot.y, lot.w, lot.h, '#6a6a66');
      ctx.strokeStyle = 'rgba(245,242,232,0.5)';
      ctx.lineWidth = 2;
      const s = worldToScreen(lot.x, lot.y, state);
      for (let i = 1; i < 5; i += 1) {
        const x = s.x + (lot.w / 5) * i;
        ctx.beginPath();
        ctx.moveTo(x, s.y + 10);
        ctx.lineTo(x, s.y + lot.h - 10);
        ctx.stroke();
      }
    }

    for (const park of city.parks) {
      if (park.x > right || park.x + park.w < left || park.y > bottom || park.y + park.h < top) continue;
      paintRect(park.x, park.y, park.w, park.h, '#4a7a3d');
      for (const tree of park.trees) {
        const s = worldToScreen(tree.x, tree.y, state);
        ctx.fillStyle = '#2f6b2f';
        ctx.beginPath();
        ctx.arc(s.x, s.y, tree.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3f7d33';
        ctx.beginPath();
        ctx.arc(s.x - 3, s.y - 3, tree.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const b of city.buildings) {
      if (b.x > right || b.x + b.w < left || b.y > bottom || b.y + b.h < top) continue;
      const s = worldToScreen(b.x, b.y, state);
      const shadow = 4 + b.height * 3;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(s.x + shadow, s.y + shadow, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(s.x, s.y, b.w, b.h);
      ctx.strokeStyle = PALETTE.buildingEdge;
      ctx.lineWidth = 3;
      ctx.strokeRect(s.x + 1.5, s.y + 1.5, b.w - 3, b.h - 3);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(s.x + 10, s.y + 10, b.w - 20, 12);
    }
  }

  function drawCar(car, state, isPlayer) {
    const s = worldToScreen(car.x, car.y, state);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(car.angle);
    const halfL = car.length / 2;
    const halfW = car.width / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-halfL + 4, -halfW + 4, car.length, car.width);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-halfL, -halfW, car.length, car.width, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(20, 30, 40, 0.85)';
    ctx.fillRect(-halfL * 0.35, -halfW + 4, halfL * 0.7, car.width - 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(halfL - 12, -halfW + 4, 6, car.width - 8);
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.fillRect(-8, -halfW - 3, 16, 6);
      ctx.fillStyle = '#f2c230';
      ctx.font = font(9, true);
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, -halfW + 5);
    }
    if (car.police) {
      const flash = Math.floor(state.elapsed * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2b4fd8';
      ctx.fillRect(-6, -halfW - 2, 12, 5);
      ctx.fillStyle = flash ? '#2b4fd8' : '#ff3b30';
      ctx.fillRect(-6, halfW - 3, 12, 5);
      ctx.fillStyle = '#f5f2e8';
      ctx.font = font(10, true);
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 4);
    }
    if (isPlayer) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(0, -halfW - 22);
      ctx.lineTo(-8, -halfW - 10);
      ctx.lineTo(8, -halfW - 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Headlights after dark.
    if (state.night) {
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#ffe9a0';
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(car.angle) * halfL, s.y + Math.sin(car.angle) * halfL);
      const spread = 0.35;
      ctx.lineTo(s.x + Math.cos(car.angle - spread) * 190, s.y + Math.sin(car.angle - spread) * 190);
      ctx.lineTo(s.x + Math.cos(car.angle + spread) * 190, s.y + Math.sin(car.angle + spread) * 190);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPerson(x, y, angle, color, state, down, isPlayer, weapon) {
    const s = worldToScreen(x, y, state);
    ctx.save();
    ctx.translate(s.x, s.y);
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (weapon === 'pistol') {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(24, 0);
      ctx.stroke();
    }
    if (isPlayer) {
      ctx.rotate(-angle);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(-7, -13);
      ctx.lineTo(7, -13);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      const s = worldToScreen(pickup.x, pickup.y, state);
      if (s.x < -30 || s.x > view.w + 30 || s.y < -30 || s.y > view.h + 30) continue;
      const bob = Math.sin(state.elapsed * 4 + pickup.x) * 3;
      if (pickup.kind === 'cash') {
        ctx.fillStyle = '#2f7d33';
        ctx.beginPath();
        ctx.arc(s.x, s.y + bob, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7ee787';
        ctx.font = font(14, true);
        ctx.textAlign = 'center';
        ctx.fillText('$', s.x, s.y + bob + 5);
      } else if (pickup.kind === 'health') {
        ctx.fillStyle = '#f5f2e8';
        ctx.fillRect(s.x - 11, s.y + bob - 11, 22, 22);
        ctx.fillStyle = '#c22e4d';
        ctx.fillRect(s.x - 3, s.y + bob - 8, 6, 16);
        ctx.fillRect(s.x - 8, s.y + bob - 3, 16, 6);
      } else {
        ctx.fillStyle = '#f2c230';
        ctx.fillRect(s.x - 11, s.y + bob - 8, 22, 16);
        ctx.fillStyle = '#111';
        ctx.font = font(9, true);
        ctx.textAlign = 'center';
        ctx.fillText('AMMO', s.x, s.y + bob + 4);
      }
    }
  }

  function drawMarker(state, marker) {
    if (!marker) return;
    const s = worldToScreen(marker.x, marker.y, state);
    const pulse = 1 + Math.sin(state.elapsed * 5) * 0.12;
    if (s.x > -40 && s.x < view.w + 40 && s.y > -40 && s.y < view.h + 40) {
      ctx.strokeStyle = PALETTE.marker;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 34 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.marker;
      ctx.save();
      ctx.translate(s.x, s.y - 44 - Math.sin(state.elapsed * 4) * 6);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
    } else {
      // Off-screen: an arrow on the screen edge points the way.
      const dx = marker.x - state.camera.x;
      const dy = marker.y - state.camera.y;
      const angle = Math.atan2(dy, dx);
      const ex = view.w / 2 + Math.cos(angle) * (view.w / 2 - 60);
      const ey = view.h / 2 + Math.sin(angle) * (view.h / 2 - 60);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle);
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      const s = worldToScreen(p.x, p.y, state);
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      if (p.tracer) {
        const end = worldToScreen(p.tracer.x, p.tracer.y, state);
        ctx.strokeStyle = `rgba(255, 242, 160, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap(state, missions) {
    const size = MINIMAP;
    const x = 16;
    const y = view.h - size - 16;
    const scale = size / WORLD;
    panel(x - 4, y - 4, size + 8, size + 8, 0.8);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.fillStyle = '#3d6b34';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x, y + 90 * TILE * scale, size, size - 90 * TILE * scale);
    ctx.strokeStyle = 'rgba(245, 242, 232, 0.55)';
    ctx.lineWidth = 2;
    for (const cx of city.roadsV) {
      ctx.beginPath();
      ctx.moveTo(x + cx * scale, y);
      ctx.lineTo(x + cx * scale, y + size);
      ctx.stroke();
    }
    for (const cy of city.roadsH) {
      ctx.beginPath();
      ctx.moveTo(x, y + cy * scale);
      ctx.lineTo(x + size, y + cy * scale);
      ctx.stroke();
    }
    const dot = (wx, wy, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + wx * scale, y + wy * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of state.entitiesCars || []) {
      dot(car.x, car.y, car.police ? '#ff3b30' : 'rgba(245,242,232,0.85)', car.police ? 3.5 : 2);
    }
    for (const enemy of state.enemies) {
      if (enemy.health > 0) dot(enemy.x, enemy.y, '#ff4d4d', 3);
    }
    const marker = missions.marker();
    if (marker) {
      const pulse = 3 + Math.sin(state.elapsed * 5) * 1.5;
      dot(marker.x, marker.y, PALETTE.marker, pulse);
    }
    const player = state.player;
    ctx.save();
    ctx.translate(x + player.x * scale, y + player.y * scale);
    ctx.rotate(player.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Caption inside the map, top left, on a dark strip so it reads anywhere.
    ctx.fillStyle = 'rgba(8,10,16,0.55)';
    ctx.fillRect(x, y, size, 20);
    text('SOLMAR BAY', x + 6, y + 15, 11, PALETTE.muted, 'left', true);
  }

  function wrapText(value, x, y, maxWidth, lineHeight) {
    const words = value.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      ctx.font = font(17, false);
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillStyle = PALETTE.text;
        ctx.textAlign = 'left';
        ctx.fillText(line, x, cy);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'left';
      ctx.fillText(line, x, cy);
    }
  }

  function drawHud(state, missions) {
    const player = state.player;
    // Top left: health, money, wanted stars.
    panel(16, 16, 250, 96, 0.72);
    text('DANA REYES', 30, 40, 15, PALETTE.text, 'left', true);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(30, 50, 180, 12);
    ctx.fillStyle = player.health > 30 ? '#7ee787' : '#ff4d4d';
    ctx.fillRect(30, 50, 180 * clamp(player.health / 100, 0, 1), 12);
    text(`${Math.ceil(player.health)}`, 218, 62, 13, PALETTE.text, 'left', true);
    text(`$${state.money}`, 30, 86, 18, '#7ee787', 'left', true);
    text(player.weapon === 'pistol' ? `PISTOL ${player.ammo}` : 'FISTS', 150, 86, 14, PALETTE.muted, 'left', true);
    for (let i = 0; i < 5; i += 1) {
      text('★', 30 + i * 26, 108, 20, i < state.wanted ? '#ffd23f' : 'rgba(245,242,232,0.25)', 'left', true);
    }
    // Top centre: clock and day/night.
    const hour = Math.floor(state.timeMinutes / 60);
    const minute = Math.floor(state.timeMinutes % 60);
    const clockText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const dayPart = state.night ? 'NIGHT' : state.dusk ? 'DUSK' : 'DAY';
    panel(view.w / 2 - 90, 16, 180, 44, 0.72);
    text(`${clockText}  ${dayPart}`, view.w / 2, 46, 18, PALETTE.text, 'center', true);
    // Top right: speed and car condition while driving.
    if (player.inCar && player.car) {
      panel(view.w - 206, 16, 190, 76, 0.72);
      const kmh = Math.round(Math.abs(player.car.speed) * 0.35);
      text(`${kmh} km/h`, view.w - 26, 46, 22, PALETTE.text, 'right', true);
      text(`CAR ${Math.ceil(state.carHp)}%`, view.w - 26, 72, 14, state.carHp > 30 ? PALETTE.muted : '#ff4d4d', 'right', true);
    }
    // Bottom centre: mission tracker.
    const objective = missions.objective();
    const trackerW = Math.min(560, view.w - 480);
    panel(view.w / 2 - trackerW / 2, view.h - 52, trackerW, 36, 0.72);
    ctx.font = font(15, true);
    const label = objective.length > 72 ? objective.slice(0, 69) + '…' : objective;
    text(label, view.w / 2, view.h - 28, 15, PALETTE.text, 'center', true);
    drawMinimap(state, missions);
    // Top right, under the speed panel: controls hint.
    text('WASD move · E car · Click attack · 1/2 weapon · P pause · M jobs', view.w - 16, 112, 12, 'rgba(245,242,232,0.6)', 'right');
    // Banner.
    if (missions.state.banner && missions.state.bannerTimer > 0) {
      const alpha = clamp(missions.state.bannerTimer, 0, 1);
      ctx.globalAlpha = alpha;
      const bw = Math.min(640, view.w - 80);
      panel(view.w / 2 - bw / 2, 136, bw, 40, 0.85);
      text(missions.state.banner, view.w / 2, 163, 17, PALETTE.marker, 'center', true);
      ctx.globalAlpha = 1;
    }
    // Dialogue (kept clear of the minimap at the bottom left).
    if (missions.state.dialogue) {
      const line = missions.state.dialogue.lines[missions.state.dialogue.at];
      const bw = Math.min(560, view.w - 280);
      panel(view.w / 2 - bw / 2, view.h - 170, bw, 96, 0.88);
      text(line.who, view.w / 2 - bw / 2 + 20, view.h - 138, 15, PALETTE.marker, 'left', true);
      ctx.font = font(17, false);
      wrapText(line.text, view.w / 2 - bw / 2 + 20, view.h - 112, bw - 40, 22);
      text('Enter / click to continue', view.w / 2 + bw / 2 - 20, view.h - 88, 12, PALETTE.muted, 'right');
    }
  }

  function drawCenterPanel(title, lines, prompt, accent) {
    const w = Math.min(660, view.w - 60);
    const h = 150 + lines.length * 30;
    const x = (view.w - w) / 2;
    const y = (view.h - h) / 2;
    panel(x, y, w, h, 0.9);
    text(title, view.w / 2, y + 62, 44, accent || PALETTE.text, 'center', true);
    lines.forEach((line, i) => {
      text(line, view.w / 2, y + 108 + i * 30, 18, PALETTE.muted, 'center');
    });
    text(prompt, view.w / 2, y + h - 26, 17, PALETTE.marker, 'center', true);
  }

  function drawTitle(state, missions, hasSave) {
    drawCenterPanel(
      'STREET HEAT',
      [
        'SOLMAR BAY — an open-world crime story',
        'Dana Reyes owes Marta Kline one last favour.',
        'Steal cars, outrun the police, finish the jobs.',
        '',
        'WASD move · Mouse aim · Click attack · E enter a car',
        'W/S drive · A/D steer · Space handbrake · 1/2 weapons · P pause',
      ],
      hasSave ? 'Enter: play — C: continue your save' : 'Enter or click to start',
      '#ffd23f',
    );
    // Footer: the game's own disclaimer, on a dark strip so it stays readable
    // over whatever the city is doing behind it.
    ctx.fillStyle = 'rgba(8,10,16,0.7)';
    ctx.fillRect(0, view.h - 40, view.w, 40);
    text('A wholly original game. No real city, no real gang, no borrowed names.', view.w / 2, view.h - 24, 13, 'rgba(245,242,232,0.75)', 'center');
  }

  function drawPaused(state, missions) {
    drawCenterPanel(
      'PAUSED',
      [
        'The city waits for you.',
        `Money $${state.money} · Jobs done: ${missions.state.index} of 3`,
        '',
        'P / Esc: resume · M: job list · R: restart · T: title screen',
      ],
      'Press P to resume',
    );
  }

  function drawOver(state, missions) {
    const reason = state.overReason === 'busted' ? 'BUSTED' : 'WASTED';
    drawCenterPanel(
      reason,
      [
        `Dana Reyes — $${state.money} in the pocket`,
        `Jobs finished: ${missions.state.index} of 3`,
        '',
        'The bay does not forgive. But it always gives a second chance.',
      ],
      'Enter: try again — T: title screen',
      '#ff4d4d',
    );
  }

  function drawMissionList(state, missions) {
    const w = Math.min(720, view.w - 60);
    const rows = missions.list();
    const h = 170 + rows.length * 92;
    const x = (view.w - w) / 2;
    const y = (view.h - h) / 2;
    panel(x, y, w, h, 0.94);
    text('JOBS — SOLMAR BAY', view.w / 2, y + 52, 30, PALETTE.marker, 'center', true);
    rows.forEach((job, i) => {
      const ry = y + 92 + i * 92;
      const status = job.status === 'done' ? '✓ DONE'
        : job.status === 'active' ? '● ACTIVE'
        : job.status === 'ready' ? '○ READY' : '🔒 LOCKED';
      text(`${i + 1}. ${job.title}`, x + 28, ry + 24, 19, PALETTE.text, 'left', true);
      text(status, x + w - 28, ry + 24, 15,
        job.status === 'done' ? '#7ee787' : job.status === 'active' ? '#ffd23f' : PALETTE.muted, 'right', true);
      ctx.font = font(15, false);
      wrapText(`${job.giver} — ${job.brief} Reward: $${job.reward}`, x + 28, ry + 50, w - 56, 20);
    });
    text('M / Esc: back to the game', view.w / 2, y + h - 24, 15, PALETTE.muted, 'center');
  }

  /** Paint one frame. `ui` carries the screen and the save state. */
  function draw(state, screen, ui) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(0, 0, view.w, view.h);
    drawCity(state);
    drawPickups(state);
    for (const ped of state.entitiesPeds || []) {
      drawPerson(ped.x, ped.y, ped.angle, ped.color, state, ped.state === 'down', false, null);
    }
    for (const officer of state.entitiesOfficers || []) {
      drawPerson(officer.x, officer.y, officer.angle, '#24344d', state, officer.state === 'down', false, null);
    }
    for (const enemy of state.enemies) {
      drawPerson(enemy.x, enemy.y, enemy.angle, '#c22e4d', state, enemy.health <= 0, false, 'pistol');
    }
    for (const car of state.entitiesCars || []) {
      drawCar(car, state, state.player.car === car);
    }
    const player = state.player;
    if (!player.inCar) {
      drawPerson(player.x, player.y, player.angle, '#ffd23f', state, false, true, player.weapon);
    }
    drawParticles(state);
    drawMarker(state, ui.missions.marker());
    // Night falls over the city.
    if (state.night) {
      ctx.fillStyle = PALETTE.night;
      ctx.fillRect(0, 0, view.w, view.h);
    } else if (state.dusk) {
      ctx.fillStyle = PALETTE.dusk;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui.missions, ui.hasSave);
      return;
    }
    drawHud(state, ui.missions);
    if (screen === SCREEN_PAUSED) drawPaused(state, ui.missions);
    else if (screen === SCREEN_OVER) drawOver(state, ui.missions);
    else if (screen === SCREEN_MISSIONS) drawMissionList(state, ui.missions);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}

// Referenced so the shared helpers stay part of this module's surface.
void lerp;
