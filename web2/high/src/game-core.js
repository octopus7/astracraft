export const RELAYS = [
  { id: 'r1', x: -8, z: 5 },
  { id: 'r2', x: -2, z: -7 },
  { id: 'r3', x: 6, z: -6 },
  { id: 'r4', x: 9, z: 4 },
  { id: 'r5', x: 1, z: 8 }
];

export const SCRAP = [
  { id: 's1', x: -5, z: 8 }, { id: 's2', x: -7, z: -3 },
  { id: 's3', x: 3, z: -8 }, { id: 's4', x: 8, z: 8 },
  { id: 's5', x: 4, z: 3 }, { id: 's6', x: -1, z: 3 }
];

export const HAZARDS = [
  { x: -4, z: -2, radius: 1.6 },
  { x: 5, z: 1, radius: 1.55 },
  { x: 0, z: 6, radius: 1.3 }
];

export function createGameState() {
  return {
    started: false,
    complete: false,
    energy: 100,
    scrap: 0,
    repaired: new Set(),
    collected: new Set(),
    elapsed: 0,
    repairProgress: 0,
    activeRelay: null,
    pulseCooldown: 0
  };
}

export function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function nearestRelay(position, state, maxDistance = 2.15) {
  let nearest = null;
  let best = maxDistance;
  for (const relay of RELAYS) {
    if (state.repaired.has(relay.id)) continue;
    const distance = distance2D(position, relay);
    if (distance < best) {
      nearest = relay;
      best = distance;
    }
  }
  return nearest;
}

export function tickState(state, position, dt, repairing = false) {
  if (!state.started || state.complete) return { repaired: null, collected: [] };
  state.elapsed += dt;
  state.pulseCooldown = Math.max(0, state.pulseCooldown - dt);

  const inHazard = HAZARDS.some((hazard) => distance2D(position, hazard) < hazard.radius);
  state.energy = Math.max(0, Math.min(100, state.energy + (inHazard ? -15 : 1.8) * dt));

  const collected = [];
  for (const item of SCRAP) {
    if (!state.collected.has(item.id) && distance2D(position, item) < 1.05) {
      state.collected.add(item.id);
      state.scrap = Math.min(6, state.scrap + 1);
      state.energy = Math.min(100, state.energy + 9);
      collected.push(item.id);
    }
  }

  const relay = nearestRelay(position, state);
  state.activeRelay = relay?.id ?? null;
  if (repairing && relay && state.energy > 0) {
    state.repairProgress = Math.min(1, state.repairProgress + dt / 1.45);
    state.energy = Math.max(0, state.energy - dt * 3.5);
  } else {
    state.repairProgress = Math.max(0, state.repairProgress - dt * 2.4);
  }

  let repaired = null;
  if (relay && state.repairProgress >= 1) {
    state.repaired.add(relay.id);
    state.repairProgress = 0;
    repaired = relay.id;
    if (state.repaired.size === RELAYS.length) state.complete = true;
  }
  return { repaired, collected, inHazard };
}

export function usePulse(state) {
  if (!state.started || state.complete || state.pulseCooldown > 0 || state.energy < 8) return false;
  state.energy -= 8;
  state.pulseCooldown = 2.5;
  return true;
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
