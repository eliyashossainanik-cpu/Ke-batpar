import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  PLAYER_COLORS,
  type BodyMarker,
  type ChatMessage,
  type ClientMessage,
  type DoorLockState,
  type FootprintDot,
  type PlayerColorId,
  type PlayerState,
  type PublicRoomSummary,
  type RoomSettings,
  type RoomSnapshot,
  type ServerMessage,
} from './src/shared/types.ts';
import {
  BOT_WAYPOINTS,
  EMERGENCY_BELL_POS,
  GAS_LEAK_VALVES,
  PLAYER_RADIUS,
  SPAWN_RING,
  TASK_STATIONS,
  VENTS,
  WALLS,
  distance2D,
  getZoneNameAt,
  hasLineOfSight,
  resolveCircleWallCollision,
} from './src/shared/mapData.ts';
import {
  BOHURUPI_COOLDOWN_SEC,
  BOHURUPI_DISGUISE_DURATION_SEC,
  DAROGA_COOLDOWN_SEC,
  DEFAULT_ROOM_SETTINGS,
  DOOR_LOCK_COOLDOWN_SEC,
  DOOR_LOCK_DURATION_SEC,
  INITIAL_KILL_COOLDOWN_SEC,
  JHARUDAR_CLEAN_CHANNEL_SEC,
  JHARUDAR_CLEAN_COOLDOWN_SEC,
  JHARUDAR_CLEAN_USES,
  KOBIRAJ_COOLDOWN_SEC,
  LOBBY_CHAT_MAX_CHARS,
  MAX_MATCH_PLAYERS,
  MIN_MATCH_PLAYERS,
  MISTRI_FIX_RANGE,
  MISTRI_VENT_COOLDOWN_SEC,
  REPORT_RANGE,
  SABOTAGE_COOLDOWN_SEC,
  SABOTAGE_FIX_RANGE,
  SABOTAGE_INITIAL_LOCKOUT_SEC,
  VENT_RANGE,
  advanceSabotageState,
  assignMatchTasks,
  assignRoles,
  assignSpecialRoles,
  canCompleteTasks,
  canExecuteKill,
  canStartLobbyMatch,
  canUseVent,
  computeTaskProgress,
  createEmptySabotageState,
  createSabotageState,
  evaluateMatchOutcome,
  executeGoyendaScan,
  findNearestCleanableBody,
  findNearestDarogaTarget,
  findNearestGasValve,
  findNearestInspectableBody,
  findNearestKillTarget,
  findNearestReportableBody,
  findNearestRevivableBody,
  findNearestShieldTarget,
  getColorShadeHint,
  inspectBodyClue,
  isCriticalSabotage,
  isMistriVentAudibleTo,
  isTaskLockedBySabotage,
  makeDefaultPlayerState,
  makeEmptyDoorLocks,
  redactSnapshotForPlayer,
  resolveDarogaShot,
  resolveVentHopTarget,
  sanitizePlayerName,
  sanitizeSoloConfig,
  stepJharudarChannel,
  tallyVotes,
} from './src/shared/gameRules.ts';
import {
  type BotBrainState,
  createBotBrainState,
  recordKillWitnesses,
  resetBotBrainsForMeeting,
  stepBotsMeeting,
  stepBotsPlaying,
} from './src/shared/botAi.ts';
import { resolveUniqueMultiplayerIdentity } from './src/shared/banglaComedy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TICK_RATE_MS = 50; // 20Hz authoritative server tick
const MAX_PLAYERS = MAX_MATCH_PLAYERS;
const RECONNECT_GRACE_MS = 20_000;

const BOT_NAMES = [
  'Chacha Miah',
  'Babu Bhai',
  'Pintu Da',
  'Tuktuki Apa',
  'Raju Rickshaw',
  'Kallu Ustad',
  'Mitu Moni',
];

const BOT_BANTER = [
  'Bhai ami Cha-er dokan e dudh-cha chini chara khachilam!',
  'Onek sus lagche kintu, aajke ke Batpar bolen?',
  'Current gelo ar amar matha ghuray gelo re!',
  'Ami DESCO te chora line check kortesilam, trust me!',
  'Rickshaw garage er pashe ke jeno gap e douraisilo!',
  'Keu baje kotha bolben na, ami ekdom bhalo Para-basi!',
  'Kichu bolbo na naki chubani dibo? Khub tension!',
  'Ami Fuchka Chottor e jhal fuchka khaitasilam kasam!',
  'Hero Saloon e Hero-cut dite gesilam bhai!',
  'Para Cricket Math e tape ball kheltesilam, keu sus bolben na!',
  'Dadu Pharmacy theke saline nite gesilam!',
  'Biyer Bari Pandal e Kacchi khaitasilam, Batpar okhane chilo naki?',
];

const PAGOL_BANTER = [
  'Hehe ami toh kichui kori nai, amake Pukur e chubani diyen na pls!',
  'Ami shudhu pukur ghat e boshe chilam bhai, kothao jai nai!',
  'Amake size korle kintu boro bhul korben bhaiya!',
];

interface RoomInternal {
  code: string;
  phase: 'lobby' | 'role_reveal' | 'playing' | 'meeting' | 'vote_results' | 'ejecting' | 'gameover';
  players: Map<string, PlayerState>;
  clients: Map<string, WebSocket>;
  botMemories: Map<string, BotBrainState>;
  footprintAccum: Map<string, number>;
  holdingFixMap: Map<string, { valveId?: 'valve_cha' | 'valve_rickshaw' }>;
  bodies: BodyMarker[];
  footprints: FootprintDot[];
  sabotage: RoomSnapshot['sabotage'];
  doorLocks: DoorLockState;
  chat: ChatMessage[];
  lobbyChat: ChatMessage[];
  lobbyCountdownSec: number | null;
  lobbyCountdownTimer: number;
  lastLobbyChatAt: Map<string, number>;
  playerReconnectTokens: Map<string, string>;
  disconnectedSlots: Map<string, { player: PlayerState; expiresAt: number }>;
  meetingCallerId: string | null;
  meetingReason: 'body' | 'emergency' | null;
  meetingTimer: number;
  discussionTimer: number;
  phaseTimer: number;
  emergencyCooldownRemaining: number;
  ejection: RoomSnapshot['ejection'];
  justEjectedPlayer: PlayerState | null;
  outcome: RoomSnapshot['outcome'];
  netaRevealedId: string | null;
  prankedLampUntil: number;
  settings: RoomSettings;
}

const rooms = new Map<string, RoomInternal>();
const socketToPlayer = new Map<WebSocket, { roomCode: string; playerId: string }>();

function generateRoomCode(): string {
  const words = ['ADDA', 'CHAI', 'MAMA', 'PARA', 'DESH', 'KELA', 'PUKR'];
  for (let i = 0; i < 10; i++) {
    const candidate =
      i < 4
        ? `${words[Math.floor(Math.random() * words.length)]}`
        : Math.random().toString(36).substring(2, 6).toUpperCase();
    if (!rooms.has(candidate)) return candidate;
  }
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function pickAvailableColor(room: RoomInternal, preferred?: PlayerColorId): PlayerColorId {
  const used = new Set(Array.from(room.players.values()).map((p) => p.color));
  if (preferred && !used.has(preferred)) return preferred;
  for (const spec of PLAYER_COLORS) {
    if (!used.has(spec.id)) return spec.id;
  }
  return PLAYER_COLORS[room.players.size % PLAYER_COLORS.length].id;
}

function buildSnapshot(room: RoomInternal): RoomSnapshot {
  const players = Array.from(room.players.values());
  const taskStats = computeTaskProgress(players);
  return {
    roomCode: room.code,
    isSolo: false,
    phase: room.phase,
    players: players.map((p) => ({ ...p, tasks: p.tasks.map((t) => ({ ...t })) })),
    bodies: room.bodies.map((b) => ({ ...b })),
    footprints: room.footprints.map((f) => ({ ...f })),
    sabotage: {
      ...room.sabotage,
      valves: room.sabotage.valves.map((v) => ({ ...v })),
    },
    doorLocks: { ...room.doorLocks },
    chat: room.chat.slice(-40),
    lobbyChat: room.lobbyChat.slice(-40),
    lobbyCountdownSec: room.lobbyCountdownSec,
    netaRevealedId: room.netaRevealedId,
    prankedLampUntil: room.prankedLampUntil,
    meetingCallerId: room.meetingCallerId,
    meetingReason: room.meetingReason,
    meetingTimer: Math.max(0, Math.ceil(room.meetingTimer)),
    discussionTimer: Math.max(0, Math.ceil(room.discussionTimer)),
    emergencyCooldownRemaining: Math.max(0, Math.ceil(room.emergencyCooldownRemaining)),
    ejection: room.ejection,
    outcome: room.outcome,
    settings: { ...room.settings },
    taskProgress: taskStats.progress,
    totalTasks: taskStats.totalTasks,
    completedTasks: taskStats.completedTasks,
  };
}

function recordFootprint(room: RoomInternal, p: PlayerState, distMoved: number): void {
  if (!p.alive || p.inVent || distMoved < 0.05) return;
  const prev = (room.footprintAccum.get(p.id) ?? 0) + distMoved;
  if (prev >= 2.2) {
    room.footprintAccum.set(p.id, 0);
    room.footprints.push({
      id: `fp_${Date.now()}_${p.id}_${Math.random().toString(36).slice(2, 5)}`,
      x: p.x,
      z: p.z,
      color: p.disguiseColor ?? p.color,
      expiresAt: Date.now() + 7500,
    });
    if (room.footprints.length > 36) {
      room.footprints.shift();
    }
  } else {
    room.footprintAccum.set(p.id, prev);
  }
}

function sendToSocket(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(room: RoomInternal, msg?: ServerMessage): void {
  if (msg) {
    const payload = JSON.stringify(msg);
    for (const ws of room.clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
    return;
  }

  const baseSnap = buildSnapshot(room);
  for (const [playerId, ws] of room.clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'room:state',
          snapshot: redactSnapshotForPlayer(baseSnap, playerId),
        } satisfies ServerMessage),
      );
    }
  }
}

