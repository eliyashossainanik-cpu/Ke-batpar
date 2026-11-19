import {
  BOHURUPI_COOLDOWN_SEC,
  BOHURUPI_DISGUISE_DURATION_SEC,
  JHARUDAR_CLEAN_CHANNEL_SEC,
  JHARUDAR_CLEAN_USES,
  KOBIRAJ_COOLDOWN_SEC,
  MISTRI_FIX_RANGE,
  SABOTAGE_COOLDOWN_SEC,
  SABOTAGE_FIX_RANGE,
  canCompleteTasks,
  canExecuteKill,
  createSabotageState,
  findNearestCleanableBody,
  findNearestGasValve,
  findNearestKillTarget,
  findNearestReportableBody,
  findNearestRevivableBody,
  findNearestShieldTarget,
  getColorShadeHint,
  isTaskLockedBySabotage,
} from './gameRules';
import {
  BOT_WAYPOINTS,
  DOORS,
  GAS_LEAK_VALVES,
  PLAYER_RADIUS,
  TASK_STATIONS,
  WALLS,
  distance2D,
  getZoneNameAt,
  hasLineOfSight,
  resolveCircleWallCollision,
} from './mapData';
import type {
  BodyMarker,
  DoorLockState,
  DoorZoneId,
  PlayerState,
  RoomSettings,
  SabotageState,
  SabotageType,
} from './types';

export interface BotBrainState {
  targetWaypointIdx: number;
  pauseTimer: number;
  activeTaskId: string | null;
  voteTimer: number;
  hasChatted: boolean;
  huntTargetId: string | null;
  sabotageDelayTimer: number;
  stuckTimer: number;
  lastX: number;
  lastZ: number;
  detourNodeIdx: number | null;
  detourTimer: number;
  suspicion: Record<string, number>;
  seenNearKill: string | null;
  killWaitTimer?: number;
  recentSightings?: Array<{ id: string; x: number; z: number; atMs: number }>;
  clearedIds?: string[];
  lastSightSampleMs?: number;
  cachedHopX?: number;
  cachedHopZ?: number;
  cachedGoalX?: number;
  cachedGoalZ?: number;
  pathRefreshTimer?: number;
}

export interface BotPlayContext {
  players: PlayerState[];
  bodies: BodyMarker[];
  sabotage: SabotageState;
  doorLocks: DoorLockState;
  settings: RoomSettings;
  holdingFixMap: Map<string, { valveId?: 'valve_cha' | 'valve_rickshaw' }>;
  brains: Map<string, BotBrainState>;
  dt: number;
  nowMs: number;
  rng?: () => number;
  onFootprint?: (p: PlayerState, distMoved: number) => void;
  onReportBody?: (reporter: PlayerState, body: BodyMarker) => void;
  onKill?: (killer: PlayerState, victim: PlayerState, shieldedBlocked: boolean) => void;
  onSabotage?: (type: SabotageType) => void;
  onDoorLock?: (zoneId: DoorZoneId) => void;
  onRevive?: (daktar: PlayerState, victim: PlayerState) => void;
  onTaskCompletedCheckWin?: () => boolean;
}

export const BOT_BANTER_LINES = [
  'Bhai ami Cha-er dokan e dudh-cha khaitasilam, ekdom clean!',
  'Onek sus lagche kintu, aajke ke Batpar bolen toh!',
  'Current gelo ar amar matha ghuray gelo re mama!',
  'Ami DESCO te line check kortesilam, trust me bhai!',
  'Rickshaw garage er pashe ke jeno gap e douraisilo!',
  'Keu baje kotha bolben na, ami ekdom bhalo Parabasi!',
  'Ami Fuchka Chottor e jhal fuchka khaitasilam kasam!',
  'Hero Saloon e Hero-cut dite gesilam, amake fashayen na!',
  'Para Cricket Math e tape ball kheltesilam, 100% clean!',
  'Biyer Bari Pandal e Kacchi khaitasilam, Batpar okhane chilo naki?',
];

export const PAGOL_BANTER_LINES = [
  'Hehe ami toh kichui kori nai, amake Pukur e chubani diyen na pls!',
  'Ami shudhu pukur ghat e boshe chilam bhai, kothao jai nai!',
  'Amake size korle kintu boro bhul korben bhaiya!',
];

