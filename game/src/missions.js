// Dana Reyes's story in Solmar Bay: three jobs for Marta Kline. Each job is
// a chain of stages, and a stage is a single objective — walk or drive to a
// marker, talk to someone, steal a car, lose the police, or win a fight.
// A stage may open with a few lines of dialogue.
export const MISSIONS = [
  {
    id: 'first-fare',
    title: 'The First Fare',
    giver: 'Marta Kline',
    brief: 'Marta needs a driver she can trust. Pick up a package at the docks and bring it to the Sunset Motel, no questions asked.',
    reward: 400,
    stages: [
      {
        type: 'talk', at: 'cafe', label: 'Meet Marta at the Anchor Café',
        say: [
          { who: 'Marta', text: 'Dana. You drive, I pay. That is the whole arrangement.' },
          { who: 'Marta', text: 'There is a package waiting at the docks. Bring it to the Sunset Motel. Do not open it, do not stop for anyone.' },
          { who: 'Dana', text: 'One fare, Marta. Then we talk about what you owe me.' },
        ],
      },
      {
        type: 'pickup', at: 'docks', label: 'Pick up the package at the docks',
        say: [{ who: 'Marta', text: 'The package is at the docks, Pier 3. Grab it and don\'t keep the buyer waiting.' }],
      },
      {
        type: 'deliver', at: 'motel', label: 'Deliver the package to the Sunset Motel',
        say: [{ who: 'Marta', text: 'Clean run. You might be worth keeping around, driver.' }],
      },
    ],
  },
  {
    id: 'borrowed-wheels',
    title: 'Borrowed Wheels',
    giver: 'Marta Kline',
    brief: 'A client wants a Comet sports car and does not want to pay for it. Take it from the dealership, lose the police, and bring it to the garage.',
    reward: 800,
    stages: [
      {
        type: 'goto', at: 'dealership', label: 'Go to the Solmar Motors dealership',
        say: [{ who: 'Marta', text: 'The red Comet in the front lot. The keys are in it. The cameras are not my problem.' }],
      },
      {
        type: 'steal', at: 'dealership', label: 'Steal the red Comet',
        say: [{ who: 'Dana', text: 'Borrowed. That is what we are calling this.' }],
      },
      {
        type: 'escape', label: 'Lose the police (wanted level back to zero)',
        say: [{ who: 'Dana', text: 'Sirens. Time to make myself scarce.' }],
      },
      {
        type: 'deliver', at: 'garage', label: 'Deliver the Comet to the garage',
        say: [{ who: 'Marta', text: 'The client is thrilled. You are officially my favourite criminal.' }],
      },
    ],
  },
  {
    id: 'warehouse-heat',
    title: 'Warehouse Heat',
    giver: 'Marta Kline',
    brief: 'Sal Moreno’s crew is holding Marta’s money in the old warehouse by the bay. Take it back — and make sure his enforcers remember your name.',
    reward: 1500,
    stages: [
      {
        type: 'goto', at: 'warehouse', label: 'Go to the old warehouse by the bay',
        say: [
          { who: 'Marta', text: 'Sal’s crew took what is mine. Five of his enforcers are guarding it.' },
          { who: 'Dana', text: 'Five? I was hoping for a challenge.' },
        ],
      },
      {
        type: 'combat', at: 'warehouse', label: 'Deal with Sal’s enforcers (0 / 5)',
        enemies: 5,
        say: [{ who: 'Sal Moreno', text: 'That is Marta’s driver! Nobody leaves my warehouse breathing!' }],
      },
      {
        type: 'pickup', at: 'warehouse', label: 'Grab Marta’s cash from the warehouse',
        say: [{ who: 'Dana', text: 'Got it. Now I just need to get out of here in one piece.' }],
      },
      {
        type: 'deliver', at: 'hideout', label: 'Bring the cash to the hideout',
        say: [{ who: 'Marta', text: 'Every dollar. Dana, you just bought yourself a future in this city.' }],
      },
    ],
  },
];

