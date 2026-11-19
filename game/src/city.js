// The map of Solmar Bay: a seeded tile-grid city of roads, blocks, buildings,
// parks, a beach and a bay along the south edge, plus the named spots the
// missions drive to. This module only builds static data once at boot —
// nothing here draws anything or moves.
import { MAP_TILES, TILE, WORLD } from './config.js';
import { pick, range, rangeInt } from './random.js';

// Roads sit every 8 tiles, the first one on tile 5; the bay starts at tile
// 90 and the beach at tile 88.
const ROAD_EVERY = 8;
const ROAD_FIRST = 5;
const BAY_TOP_TILE = 90;
const BEACH_TOP_TILE = 88;

const ROOF_COLORS = ['#b0563f', '#4f6f8f', '#7a7f8a', '#8a6f4f', '#6f8f5a', '#94604f'];

// Pixel centres of the vertical (and, by symmetry, horizontal) roads.
function roadLines() {
  const centres = [];
  for (let tile = ROAD_FIRST; tile + 1 < MAP_TILES; tile += ROAD_EVERY) {
    centres.push((tile + 0.5) * TILE);
  }
  return centres;
}

// A rectangle given in tile coordinates, converted to pixels.
function tileBox(x0, y0, x1, y1) {
  return { x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE };
}