// Curated walkable Moholla navigation nodes (corridors, doorways, plazas, and outer avenues)
const EXTRA_NAV_NODES: Array<{ x: number; z: number }> = [
  // Doorway entrances (inside & outside each of the 4 inner buildings + 2 outer buildings)
  { x: -31.2, z: -26.5 },
  { x: -31.2, z: -19.5 },
  { x: 31.2, z: -26.5 },
  { x: 31.2, z: -19.5 },
  { x: -31.2, z: 26.5 },
  { x: -31.2, z: 19.5 },
  { x: 31.2, z: 26.5 },
  { x: 31.2, z: 19.5 },
  // Cha Dokan / DESCO / Dish interiors around counters/obstacles
  { x: -29.0, z: -32.0 },
  { x: -35.5, z: -32.2 },
  { x: -41.5, z: -32.0 },
  { x: 38.0, z: -29.5 },
  { x: 31.5, z: -32.0 },
  { x: -31.2, z: 32.5 },
  { x: -34.0, z: 27.5 },
  { x: -34.0, z: 37.0 },
  { x: 34.5, z: 29.0 },
  { x: 29.5, z: 32.0 },
  // Saloon & Pharmacy doorways (open East)
  { x: -55.0, z: -26.0 },
  { x: -60.5, z: -26.0 },
  { x: -55.0, z: 26.0 },
  { x: -60.5, z: 26.0 },
  // Pukur Ghat West bypass (around pukur_water x: -51..-42, z: -8..8)
  { x: -37.5, z: -12.0 },
  { x: -37.5, z: 12.0 },
  { x: -54.0, z: -12.0 },
  { x: -54.0, z: 12.0 },
  // Adda Chowk & WASA & Alley hubs
  { x: -8.5, z: -8.5 },
  { x: 8.5, z: -8.5 },
  { x: -8.5, z: 8.5 },
  { x: 8.5, z: 8.5 },
  { x: -21.0, z: -15.0 },
  { x: 21.0, z: -15.0 },
  { x: -21.0, z: 15.0 },
  { x: 21.0, z: 15.0 },
  { x: -11.0, z: -34.5 },
  { x: 11.0, z: -34.5 },
  { x: -11.0, z: 34.5 },
  { x: 11.0, z: 34.5 },
  // Outer Boulevard corners & Fuchka/Rail connectors
  { x: -24.0, z: -52.0 },
  { x: 24.0, z: -52.0 },
  { x: -24.0, z: 52.0 },
  { x: 24.0, z: 52.0 },
  { x: -52.0, z: -52.0 },
  { x: 52.0, z: -52.0 },
  { x: -52.0, z: 52.0 },
  { x: 52.0, z: 52.0 },
];

export const NAV_NODES: Array<{ x: number; z: number }> = (() => {
  const pts: Array<{ x: number; z: number }> = [];
  const pushUnique = (x: number, z: number) => {
    if (!pts.some((p) => Math.hypot(p.x - x, p.z - z) < 2.2)) {
      pts.push({ x, z });
    }
  };
  for (const w of BOT_WAYPOINTS) pushUnique(w.x, w.z);
  for (const n of EXTRA_NAV_NODES) pushUnique(n.x, n.z);
  return pts;
})();

function segmentHitsExpandedAABB(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  pad: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const checks: Array<[number, number]> = [
    [-dx, ax - (minX - pad)],
    [dx, maxX + pad - ax],
    [-dz, az - (minZ - pad)],
    [dz, maxZ + pad - az],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

export function isPathSegmentWalkable(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  doorLocks?: DoorLockState,
  pad = PLAYER_RADIUS + 0.15,
): boolean {
  for (let i = 0; i < WALLS.length; i++) {
    const w = WALLS[i];
    if (segmentHitsExpandedAABB(ax, az, bx, bz, w.minX, w.maxX, w.minZ, w.maxZ, pad)) {
      return false;
    }
  }
  if (doorLocks) {
    for (let i = 0; i < DOORS.length; i++) {
      const d = DOORS[i];
      if (doorLocks[d.zoneId] <= 0) continue;
      if (segmentHitsExpandedAABB(ax, az, bx, bz, d.minX, d.maxX, d.minZ, d.maxZ, pad)) {
        return false;
      }
    }
  }
  return true;
}

interface NavEdge {
  to: number;
  cost: number;
  doorZone?: DoorZoneId;
}

const STATIC_NAV_ADJ: NavEdge[][] = (() => {
  const n = NAV_NODES.length;
  const adj: NavEdge[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = NAV_NODES[i];
      const b = NAV_NODES[j];
      const d = distance2D(a.x, a.z, b.x, b.z);
      if (d > 34) continue;
      if (!isPathSegmentWalkable(a.x, a.z, b.x, b.z, undefined, PLAYER_RADIUS + 0.15)) {
        continue;
      }
      let doorZone: DoorZoneId | undefined;
      for (const door of DOORS) {
        if (
          segmentHitsExpandedAABB(
            a.x,
            a.z,
            b.x,
            b.z,
            door.minX,
            door.maxX,
            door.minZ,
            door.maxZ,
            PLAYER_RADIUS + 0.15,
          )
        ) {
          doorZone = door.zoneId;
          break;
        }
      }
      adj[i].push({ to: j, cost: d, doorZone });
      adj[j].push({ to: i, cost: d, doorZone });
    }
  }
  return adj;
})();

const STATIC_ALL_PAIRS = (() => {
  const n = NAV_NODES.length;
  const dist = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity));
  const nextHop = Array.from({ length: n }, () => new Int32Array(n).fill(-1));
  for (let i = 0; i < n; i++) {
    dist[i][i] = 0;
    nextHop[i][i] = i;
    for (const e of STATIC_NAV_ADJ[i]) {
      dist[i][e.to] = e.cost;
      nextHop[i][e.to] = e.to;
    }
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const dik = dist[i][k];
      if (dik === Infinity) continue;
      for (let j = 0; j < n; j++) {
        const alt = dik + dist[k][j];
        if (alt < dist[i][j]) {
          dist[i][j] = alt;
          nextHop[i][j] = nextHop[i][k];
        }
      }
    }
  }
  return { dist, nextHop };
})();

function hasAnyLockedDoor(doorLocks?: DoorLockState): boolean {
  if (!doorLocks) return false;
  return (
    doorLocks.cha_dokan > 0 ||
    doorLocks.rickshaw_garage > 0 ||
    doorLocks.desco_power > 0 ||
    doorLocks.dish_roof > 0
  );
}