function pushSystemChat(room: RoomInternal, text: string): void {
  room.chat.push({
    id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    senderId: 'system',
    senderName: 'Moholla Announcement',
    senderColor: 'holud',
    text,
    timestamp: Date.now(),
    system: true,
  });
}

function createEmptyRoom(code: string): RoomInternal {
  return {
    code,
    phase: 'lobby',
    players: new Map(),
    clients: new Map(),
    botMemories: new Map(),
    footprintAccum: new Map(),
    holdingFixMap: new Map(),
    bodies: [],
    footprints: [],
    sabotage: createEmptySabotageState(SABOTAGE_INITIAL_LOCKOUT_SEC),
    doorLocks: makeEmptyDoorLocks(),
    chat: [],
    lobbyChat: [],
    lobbyCountdownSec: null,
    lobbyCountdownTimer: 0,
    lastLobbyChatAt: new Map(),
    playerReconnectTokens: new Map(),
    disconnectedSlots: new Map(),
    meetingCallerId: null,
    meetingReason: null,
    meetingTimer: 0,
    discussionTimer: 0,
    phaseTimer: 0,
    emergencyCooldownRemaining: 0,
    ejection: null,
    justEjectedPlayer: null,
    outcome: null,
    netaRevealedId: null,
    prankedLampUntil: 0,
    settings: { ...DEFAULT_ROOM_SETTINGS },
  };
}

function pruneExpiredReconnectSlots(room: RoomInternal): void {
  const now = Date.now();
  for (const [token, entry] of room.disconnectedSlots.entries()) {
    if (entry.expiresAt <= now) {
      room.disconnectedSlots.delete(token);
    }
  }
}

function cancelRoomLobbyCountdown(room: RoomInternal): void {
  if (room.lobbyCountdownSec !== null || room.lobbyCountdownTimer > 0) {
    room.lobbyCountdownSec = null;
    room.lobbyCountdownTimer = 0;
  }
}

