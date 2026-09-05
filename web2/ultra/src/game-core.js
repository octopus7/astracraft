const EPSILON = 1e-9;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Renderer-agnostic tuning values for the repair shift. All distances are in
 * world-space metres and all rates are per second.
 */
export const DISTRICT_CONFIG = deepFreeze({
  shiftDuration: 180,
  simulationStep: 0.05,
  interactionRadius: 2.25,
  cachePickupRadius: 1.35,
  bounds: { minX: -18, maxX: 18, minZ: -18, maxZ: 18 },
  playerStart: { x: 0, z: 11 },
  maxEnergy: 100,
  maxIntegrity: 100,
  maxHeat: 100,
  baseEnergyRegen: 2.8,
  sprintEnergyRate: 9,
  repairEnergyRate: 6.2,
  baseCoolingRate: 10,
  repairProgressDecay: 0.08,
  overheatRecoveryThreshold: 58,
  scanCost: 12,
  scanCooldown: 8,
  scanDuration: 3
});

export const REPAIR_NODES = deepFreeze([
  {
    id: 'coolant_loop',
    label: 'Coolant Loop',
    shortLabel: 'COOLANT',
    position: { x: -10, z: -6 },
    duration: 2.8,
    cost: { cells: 1, coolant: 0 },
    prerequisites: [],
    heatRate: 7,
    score: 300,
    system: 'Adds passive cooling across the district.'
  },
  {
    id: 'grid_coupler',
    label: 'Grid Coupler',
    shortLabel: 'POWER',
    position: { x: 9, z: -7 },
    duration: 3.2,
    cost: { cells: 1, coolant: 0 },
    prerequisites: [],
    heatRate: 8,
    score: 325,
    system: 'Improves suit charging and dampens hazards.'
  },
  {
    id: 'signal_array',
    label: 'Signal Array',
    shortLabel: 'UPLINK',
    position: { x: -9, z: 8 },
    duration: 3.4,
    cost: { cells: 1, coolant: 1 },
    prerequisites: ['grid_coupler'],
    heatRate: 9,
    score: 400,
    system: 'Reduces scan energy cost and cooldown.'
  },
  {
    id: 'atmos_scrubber',
    label: 'Atmospheric Scrubber',
    shortLabel: 'ATMOS',
    position: { x: -2, z: -12 },
    duration: 3.6,
    cost: { cells: 1, coolant: 1 },
    prerequisites: ['coolant_loop'],
    heatRate: 9,
    score: 425,
    system: 'Purges the corrosive air from the service deck.'
  },
  {
    id: 'district_core',
    label: 'District Core',
    shortLabel: 'CORE',
    position: { x: 8, z: 8 },
    duration: 4.2,
    cost: { cells: 2, coolant: 1 },
    prerequisites: ['coolant_loop', 'grid_coupler', 'signal_array', 'atmos_scrubber'],
    heatRate: 11,
    score: 700,
    system: 'Restores the district and completes the shift.'
  }
]);

export const SUPPLY_CACHES = deepFreeze([
  {
    id: 'tram_depot',
    label: 'Tram Depot Cache',
    position: { x: -13, z: 3 },
    reward: { cells: 2, coolant: 0, energy: 20 }
  },
  {
    id: 'market_locker',
    label: 'Market Service Locker',
    position: { x: 3, z: 4 },
    reward: { cells: 1, coolant: 1, energy: 15 }
  },
  {
    id: 'rail_yard',
    label: 'Rail Yard Salvage',
    position: { x: 13, z: -2 },
    reward: { cells: 1, coolant: 1, energy: 20 }
  }
]);

export const HAZARDS = deepFreeze([
  {
    id: 'plasma_leak',
    label: 'Plasma Leak',
    position: { x: -4, z: 1 },
    radius: 2.55,
    heatRate: 19,
    energyRate: 4,
    integrityRate: 2
  },
  {
    id: 'arc_fault',
    label: 'Arc Fault',
    position: { x: 6, z: -1 },
    radius: 2.25,
    heatRate: 8,
    energyRate: 11,
    integrityRate: 8
  },
  {
    id: 'nanite_fog',
    label: 'Nanite Fog',
    position: { x: 0, z: -9 },
    radius: 2.8,
    heatRate: 13,
    energyRate: 5,
    integrityRate: 5
  }
]);