export function buildCity(random) {
  const roadsV = roadLines();
  const roadsH = roadLines();
  const roadHalf = TILE;
  const buildings = [];
  const parks = [];
  const lots = [];
  const trees = [];

  // City blocks fill the gaps between roads: tiles 7..12, 15..20, and so on.
  const blockSpans = [];
  for (let tile = ROAD_FIRST + 2; tile + 6 <= MAP_TILES; tile += ROAD_EVERY) {
    blockSpans.push([tile, tile + 6]);
  }

  function rollBlockKind() {
    const roll = random();
    if (roll < 0.62) return 'buildings';
    if (roll < 0.78) return 'park';
    if (roll < 0.9) return 'parking';
    return 'plaza';
  }

  for (const [bx0, bx1] of blockSpans) {
    for (const [by0, by1] of blockSpans) {
      if (by0 >= BEACH_TOP_TILE) continue;
      const kind = rollBlockKind();
      const rect = tileBox(bx0, by0, bx1, by1);
      if (kind === 'park') {
        const park = { ...rect, trees: [] };
        const count = rangeInt(random, 5, 9);
        for (let i = 0; i < count; i += 1) {
          park.trees.push({
            x: rect.x + range(random, 30, rect.w - 30),
            y: rect.y + range(random, 30, rect.h - 30),
            r: range(random, 10, 18),
          });
        }
        parks.push(park);
        trees.push(...park.trees);
      } else if (kind === 'parking') {
        lots.push(rect);
      } else if (kind === 'buildings') {
        // Two separate draws, as before: the first picks one building, the
        // second (only when needed) picks two versus four.
        const count = random() < 0.5 ? 1 : random() < 0.75 ? 2 : 4;
        if (count === 1) {
          buildings.push({
            x: rect.x + 16, y: rect.y + 16, w: rect.w - 32, h: rect.h - 32,
            color: pick(random, ROOF_COLORS), height: rangeInt(random, 1, 3),
          });
        } else if (count === 2) {
          const splitVertical = random() < 0.5;
          for (let i = 0; i < 2; i += 1) {
            buildings.push({
              x: splitVertical ? rect.x + 16 : rect.x + 16 + i * (rect.w / 2),
              y: splitVertical ? rect.y + 16 + i * (rect.h / 2) : rect.y + 16,
              w: splitVertical ? rect.w - 32 : rect.w / 2 - 24,
              h: splitVertical ? rect.h / 2 - 24 : rect.h - 32,
              color: pick(random, ROOF_COLORS), height: rangeInt(random, 1, 3),
            });
          }
        } else {
          for (let i = 0; i < 2; i += 1) {
            for (let j = 0; j < 2; j += 1) {
              buildings.push({
                x: rect.x + 12 + i * (rect.w / 2),
                y: rect.y + 12 + j * (rect.h / 2),
                w: rect.w / 2 - 24,
                h: rect.h / 2 - 24,
                color: pick(random, ROOF_COLORS), height: rangeInt(random, 1, 3),
              });
            }
          }
        }
      }
      // 'plaza' blocks are left open: pavement and nothing else.
    }
  }

  // Named places the missions and free roam use. Each one sits on a road,
  // so the player can always drive right up to it.
  const atCrossing = (roadV, roadH) => ({ x: roadsV[roadV], y: roadsH[roadH] });
  const landmarks = {
    cafe: atCrossing(5, 5),
    docks: { x: roadsV[3], y: (BEACH_TOP_TILE - 0.5) * TILE },
    motel: atCrossing(9, 6),
    dealership: atCrossing(4, 1),
    garage: atCrossing(1, 7),
    warehouse: atCrossing(8, 8),
    hideout: atCrossing(2, 3),
    plaza: atCrossing(6, 4),
  };

  const water = [{ x: 0, y: BAY_TOP_TILE * TILE, w: WORLD, h: (MAP_TILES - BAY_TOP_TILE) * TILE }];
  const beach = [{ x: 0, y: BEACH_TOP_TILE * TILE, w: WORLD, h: (BAY_TOP_TILE - BEACH_TOP_TILE) * TILE }];

  function isWaterAt(x, y) {
    return y >= BAY_TOP_TILE * TILE;
  }

  function isBeachAt(x, y) {
    return y >= BEACH_TOP_TILE * TILE && y < BAY_TOP_TILE * TILE;
  }

  function nearestRoadX(x) {
    let best = roadsV[0];
    for (const c of roadsV) if (Math.abs(c - x) < Math.abs(best - x)) best = c;
    return best;
  }

  function nearestRoadY(y) {
    let best = roadsH[0];
    for (const c of roadsH) if (Math.abs(c - y) < Math.abs(best - y)) best = c;
    return best;
  }

  // Push a circle out of every building, out of the water and back inside
  // the world's edge. Returns true when anything moved it.
  function collideCircle(body) {
    let pushed = false;
    const r = body.radius;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      pushed = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        body.x = cx + (dx / d) * r;
        body.y = cy + (dy / d) * r;
      } else {
        body.y = b.y - r;
      }
    }
    if (body.y + r > BAY_TOP_TILE * TILE) {
      body.y = BAY_TOP_TILE * TILE - r;
      pushed = true;
    }
    if (body.x < r) { body.x = r; pushed = true; }
    if (body.x > WORLD - r) { body.x = WORLD - r; pushed = true; }
    if (body.y < r) { body.y = r; pushed = true; }
    if (body.y > WORLD - r) { body.y = WORLD - r; pushed = true; }
    return pushed;
  }

  function inPark(x, y) {
    for (const p of parks) {
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
    }
    return false;
  }

  function randomRoadPoint(randomFn, minX, minY, maxX, maxY) {
    for (let tries = 0; tries < 40; tries += 1) {
      const vertical = randomFn() < 0.5;
      const road = pick(randomFn, vertical ? roadsV : roadsH);
      const along = range(randomFn, TILE * 4, WORLD - TILE * 4);
      const point = vertical ? { x: road, y: along } : { x: along, y: road };
      if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue;
      if (isWaterAt(point.x, point.y)) continue;
      return point;
    }
    return { x: roadsV[5], y: roadsH[5] };
  }

  return {
    roadsV, roadsH, roadHalf, buildings, parks, lots, trees, water, beach,
    landmarks, isWaterAt, isBeachAt, nearestRoadX, nearestRoadY,
    collideCircle, inPark, randomRoadPoint,
  };
}