function findNearestWalkableNodes(
  x: number,
  z: number,
  doorLocks?: DoorLockState,
): number[] {
  const dists: Array<{ idx: number; dist: number }> = [];
  for (let i = 0; i < NAV_NODES.length; i++) {
    const node = NAV_NODES[i];
    const dist = distance2D(x, z, node.x, node.z);
    if (dist <= 38) dists.push({ idx: i, dist });
  }
  dists.sort((a, b) => a.dist - b.dist);

  const clearIds: number[] = [];
  const fallbackIds: number[] = [];
  const limit = Math.min(dists.length, 18);
  for (let i = 0; i < limit; i++) {
    const item = dists[i];
    const node = NAV_NODES[item.idx];
    if (isPathSegmentWalkable(x, z, node.x, node.z, doorLocks, PLAYER_RADIUS + 0.05)) {
      clearIds.push(item.idx);
    } else if (fallbackIds.length < 2) {
      fallbackIds.push(item.idx);
    }
  }
  return clearIds.length > 0 ? clearIds : fallbackIds;
}

/**
 * Computes the next obstacle-free steering point toward (goalX, goalZ) using
 * direct segment clearance first and shortest path over Moholla corridors otherwise.
 */
export function computeNextMoveTarget(
  fromX: number,
  fromZ: number,
  goalX: number,
  goalZ: number,
  doorLocks?: DoorLockState,
): { x: number; z: number } {
  if (distance2D(fromX, fromZ, goalX, goalZ) < 1.2) {
    return { x: goalX, z: goalZ };
  }
  if (isPathSegmentWalkable(fromX, fromZ, goalX, goalZ, doorLocks, PLAYER_RADIUS + 0.1)) {
    return { x: goalX, z: goalZ };
  }

  const starts = findNearestWalkableNodes(fromX, fromZ, doorLocks);
  const goals = findNearestWalkableNodes(goalX, goalZ, doorLocks);
  if (starts.length === 0 || goals.length === 0) {
    return { x: goalX, z: goalZ };
  }

  // Fast O(1) path lookup when no doors are currently locked
  if (!hasAnyLockedDoor(doorLocks)) {
    let bestFirst = -1;
    let bestGoal = -1;
    let bestCost = Infinity;
    for (const s of starts) {
      const dStart = distance2D(fromX, fromZ, NAV_NODES[s].x, NAV_NODES[s].z);
      for (const g of goals) {
        const mid = STATIC_ALL_PAIRS.dist[s][g];
        if (!Number.isFinite(mid)) continue;
        const dGoal = distance2D(NAV_NODES[g].x, NAV_NODES[g].z, goalX, goalZ);
        const total = dStart + mid + dGoal;
        if (total < bestCost) {
          bestCost = total;
          bestFirst = s;
          bestGoal = g;
        }
      }
    }
    if (bestFirst >= 0 && bestGoal >= 0) {
      let hopIdx = bestFirst;
      if (
        distance2D(fromX, fromZ, NAV_NODES[bestFirst].x, NAV_NODES[bestFirst].z) < 1.3 &&
        bestFirst !== bestGoal
      ) {
        const nextIdx = STATIC_ALL_PAIRS.nextHop[bestFirst][bestGoal];
        if (nextIdx >= 0) hopIdx = nextIdx;
      }
      return NAV_NODES[hopIdx];
    }
  }

  const goalSet = new Set(goals);
  const n = NAV_NODES.length;
  const dist = new Float64Array(n).fill(Infinity);
  const firstHop = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);

  for (const s of starts) {
    const d0 = distance2D(fromX, fromZ, NAV_NODES[s].x, NAV_NODES[s].z);
    dist[s] = d0;
    firstHop[s] = s;
  }

  let bestGoalNode = -1;
  let bestTotalCost = Infinity;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < bestD) {
        bestD = dist[i];
        u = i;
      }
    }
    if (u < 0) break;
    visited[u] = 1;

    if (goalSet.has(u)) {
      const total = dist[u] + distance2D(NAV_NODES[u].x, NAV_NODES[u].z, goalX, goalZ);
      if (total < bestTotalCost) {
        bestTotalCost = total;
        bestGoalNode = u;
      }
    }

    const edges = STATIC_NAV_ADJ[u];
    for (let eIdx = 0; eIdx < edges.length; eIdx++) {
      const e = edges[eIdx];
      if (e.doorZone && doorLocks && doorLocks[e.doorZone] > 0) continue;
      const nd = dist[u] + e.cost;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        firstHop[e.to] = firstHop[u];
      }
    }
  }

  if (bestGoalNode >= 0 && firstHop[bestGoalNode] >= 0) {
    const hopIdx = firstHop[bestGoalNode];
    const hop = NAV_NODES[hopIdx];
    if (distance2D(fromX, fromZ, hop.x, hop.z) < 1.1 && bestGoalNode !== hopIdx) {
      return { x: goalX, z: goalZ };
    }
    return hop;
  }

  return NAV_NODES[starts[0]];
}

export function createBotBrainState(rng: () => number = Math.random): BotBrainState {
  return {
    targetWaypointIdx: Math.floor(rng() * BOT_WAYPOINTS.length),
    pauseTimer: 0.4 + rng() * 0.9,
    activeTaskId: null,
    voteTimer: 2 + rng() * 4,
    hasChatted: false,
    huntTargetId: null,
    sabotageDelayTimer: 22 + rng() * 28,
    killWaitTimer: 2 + rng() * 5,
    recentSightings: [],
    clearedIds: [],
    lastSightSampleMs: 0,
    stuckTimer: 0,
    lastX: 0,
    lastZ: 0,
    detourNodeIdx: null,
    detourTimer: 0,
    suspicion: {},
    seenNearKill: null,
  };
}