export const WAVE_SCHEDULE = deepFreeze([
  { id: 'surge_1', label: 'ION SURGE I', startsAt: 32, duration: 14, intensity: 1 },
  { id: 'surge_2', label: 'ION SURGE II', startsAt: 78, duration: 17, intensity: 1.35 },
  { id: 'surge_3', label: 'ION SURGE III', startsAt: 128, duration: 20, intensity: 1.7 }
]);

const REPAIR_BY_ID = Object.fromEntries(REPAIR_NODES.map((node) => [node.id, node]));

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function copyPosition(position, fallback = DISTRICT_CONFIG.playerStart) {
  return {
    x: clamp(finiteOr(position?.x, fallback.x), DISTRICT_CONFIG.bounds.minX, DISTRICT_CONFIG.bounds.maxX),
    z: clamp(finiteOr(position?.z, fallback.z), DISTRICT_CONFIG.bounds.minZ, DISTRICT_CONFIG.bounds.maxZ)
  };
}

function getX(point) {
  return Number.isFinite(point?.x) ? point.x : point?.position?.x;
}

function getZ(point) {
  return Number.isFinite(point?.z) ? point.z : point?.position?.z;
}

export function distance2D(a, b) {
  const ax = getX(a);
  const az = getZ(a);
  const bx = getX(b);
  const bz = getZ(b);
  if (![ax, az, bx, bz].every(Number.isFinite)) return Infinity;
  return Math.hypot(ax - bx, az - bz);
}

function repaired(state, repairId) {
  return state.repairs[repairId]?.status === 'repaired';
}

function createRepairState(node) {
  return {
    id: node.id,
    status: node.prerequisites.length === 0 ? 'available' : 'locked',
    progress: 0,
    completedAt: null
  };
}

function createWaveState(wave) {
  return { id: wave.id, status: 'pending', startedAt: null, endedAt: null };
}

/** Create a fresh, JSON-serializable shift state. */
export function createGameState(options = {}) {
  const startsActive = options.started === true;
  const repairs = Object.fromEntries(REPAIR_NODES.map((node) => [node.id, createRepairState(node)]));
  const caches = Object.fromEntries(SUPPLY_CACHES.map((cache) => [cache.id, { collected: false, collectedAt: null }]));

  const state = {
    version: 1,
    phase: startsActive ? 'active' : 'briefing',
    started: startsActive,
    complete: false,
    outcome: null,
    elapsed: 0,
    timeRemaining: DISTRICT_CONFIG.shiftDuration,
    score: 0,
    repairCount: 0,
    player: {
      position: copyPosition(options.startPosition),
      energy: DISTRICT_CONFIG.maxEnergy,
      integrity: DISTRICT_CONFIG.maxIntegrity,
      heat: 0,
      overheated: false,
      inHazard: null,
      repairing: null
    },
    inventory: { cells: 2, coolant: 1 },
    repairs,
    caches,
    waves: WAVE_SCHEDULE.map(createWaveState),
    wave: {
      active: false,
      activeId: null,
      index: 0,
      intensity: 0,
      timeToNext: WAVE_SCHEDULE[0].startsAt,
      endsIn: 0
    },
    scan: { cooldown: 0, activeRemaining: 0 },
    interaction: {
      type: null,
      targetId: null,
      label: '',
      status: 'idle',
      blockedReason: null,
      progress: 0,
      distance: null
    },
    stats: {
      cachesCollected: 0,
      repairsCompleted: 0,
      wavesSurvived: 0,
      scansUsed: 0,
      hazardSeconds: 0
    },
    feedback: { blockedKey: null, energyDepleted: false }
  };

  updateInteraction(state);
  return state;
}

/** Move a briefing state into active play. Returns the emitted event or null. */
export function startShift(state) {
  if (state.phase !== 'briefing') return null;
  state.phase = 'active';
  state.started = true;
  const event = { type: 'shift-started', duration: DISTRICT_CONFIG.shiftDuration };
  updateInteraction(state);
  return event;
}