export function createMissions(city) {
  const state = {
    index: 0,
    stage: 0,
    active: false,
    finished: false,
    dialogue: null,
    dialogueTimer: 0,
    enemiesLeft: 0,
    targetCar: null,
    banner: null,
    bannerTimer: 0,
  };

  function current() {
    return MISSIONS[state.index] || null;
  }

  function stageDef() {
    const mission = current();
    return mission ? mission.stages[state.stage] || null : null;
  }

  function landmark(name) {
    return city.landmarks[name];
  }

  function showBanner(text) {
    state.banner = text;
    state.bannerTimer = 3.5;
  }

  function startDialogue(lines) {
    state.dialogue = { lines, at: 0 };
    state.dialogueTimer = 0;
  }

  function beginStage() {
    const stage = stageDef();
    if (!stage) return;
    if (stage.say) startDialogue(stage.say);
    if (stage.type === 'combat') state.enemiesLeft = stage.enemies;
  }

  /** Jump to a later stage of the current mission (used to stage a scene). */
  function skipToStage(index) {
    const mission = current();
    if (!mission || index < 0 || index >= mission.stages.length) return;
    state.stage = index;
    state.active = true;
    beginStage();
  }

  function begin() {
    state.active = true;
    state.stage = 0;
    beginStage();
    const mission = current();
    if (mission) showBanner(`New job: ${mission.title}`);
  }

  function advanceStage(events) {
    state.stage += 1;
    const mission = current();
    if (state.stage >= mission.stages.length) {
      events.push({ type: 'mission-complete', mission });
      state.index += 1;
      if (state.index >= MISSIONS.length) {
        state.finished = true;
        state.active = false;
        showBanner('Story complete — Solmar Bay is yours, Dana.');
      } else {
        state.active = false;
      }
      return;
    }
    beginStage();
    events.push({ type: 'stage', mission, stage: stageDef() });
  }

  // ctx: {x, y, inCar, car, wanted, enemiesAlive, enemiesSpawned, nearPress}
  // Returns a list of events for the world to react to.
  function update(ctx) {
    const events = [];
    if (state.bannerTimer > 0) state.bannerTimer -= 1 / 60;
    if (state.dialogue) state.dialogueTimer += 1 / 60;
    if (!state.active) return events;
    const stage = stageDef();
    if (!stage) return events;
    const point = stage.at ? landmark(stage.at) : null;
    const near = point ? Math.hypot(ctx.x - point.x, ctx.y - point.y) < 90 : false;
    if (stage.type === 'talk' || stage.type === 'goto' ||
      stage.type === 'pickup' || stage.type === 'deliver') {
      if (near && (stage.type === 'talk' ? ctx.nearPress : true)) {
        if (stage.type === 'pickup') {
          events.push({ type: 'pickup', item: stage.at === 'warehouse' ? 'cash' : 'package' });
        }
        advanceStage(events);
      }
    } else if (stage.type === 'steal') {
      if (ctx.car === state.targetCar && ctx.inCar) advanceStage(events);
    } else if (stage.type === 'escape') {
      if (ctx.wanted === 0) advanceStage(events);
    } else if (stage.type === 'combat') {
      state.enemiesLeft = ctx.enemiesAlive;
      if (ctx.enemiesAlive === 0 && ctx.enemiesSpawned) advanceStage(events);
    }
    return events;
  }

  function advanceDialogue() {
    if (!state.dialogue) return false;
    state.dialogue.at += 1;
    state.dialogueTimer = 0;
    if (state.dialogue.at >= state.dialogue.lines.length) {
      state.dialogue = null;
      return false;
    }
    return true;
  }

  function marker() {
    if (!state.active) return null;
    const stage = stageDef();
    if (!stage || !stage.at) return null;
    return landmark(stage.at);
  }

  function objective() {
    if (!state.active) {
      if (state.finished) return 'Story complete — explore Solmar Bay, or start a new game.';
      return 'Press Enter to start the next job.';
    }
    const mission = current();
    const stage = stageDef();
    let label = stage.label;
    if (stage.type === 'combat') {
      label = `Deal with Sal’s enforcers (${stage.enemies - state.enemiesLeft} / ${stage.enemies})`;
    }
    return `${mission.title}: ${label}`;
  }

  function list() {
    return MISSIONS.map((mission, i) => ({
      title: mission.title,
      giver: mission.giver,
      brief: mission.brief,
      reward: mission.reward,
      status: i < state.index ? 'done' : i === state.index ? (state.active ? 'active' : 'ready') : 'locked',
    }));
  }

  return {
    state, current, stageDef, begin, update, advanceDialogue, marker, objective, list,
    showBanner, skipToStage,
  };
}