function spawnRoomBot(room: RoomInternal): boolean {
  if (room.players.size >= MAX_PLAYERS) return false;
  const botId = `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const sp = SPAWN_RING[room.players.size % SPAWN_RING.length];
  const botCandidate = BOT_NAMES[room.players.size % BOT_NAMES.length];
  const botIdentity = resolveUniqueMultiplayerIdentity(
    botCandidate,
    undefined,
    Array.from(room.players.values()),
  );
  const existingNames = Array.from(room.players.values()).map((p) => p.name);
  room.players.set(
    botId,
    makeDefaultPlayerState({
      id: botId,
      name: sanitizePlayerName(botIdentity.name, existingNames),
      color: pickAvailableColor(room, botIdentity.color),
      x: sp.x,
      z: sp.z,
      yaw: sp.yaw,
      isBot: true,
      isHost: false,
      ready: true,
      emergencyMeetingsLeft: room.settings.emergencyMeetingsPerPlayer,
    }),
  );
  return true;
}

function removeRoomPlayer(room: RoomInternal, playerId: string, intentional: boolean): void {
  const oldPlayer = room.players.get(playerId);
  const wasHost = oldPlayer?.isHost ?? false;
  const token = room.playerReconnectTokens.get(playerId);

  room.clients.delete(playerId);
  room.holdingFixMap.delete(playerId);
  room.players.delete(playerId);

  if (room.clients.size === 0) {
    room.disconnectedSlots.clear();
    rooms.delete(room.code);
    return;
  }

  if (!intentional && oldPlayer && token) {
    room.disconnectedSlots.set(token, {
      player: {
        ...oldPlayer,
        isHost: false,
        ready: false,
        tasks: oldPlayer.tasks.map((t) => ({ ...t })),
      },
      expiresAt: Date.now() + RECONNECT_GRACE_MS,
    });
  } else {
    room.playerReconnectTokens.delete(playerId);
  }

  if (wasHost) {
    const nextHuman = Array.from(room.players.values()).find((p) => !p.isBot);
    if (nextHuman) {
      nextHuman.isHost = true;
      nextHuman.ready = true;
    }
  }

  if (room.phase === 'lobby') {
    if (intentional && room.settings.autoFillBots && room.players.size < MAX_PLAYERS) {
      spawnRoomBot(room);
    }
    if (!canStartLobbyMatch(Array.from(room.players.values())).ok) {
      cancelRoomLobbyCountdown(room);
    }
  }

  broadcastRoom(room);
}

function startMatch(room: RoomInternal): void {
  const playerList = Array.from(room.players.values());
  if (!canStartLobbyMatch(playerList).ok) return;
  cancelRoomLobbyCountdown(room);
  room.disconnectedSlots.clear();
  room.settings = sanitizeSoloConfig(playerList.length, room.settings).settings;

  let assigned = assignRoles(playerList, room.settings.vondoCount);
  assigned = assignSpecialRoles(
    assigned,
    room.settings.enableSpecialRoles,
    undefined,
    undefined,
    Math.random,
    room.settings.enableNeutralRoles,
  );
  assignMatchTasks(assigned, room.settings.tasksPerPlayer);
  room.bodies = [];
  room.footprints = [];
  room.footprintAccum.clear();
  room.holdingFixMap.clear();
  room.chat = [];
  room.ejection = null;
  room.justEjectedPlayer = null;
  room.outcome = null;
  room.meetingCallerId = null;
  room.meetingReason = null;
  room.netaRevealedId = null;
  room.prankedLampUntil = 0;
  room.lobbyCountdownSec = null;
  room.discussionTimer = 0;
  room.doorLocks = makeEmptyDoorLocks();
  room.emergencyCooldownRemaining = room.settings.emergencyCooldownSec;
  room.sabotage = createEmptySabotageState(SABOTAGE_INITIAL_LOCKOUT_SEC);

  assigned.forEach((p, idx) => {
    const sp = SPAWN_RING[idx % SPAWN_RING.length];
    p.x = sp.x;
    p.z = sp.z;
    p.vx = 0;
    p.vz = 0;
    p.yaw = sp.yaw;
    p.alive = true;
    p.inVent = false;
    p.watchingCams = false;
    p.visualTaskTimer = 0;
    p.abilityCooldown =
      p.specialRole === 'bohurupi' ||
      p.specialRole === 'kobiraj' ||
      p.specialRole === 'daroga' ||
      p.specialRole === 'jharudar'
        ? 6
        : 0;
    p.revivesLeft = p.specialRole === 'daktar' ? 1 : 0;
    p.scansLeft = p.specialRole === 'goyenda' ? 2 : 0;
    p.shotsLeft = p.specialRole === 'daroga' ? 1 : 0;
    p.cleansLeft = p.specialRole === 'jharudar' ? 3 : 0;
    p.pranksLeft = 1;
    p.shielded = false;
    p.disguiseColor = null;
    p.disguiseName = null;
    p.disguiseTimer = 0;
    p.hasVoted = false;
    p.votedFor = null;
    p.emergencyMeetingsLeft =
      p.specialRole === 'neta'
        ? room.settings.emergencyMeetingsPerPlayer + 1
        : room.settings.emergencyMeetingsPerPlayer;
    p.killCooldownRemaining = p.role === 'vondo' ? INITIAL_KILL_COOLDOWN_SEC : 0;
    room.players.set(p.id, p);
  });

  room.phase = 'role_reveal';
  room.phaseTimer = 8.0;
  pushSystemChat(room, 'Khela shuru! Para tasks shesh koro ba Batpar ke Pukur e felo!');
  broadcastRoom(room);
}

function startMeeting(room: RoomInternal, caller: PlayerState, reason: 'body' | 'emergency', victimName?: string): void {
  if (room.phase !== 'playing') return;
  room.phase = 'meeting';
  room.meetingCallerId = caller.id;
  room.meetingReason = reason;
  room.discussionTimer = room.settings.discussionTimeSec;
  room.meetingTimer = room.settings.meetingTimeSec;
  room.ejection = null;
  room.justEjectedPlayer = null;
  room.footprints = [];
  room.holdingFixMap.clear();
  if (isCriticalSabotage(room.sabotage.active)) {
    room.sabotage = createEmptySabotageState(SABOTAGE_COOLDOWN_SEC);
  } else {
    room.sabotage.fixProgress = 0;
    room.sabotage.fixerId = null;
  }
  room.doorLocks = makeEmptyDoorLocks();

  for (const p of room.players.values()) {
    p.inVent = false;
    p.watchingCams = false;
    p.disguiseColor = null;
    p.disguiseName = null;
    p.disguiseTimer = 0;
    p.jharuTargetBodyId = null;
    p.jharuTimer = 0;
    p.pranksLeft = 1;
    p.vx = 0;
    p.vz = 0;
    p.hasVoted = false;
    p.votedFor = null;
  }

  if (!room.netaRevealedId) {
    const aliveNeta = Array.from(room.players.values()).find(
      (p) => p.alive && p.specialRole === 'neta',
    );
    if (aliveNeta) {
      room.netaRevealedId = aliveNeta.id;
      pushSystemChat(
        room,
        `${aliveNeta.name} mohollar Neta (Mayor) — tar Shalish vote 2x hisebe count hobe!`,
      );
    }
  }

  resetBotBrainsForMeeting(room.botMemories);

  if (reason === 'body') {
    pushSystemChat(room, `${caller.name} found ${victimName ?? 'a fallen neighbor'}! Adda called!`);
  } else {
    pushSystemChat(room, `${caller.name} rang the Adda Bell! Urgent Moholla meeting!`);
  }

  broadcastRoom(room, { type: 'sfx:event', kind: reason === 'body' ? 'report' : 'meeting' });
  broadcastRoom(room);
}

function resolveMeetingVotes(room: RoomInternal): void {
  const players = Array.from(room.players.values());
  const ejection = tallyVotes(players, room.settings.confirmEjects);
  room.ejection = ejection;

  // Transition to Vote Results tally screen for 2.6s first (official Among Us flow!)
  room.phase = 'vote_results';
  room.phaseTimer = 2.6;
  broadcastRoom(room);
}

function checkAndApplyWinCondition(room: RoomInternal, sabotageExpired = false): boolean {
  const players = Array.from(room.players.values());
  const stats = computeTaskProgress(players);
  const outcome = evaluateMatchOutcome(
    players,
    stats.progress,
    sabotageExpired,
    room.justEjectedPlayer,
  );
  if (outcome) {
    room.outcome = outcome;
    room.phase = 'gameover';
    broadcastRoom(room);
    return true;
  }
  return false;
}

function updateRoomBots(room: RoomInternal, dt: number): void {
  const players = Array.from(room.players.values());
  if (room.phase === 'playing') {
    stepBotsPlaying({
      players,
      bodies: room.bodies,
      sabotage: room.sabotage,
      doorLocks: room.doorLocks,
      settings: room.settings,
      holdingFixMap: room.holdingFixMap,
      brains: room.botMemories,
      dt,
      nowMs: Date.now(),
      onFootprint: (p, distMoved) => recordFootprint(room, p, distMoved),
      onReportBody: (reporter, body) => startMeeting(room, reporter, 'body', body.victimName),
      onKill: (_killer, victim, shieldBlocked) => {
        if (shieldBlocked) {
          broadcastRoom(room, { type: 'sfx:event', kind: 'shield' });
          const targetWs = room.clients.get(victim.id);
          if (targetWs) {
            sendToSocket(targetWs, {
              type: 'clue:result',
              title: 'Tabiz Saved You!',
              detail: 'Ekjon Batpar tomake gap e nite chaisilo, kintu Tabiz shield bachay dise!',
            });
          }
        } else {
          broadcastRoom(room, { type: 'sfx:event', kind: 'kill' });
        }
      },
      onSabotage: () => broadcastRoom(room, { type: 'sfx:event', kind: 'sabotage' }),
      onDoorLock: (zoneId) => {
        room.doorLocks[zoneId] = DOOR_LOCK_DURATION_SEC;
        room.doorLocks.cooldownRemaining = DOOR_LOCK_COOLDOWN_SEC;
        broadcastRoom(room, { type: 'sfx:event', kind: 'door' });
      },
      onRevive: () => broadcastRoom(room, { type: 'sfx:event', kind: 'revive' }),
      onTaskCompletedCheckWin: () => checkAndApplyWinCondition(room),
    });
  } else if (room.phase === 'meeting') {
    stepBotsMeeting({
      players,
      bodies: room.bodies,
      discussionTimer: room.discussionTimer,
      brains: room.botMemories,
      dt,
      onChat: (p, text) => {
        room.chat.push({
          id: `chat_${Date.now()}_${p.id}`,
          senderId: p.id,
          senderName: p.name,
          senderColor: p.color,
          text,
          timestamp: Date.now(),
        });
      },
    });
  }
}

setInterval(() => {
  const dt = TICK_RATE_MS / 1000;
  for (const room of rooms.values()) {
    if (room.clients.size === 0) continue;

    if (room.phase === 'lobby') {
      pruneExpiredReconnectSlots(room);
      if (room.lobbyCountdownSec !== null) {
        room.lobbyCountdownTimer -= dt;
        const nextSec = Math.max(0, Math.ceil(room.lobbyCountdownTimer));
        if (nextSec > 0 && nextSec !== room.lobbyCountdownSec) {
          room.lobbyCountdownSec = nextSec;
          broadcastRoom(room, { type: 'sfx:event', kind: 'lobby_tick' });
          broadcastRoom(room);
        }
        if (room.lobbyCountdownTimer <= 0) {
          room.lobbyCountdownSec = null;
          room.lobbyCountdownTimer = 0;
          broadcastRoom(room, { type: 'sfx:event', kind: 'lobby_start' });
          startMatch(room);
        }
      }
    } else if (room.phase === 'role_reveal') {
      room.phaseTimer -= dt;
      if (room.phaseTimer <= 0) {
        room.phase = 'playing';
        broadcastRoom(room);
      }
    } else if (room.phase === 'playing') {
      const nowMs = Date.now();
      room.footprints = room.footprints.filter((f) => f.expiresAt > nowMs);
      for (const p of room.players.values()) {
        if (p.killCooldownRemaining > 0) p.killCooldownRemaining = Math.max(0, p.killCooldownRemaining - dt);
        if (p.visualTaskTimer > 0) p.visualTaskTimer = Math.max(0, p.visualTaskTimer - dt);
        if (p.abilityCooldown > 0) p.abilityCooldown = Math.max(0, p.abilityCooldown - dt);
        if (p.disguiseTimer > 0) {
          p.disguiseTimer = Math.max(0, p.disguiseTimer - dt);
          if (p.disguiseTimer === 0) {
            p.disguiseColor = null;
            p.disguiseName = null;
          }
        }
        if (p.jharuTargetBodyId) {
          const jRes = stepJharudarChannel(p, room.bodies, dt);
          if (jRes.completedBody) {
            room.bodies = room.bodies.filter((b) => b.id !== jRes.completedBody!.id);
            const pWs = room.clients.get(p.id);
            if (pWs) {
              sendToSocket(pWs, { type: 'sfx:event', kind: 'clean' });
              sendToSocket(pWs, {
                type: 'clue:result',
                title: 'Lash Gayeb!',
                detail: `Cleaned ${jRes.completedBody.victimName}'s body — nobody can report it now!`,
              });
            }
          } else if (jRes.cancelled) {
            const pWs = room.clients.get(p.id);
            if (pWs) {
              sendToSocket(pWs, {
                type: 'clue:result',
                title: 'Clean Cancelled',
                detail: 'Tumi shoray geso ba lash report hoye gese!',
              });
            }
          }
        }
      }
      if (room.emergencyCooldownRemaining > 0) {
        room.emergencyCooldownRemaining = Math.max(0, room.emergencyCooldownRemaining - dt);
      }
      if (room.doorLocks.cooldownRemaining > 0) {
        room.doorLocks.cooldownRemaining = Math.max(0, room.doorLocks.cooldownRemaining - dt);
      }
      room.doorLocks.cha_dokan = Math.max(0, room.doorLocks.cha_dokan - dt);
      room.doorLocks.rickshaw_garage = Math.max(0, room.doorLocks.rickshaw_garage - dt);
      room.doorLocks.desco_power = Math.max(0, room.doorLocks.desco_power - dt);
      room.doorLocks.dish_roof = Math.max(0, room.doorLocks.dish_roof - dt);
      for (const hid of Array.from(room.holdingFixMap.keys())) {
        const hp = room.players.get(hid);
        if (!hp || !hp.alive || hp.isBot) {
          room.holdingFixMap.delete(hid);
        }
      }

      updateRoomBots(room, dt);
      if (room.phase !== 'playing') continue;

      const sabStep = advanceSabotageState(
        room.sabotage,
        Array.from(room.players.values()),
        dt,
        room.holdingFixMap,
      );
      if (sabStep.fixed) {
        room.holdingFixMap.clear();
        broadcastRoom(room, { type: 'sfx:event', kind: 'task' });
      } else if (sabStep.expiredCritical) {
        room.holdingFixMap.clear();
        checkAndApplyWinCondition(room, true);
        continue;
      } else if (sabStep.expiredNonCriticalType) {
        room.holdingFixMap.clear();
        pushSystemChat(
          room,
          sabStep.expiredNonCriticalType === 'loadshedding'
            ? 'Current ashche! DESCO line nijei thik hoye gese!'
            : 'Wi-Fi ashche! Dish line abar chaloo hoye gese!',
        );
      }
      broadcastRoom(room);
    } else if (room.phase === 'meeting') {
      updateRoomBots(room, dt);
      if (room.discussionTimer > 0) {
        room.discussionTimer = Math.max(0, room.discussionTimer - dt);
        broadcastRoom(room);
      } else {
        room.meetingTimer -= dt;
        const alivePlayers = Array.from(room.players.values()).filter((p) => p.alive);
        const allVoted = alivePlayers.length > 0 && alivePlayers.every((p) => p.hasVoted);
        if (allVoted || room.meetingTimer <= 0) {
          resolveMeetingVotes(room);
        } else {
          broadcastRoom(room);
        }
      }
    } else if (room.phase === 'vote_results') {
      room.phaseTimer -= dt;
      if (room.phaseTimer <= 0) {
        room.justEjectedPlayer = null;
        if (room.ejection?.ejectedId) {
          const ejected = room.players.get(room.ejection.ejectedId);
          if (ejected) {
            ejected.alive = false;
            room.justEjectedPlayer = ejected;
          }
        }
        room.bodies = [];
        room.phase = 'ejecting';
        room.phaseTimer = room.ejection?.reason === 'voted' ? 7.5 : 5.0;
        if (room.ejection?.reason === 'voted' && room.ejection.ejectedId) {
          broadcastRoom(room, { type: 'sfx:event', kind: 'eject' });
        }
        broadcastRoom(room);
      }
    } else if (room.phase === 'ejecting') {
      room.phaseTimer -= dt;
      if (room.phaseTimer <= 0) {
        if (!checkAndApplyWinCondition(room)) {
          room.justEjectedPlayer = null;
          let idx = 0;
          for (const p of room.players.values()) {
            const sp = SPAWN_RING[idx % SPAWN_RING.length];
            p.x = sp.x;
            p.z = sp.z;
            p.yaw = sp.yaw;
            p.hasVoted = false;
            p.votedFor = null;
            if (p.role === 'vondo') {
              p.killCooldownRemaining = room.settings.killCooldownSec;
            }
            idx++;
          }
          room.emergencyCooldownRemaining = room.settings.emergencyCooldownSec;
          room.phase = 'playing';
          broadcastRoom(room);
        }
      }
    }
  }
}, TICK_RATE_MS);