export function nearestRepairNode(position, state, maxDistance = DISTRICT_CONFIG.interactionRadius) {
  let nearest = null;
  let nearestDistance = Math.max(0, finiteOr(maxDistance, DISTRICT_CONFIG.interactionRadius));

  for (const node of REPAIR_NODES) {
    if (state.repairs[node.id]?.status === 'repaired') continue;
    const distance = distance2D(position, node.position);
    if (distance <= nearestDistance + EPSILON && (nearest === null || distance < nearestDistance - EPSILON)) {
      nearest = node;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function systemModifiers(state) {
  return {
    coolingRate: DISTRICT_CONFIG.baseCoolingRate + (repaired(state, 'coolant_loop') ? 4 : 0),
    energyRegen: DISTRICT_CONFIG.baseEnergyRegen + (repaired(state, 'grid_coupler') ? 1.5 : 0),
    hazardMultiplier: repaired(state, 'grid_coupler') ? 0.82 : 1,
    scanCost: repaired(state, 'signal_array') ? 8 : DISTRICT_CONFIG.scanCost,
    scanCooldown: repaired(state, 'signal_array') ? 5 : DISTRICT_CONFIG.scanCooldown
  };
}

function refreshRepairStatuses(state, events = null) {
  for (const node of REPAIR_NODES) {
    const repair = state.repairs[node.id];
    if (repair.status === 'repaired') continue;
    const wasLocked = repair.status === 'locked';
    const unlocked = node.prerequisites.every((id) => repaired(state, id));
    repair.status = unlocked ? (state.player.repairing === node.id ? 'repairing' : 'available') : 'locked';
    if (!unlocked) repair.progress = 0;
    if (events && wasLocked && unlocked) {
      events.push({ type: 'system-unlocked', repairId: node.id, label: node.label });
    }
  }
  state.repairCount = REPAIR_NODES.reduce((count, node) => count + Number(repaired(state, node.id)), 0);
}

function repairBlockReason(state, node) {
  if (!node || state.phase !== 'active') return 'inactive';
  const repair = state.repairs[node.id];
  if (repair.status === 'locked') return 'dependency';
  if (repair.status === 'repaired') return 'complete';
  if (state.inventory.cells < node.cost.cells) return 'cells';
  if (state.inventory.coolant < node.cost.coolant) return 'coolant';
  if (state.player.overheated) return 'heat';
  if (state.player.energy <= EPSILON) return 'energy';
  return null;
}

function updateInteraction(state) {
  if (state.phase === 'won' || state.phase === 'lost') {
    state.interaction = {
      type: null,
      targetId: null,
      label: '',
      status: 'idle',
      blockedReason: null,
      progress: 0,
      distance: null
    };
    return state.interaction;
  }

  const node = nearestRepairNode(state.player.position, state);
  if (!node) {
    state.interaction = {
      type: null,
      targetId: null,
      label: '',
      status: 'idle',
      blockedReason: null,
      progress: 0,
      distance: null
    };
    return state.interaction;
  }

  const repair = state.repairs[node.id];
  state.interaction = {
    type: 'repair',
    targetId: node.id,
    label: node.label,
    status: repair.status,
    blockedReason: repairBlockReason(state, node),
    progress: repair.progress,
    distance: distance2D(state.player.position, node.position)
  };
  return state.interaction;
}

export function getObjective(state) {
  if (state.phase === 'won') {
    return { title: 'DISTRICT ONLINE', detail: 'All five systems are stable.', repairId: null, status: 'complete' };
  }
  if (state.phase === 'lost') {
    const detail = state.outcome === 'integrity' ? 'Suit integrity failed.' : 'The service window expired.';
    return { title: 'SHIFT FAILED', detail, repairId: null, status: 'failed' };
  }

  const node = REPAIR_NODES.find((candidate) => state.repairs[candidate.id].status === 'repairing')
    ?? REPAIR_NODES.find((candidate) => state.repairs[candidate.id].status === 'available')
    ?? REPAIR_NODES.find((candidate) => state.repairs[candidate.id].status === 'locked');
  if (!node) return { title: 'SYSTEM CHECK', detail: 'Awaiting telemetry.', repairId: null, status: 'idle' };

  const repair = state.repairs[node.id];
  if (repair.status === 'locked') {
    const dependencies = node.prerequisites
      .filter((id) => !repaired(state, id))
      .map((id) => REPAIR_BY_ID[id].shortLabel)
      .join(' + ');
    return {
      title: `${node.shortLabel} LOCKED`,
      detail: `Restore ${dependencies} first.`,
      repairId: node.id,
      status: 'locked'
    };
  }

  return {
    title: `RESTORE ${node.shortLabel}`,
    detail: `Hold repair · ${node.cost.cells} cell${node.cost.cells === 1 ? '' : 's'}${node.cost.coolant ? ` · ${node.cost.coolant} coolant` : ''}`,
    repairId: node.id,
    status: repair.status
  };
}

function syncWaveSummary(state) {
  const activeIndex = state.waves.findIndex((wave) => wave.status === 'active');
  const pendingIndex = state.waves.findIndex((wave) => wave.status === 'pending');
  if (activeIndex >= 0) {
    const definition = WAVE_SCHEDULE[activeIndex];
    state.wave.active = true;
    state.wave.activeId = definition.id;
    state.wave.index = activeIndex;
    state.wave.intensity = definition.intensity;
    state.wave.timeToNext = 0;
    state.wave.endsIn = Math.max(0, definition.startsAt + definition.duration - state.elapsed);
    return;
  }

  state.wave.active = false;
  state.wave.activeId = null;
  state.wave.intensity = 0;
  state.wave.endsIn = 0;
  state.wave.index = pendingIndex >= 0 ? pendingIndex : WAVE_SCHEDULE.length;
  state.wave.timeToNext = pendingIndex >= 0
    ? Math.max(0, WAVE_SCHEDULE[pendingIndex].startsAt - state.elapsed)
    : 0;
}

function advanceWaves(state, events) {
  for (let index = 0; index < WAVE_SCHEDULE.length; index += 1) {
    const definition = WAVE_SCHEDULE[index];
    const wave = state.waves[index];
    const endAt = definition.startsAt + definition.duration;

    if (wave.status === 'pending' && state.elapsed + EPSILON >= definition.startsAt) {
      wave.status = 'active';
      wave.startedAt = definition.startsAt;
      events.push({
        type: 'wave-started',
        waveId: definition.id,
        label: definition.label,
        intensity: definition.intensity,
        duration: definition.duration
      });
    }
    if (wave.status === 'active' && state.elapsed + EPSILON >= endAt) {
      wave.status = 'passed';
      wave.endedAt = endAt;
      state.stats.wavesSurvived += 1;
      state.score += 120;
      events.push({ type: 'wave-ended', waveId: definition.id, score: 120 });
    }
  }
  syncWaveSummary(state);
}

function collectNearbyCaches(state, events) {
  for (const cache of SUPPLY_CACHES) {
    const cacheState = state.caches[cache.id];
    if (cacheState.collected || distance2D(state.player.position, cache.position) > DISTRICT_CONFIG.cachePickupRadius) continue;

    cacheState.collected = true;
    cacheState.collectedAt = state.elapsed;
    state.inventory.cells += cache.reward.cells;
    state.inventory.coolant += cache.reward.coolant;
    state.player.energy = Math.min(DISTRICT_CONFIG.maxEnergy, state.player.energy + cache.reward.energy);
    state.stats.cachesCollected += 1;
    state.score += 75;
    events.push({
      type: 'cache-collected',
      cacheId: cache.id,
      label: cache.label,
      reward: { ...cache.reward },
      score: 75
    });
  }
}

function hazardAt(position) {
  return HAZARDS.find((hazard) => distance2D(position, hazard.position) <= hazard.radius) ?? null;
}

function updateHazardPresence(state, hazard, events) {
  const previous = state.player.inHazard;
  const next = hazard?.id ?? null;
  if (previous === next) return;
  if (previous) events.push({ type: 'hazard-exited', hazardId: previous });
  if (hazard) events.push({ type: 'hazard-entered', hazardId: hazard.id, label: hazard.label });
  state.player.inHazard = next;
}

function updatePlayerThresholds(state, events) {
  if (!state.player.overheated && state.player.heat >= DISTRICT_CONFIG.maxHeat - EPSILON) {
    state.player.overheated = true;
    events.push({ type: 'player-overheated' });
  } else if (state.player.overheated && state.player.heat <= DISTRICT_CONFIG.overheatRecoveryThreshold + EPSILON) {
    state.player.overheated = false;
    events.push({ type: 'player-cooled' });
  }

  if (!state.feedback.energyDepleted && state.player.energy <= EPSILON) {
    state.feedback.energyDepleted = true;
    events.push({ type: 'energy-depleted' });
  } else if (state.feedback.energyDepleted && state.player.energy >= 5) {
    state.feedback.energyDepleted = false;
    events.push({ type: 'energy-restored' });
  }
}

function finishShift(state, phase, outcome, events) {
  if (state.phase !== 'active') return;
  state.phase = phase;
  state.outcome = outcome;
  state.complete = phase === 'won';
  state.player.repairing = null;
  state.feedback.blockedKey = null;

  if (phase === 'won') {
    const bonus = Math.floor(state.timeRemaining) * 10 + Math.round(state.player.integrity) * 5;
    state.score += bonus;
    events.push({ type: 'shift-won', outcome, bonus, score: state.score });
  } else {
    events.push({ type: 'shift-lost', reason: outcome, score: state.score });
  }
}

function updateEnvironment(state, input, step, suppressEnergyRegen, events) {
  const hazard = hazardAt(state.player.position);
  updateHazardPresence(state, hazard, events);
  const modifiers = systemModifiers(state);
  const surgeMultiplier = 1 + state.wave.intensity * 0.55;
  const hazardMultiplier = modifiers.hazardMultiplier * surgeMultiplier;

  let energyDelta = 0;
  if (hazard) {
    energyDelta -= hazard.energyRate * hazardMultiplier;
    state.stats.hazardSeconds += step;
  }
  if (input.sprinting === true) energyDelta -= DISTRICT_CONFIG.sprintEnergyRate;
  else if (!suppressEnergyRegen) energyDelta += modifiers.energyRegen;

  let heatDelta = state.wave.intensity * 0.75;
  if (hazard) heatDelta += hazard.heatRate * hazardMultiplier;
  else heatDelta -= modifiers.coolingRate;

  state.player.energy = clamp(state.player.energy + energyDelta * step, 0, DISTRICT_CONFIG.maxEnergy);
  state.player.heat = clamp(state.player.heat + heatDelta * step, 0, DISTRICT_CONFIG.maxHeat);

  if (hazard) {
    state.player.integrity = clamp(
      state.player.integrity - hazard.integrityRate * hazardMultiplier * step,
      0,
      DISTRICT_CONFIG.maxIntegrity
    );
  }
  if (state.player.heat >= 90) {
    const thermalDamageRate = ((state.player.heat - 90) / 10) * 2.5;
    state.player.integrity = clamp(state.player.integrity - thermalDamageRate * step, 0, DISTRICT_CONFIG.maxIntegrity);
  }

  updatePlayerThresholds(state, events);
  if (state.player.integrity <= EPSILON) finishShift(state, 'lost', 'integrity', events);
}

function decayInactiveRepairs(state, activeId, step) {
  for (const node of REPAIR_NODES) {
    if (node.id === activeId) continue;
    const repair = state.repairs[node.id];
    if (repair.status === 'repaired' || repair.progress <= 0) continue;
    repair.progress = Math.max(0, repair.progress - DISTRICT_CONFIG.repairProgressDecay * step);
  }
}

function pauseRepair(state, reason, events) {
  if (!state.player.repairing) return;
  const repairId = state.player.repairing;
  state.player.repairing = null;
  events.push({ type: 'repair-paused', repairId, reason });
}

function updateRepair(state, input, step, events) {
  refreshRepairStatuses(state);
  const node = nearestRepairNode(state.player.position, state);
  const wantsRepair = input.repairing === true && node !== null;
  let blockedReason = wantsRepair ? repairBlockReason(state, node) : null;
  if (!blockedReason && state.player.energy + EPSILON < DISTRICT_CONFIG.repairEnergyRate * step) {
    blockedReason = 'energy';
  }
  const canRepair = wantsRepair && blockedReason === null;

  if (!canRepair) {
    pauseRepair(state, blockedReason ?? 'released', events);
    decayInactiveRepairs(state, null, step);
    refreshRepairStatuses(state);

    if (wantsRepair && blockedReason) {
      const blockedKey = `${node.id}:${blockedReason}`;
      if (state.feedback.blockedKey !== blockedKey) {
        events.push({ type: 'repair-blocked', repairId: node.id, reason: blockedReason });
        state.feedback.blockedKey = blockedKey;
      }
    } else {
      state.feedback.blockedKey = null;
    }
    return;
  }

  state.feedback.blockedKey = null;
  if (state.player.repairing !== node.id) {
    pauseRepair(state, 'target-changed', events);
    state.player.repairing = node.id;
    events.push({ type: 'repair-started', repairId: node.id, label: node.label });
  }

  const repair = state.repairs[node.id];
  repair.status = 'repairing';
  repair.progress = Math.min(1, repair.progress + step / node.duration);
  state.player.energy = clamp(
    state.player.energy - DISTRICT_CONFIG.repairEnergyRate * step,
    0,
    DISTRICT_CONFIG.maxEnergy
  );
  state.player.heat = clamp(state.player.heat + node.heatRate * step, 0, DISTRICT_CONFIG.maxHeat);
  decayInactiveRepairs(state, node.id, step);
  updatePlayerThresholds(state, events);

  if (repair.progress < 1 - EPSILON) return;

  repair.progress = 1;
  repair.status = 'repaired';
  repair.completedAt = state.elapsed;
  state.inventory.cells -= node.cost.cells;
  state.inventory.coolant -= node.cost.coolant;
  state.player.repairing = null;
  state.stats.repairsCompleted += 1;
  state.repairCount += 1;
  state.score += node.score;
  events.push({
    type: 'repair-completed',
    repairId: node.id,
    label: node.label,
    system: node.system,
    score: node.score
  });
  refreshRepairStatuses(state, events);

  if (state.repairCount === REPAIR_NODES.length) {
    finishShift(state, 'won', 'district-restored', events);
  }
}

function simulateStep(state, input, step, events) {
  state.elapsed = Math.min(DISTRICT_CONFIG.shiftDuration, state.elapsed + step);
  state.timeRemaining = Math.max(0, DISTRICT_CONFIG.shiftDuration - state.elapsed);
  state.scan.cooldown = Math.max(0, state.scan.cooldown - step);
  state.scan.activeRemaining = Math.max(0, state.scan.activeRemaining - step);
  advanceWaves(state, events);
  collectNearbyCaches(state, events);

  refreshRepairStatuses(state);
  const target = nearestRepairNode(state.player.position, state);
  const attemptingRepair = input.repairing === true && target !== null;
  updateEnvironment(state, input, step, attemptingRepair, events);
  if (state.phase !== 'active') return;

  updateRepair(state, input, step, events);
  if (state.phase === 'active' && state.timeRemaining <= EPSILON) {
    state.timeRemaining = 0;
    finishShift(state, 'lost', 'timeout', events);
  }
}

/**
 * Advance the deterministic simulation. The supplied position is copied into
 * state.player.position; rendering and collision remain the renderer's concern.
 */
export function tickGame(state, input = {}, dt = 0) {
  const events = [];
  if (input.position) state.player.position = copyPosition(input.position, state.player.position);

  const requested = finiteOr(dt, 0);
  let remaining = requested > 0 ? requested : 0;
  let simulated = 0;

  while (remaining > EPSILON && state.phase === 'active') {
    const step = Math.min(DISTRICT_CONFIG.simulationStep, remaining, state.timeRemaining);
    if (step <= EPSILON) break;
    simulateStep(state, input, step, events);
    remaining -= step;
    simulated += step;
  }

  updateInteraction(state);
  return {
    events,
    phase: state.phase,
    simulated,
    interaction: state.interaction,
    objective: getObjective(state)
  };
}

/** Spend suit energy to reveal all unresolved points for a short UI pulse. */
export function triggerScan(state) {
  if (state.phase !== 'active' || state.scan.cooldown > EPSILON) return null;
  const modifiers = systemModifiers(state);
  if (state.player.energy + EPSILON < modifiers.scanCost) return null;

  state.player.energy = clamp(state.player.energy - modifiers.scanCost, 0, DISTRICT_CONFIG.maxEnergy);
  state.scan.cooldown = modifiers.scanCooldown;
  state.scan.activeRemaining = DISTRICT_CONFIG.scanDuration;
  state.stats.scansUsed += 1;
  const energyDepleted = state.player.energy <= EPSILON;
  if (energyDepleted) state.feedback.energyDepleted = true;
  return {
    type: 'scan-triggered',
    energyCost: modifiers.scanCost,
    energyDepleted,
    duration: DISTRICT_CONFIG.scanDuration,
    repairIds: REPAIR_NODES.filter((node) => !repaired(state, node.id)).map((node) => node.id),
    cacheIds: SUPPLY_CACHES.filter((cache) => !state.caches[cache.id].collected).map((cache) => cache.id)
  };
}

export function formatTime(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(finiteOr(seconds, 0)));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}