export function resetBotBrainsForMeeting(
  brains: Map<string, BotBrainState>,
  rng: () => number = Math.random,
): void {
  for (const brain of brains.values()) {
    brain.voteTimer = 1.6 + rng() * 3.8;
    brain.hasChatted = false;
    brain.pauseTimer = 0.2;
    brain.detourNodeIdx = null;
    brain.detourTimer = 0;
    brain.killWaitTimer = 34 + rng() * 20;
  }
}

export function recordKillWitnesses(
  brains: Map<string, BotBrainState>,
  players: PlayerState[],
  killer: PlayerState,
  victim: PlayerState,
  sabotageActive: SabotageType | null,
  doorLocks: DoorLockState,
): void {
  const visionRange = sabotageActive === 'loadshedding' ? 7.5 : 14.5;
  for (const observer of players) {
    if (!observer.isBot || !observer.alive) continue;
    if (observer.id === killer.id || observer.id === victim.id || observer.role === 'vondo') continue;
    const dist = distance2D(observer.x, observer.z, victim.x, victim.z);
    if (dist > visionRange) continue;
    if (!hasLineOfSight(observer.x, observer.z, victim.x, victim.z, WALLS, doorLocks)) continue;
    const brain = brains.get(observer.id);
    if (!brain) continue;
    brain.seenNearKill = killer.id;
    brain.suspicion[killer.id] = (brain.suspicion[killer.id] ?? 0) + 5;
  }
}

function hasKillWitnesses(
  killer: PlayerState,
  victim: PlayerState,
  players: PlayerState[],
  sabotageActive: SabotageType | null,
  doorLocks: DoorLockState,
): boolean {
  const visionRange = sabotageActive === 'loadshedding' ? 7.2 : 14.0;
  for (const other of players) {
    if (!other.alive) continue;
    if (other.id === killer.id || other.id === victim.id || other.role === 'vondo') continue;
    const d = distance2D(other.x, other.z, victim.x, victim.z);
    if (d > visionRange) continue;
    if (hasLineOfSight(other.x, other.z, victim.x, victim.z, WALLS, doorLocks)) {
      return true;
    }
  }
  return false;
}

function computeGasValveAssignments(
  players: PlayerState[],
): Map<string, 'valve_cha' | 'valve_rickshaw'> {
  const helpers = players
    .filter((p) => p.isBot && p.alive && p.role === 'parabasi' && p.specialRole !== 'pagol')
    .sort((a, b) => a.id.localeCompare(b.id));
  const assignments = new Map<string, 'valve_cha' | 'valve_rickshaw'>();
  if (helpers.length === 0) return assignments;

  // Pick closest helper to valve_cha first, closest other to valve_rickshaw
  const v0 = GAS_LEAK_VALVES[0];
  const v1 = GAS_LEAK_VALVES[1];

  const byV0 = [...helpers].sort((a, b) => distance2D(a.x, a.z, v0.x, v0.z) - distance2D(b.x, b.z, v0.x, v0.z));
  const firstCha = byV0[0];
  assignments.set(firstCha.id, 'valve_cha');

  const remaining = helpers.filter((h) => h.id !== firstCha.id);
  if (remaining.length > 0) {
    remaining.sort((a, b) => distance2D(a.x, a.z, v1.x, v1.z) - distance2D(b.x, b.z, v1.x, v1.z));
    assignments.set(remaining[0].id, 'valve_rickshaw');
    // Alternate additional helpers between both valves for redundancy
    for (let i = 1; i < remaining.length; i++) {
      assignments.set(remaining[i].id, i % 2 === 1 ? 'valve_cha' : 'valve_rickshaw');
    }
  }
  return assignments;
}