function handleSocketMessage(ws: WebSocket, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    return;
  }

  if (msg.type === 'room:list') {
    const list: PublicRoomSummary[] = [];
    for (const r of rooms.values()) {
      if (r.clients.size === 0) continue;
      const host = Array.from(r.players.values()).find((p) => p.isHost);
      list.push({
        roomCode: r.code,
        playerCount: r.players.size,
        maxPlayers: MAX_PLAYERS,
        phase: r.phase,
        hostName: host?.name ?? 'Host',
      });
    }
    sendToSocket(ws, { type: 'room:list_result', rooms: list });
    return;
  }

  if (msg.type === 'room:create' || msg.type === 'room:join') {
    const prev = socketToPlayer.get(ws);
    if (prev) {
      socketToPlayer.delete(ws);
      const oldRoom = rooms.get(prev.roomCode);
      if (oldRoom) {
        removeRoomPlayer(oldRoom, prev.playerId, true);
      }
    }

    let room: RoomInternal | undefined;
    if (msg.type === 'room:create') {
      const code = generateRoomCode();
      room = createEmptyRoom(code);
      rooms.set(code, room);
    } else {
      const code = msg.roomCode.trim().toUpperCase();
      room = rooms.get(code);
      if (!room) {
        sendToSocket(ws, { type: 'room:error', message: `Ei code e kono room nai (${code} not found).` });
        return;
      }
      pruneExpiredReconnectSlots(room);
      const token = msg.reconnectToken;
      if (token && room.disconnectedSlots.has(token)) {
        const reserved = room.disconnectedSlots.get(token)!;
        room.disconnectedSlots.delete(token);
        const existingNames = Array.from(room.players.values()).map((p) => p.name);
        const restored: PlayerState = {
          ...reserved.player,
          isHost: false,
          ready: room.phase === 'lobby' ? false : reserved.player.ready,
          name: sanitizePlayerName(reserved.player.name, existingNames),
          color: pickAvailableColor(room, reserved.player.color),
          tasks: reserved.player.tasks.map((t) => ({ ...t })),
        };
        room.players.set(restored.id, restored);
        room.clients.set(restored.id, ws);
        room.playerReconnectTokens.set(restored.id, token);
        socketToPlayer.set(ws, { roomCode: room.code, playerId: restored.id });
        sendToSocket(ws, {
          type: 'room:joined',
          playerId: restored.id,
          snapshot: redactSnapshotForPlayer(buildSnapshot(room), restored.id),
          reconnectToken: token,
        });
        broadcastRoom(room, { type: 'sfx:event', kind: 'lobby_join' });
        broadcastRoom(room);
        return;
      }
      if (room.phase !== 'lobby' || room.lobbyCountdownSec !== null) {
        sendToSocket(ws, { type: 'room:error', message: 'Khela shuru hoye gese! Match already in progress.' });
        return;
      }
      if (room.players.size + room.disconnectedSlots.size >= MAX_PLAYERS) {
        sendToSocket(ws, { type: 'room:error', message: 'Room bhorti! Max 8 jon (room is full).' });
        return;
      }
    }

    const playerId = `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const issuedToken = `rc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const sp = SPAWN_RING[room.players.size % SPAWN_RING.length];
    const resolvedIdentity = resolveUniqueMultiplayerIdentity(
      msg.name,
      msg.color,
      Array.from(room.players.values()),
    );
    const existingNames = Array.from(room.players.values()).map((p) => p.name);
    const uniqueName = sanitizePlayerName(resolvedIdentity.name, existingNames);
    const isHost = room.players.size === 0;

    const player: PlayerState = makeDefaultPlayerState({
      id: playerId,
      name: uniqueName,
      color: pickAvailableColor(room, resolvedIdentity.color),
      x: sp.x,
      z: sp.z,
      yaw: sp.yaw,
      isBot: false,
      isHost,
      ready: isHost,
      emergencyMeetingsLeft: room.settings.emergencyMeetingsPerPlayer,
    });

    room.players.set(playerId, player);
    room.clients.set(playerId, ws);
    room.playerReconnectTokens.set(playerId, issuedToken);
    socketToPlayer.set(ws, { roomCode: room.code, playerId });

    sendToSocket(ws, {
      type: 'room:joined',
      playerId,
      snapshot: redactSnapshotForPlayer(buildSnapshot(room), playerId),
      reconnectToken: issuedToken,
    });
    if (!isHost) {
      broadcastRoom(room, { type: 'sfx:event', kind: 'lobby_join' });
    }
    broadcastRoom(room);
    return;
  }

  const ref = socketToPlayer.get(ws);
  if (!ref) return;
  const room = rooms.get(ref.roomCode);
  if (!room) return;
  const player = room.players.get(ref.playerId);
  if (!player) return;

  if (msg.type === 'room:leave') {
    socketToPlayer.delete(ws);
    removeRoomPlayer(room, ref.playerId, true);
    return;
  }

  switch (msg.type) {
    case 'lobby:settings': {
      if (!player.isHost || room.phase !== 'lobby') return;
      const sanitized = sanitizeSoloConfig(
        Math.max(MIN_MATCH_PLAYERS, room.players.size),
        { ...room.settings, ...msg.settings },
      );
      room.settings = sanitized.settings;
      broadcastRoom(room);
      break;
    }
    case 'lobby:customize': {
      if (room.phase !== 'lobby') return;
      if (typeof msg.name === 'string') {
        const otherNames = Array.from(room.players.values())
          .filter((p) => p.id !== player.id)
          .map((p) => p.name);
        player.name = sanitizePlayerName(msg.name, otherNames);
      }
      if (
        msg.color &&
        !Array.from(room.players.values()).some((p) => p.id !== player.id && p.color === msg.color)
      ) {
        player.color = msg.color;
      }
      broadcastRoom(room);
      break;
    }
    case 'lobby:ready': {
      if (room.phase !== 'lobby' || player.isHost || player.isBot) return;
      player.ready = Boolean(msg.ready);
      if (!player.ready) {
        cancelRoomLobbyCountdown(room);
      }
      broadcastRoom(room, { type: 'sfx:event', kind: 'lobby_ready' });
      broadcastRoom(room);
      break;
    }
    case 'lobby:kick': {
      if (!player.isHost || room.phase !== 'lobby') return;
      const target = room.players.get(msg.targetPlayerId);
      if (!target || target.id === player.id) return;
      if (target.isBot) {
        room.players.delete(target.id);
      } else {
        const targetWs = room.clients.get(target.id);
        if (targetWs) {
          sendToSocket(targetWs, {
            type: 'room:kicked',
            message: 'Host tomake room theke kick korse.',
          });
          socketToPlayer.delete(targetWs);
        }
        room.clients.delete(target.id);
        room.playerReconnectTokens.delete(target.id);
        room.players.delete(target.id);
      }
      if (!canStartLobbyMatch(Array.from(room.players.values())).ok) {
        cancelRoomLobbyCountdown(room);
      }
      broadcastRoom(room);
      break;
    }
    case 'lobby:chat': {
      if (room.phase !== 'lobby') return;
      const now = Date.now();
      const prevAt = room.lastLobbyChatAt.get(player.id) ?? 0;
      if (now - prevAt < 500) return;
      const clean = msg.text.trim().slice(0, LOBBY_CHAT_MAX_CHARS);
      if (!clean) return;
      room.lastLobbyChatAt.set(player.id, now);
      room.lobbyChat.push({
        id: `lchat_${now}_${Math.random().toString(36).slice(2, 5)}`,
        senderId: player.id,
        senderName: player.name,
        senderColor: player.color,
        text: clean,
        timestamp: now,
      });
      if (room.lobbyChat.length > 40) {
        room.lobbyChat = room.lobbyChat.slice(-40);
      }
      broadcastRoom(room);
      break;
    }
    case 'lobby:add_bot': {
      if (!player.isHost || room.phase !== 'lobby' || room.players.size >= MAX_PLAYERS) return;
      if (spawnRoomBot(room)) {
        broadcastRoom(room, { type: 'sfx:event', kind: 'lobby_join' });
        broadcastRoom(room);
      }
      break;
    }
    case 'lobby:remove_bot': {
      if (!player.isHost || room.phase !== 'lobby') return;
      let removed = false;
      if (msg.targetPlayerId) {
        const target = room.players.get(msg.targetPlayerId);
        if (target?.isBot) {
          room.players.delete(target.id);
          removed = true;
        }
      } else {
        const bots = Array.from(room.players.values()).filter((p) => p.isBot);
        const last = bots.at(-1);
        if (last) {
          room.players.delete(last.id);
          removed = true;
        }
      }
      if (removed) {
        if (!canStartLobbyMatch(Array.from(room.players.values())).ok) {
          cancelRoomLobbyCountdown(room);
        }
        broadcastRoom(room);
      }
      break;
    }
    case 'lobby:remove_bots': {
      if (!player.isHost || room.phase !== 'lobby') return;
      for (const [id, pl] of room.players.entries()) {
        if (pl.isBot) room.players.delete(id);
      }
      cancelRoomLobbyCountdown(room);
      broadcastRoom(room);
      break;
    }
    case 'lobby:start': {
      if (!player.isHost || room.phase !== 'lobby') return;
      const check = canStartLobbyMatch(Array.from(room.players.values()));
      if (!check.ok) {
        sendToSocket(ws, {
          type: 'room:error',
          message: check.reason ?? `Aro players lagbe (min ${MIN_MATCH_PLAYERS})!`,
        });
        return;
      }
      if (room.lobbyCountdownSec === null) {
        room.lobbyCountdownSec = 5;
        room.lobbyCountdownTimer = 5.0;
        broadcastRoom(room, { type: 'sfx:event', kind: 'lobby_tick' });
        broadcastRoom(room);
      }
      break;
    }
    case 'lobby:cancel_start': {
      if (!player.isHost || room.phase !== 'lobby') return;
      cancelRoomLobbyCountdown(room);
      broadcastRoom(room);
      break;
    }
    case 'player:move': {
      if (room.phase !== 'playing' && room.phase !== 'lobby') return;
      if (player.inVent) return;
      const resolved = player.alive
        ? resolveCircleWallCollision(msg.x, msg.z, PLAYER_RADIUS, WALLS, room.doorLocks)
        : { x: msg.x, z: msg.z };
      const moved = Math.hypot(resolved.x - player.x, resolved.z - player.z);
      player.x = resolved.x;
      player.z = resolved.z;
      player.vx = msg.vx;
      player.vz = msg.vz;
      player.yaw = msg.yaw;
      if (room.phase === 'playing') {
        recordFootprint(room, player, moved);
      } else if (room.phase === 'lobby') {
        broadcastRoom(room);
      }
      break;
    }
    case 'player:visual_task_start': {
      if (
        room.phase !== 'playing' ||
        !room.settings.visualTasks ||
        player.role !== 'parabasi' ||
        player.specialRole === 'pagol'
      ) {
        return;
      }
      player.visualTaskTimer = 3.0;
      broadcastRoom(room);
      break;
    }
    case 'player:task_complete': {
      if (room.phase !== 'playing') return;
      if (isTaskLockedBySabotage(msg.taskId, room.sabotage)) return;
      const station = TASK_STATIONS.find((s) => s.id === msg.taskId);
      if (!station || distance2D(player.x, player.z, station.x, station.z) > station.radius + 1.5) return;
      const taskItem = player.tasks.find((t) => t.taskId === msg.taskId);
      if (taskItem && !taskItem.completed) {
        taskItem.completed = true;
        if (canCompleteTasks(player) && !taskItem.isFake && station.isVisual && room.settings.visualTasks) {
          player.visualTaskTimer = 2.6;
        }
        sendToSocket(ws, { type: 'sfx:event', kind: 'task' });
        if (!checkAndApplyWinCondition(room)) {
          broadcastRoom(room);
        }
      }
      break;
    }
    case 'player:use_ability': {
      if (room.phase !== 'playing') return;
      if (!player.alive) {
        if ((player.pranksLeft ?? 0) <= 0) {
          sendToSocket(ws, {
            type: 'clue:result',
            title: 'Lamp Prank Used',
            detail: 'Ei round e lamp prank shesh — next Shalish er por abar parbe!',
          });
          return;
        }
        player.pranksLeft = 0;
        room.prankedLampUntil = Date.now() + 3500;
        broadcastRoom(room, { type: 'sfx:event', kind: 'prank' });
        sendToSocket(ws, {
          type: 'clue:result',
          title: 'Moholla Lamp Flicker!',
          detail: 'Harmless ghost prank — streetlamps 3.5s flicker korche!',
        });
        broadcastRoom(room);
        return;
      }
      if (player.inVent) return;
      if (player.specialRole === 'goyenda') {
        const scan = executeGoyendaScan(player, room.bodies, Date.now());
        if (!scan.ok) {
          sendToSocket(ws, {
            type: 'clue:result',
            title: 'Goyenda Scanner',
            detail:
              scan.reason === 'no_scans_left'
                ? 'Shob forensic scan (2/2) shesh hoye gese!'
                : 'Move near a fallen neighbor body to scan forensic clues.',
          });
          return;
        }
        sendToSocket(ws, { type: 'sfx:event', kind: 'clue' });
        sendToSocket(ws, { type: 'clue:result', title: scan.clue!.title, detail: scan.clue!.detail });
        broadcastRoom(room);
        return;
      }
      if (player.specialRole === 'kobiraj') {
        if (player.abilityCooldown > 0.05) return;
        const nearby = msg.targetId
          ? room.players.get(msg.targetId)
          : findNearestShieldTarget(player, Array.from(room.players.values()));
        const receiver =
          nearby && nearby.alive && !nearby.inVent ? nearby : !player.shielded ? player : null;
        if (!receiver) return;
        receiver.shielded = true;
        player.abilityCooldown = KOBIRAJ_COOLDOWN_SEC;
        sendToSocket(ws, { type: 'sfx:event', kind: 'shield' });
        sendToSocket(ws, {
          type: 'clue:result',
          title: 'Tabiz Shield Active',
          detail:
            receiver.id === player.id
              ? 'You placed a protective Tabiz shield on yourself!'
              : `Protected ${receiver.name} with a Kobiraj Tabiz shield!`,
        });
        broadcastRoom(room);
        return;
      }
      if (player.specialRole === 'bohurupi') {
        if (player.disguiseTimer > 0 && (!msg.targetId || msg.targetId === player.id)) {
          player.disguiseColor = null;
          player.disguiseName = null;
          player.disguiseTimer = 0;
          broadcastRoom(room, { type: 'sfx:event', kind: 'disguise' });
          broadcastRoom(room);
          return;
        }
        if (player.abilityCooldown > 0.05) return;
        const candidates = Array.from(room.players.values()).filter(
          (p) => p.alive && p.id !== player.id && p.role !== 'vondo',
        );
        const chosen =
          (msg.targetId ? candidates.find((c) => c.id === msg.targetId) : candidates[0]) ?? candidates[0];
        if (!chosen) return;
        player.disguiseColor = chosen.color;
        player.disguiseName = chosen.name;
        player.disguiseTimer = BOHURUPI_DISGUISE_DURATION_SEC;
        player.abilityCooldown = BOHURUPI_COOLDOWN_SEC;
        broadcastRoom(room, { type: 'sfx:event', kind: 'disguise' });
        sendToSocket(ws, {
          type: 'clue:result',
          title: 'Bohurupi Shapeshift',
          detail: `Disguised as ${chosen.name} for ${BOHURUPI_DISGUISE_DURATION_SEC}s!`,
        });
        broadcastRoom(room);
        return;
      }
      if (player.specialRole === 'daroga') {
        if ((player.shotsLeft ?? 1) <= 0) {
          sendToSocket(ws, {
            type: 'clue:result',
            title: 'Para Daroga',
            detail: 'Tomar 1 ta Sheriff shot already use hoye gese!',
          });
          return;
        }
        if (player.abilityCooldown > 0.05) return;
        const target = msg.targetId
          ? room.players.get(msg.targetId)
          : findNearestDarogaTarget(player, Array.from(room.players.values()));
        if (!target) {
          sendToSocket(ws, {
            type: 'clue:result',
            title: 'Para Daroga',
            detail: 'Move close to a suspect to make an Arrest Shot!',
          });
          return;
        }
        const res = resolveDarogaShot(player, target);
        if (!res.allowed) return;
        player.shotsLeft = Math.max(0, (player.shotsLeft ?? 1) - 1);
        broadcastRoom(room, { type: 'sfx:event', kind: 'daroga' });
        if (res.hitVondo) {
          target.alive = false;
          target.watchingCams = false;
          player.abilityCooldown = DAROGA_COOLDOWN_SEC;
          room.bodies.push({
            id: `body_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            victimId: target.id,
            victimName: target.name,
            color: target.color,
            x: target.x,
            z: target.z,
            reported: false,
            killedAt: Date.now(),
            killerColorHint: getColorShadeHint(player.color),
            killerZoneHint: getZoneNameAt(target.x, target.z),
          });
          sendToSocket(ws, {
            type: 'clue:result',
            title: 'Daroga Bullseye!',
            detail: `${target.name} CHILO ASLI BATPAR! Size kore diso!`,
          });
        } else {
          player.alive = false;
          player.watchingCams = false;
          room.bodies.push({
            id: `body_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            victimId: player.id,
            victimName: player.name,
            color: player.color,
            x: player.x,
            z: player.z,
            reported: false,
            killedAt: Date.now(),
            killerColorHint: getColorShadeHint(player.color),
            killerZoneHint: getZoneNameAt(player.x, player.z),
          });
          sendToSocket(ws, {
            type: 'clue:result',
            title: 'Daroga Misfire!',
            detail: `${target.name} niraparadh Para-basi chilo! Ulto tomar job gelo!`,
          });
        }
        if (!checkAndApplyWinCondition(room)) {
          broadcastRoom(room);
        }
        return;
      }
      if (player.specialRole === 'daktar') {
        if ((player.revivesLeft ?? 0) <= 0) return;
        const body = findNearestRevivableBody(player, room.bodies);
        if (!body) {
          sendToSocket(ws, {
            type: 'clue:result',
            title: 'Para Daktar',
            detail: 'Move near an unreported fallen body to apply Saline!',
          });
          return;
        }
        const victim = room.players.get(body.victimId);
        if (!victim) return;
        room.bodies = room.bodies.filter((b) => b.id !== body.id);
        victim.alive = true;
        victim.x = body.x;
        victim.z = body.z;
        player.revivesLeft = Math.max(0, (player.revivesLeft ?? 1) - 1);
        player.abilityCooldown = 10;
        broadcastRoom(room, { type: 'sfx:event', kind: 'revive' });
        sendToSocket(ws, {
          type: 'clue:result',
          title: 'Saline Revive Success!',
          detail: `${victim.name} ke Para Daktar bachaye tulsen!`,
        });
        broadcastRoom(room);
        return;
      }
      if (player.specialRole === 'jharudar') {
        if ((player.cleansLeft ?? JHARUDAR_CLEAN_USES) <= 0) {
          sendToSocket(ws, {
            type: 'clue:result',
            title: 'Safai Batpar',
            detail: 'Shob clean (3/3) use hoye gese!',
          });
          return;
        }
        if (player.abilityCooldown > 0.05) return;
        const body = findNearestCleanableBody(player, room.bodies);
        if (!body) {
          sendToSocket(ws, {
            type: 'clue:result',
            title: 'Safai Batpar',
            detail: 'Move near an unreported fallen body to clean it!',
          });
          return;
        }
        player.jharuTargetBodyId = body.id;
        player.jharuTimer = JHARUDAR_CLEAN_CHANNEL_SEC;
        sendToSocket(ws, {
          type: 'clue:result',
          title: 'Jharu Dichhe...',
          detail: `Hold steady near ${body.victimName} for 2s to sweep the body!`,
        });
        broadcastRoom(room);
      }
      break;
    }
    case 'player:kill': {
      if (room.phase !== 'playing') return;
      const target = room.players.get(msg.targetId);
      if (!target) return;
      const check = canExecuteKill(player, target);
      if (!check.allowed) return;
      if (target.shielded) {
        target.shielded = false;
        player.killCooldownRemaining = 6;
        broadcastRoom(room, { type: 'sfx:event', kind: 'shield' });
        sendToSocket(ws, {
          type: 'clue:result',
          title: 'Tabiz Shield Shattered!',
          detail: `${target.name} was protected by the Kobiraj!`,
        });
        const targetWs = room.clients.get(target.id);
        if (targetWs) {
          sendToSocket(targetWs, {
            type: 'clue:result',
            title: 'Tabiz Saved You!',
            detail: 'Ekjon Batpar attack korsilo, kintu tomar Tabiz shield bachay dise!',
          });
        }
        broadcastRoom(room);
        return;
      }
      target.alive = false;
      target.watchingCams = false;
      player.killCooldownRemaining = room.settings.killCooldownSec;
      player.x = target.x;
      player.z = target.z;
      room.bodies.push({
        id: `body_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        victimId: target.id,
        victimName: target.name,
        color: target.color,
        x: target.x,
        z: target.z,
        reported: false,
        killedAt: Date.now(),
        killerColorHint: getColorShadeHint(player.color),
        killerZoneHint: getZoneNameAt(target.x, target.z),
      });
      broadcastRoom(room, { type: 'sfx:event', kind: 'kill' });
      recordKillWitnesses(
        room.botMemories,
        Array.from(room.players.values()),
        player,
        target,
        room.sabotage.active,
        room.doorLocks,
      );
      if (!checkAndApplyWinCondition(room)) {
        broadcastRoom(room);
      }
      break;
    }
    case 'player:vent_toggle': {
      if (room.phase !== 'playing' || !canUseVent(player)) return;
      const emitVentSfx = () => {
        if (player.specialRole === 'mistri') {
          for (const listener of room.players.values()) {
            if (!listener.isBot && isMistriVentAudibleTo(player, listener)) {
              const lWs = room.clients.get(listener.id);
              if (lWs) sendToSocket(lWs, { type: 'sfx:event', kind: 'vent' });
            }
          }
        } else {
          broadcastRoom(room, { type: 'sfx:event', kind: 'vent' });
        }
      };
      if (!player.inVent) {
        const nearVent = VENTS.find((v) => distance2D(player.x, player.z, v.x, v.z) <= VENT_RANGE);
        if (!nearVent) return;
        player.inVent = true;
        player.x = nearVent.x;
        player.z = nearVent.z;
        emitVentSfx();
      } else if (msg.destinationVentId) {
        const dest = resolveVentHopTarget(player.x, player.z, msg.destinationVentId);
        if (!dest) return;
        player.x = dest.x;
        player.z = dest.z;
        emitVentSfx();
      } else {
        player.inVent = false;
        if (player.specialRole === 'mistri') {
          player.abilityCooldown = MISTRI_VENT_COOLDOWN_SEC;
        }
        emitVentSfx();
      }
      broadcastRoom(room);
      break;
    }
    case 'player:sabotage': {
      if (room.phase !== 'playing' || !player.alive || player.role !== 'vondo') return;
      if (room.sabotage.active || room.sabotage.cooldownRemaining > 0) return;
      room.sabotage = createSabotageState(msg.sabotageType, SABOTAGE_COOLDOWN_SEC);
      room.holdingFixMap.clear();
      broadcastRoom(room, { type: 'sfx:event', kind: 'sabotage' });
      broadcastRoom(room);
      break;
    }
    case 'player:lock_doors': {
      if (room.phase !== 'playing' || !player.alive || player.role !== 'vondo') return;
      if (room.doorLocks.cooldownRemaining > 0) return;
      room.doorLocks[msg.zoneId] = DOOR_LOCK_DURATION_SEC;
      room.doorLocks.cooldownRemaining = DOOR_LOCK_COOLDOWN_SEC;
      broadcastRoom(room, { type: 'sfx:event', kind: 'door' });
      broadcastRoom(room);
      break;
    }
    case 'player:watch_cams': {
      if (room.phase !== 'playing') return;
      player.watchingCams = msg.watching;
      broadcastRoom(room);
      break;
    }
    case 'player:fix_sabotage': {
      if (room.phase !== 'playing' || !player.alive || !room.sabotage.active) {
        room.holdingFixMap.delete(player.id);
        return;
      }
      if (msg.holding === false) {
        room.holdingFixMap.delete(player.id);
        return;
      }
      const range = player.specialRole === 'mistri' ? MISTRI_FIX_RANGE : SABOTAGE_FIX_RANGE;
      if (room.sabotage.active === 'gas_leak') {
        const nearValve = msg.valveId
          ? GAS_LEAK_VALVES.find((v) => v.id === msg.valveId && distance2D(player.x, player.z, v.x, v.z) <= range)
          : findNearestGasValve(player.x, player.z, room.sabotage, range);
        if (nearValve) {
          room.holdingFixMap.set(player.id, { valveId: nearValve.id });
        } else {
          room.holdingFixMap.delete(player.id);
        }
        break;
      }
      if (distance2D(player.x, player.z, room.sabotage.fixStationX, room.sabotage.fixStationZ) <= range) {
        room.holdingFixMap.set(player.id, {});
      } else {
        room.holdingFixMap.delete(player.id);
      }
      break;
    }
    case 'player:report_body': {
      if (room.phase !== 'playing' || !player.alive) return;
      const body = room.bodies.find((b) => b.id === msg.bodyId && !b.reported);
      if (!body) return;
      if (distance2D(player.x, player.z, body.x, body.z) > REPORT_RANGE + 1.0) return;
      if (!hasLineOfSight(player.x, player.z, body.x, body.z, WALLS, room.doorLocks)) return;
      body.reported = true;
      startMeeting(room, player, 'body', body.victimName);
      break;
    }
    case 'player:emergency_meeting': {
      if (
        room.phase !== 'playing' ||
        !player.alive ||
        isCriticalSabotage(room.sabotage.active) ||
        room.emergencyCooldownRemaining > 0 ||
        player.emergencyMeetingsLeft <= 0
      ) {
        return;
      }
      if (distance2D(player.x, player.z, EMERGENCY_BELL_POS.x, EMERGENCY_BELL_POS.z) <= EMERGENCY_BELL_POS.interactRadius) {
        player.emergencyMeetingsLeft--;
        startMeeting(room, player, 'emergency');
      }
      break;
    }
    case 'meeting:chat': {
      if (room.phase !== 'meeting') return;
      const text = msg.text.trim().slice(0, 140);
      if (!text) return;
      room.chat.push({
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        senderId: player.id,
        senderName: player.alive ? player.name : `${player.name} (Ghost)`,
        senderColor: player.color,
        text,
        timestamp: Date.now(),
        ghostOnly: !player.alive,
      });
      broadcastRoom(room);
      break;
    }
    case 'meeting:vote': {
      if (room.phase !== 'meeting' || room.discussionTimer > 0 || !player.alive || player.hasVoted) {
        return;
      }
      player.votedFor = msg.targetId;
      player.hasVoted = true;
      broadcastRoom(room);
      break;
    }
    case 'player:meme_sfx': {
      const allowed = new Set(['vine_boom', 'bonk', 'sad_trombone', 'airhorn', 'dun_dun', 'chubani']);
      if (allowed.has(msg.memeId)) {
        broadcastRoom(room, { type: 'meme:play', memeId: msg.memeId });
      }
      break;
    }
    case 'room:play_again': {
      if (!player.isHost) return;
      room.phase = 'lobby';
      room.bodies = [];
      room.footprints = [];
      room.footprintAccum.clear();
      room.holdingFixMap.clear();
      room.chat = [];
      room.outcome = null;
      room.ejection = null;
      room.justEjectedPlayer = null;
      room.meetingCallerId = null;
      room.meetingReason = null;
      room.meetingTimer = 0;
      room.discussionTimer = 0;
      room.lobbyCountdownSec = null;
      room.netaRevealedId = null;
      room.prankedLampUntil = 0;
      room.emergencyCooldownRemaining = 0;
      room.sabotage = createEmptySabotageState(SABOTAGE_INITIAL_LOCKOUT_SEC);
      room.doorLocks = makeEmptyDoorLocks();
      let idx = 0;
      for (const p of room.players.values()) {
        const sp = SPAWN_RING[idx % SPAWN_RING.length];
        p.x = sp.x;
        p.z = sp.z;
        p.vx = 0;
        p.vz = 0;
        p.yaw = sp.yaw;
        p.alive = true;
        p.inVent = false;
        p.watchingCams = false;
        p.visualTaskTimer = 0;
        p.abilityCooldown = 0;
        p.shielded = false;
        p.disguiseColor = null;
        p.disguiseName = null;
        p.disguiseTimer = 0;
        p.role = 'parabasi';
        p.specialRole = 'none';
        p.tasks = [];
        p.scansLeft = 0;
        p.shotsLeft = 0;
        p.cleansLeft = 0;
        p.revivesLeft = 0;
        p.pranksLeft = 1;
        p.jharuTargetBodyId = null;
        p.jharuTimer = 0;
        p.killCooldownRemaining = 0;
        p.emergencyMeetingsLeft = room.settings.emergencyMeetingsPerPlayer;
        p.ready = p.isHost || p.isBot;
        p.hasVoted = false;
        p.votedFor = null;
        idx++;
      }
      broadcastRoom(room);
      break;
    }
  }
}

const MEME_STORAGE_DIR = path.resolve(__dirname, 'server_memes');
const MEME_MANIFEST_PATH = path.join(MEME_STORAGE_DIR, 'manifest.json');

interface ServerMemeRecord {
  slotId: string;
  fileName: string;
  mimeType: string;
  customLabel?: string;
  updatedAt: number;
  hasFile: boolean;
  storedFile?: string;
}

const VALID_MEME_SLOTS = new Set([
  'vine_boom',
  'bonk',
  'sad_trombone',
  'airhorn',
  'dun_dun',
  'chubani',
  'event_kill',
  'event_report',
  'event_meeting',
  'event_eject',
  'event_sabotage',
  'event_shield',
  'event_daroga',
  'event_clean',
  'event_revive',
  'event_task',
  'event_vent',
  'event_jump',
  'event_win',
  'event_loss',
]);

function ensureMemeStorageDir(): void {
  if (!fs.existsSync(MEME_STORAGE_DIR)) {
    fs.mkdirSync(MEME_STORAGE_DIR, { recursive: true });
  }
}

function readMemeManifest(): Record<string, ServerMemeRecord> {
  ensureMemeStorageDir();
  if (!fs.existsSync(MEME_MANIFEST_PATH)) return {};
  try {
    const raw = fs.readFileSync(MEME_MANIFEST_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, ServerMemeRecord>;
  } catch {
    return {};
  }
}

function writeMemeManifest(manifest: Record<string, ServerMemeRecord>): void {
  ensureMemeStorageDir();
  fs.writeFileSync(MEME_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

function sanitizeSlotId(raw: string): string | null {
  const clean = raw.trim();
  return VALID_MEME_SLOTS.has(clean) ? clean : null;
}

function checkAdminPin(req: express.Request): boolean {
  const expected = process.env.ADMIN_PASSCODE?.trim();
  if (!expected) return true;
  const provided = String(req.headers['x-admin-passcode'] ?? '').trim();
  return provided === expected;
}

async function bootstrap(): Promise<void> {
  ensureMemeStorageDir();
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-passcode');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: '8mb' }));
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcastAllSockets = (msg: ServerMessage) => {
    const raw = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  };

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      handleSocketMessage(ws, String(data));
    });
    ws.on('close', () => {
      const ref = socketToPlayer.get(ws);
      socketToPlayer.delete(ws);
      if (!ref) return;
      const room = rooms.get(ref.roomCode);
      if (!room) return;
      removeRoomPlayer(room, ref.playerId, false);
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: 'express', activeRooms: rooms.size });
  });

  // Server-Side Viral Bangla Meme Audio Endpoints
  app.get('/api/memes', (_req, res) => {
    const manifest = readMemeManifest();
    const publicClips: Record<string, Omit<ServerMemeRecord, 'storedFile'>> = {};
    for (const [k, v] of Object.entries(manifest)) {
      publicClips[k] = {
        slotId: v.slotId,
        fileName: v.fileName,
        mimeType: v.mimeType,
        customLabel: v.customLabel,
        updatedAt: v.updatedAt,
        hasFile: Boolean(v.hasFile && v.storedFile && fs.existsSync(path.join(MEME_STORAGE_DIR, v.storedFile))),
      };
    }
    res.json({
      requiresPin: Boolean(process.env.ADMIN_PASSCODE?.trim()),
      clips: publicClips,
    });
  });

  app.get('/api/memes/file/:slotId', (req, res) => {
    const slotId = sanitizeSlotId(req.params.slotId);
    if (!slotId) {
      res.status(404).json({ error: 'Unknown meme slot' });
      return;
    }
    const manifest = readMemeManifest();
    const entry = manifest[slotId];
    if (!entry?.storedFile) {
      res.status(404).json({ error: 'No audio uploaded for this slot' });
      return;
    }
    const filePath = path.join(MEME_STORAGE_DIR, path.basename(entry.storedFile));
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Audio file missing' });
      return;
    }
    res.setHeader('Content-Type', entry.mimeType || 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(filePath);
  });

  app.post('/api/admin/memes/clear', (req, res) => {
    if (!checkAdminPin(req)) {
      res.status(401).json({ error: 'Invalid Admin Passcode PIN.' });
      return;
    }
    const manifest = readMemeManifest();
    for (const entry of Object.values(manifest)) {
      if (entry.storedFile) {
        const p = path.join(MEME_STORAGE_DIR, path.basename(entry.storedFile));
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }
    }
    writeMemeManifest({});
    broadcastAllSockets({ type: 'memes:updated', updatedAt: Date.now() });
    res.json({ ok: true });
  });

  app.post('/api/admin/memes/:slotId', (req, res) => {
    if (!checkAdminPin(req)) {
      res.status(401).json({ error: 'Invalid Admin Passcode PIN.' });
      return;
    }
    const slotId = sanitizeSlotId(req.params.slotId);
    if (!slotId) {
      res.status(400).json({ error: 'Invalid meme slot ID.' });
      return;
    }
    const body = (req.body ?? {}) as {
      fileName?: string;
      mimeType?: string;
      customLabel?: string;
      dataBase64?: string;
      labelOnly?: boolean;
    };

    const manifest = readMemeManifest();
    const prev = manifest[slotId];
    const now = Date.now();

    if (body.labelOnly) {
      if (prev) {
        prev.customLabel = body.customLabel ? String(body.customLabel).trim().slice(0, 24) : undefined;
        prev.updatedAt = now;
      } else {
        manifest[slotId] = {
          slotId,
          fileName: '',
          mimeType: '',
          customLabel: body.customLabel ? String(body.customLabel).trim().slice(0, 24) : undefined,
          updatedAt: now,
          hasFile: false,
        };
      }
      writeMemeManifest(manifest);
      broadcastAllSockets({ type: 'memes:updated', updatedAt: now });
      res.json({ ok: true });
      return;
    }

    if (!body.dataBase64 || typeof body.dataBase64 !== 'string') {
      res.status(400).json({ error: 'Missing audio payload.' });
      return;
    }
    const audioBuf = Buffer.from(body.dataBase64, 'base64');
    if (audioBuf.length === 0 || audioBuf.length > 6 * 1024 * 1024) {
      res.status(400).json({ error: 'Audio file must be under 6 MB.' });
      return;
    }

    const storedFile = `${slotId}.bin`;
    fs.writeFileSync(path.join(MEME_STORAGE_DIR, storedFile), audioBuf);
    manifest[slotId] = {
      slotId,
      fileName: String(body.fileName || `${slotId}.mp3`).slice(0, 80),
      mimeType: String(body.mimeType || 'audio/mpeg').slice(0, 60),
      customLabel: body.customLabel
        ? String(body.customLabel).trim().slice(0, 24)
        : prev?.customLabel,
      updatedAt: now,
      hasFile: true,
      storedFile,
    };
    writeMemeManifest(manifest);
    broadcastAllSockets({ type: 'memes:updated', updatedAt: now });
    res.json({ ok: true, updatedAt: now });
  });

  app.delete('/api/admin/memes/:slotId', (req, res) => {
    if (!checkAdminPin(req)) {
      res.status(401).json({ error: 'Invalid Admin Passcode PIN.' });
      return;
    }
    const slotId = sanitizeSlotId(req.params.slotId);
    if (!slotId) {
      res.status(400).json({ error: 'Invalid meme slot ID.' });
      return;
    }
    const manifest = readMemeManifest();
    const prev = manifest[slotId];
    if (prev?.storedFile) {
      const p = path.join(MEME_STORAGE_DIR, path.basename(prev.storedFile));
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
    delete manifest[slotId];
    writeMemeManifest(manifest);
    broadcastAllSockets({ type: 'memes:updated', updatedAt: Date.now() });
    res.json({ ok: true });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const publicPath = path.resolve(__dirname, 'public');
    if (fs.existsSync(publicPath)) {
      app.use(express.static(publicPath));
    }
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Ke Batpar server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