export function stepBotsPlaying(ctx: BotPlayContext): boolean {
  const {
    players,
    bodies,
    sabotage,
    doorLocks,
    settings,
    holdingFixMap,
    brains,
    dt,
    nowMs,
  } = ctx;
  const rng = ctx.rng ?? Math.random;
  const gasAssignments = sabotage.active === 'gas_leak' ? computeGasValveAssignments(players) : null;

  // Pick up to 2 nearest bots for non-critical sabotage so everyone doesn't clump awkwardly
  const nonCritFixerIds = new Set<string>();
  if (sabotage.active && sabotage.active !== 'gas_leak') {
    const candidates = players
      .filter((p) => p.isBot && p.alive && p.role === 'parabasi' && p.specialRole !== 'pagol')
      .sort(
        (a, b) =>
          distance2D(a.x, a.z, sabotage.fixStationX, sabotage.fixStationZ) -
          distance2D(b.x, b.z, sabotage.fixStationX, sabotage.fixStationZ),
      );
    for (const c of candidates.slice(0, 2)) {
      nonCritFixerIds.add(c.id);
    }
  }

  const aliveNonVondos = players.filter((p) => p.alive && p.role !== 'vondo').length;
  const aliveVondos = players.filter((p) => p.alive && p.role === 'vondo').length;
  const gameAlmostWonByVondo = aliveVondos >= Math.max(1, aliveNonVondos - 1);

  for (const p of players) {
    if (!p.isBot || !p.alive) continue;
    let brain = brains.get(p.id);
    if (!brain) {
      brain = createBotBrainState(rng);
      brain.lastX = p.x;
      brain.lastZ = p.z;
      brains.set(p.id, brain);
    }

    if (brain.sabotageDelayTimer > 0 && !sabotage.active && sabotage.cooldownRemaining <= 0) {
      brain.sabotageDelayTimer = Math.max(0, brain.sabotageDelayTimer - dt);
    }
    if (brain.detourTimer > 0) {
      brain.detourTimer = Math.max(0, brain.detourTimer - dt);
      if (brain.detourTimer === 0) brain.detourNodeIdx = null;
    }

    // 1. Jharudar sweeps nearby unreported body using 2s channel
    if (
      p.specialRole === 'jharudar' &&
      p.abilityCooldown <= 0.05 &&
      !p.jharuTargetBodyId &&
      (p.cleansLeft ?? JHARUDAR_CLEAN_USES) > 0
    ) {
      const cleanTarget = findNearestCleanableBody(p, bodies);
      if (cleanTarget && rng() < 0.22) {
        p.jharuTargetBodyId = cleanTarget.id;
        p.jharuTimer = JHARUDAR_CLEAN_CHANNEL_SEC;
        p.vx = 0;
        p.vz = 0;
        continue;
      }
    }
    if (p.jharuTargetBodyId) {
      p.vx = 0;
      p.vz = 0;
      continue;
    }

    // 2. Daktar revives nearby unreported body once
    if (p.specialRole === 'daktar' && (p.revivesLeft ?? 0) > 0) {
      const revBody = findNearestRevivableBody(p, bodies);
      if (revBody && rng() < 0.25) {
        const victim = players.find((pl) => pl.id === revBody.victimId);
        if (victim) {
          const idx = bodies.findIndex((b) => b.id === revBody.id);
          if (idx >= 0) bodies.splice(idx, 1);
          victim.alive = true;
          victim.x = revBody.x;
          victim.z = revBody.z;
          p.revivesLeft = 0;
          ctx.onRevive?.(p, victim);
          continue;
        }
      }
    }

    // 3. Report discovered dead body (with LOS check)
    const reportable = findNearestReportableBody(p, bodies, doorLocks);
    if (reportable) {
      const timeSinceKill = nowMs - reportable.killedAt;
      const shouldReport =
        p.role === 'parabasi' ||
        (p.specialRole !== 'jharudar' && timeSinceKill > 8000 && rng() < 0.02);
      if (shouldReport) {
        reportable.reported = true;
        ctx.onReportBody?.(p, reportable);
        return true;
      }
    }

    // 4. Kobiraj shields nearby ally
    if (p.specialRole === 'kobiraj' && p.abilityCooldown <= 0.05) {
      const ally = findNearestShieldTarget(p, players);
      if (ally && rng() < 0.08) {
        ally.shielded = true;
        p.abilityCooldown = KOBIRAJ_COOLDOWN_SEC;
      }
    }

    // 5. Bohurupi occasionally disguises
    if (p.specialRole === 'bohurupi' && p.abilityCooldown <= 0.05 && rng() < 0.015) {
      const disguises = players.filter((o) => o.alive && o.role !== 'vondo');
      if (disguises.length > 0) {
        const pick = disguises[Math.floor(rng() * disguises.length)];
        p.disguiseColor = pick.color;
        p.disguiseName = pick.name;
        p.disguiseTimer = BOHURUPI_DISGUISE_DURATION_SEC;
        p.abilityCooldown = BOHURUPI_COOLDOWN_SEC;
      }
    }

    // 6. Batpar sabotage pacing (~60-90s intervals after 40s initial lockout)
    if (p.role === 'vondo') {
      if (
        !sabotage.active &&
        sabotage.cooldownRemaining <= 0 &&
        brain.sabotageDelayTimer <= 0
      ) {
        const roll = rng();
        const sabType: SabotageType =
          roll < 0.44 ? 'loadshedding' : roll < 0.78 ? 'wifi_down' : 'gas_leak';
        const newSab = createSabotageState(sabType, SABOTAGE_COOLDOWN_SEC);
        Object.assign(sabotage, newSab);
        // Reset delay across all Batpar bots to 25-55s extra on top of 35s cooldown => 60-90s total
        for (const other of players) {
          if (other.isBot && other.role === 'vondo') {
            const ob = brains.get(other.id);
            if (ob) ob.sabotageDelayTimer = 25 + rng() * 30;
          }
        }
        ctx.onSabotage?.(sabType);
      } else if (doorLocks.cooldownRemaining <= 0 && rng() < 0.004) {
        const zones: DoorZoneId[] = ['cha_dokan', 'rickshaw_garage', 'desco_power', 'dish_roof'];
        const zPick = zones[Math.floor(rng() * zones.length)];
        ctx.onDoorLock?.(zPick);
      }
    }

    // 7. Crew sabotage repair hold when near target station / assigned valve
    if (sabotage.active && p.role === 'parabasi' && p.specialRole !== 'pagol') {
      const range = p.specialRole === 'mistri' ? MISTRI_FIX_RANGE : SABOTAGE_FIX_RANGE;
      if (sabotage.active === 'gas_leak') {
        const assignedValveId = gasAssignments?.get(p.id);
        const nearV = findNearestGasValve(p.x, p.z, sabotage, range);
        if (nearV && (!assignedValveId || nearV.id === assignedValveId || !nearV.holderId)) {
          holdingFixMap.set(p.id, { valveId: nearV.id });
        }
      } else if (
        distance2D(p.x, p.z, sabotage.fixStationX, sabotage.fixStationZ) <= range
      ) {
        holdingFixMap.set(p.id, {});
      }
    }

    if (p.role === 'vondo' && p.killCooldownRemaining <= 0) {
      brain.killWaitTimer = Math.max(0, (brain.killWaitTimer ?? 0) - dt);
    }

    // Track nearby player sightings & visual task clears every ~1s for social deduction
    if (p.role === 'parabasi' && nowMs - (brain.lastSightSampleMs ?? 0) >= 1000) {
      brain.lastSightSampleMs = nowMs;
      const sights = (brain.recentSightings ?? []).filter((s) => nowMs - s.atMs <= 28000);
      const cleared = new Set(brain.clearedIds ?? []);
      const sightRange = sabotage.active === 'loadshedding' ? 9 : 18;
      for (const other of players) {
        if (!other.alive || other.id === p.id || other.inVent) continue;
        if (distance2D(p.x, p.z, other.x, other.z) > sightRange) continue;
        if (!hasLineOfSight(p.x, p.z, other.x, other.z, WALLS, doorLocks)) continue;
        sights.push({ id: other.id, x: other.x, z: other.z, atMs: nowMs });
        if (other.visualTaskTimer > 0 && settings.visualTasks) {
          cleared.add(other.id);
        }
      }
      brain.recentSightings = sights.slice(-24);
      brain.clearedIds = Array.from(cleared);
    }

    // 8. Batpar kill with witness LOS check & realistic blend-in wait
    if (p.role === 'vondo' && p.killCooldownRemaining <= 0 && (brain.killWaitTimer ?? 0) <= 0) {
      const victim = findNearestKillTarget(p, players);
      if (victim) {
        const check = canExecuteKill(p, victim);
        const witnessed = hasKillWitnesses(p, victim, players, sabotage.active, doorLocks);
        if (check.allowed && (!witnessed || gameAlmostWonByVondo)) {
          if (victim.shielded) {
            victim.shielded = false;
            p.killCooldownRemaining = 6;
            brain.killWaitTimer = 8 + rng() * 10;
            ctx.onKill?.(p, victim, true);
          } else {
            victim.alive = false;
            victim.watchingCams = false;
            p.killCooldownRemaining = settings.killCooldownSec;
            brain.killWaitTimer = 40 + rng() * 22;
            bodies.push({
              id: `body_${nowMs}_${victim.id}_${Math.floor(rng() * 1000)}`,
              victimId: victim.id,
              victimName: victim.name,
              color: victim.color,
              x: victim.x,
              z: victim.z,
              reported: false,
              killedAt: nowMs,
              killerColorHint: getColorShadeHint(p.color),
              killerZoneHint: getZoneNameAt(victim.x, victim.z),
            });
            recordKillWitnesses(brains, players, p, victim, sabotage.active, doorLocks);
            brain.huntTargetId = null;
            ctx.onKill?.(p, victim, false);
            if (ctx.onTaskCompletedCheckWin?.()) return true;
          }
        }
      }
    }

    // 9. Movement / Task Station Hold / Sabotage Navigation
    const holdingSabotageNow = holdingFixMap.has(p.id);
    if (holdingSabotageNow) {
      p.vx = 0;
      p.vz = 0;
      brain.stuckTimer = 0;
      continue;
    }

    if (brain.pauseTimer > 0) {
      if (sabotage.active === 'gas_leak' && gasAssignments?.has(p.id)) {
        brain.pauseTimer = 0;
        brain.activeTaskId = null;
        brain.pathRefreshTimer = 0;
      } else {
        brain.pauseTimer -= dt;
        p.vx = 0;
        p.vz = 0;
        brain.stuckTimer = 0;
        if (brain.pauseTimer <= 0 && brain.activeTaskId) {
          if (canCompleteTasks(p)) {
            const tItem = p.tasks.find(
              (t) =>
                t.taskId === brain.activeTaskId &&
                !t.completed &&
                !isTaskLockedBySabotage(t.taskId, sabotage),
            );
            const st = tItem ? TASK_STATIONS.find((s) => s.id === tItem.taskId) : null;
            if (tItem && st && distance2D(p.x, p.z, st.x, st.z) <= st.radius + 1.0) {
              tItem.completed = true;
              brain.activeTaskId = null;
              if (ctx.onTaskCompletedCheckWin?.()) return true;
            }
          } else if (p.role === 'vondo') {
            // Batpar stops faking task after hold
            brain.activeTaskId = null;
          }
        }
        continue;
      }
    }

    // Decide goal position
    let goalX = BOT_WAYPOINTS[brain.targetWaypointIdx % BOT_WAYPOINTS.length].x;
    let goalZ = BOT_WAYPOINTS[brain.targetWaypointIdx % BOT_WAYPOINTS.length].z;
    let activeStationTarget: (typeof TASK_STATIONS)[number] | null = null;

    if (brain.detourNodeIdx !== null && brain.detourTimer > 0) {
      const dNode = NAV_NODES[brain.detourNodeIdx % NAV_NODES.length];
      goalX = dNode.x;
      goalZ = dNode.z;
    } else if (sabotage.active === 'gas_leak' && gasAssignments?.has(p.id)) {
      const vId = gasAssignments.get(p.id)!;
      const v = GAS_LEAK_VALVES.find((item) => item.id === vId) ?? GAS_LEAK_VALVES[0];
      goalX = v.x;
      goalZ = v.z;
    } else if (sabotage.active && sabotage.active !== 'gas_leak' && nonCritFixerIds.has(p.id)) {
      goalX = sabotage.fixStationX;
      goalZ = sabotage.fixStationZ;
    } else if (
      p.role === 'vondo' &&
      p.killCooldownRemaining <= 3.0 &&
      (brain.killWaitTimer ?? 0) <= 1.5
    ) {
      // Batpar stalks an isolated crewmate only when ready to strike
      let isolated: PlayerState | null = null;
      let bestScore = Infinity;
      for (const cand of players) {
        if (!cand.alive || cand.role === 'vondo' || cand.inVent) continue;
        const dist = distance2D(p.x, p.z, cand.x, cand.z);
        const crowd = players.filter(
          (o) =>
            o.alive &&
            o.id !== cand.id &&
            o.id !== p.id &&
            o.role !== 'vondo' &&
            distance2D(o.x, o.z, cand.x, cand.z) < 12,
        ).length;
        const score = dist + crowd * 18;
        if (score < bestScore) {
          bestScore = score;
          isolated = cand;
        }
      }
      if (isolated) {
        goalX = isolated.x;
        goalZ = isolated.z;
      }
    } else {
      // Real task for Parabasi or fake task for Batpar
      const nextTask = p.tasks.find(
        (t) => !t.completed && !isTaskLockedBySabotage(t.taskId, sabotage),
      );
      const st = nextTask ? TASK_STATIONS.find((s) => s.id === nextTask.taskId) : null;
      if (st) {
        activeStationTarget = st;
        goalX = st.x;
        goalZ = st.z;
      }
    }

    const distToGoal = distance2D(p.x, p.z, goalX, goalZ);
    const arrivalDist = activeStationTarget ? activeStationTarget.radius * 0.72 : 1.1;

    if (distToGoal <= arrivalDist) {
      if (activeStationTarget) {
        brain.activeTaskId = activeStationTarget.id;
        brain.pauseTimer = activeStationTarget.holdDurationSec;
        if (canCompleteTasks(p) && activeStationTarget.isVisual && settings.visualTasks) {
          p.visualTaskTimer = 2.6;
        }
      } else {
        brain.activeTaskId = null;
        brain.pauseTimer = 1.1 + rng() * 1.5;
        brain.targetWaypointIdx = Math.floor(rng() * BOT_WAYPOINTS.length);
      }
      p.vx = 0;
      p.vz = 0;
      brain.stuckTimer = 0;
      continue;
    }

    if (brain.pathRefreshTimer && brain.pathRefreshTimer > 0) {
      brain.pathRefreshTimer = Math.max(0, brain.pathRefreshTimer - dt);
    }

    let nextHop: { x: number; z: number };
    const goalSame =
      brain.cachedGoalX !== undefined &&
      brain.cachedGoalZ !== undefined &&
      distance2D(goalX, goalZ, brain.cachedGoalX, brain.cachedGoalZ) < 1.5;
    const hopValid =
      goalSame &&
      brain.cachedHopX !== undefined &&
      brain.cachedHopZ !== undefined &&
      (brain.pathRefreshTimer ?? 0) > 0 &&
      distance2D(p.x, p.z, brain.cachedHopX, brain.cachedHopZ) > 1.1 &&
      !hasAnyLockedDoor(doorLocks);

    if (hopValid) {
      nextHop = { x: brain.cachedHopX!, z: brain.cachedHopZ! };
    } else {
      nextHop = computeNextMoveTarget(p.x, p.z, goalX, goalZ, doorLocks);
      brain.cachedHopX = nextHop.x;
      brain.cachedHopZ = nextHop.z;
      brain.cachedGoalX = goalX;
      brain.cachedGoalZ = goalZ;
      brain.pathRefreshTimer = 0.85;
    }

    const dx = nextHop.x - p.x;
    const dz = nextHop.z - p.z;
    const hopDist = Math.hypot(dx, dz);
    if (hopDist < 0.05) {
      brain.pathRefreshTimer = 0;
      brain.targetWaypointIdx = Math.floor(rng() * BOT_WAYPOINTS.length);
      continue;
    }

    const speed = settings.moveSpeed * 0.65;
    p.vx = (dx / hopDist) * speed;
    p.vz = (dz / hopDist) * speed;
    p.yaw = Math.atan2(p.vx, p.vz);

    const resolved = resolveCircleWallCollision(
      p.x + p.vx * dt,
      p.z + p.vz * dt,
      PLAYER_RADIUS,
      WALLS,
      doorLocks,
    );
    const moved = Math.hypot(resolved.x - p.x, resolved.z - p.z);
    p.x = resolved.x;
    p.z = resolved.z;
    ctx.onFootprint?.(p, moved);

    // Stuck detection: if barely moving for >0.6s, take an unobstructed detour node
    if (moved < speed * dt * 0.2) {
      brain.stuckTimer += dt;
      if (brain.stuckTimer > 0.6) {
        brain.stuckTimer = 0;
        const candidates = findNearestWalkableNodes(p.x, p.z, doorLocks);
        if (candidates.length > 0) {
          brain.detourNodeIdx = candidates[Math.floor(rng() * candidates.length)];
          brain.detourTimer = 1.6;
        }
        brain.targetWaypointIdx = Math.floor(rng() * BOT_WAYPOINTS.length);
      }
    } else {
      brain.stuckTimer = 0;
    }
    brain.lastX = p.x;
    brain.lastZ = p.z;
  }

  return false;
}

export function stepBotsMeeting(params: {
  players: PlayerState[];
  bodies: BodyMarker[];
  discussionTimer: number;
  brains: Map<string, BotBrainState>;
  dt: number;
  rng?: () => number;
  onChat?: (p: PlayerState, text: string) => void;
}): void {
  const { players, bodies, discussionTimer, brains, dt, onChat } = params;
  const rng = params.rng ?? Math.random;
  const canCastVote = discussionTimer <= 0;

  // Compute shared crew clues from recent sightings near dropped bodies (once per meeting when vote unlocks or early)
  const roomSuspicion: Record<string, number> = {};
  for (const pl of players) {
    if (!pl.isBot || !pl.alive || pl.role === 'vondo') continue;
    const b = brains.get(pl.id);
    if (!b) continue;
    const clearedSet = new Set(b.clearedIds ?? []);
    for (const body of bodies) {
      if (pl.specialRole === 'goyenda' && body.killerColorHint && b.recentSightings && b.recentSightings.length > 0) {
        for (const cand of players) {
          if (cand.alive && cand.id !== pl.id && getColorShadeHint(cand.color) === body.killerColorHint) {
            b.suspicion[cand.id] = (b.suspicion[cand.id] ?? 0) + 1.25;
          }
        }
      }
      if (b.recentSightings && b.recentSightings.length > 0) {
        for (const sight of b.recentSightings) {
          if (clearedSet.has(sight.id)) continue;
          const d = distance2D(sight.x, sight.z, body.x, body.z);
          if (d <= 20 && Math.abs(sight.atMs - body.killedAt) <= 22000) {
            b.suspicion[sight.id] = (b.suspicion[sight.id] ?? 0) + 1.5;
          }
        }
        // Clear processed sightings so they don't re-accumulate every tick
        b.recentSightings = [];
      }
    }
    for (const [sid, val] of Object.entries(b.suspicion)) {
      if (!clearedSet.has(sid) && val > 0) {
        roomSuspicion[sid] = (roomSuspicion[sid] ?? 0) + val;
      }
    }
  }

  let sharedTopId: string | null = null;
  let sharedTopScore = 0;
  for (const [sid, val] of Object.entries(roomSuspicion)) {
    const target = players.find((pl) => pl.id === sid && pl.alive);
    if (target && val > sharedTopScore) {
      sharedTopScore = val;
      sharedTopId = sid;
    }
  }

  for (const p of players) {
    if (!p.isBot || !p.alive) continue;
    let brain = brains.get(p.id);
    if (!brain) {
      brain = createBotBrainState(rng);
      brains.set(p.id, brain);
    }

    if (!brain.hasChatted && rng() < 0.04) {
      brain.hasChatted = true;
      if (p.specialRole === 'pagol') {
        onChat?.(p, PAGOL_BANTER_LINES[Math.floor(rng() * PAGOL_BANTER_LINES.length)]);
      } else if (brain.seenNearKill) {
        const suspect = players.find((pl) => pl.id === brain.seenNearKill && pl.alive);
        if (suspect) {
          onChat?.(p, `Bhai ami ${suspect.name} ke shamne size korte dekhsi! Ore Pukur e felo!`);
        } else {
          onChat?.(p, BOT_BANTER_LINES[Math.floor(rng() * BOT_BANTER_LINES.length)]);
        }
      } else if (p.role === 'parabasi' && sharedTopId && sharedTopScore >= 3) {
        const suspect = players.find((pl) => pl.id === sharedTopId && pl.alive);
        if (suspect) {
          onChat?.(p, `${suspect.name} ke body er zone er pashe ghurte dekha gese, sus lagche!`);
        } else {
          onChat?.(p, BOT_BANTER_LINES[Math.floor(rng() * BOT_BANTER_LINES.length)]);
        }
      } else {
        onChat?.(p, BOT_BANTER_LINES[Math.floor(rng() * BOT_BANTER_LINES.length)]);
      }
    }

    if (!canCastVote || p.hasVoted) continue;
    brain.voteTimer -= dt;
    if (brain.voteTimer <= 0) {
      const aliveOthers = players.filter((pl) => pl.alive && pl.id !== p.id);
      const nonTeammates = aliveOthers.filter((pl) =>
        p.role === 'vondo' ? pl.role !== 'vondo' : true,
      );
      const clearedSet = new Set(brain.clearedIds ?? []);

      // 1. High-confidence witness accusation from alive Parabasi
      if (p.role === 'parabasi' && brain.seenNearKill) {
        const target = aliveOthers.find((pl) => pl.id === brain.seenNearKill);
        if (target && rng() < 0.9) {
          p.votedFor = target.id;
          p.hasVoted = true;
          continue;
        }
      }

      // 2. If no bodies have ever dropped in this match (early emergency), never dogpile random ejects
      const anyCasualties = players.some((pl) => !pl.alive) || bodies.length > 0;
      if (!anyCasualties && rng() < 0.92) {
        p.votedFor = 'skip';
        p.hasVoted = true;
        continue;
      }

      // 3. Crew consensus deduction when sightings/clues point to a strong suspect
      if (
        p.role === 'parabasi' &&
        p.specialRole !== 'pagol' &&
        sharedTopId &&
        sharedTopId !== p.id &&
        !clearedSet.has(sharedTopId) &&
        sharedTopScore >= 1.5 &&
        rng() < 0.85
      ) {
        p.votedFor = sharedTopId;
        p.hasVoted = true;
        continue;
      }

      // 4. Otherwise cautious social deduction voting (avoid blind random crew votes)
      const unCleared = nonTeammates.filter((c) => !clearedSet.has(c.id));
      const pool = unCleared.length > 0 ? unCleared : nonTeammates;
      let topSuspect: PlayerState | null = null;
      let topScore = 0;
      for (const cand of pool) {
        const score = brain.suspicion[cand.id] ?? 0;
        if (score > topScore) {
          topScore = score;
          topSuspect = cand;
        }
      }

      if (topSuspect && topScore >= 1.5 && rng() < 0.78) {
        p.votedFor = topSuspect.id;
      } else if (p.role === 'vondo' && pool.length > 0 && rng() >= 0.48) {
        p.votedFor = pool[Math.floor(rng() * pool.length)].id;
      } else if (pool.length > 0 && rng() >= 0.90) {
        p.votedFor = pool[Math.floor(rng() * pool.length)].id;
      } else {
        p.votedFor = 'skip';
      }
      p.hasVoted = true;
    }
  }
}
