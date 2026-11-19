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
} from '../shared/types';
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
} from '../shared/mapData';
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
} from '../shared/gameRules';
import {
  type BotBrainState,
  createBotBrainState,
  recordKillWitnesses,
  resetBotBrainsForMeeting,
  stepBotsMeeting,
  stepBotsPlaying,
} from '../shared/botAi';
import { resolveUniqueMultiplayerIdentity } from '../shared/banglaComedy';

const MAX_PLAYERS = MAX_MATCH_PLAYERS;
const RECONNECT_GRACE_MS = 20_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
  'Bhai ami Cha-er dokan e dudh-cha chini chara khachilam, kasam!',
  'Onek sus lagche kintu, aajke ke Batpar bolen toh!',
  'Current gelo ar amar matha ghuray gelo re mama!',
  'Ami DESCO te chora line check kortesilam, trust me bhai!',
  'Rickshaw garage er pashe ke jeno gap e douraisilo!',
  'Keu baje kotha bolben na, amar kache Tabiz o ache!',
  'Ami Fuchka Chottor e jhal fuchka khaitasilam, ekdom innocent!',
  'Hero Saloon e Hero-cut dite gesilam, keu fashayen na pls!',
  'Para Cricket Math e tape ball kheltesilam, 100% clean!',
  'Biyer Bari Pandal e Kacchi khaitasilam, Batpar okhane chilo naki?!',
  'Bhai amar net slow chilo tai daray chilam, Batpar na!',
];

const PAGOL_BANTER = [
  'Hehe ami toh kichui kori nai, amake Pukur e chubani diyen na pls!',
  'Ami shudhu pukur ghat e boshe chilam bhai, kothao jai nai!',
  'Amake size korle kintu boro bhul korben bhaiya!',
];

export function generateP2PRoomCode(length = 5): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function buildPeerIdForRoomCode(code: string): string {
  return `kebatpar-v1-${normalizeRoomCode(code)}`;
}

export interface P2PHostTransport {
  sendToClient: (clientId: string, msg: ServerMessage) => void;
  broadcast: (msg: ServerMessage) => void;
}

/**
 * Host-authoritative multiplayer room engine for zero-backend Room Code play
 * (used automatically on static hosting like Cloudflare Pages when no `/ws` server exists).
 */
export class P2PHostRoomEngine {
  public readonly roomCode: string;
  private phase: RoomSnapshot['phase'] = 'lobby';
  private players = new Map<string, PlayerState>();
  private clientToPlayer = new Map<string, string>();
  private playerToClient = new Map<string, string>();
  private botMemories = new Map<string, BotBrainState>();
  private footprintAccum = new Map<string, number>();
  private holdingFixMap = new Map<string, { valveId?: 'valve_cha' | 'valve_rickshaw' }>();
  private bodies: BodyMarker[] = [];
  private footprints: FootprintDot[] = [];
  private sabotage: RoomSnapshot['sabotage'] = createEmptySabotageState(SABOTAGE_INITIAL_LOCKOUT_SEC);
  private doorLocks: DoorLockState = makeEmptyDoorLocks();
  private chat: ChatMessage[] = [];
  private lobbyChat: ChatMessage[] = [];
  private lobbyCountdownSec: number | null = null;
  private lobbyCountdownTimer = 0;
  private lastLobbyChatAt = new Map<string, number>();
  private playerReconnectTokens = new Map<string, string>();
  private disconnectedSlots = new Map<string, { player: PlayerState; expiresAt: number }>();
  private meetingCallerId: string | null = null;
  private meetingReason: 'body' | 'emergency' | null = null;
  private meetingTimer = 0;
  private discussionTimer = 0;
  private phaseTimer = 0;
  private emergencyCooldownRemaining = 0;
  private ejection: RoomSnapshot['ejection'] = null;
  private justEjectedPlayer: PlayerState | null = null;
  private outcome: RoomSnapshot['outcome'] = null;
  private netaRevealedId: string | null = null;
  private prankedLampUntil = 0;
  private settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  private transport: P2PHostTransport;

  constructor(roomCode: string, transport: P2PHostTransport) {
    this.roomCode = normalizeRoomCode(roomCode) || generateP2PRoomCode();
    this.transport = transport;
  }

  public getSnapshot(): RoomSnapshot {
    const players = Array.from(this.players.values());
    const taskStats = computeTaskProgress(players);
    return {
      roomCode: this.roomCode,
      isSolo: false,
      phase: this.phase,
      players: players.map((p) => ({ ...p, tasks: p.tasks.map((t) => ({ ...t })) })),
      bodies: this.bodies.map((b) => ({ ...b })),
      footprints: this.footprints.map((f) => ({ ...f })),
      sabotage: {
        ...this.sabotage,
        valves: this.sabotage.valves.map((v) => ({ ...v })),
      },
      doorLocks: { ...this.doorLocks },
      chat: this.chat.slice(-40),
      lobbyChat: this.lobbyChat.slice(-40),
      lobbyCountdownSec: this.lobbyCountdownSec,
      meetingCallerId: this.meetingCallerId,
      meetingReason: this.meetingReason,
      meetingTimer: Math.max(0, Math.ceil(this.meetingTimer)),
      discussionTimer: Math.max(0, Math.ceil(this.discussionTimer)),
      emergencyCooldownRemaining: Math.max(0, Math.ceil(this.emergencyCooldownRemaining)),
      ejection: this.ejection,
      outcome: this.outcome,
      settings: { ...this.settings },
      taskProgress: taskStats.progress,
      totalTasks: taskStats.totalTasks,
      completedTasks: taskStats.completedTasks,
      netaRevealedId: this.netaRevealedId,
      prankedLampUntil: this.prankedLampUntil,
    };
  }

  public hasHumanClients(): boolean {
    return this.clientToPlayer.size > 0;
  }

  public getRoomSummary(): PublicRoomSummary {
    const players = Array.from(this.players.values());
    const host = players.find((p) => p.isHost) ?? players.find((p) => !p.isBot) ?? players[0];
    return {
      roomCode: this.roomCode,
      hostName: host?.name ?? 'Host',
      playerCount: players.length,
      maxPlayers: MAX_PLAYERS,
      phase: this.phase,
    };
  }

  private pickAvailableColor(preferred?: PlayerColorId): PlayerColorId {
    const used = new Set(Array.from(this.players.values()).map((p) => p.color));
    if (preferred && !used.has(preferred)) return preferred;
    for (const spec of PLAYER_COLORS) {
      if (!used.has(spec.id)) return spec.id;
    }
    return PLAYER_COLORS[this.players.size % PLAYER_COLORS.length].id;
  }

  private broadcastState(msg?: ServerMessage): void {
    if (msg) {
      this.transport.broadcast(msg);
      return;
    }
    const baseSnap = this.getSnapshot();
    for (const [playerId, clientId] of this.playerToClient.entries()) {
      this.transport.sendToClient(clientId, {
        type: 'room:state',
        snapshot: redactSnapshotForPlayer(baseSnap, playerId),
      });
    }
  }

  private sendToPlayer(playerId: string, msg: ServerMessage): void {
    const cid = this.playerToClient.get(playerId);
    if (cid) {
      this.transport.sendToClient(cid, msg);
    }
  }

  private pushSystemChat(text: string): void {
    this.chat.push({
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderId: 'system',
      senderName: 'Moholla Announcement',
      senderColor: 'holud',
      text,
      timestamp: Date.now(),
      system: true,
    });
  }

  private recordFootprint(p: PlayerState, distMoved: number): void {
    if (!p.alive || p.inVent || distMoved < 0.05) return;
    const prev = (this.footprintAccum.get(p.id) ?? 0) + distMoved;
    if (prev >= 2.2) {
      this.footprintAccum.set(p.id, 0);
      this.footprints.push({
        id: `fp_${Date.now()}_${p.id}_${Math.random().toString(36).slice(2, 5)}`,
        x: p.x,
        z: p.z,
        color: p.disguiseColor ?? p.color,
        expiresAt: Date.now() + 7500,
      });
      if (this.footprints.length > 36) {
        this.footprints.shift();
      }
    } else {
      this.footprintAccum.set(p.id, prev);
    }
  }

  private pruneExpiredReconnectSlots(): void {
    const now = Date.now();
    for (const [token, entry] of this.disconnectedSlots.entries()) {
      if (entry.expiresAt <= now) {
        this.disconnectedSlots.delete(token);
      }
    }
  }

  private cancelLobbyCountdown(): void {
    if (this.lobbyCountdownSec !== null || this.lobbyCountdownTimer > 0) {
      this.lobbyCountdownSec = null;
      this.lobbyCountdownTimer = 0;
    }
  }

  private spawnBotPlayer(): boolean {
    if (this.players.size >= MAX_PLAYERS) return false;
    const botId = `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const sp = SPAWN_RING[this.players.size % SPAWN_RING.length];
    const botCandidate = BOT_NAMES[this.players.size % BOT_NAMES.length];
    const botIdentity = resolveUniqueMultiplayerIdentity(
      botCandidate,
      undefined,
      Array.from(this.players.values()),
    );
    const existingNames = Array.from(this.players.values()).map((p) => p.name);
    this.players.set(
      botId,
      makeDefaultPlayerState({
        id: botId,
        name: sanitizePlayerName(botIdentity.name, existingNames),
        color: this.pickAvailableColor(botIdentity.color),
        x: sp.x,
        z: sp.z,
        yaw: sp.yaw,
        isBot: true,
        isHost: false,
        ready: true,
        emergencyMeetingsLeft: this.settings.emergencyMeetingsPerPlayer,
      }),
    );
    return true;
  }

  public addClient(
    clientId: string,
    name: string,
    color: PlayerColorId,
    isHost = false,
    reconnectToken?: string,
  ): boolean {
    this.pruneExpiredReconnectSlots();

    if (!isHost && reconnectToken && this.disconnectedSlots.has(reconnectToken)) {
      const reserved = this.disconnectedSlots.get(reconnectToken)!;
      this.disconnectedSlots.delete(reconnectToken);
      const existingNames = Array.from(this.players.values()).map((p) => p.name);
      const restored: PlayerState = {
        ...reserved.player,
        isHost: false,
        ready: this.phase === 'lobby' ? false : reserved.player.ready,
        name: sanitizePlayerName(reserved.player.name, existingNames),
        color: this.pickAvailableColor(reserved.player.color),
        tasks: reserved.player.tasks.map((t) => ({ ...t })),
      };
      this.players.set(restored.id, restored);
      this.clientToPlayer.set(clientId, restored.id);
      this.playerToClient.set(restored.id, clientId);
      this.playerReconnectTokens.set(restored.id, reconnectToken);

      const snapshot = this.getSnapshot();
      this.transport.sendToClient(clientId, {
        type: 'room:joined',
        playerId: restored.id,
        snapshot: redactSnapshotForPlayer(snapshot, restored.id),
        reconnectToken,
      });
      this.broadcastState({ type: 'sfx:event', kind: 'lobby_join' });
      this.broadcastState();
      return true;
    }

    if (!isHost) {
      if (this.phase !== 'lobby' || this.lobbyCountdownSec !== null) {
        this.transport.sendToClient(clientId, {
          type: 'room:error',
          message: 'Khela shuru hoye gese! Match already in progress.',
        });
        return false;
      }
      if (this.players.size + this.disconnectedSlots.size >= MAX_PLAYERS) {
        this.transport.sendToClient(clientId, {
          type: 'room:error',
          message: 'Room bhorti! Max 8 jon (room is full).',
        });
        return false;
      }
    }

    const playerId = isHost
      ? 'pl_host'
      : `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const issuedToken = `rc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const sp = SPAWN_RING[this.players.size % SPAWN_RING.length];
    const resolvedIdentity = resolveUniqueMultiplayerIdentity(
      name,
      color,
      Array.from(this.players.values()),
    );
    const existingNames = Array.from(this.players.values()).map((p) => p.name);
    const uniqueName = sanitizePlayerName(resolvedIdentity.name, existingNames);

    const player: PlayerState = makeDefaultPlayerState({
      id: playerId,
      name: uniqueName,
      color: this.pickAvailableColor(resolvedIdentity.color),
      x: sp.x,
      z: sp.z,
      yaw: sp.yaw,
      isBot: false,
      isHost,
      ready: isHost,
      emergencyMeetingsLeft: this.settings.emergencyMeetingsPerPlayer,
    });

    this.players.set(playerId, player);
    this.clientToPlayer.set(clientId, playerId);
    this.playerToClient.set(playerId, clientId);
    this.playerReconnectTokens.set(playerId, issuedToken);

    const snapshot = this.getSnapshot();
    this.transport.sendToClient(clientId, {
      type: 'room:joined',
      playerId,
      snapshot: redactSnapshotForPlayer(snapshot, playerId),
      reconnectToken: issuedToken,
    });
    if (!isHost) {
      this.broadcastState({ type: 'sfx:event', kind: 'lobby_join' });
    }
    this.broadcastState();
    return true;
  }

  public removeClient(clientId: string, intentional = false): void {
    const playerId = this.clientToPlayer.get(clientId);
    if (!playerId) return;
    const oldPlayer = this.players.get(playerId);
    const wasHost = oldPlayer?.isHost ?? false;
    const token = this.playerReconnectTokens.get(playerId);

    this.clientToPlayer.delete(clientId);
    this.playerToClient.delete(playerId);
    this.holdingFixMap.delete(playerId);
    this.players.delete(playerId);

    if (this.clientToPlayer.size === 0) {
      this.disconnectedSlots.clear();
      return;
    }

    if (!intentional && oldPlayer && token) {
      this.disconnectedSlots.set(token, {
        player: {
          ...oldPlayer,
          isHost: false,
          ready: false,
          tasks: oldPlayer.tasks.map((t) => ({ ...t })),
        },
        expiresAt: Date.now() + RECONNECT_GRACE_MS,
      });
    } else {
      this.playerReconnectTokens.delete(playerId);
    }

    if (wasHost) {
      const nextHuman = Array.from(this.players.values()).find((p) => !p.isBot);
      if (nextHuman) {
        nextHuman.isHost = true;
        nextHuman.ready = true;
      }
    }

    if (this.phase === 'lobby') {
      if (intentional && this.settings.autoFillBots && this.players.size < MAX_PLAYERS) {
        this.spawnBotPlayer();
      }
      if (!canStartLobbyMatch(Array.from(this.players.values())).ok) {
        this.cancelLobbyCountdown();
      }
    }

    this.broadcastState();
  }

  private checkWin(sabotageExpired = false): boolean {
    const players = Array.from(this.players.values());
    const stats = computeTaskProgress(players);
    const outcome = evaluateMatchOutcome(
      players,
      stats.progress,
      sabotageExpired,
      this.justEjectedPlayer,
    );
    if (outcome) {
      this.outcome = outcome;
      this.phase = 'gameover';
      this.broadcastState();
      return true;
    }
    return false;
  }

  private startMatch(): void {
    const playerList = Array.from(this.players.values());
    if (!canStartLobbyMatch(playerList).ok) return;
    this.cancelLobbyCountdown();
    this.disconnectedSlots.clear();
    this.settings = sanitizeSoloConfig(playerList.length, this.settings).settings;

    let assigned = assignRoles(playerList, this.settings.vondoCount);
    assigned = assignSpecialRoles(
      assigned,
      this.settings.enableSpecialRoles,
      undefined,
      undefined,
      Math.random,
      this.settings.enableNeutralRoles,
    );
    assignMatchTasks(assigned, this.settings.tasksPerPlayer);
    this.bodies = [];
    this.footprints = [];
    this.footprintAccum.clear();
    this.holdingFixMap.clear();
    this.chat = [];
    this.ejection = null;
    this.justEjectedPlayer = null;
    this.outcome = null;
    this.meetingCallerId = null;
    this.meetingReason = null;
    this.netaRevealedId = null;
    this.prankedLampUntil = 0;
    this.doorLocks = makeEmptyDoorLocks();
    this.emergencyCooldownRemaining = this.settings.emergencyCooldownSec;
    this.sabotage = createEmptySabotageState(SABOTAGE_INITIAL_LOCKOUT_SEC);

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
          ? this.settings.emergencyMeetingsPerPlayer + 1
          : this.settings.emergencyMeetingsPerPlayer;
      p.killCooldownRemaining = p.role === 'vondo' ? INITIAL_KILL_COOLDOWN_SEC : 0;
      this.players.set(p.id, p);
    });

    this.phase = 'role_reveal';
    this.phaseTimer = 8.0;
    this.pushSystemChat('Khela shuru! Para tasks shesh koro ba Batpar ke Pukur e felo!');
    this.broadcastState();
  }

  private startMeeting(caller: PlayerState, reason: 'body' | 'emergency', victimName?: string): void {
    if (this.phase !== 'playing') return;
    this.phase = 'meeting';
    this.meetingCallerId = caller.id;
    this.meetingReason = reason;
    this.discussionTimer = this.settings.discussionTimeSec;
    this.meetingTimer = this.settings.meetingTimeSec;
    this.ejection = null;
    this.justEjectedPlayer = null;
    this.footprints = [];
    this.holdingFixMap.clear();
    if (isCriticalSabotage(this.sabotage.active)) {
      this.sabotage = createEmptySabotageState(SABOTAGE_COOLDOWN_SEC);
    } else {
      this.sabotage.fixProgress = 0;
      this.sabotage.fixerId = null;
    }
    this.doorLocks = makeEmptyDoorLocks();

    for (const p of this.players.values()) {
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

    if (!this.netaRevealedId) {
      const aliveNeta = Array.from(this.players.values()).find(
        (p) => p.alive && p.specialRole === 'neta',
      );
      if (aliveNeta) {
        this.netaRevealedId = aliveNeta.id;
        this.pushSystemChat(
          `${aliveNeta.name} mohollar Neta (Mayor) — tar Shalish vote 2x hisebe count hobe!`,
        );
      }
    }

    resetBotBrainsForMeeting(this.botMemories);

    if (reason === 'body') {
      this.pushSystemChat(`${caller.name} found ${victimName ?? 'a fallen neighbor'}! Adda called!`);
    } else {
      this.pushSystemChat(`${caller.name} rang the Adda Bell! Urgent Moholla meeting!`);
    }

    this.broadcastState({ type: 'sfx:event', kind: reason === 'body' ? 'report' : 'meeting' });
    this.broadcastState();
  }

  private resolveMeetingVotes(): void {
    const players = Array.from(this.players.values());
    this.ejection = tallyVotes(players, this.settings.confirmEjects);
    this.phase = 'vote_results';
    this.phaseTimer = 2.6;
    this.broadcastState();
  }

  private updateBots(dt: number): void {
    const players = Array.from(this.players.values());
    if (this.phase === 'playing') {
      stepBotsPlaying({
        players,
        bodies: this.bodies,
        sabotage: this.sabotage,
        doorLocks: this.doorLocks,
        settings: this.settings,
        holdingFixMap: this.holdingFixMap,
        brains: this.botMemories,
        dt,
        nowMs: Date.now(),
        onFootprint: (p, distMoved) => this.recordFootprint(p, distMoved),
        onReportBody: (reporter, body) => this.startMeeting(reporter, 'body', body.victimName),
        onKill: (_killer, victim, shieldBlocked) => {
          if (shieldBlocked) {
            this.broadcastState({ type: 'sfx:event', kind: 'shield' });
            this.sendToPlayer(victim.id, {
              type: 'clue:result',
              title: 'Tabiz Saved You!',
              detail: 'Ekjon Batpar tomake gap e nite chaisilo, kintu Tabiz shield bachay dise!',
            });
          } else {
            this.broadcastState({ type: 'sfx:event', kind: 'kill' });
          }
        },
        onSabotage: () => this.broadcastState({ type: 'sfx:event', kind: 'sabotage' }),
        onDoorLock: (zoneId) => {
          this.doorLocks[zoneId] = DOOR_LOCK_DURATION_SEC;
          this.doorLocks.cooldownRemaining = DOOR_LOCK_COOLDOWN_SEC;
          this.broadcastState({ type: 'sfx:event', kind: 'door' });
        },
        onRevive: () => this.broadcastState({ type: 'sfx:event', kind: 'revive' }),
        onTaskCompletedCheckWin: () => this.checkWin(),
      });
    } else if (this.phase === 'meeting') {
      stepBotsMeeting({
        players,
        bodies: this.bodies,
        discussionTimer: this.discussionTimer,
        brains: this.botMemories,
        dt,
        onChat: (p, text) => {
          this.chat.push({
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

  public step(dt: number): void {
    if (this.phase === 'lobby') {
      this.pruneExpiredReconnectSlots();
      if (this.lobbyCountdownSec !== null) {
        this.lobbyCountdownTimer -= dt;
        const nextSec = Math.max(0, Math.ceil(this.lobbyCountdownTimer));
        if (nextSec > 0 && nextSec !== this.lobbyCountdownSec) {
          this.lobbyCountdownSec = nextSec;
          this.broadcastState({ type: 'sfx:event', kind: 'lobby_tick' });
          this.broadcastState();
        }
        if (this.lobbyCountdownTimer <= 0) {
          this.lobbyCountdownSec = null;
          this.lobbyCountdownTimer = 0;
          this.broadcastState({ type: 'sfx:event', kind: 'lobby_start' });
          this.startMatch();
        }
      }
    } else if (this.phase === 'role_reveal') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'playing';
        this.broadcastState();
      }
    } else if (this.phase === 'playing') {
      const nowMs = Date.now();
      this.footprints = this.footprints.filter((f) => f.expiresAt > nowMs);
      for (const p of this.players.values()) {
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
          const jRes = stepJharudarChannel(p, this.bodies, dt);
          if (jRes.completedBody) {
            this.bodies = this.bodies.filter((b) => b.id !== jRes.completedBody!.id);
            this.sendToPlayer(p.id, { type: 'sfx:event', kind: 'clean' });
            this.sendToPlayer(p.id, {
              type: 'clue:result',
              title: 'Lash Gayeb!',
              detail: `Cleaned ${jRes.completedBody.victimName}'s body — nobody can report it now!`,
            });
          } else if (jRes.cancelled) {
            this.sendToPlayer(p.id, {
              type: 'clue:result',
              title: 'Clean Cancelled',
              detail: 'Tumi shoray geso ba lash report hoye gese!',
            });
          }
        }
      }
      if (this.emergencyCooldownRemaining > 0) {
        this.emergencyCooldownRemaining = Math.max(0, this.emergencyCooldownRemaining - dt);
      }
      if (this.doorLocks.cooldownRemaining > 0) {
        this.doorLocks.cooldownRemaining = Math.max(0, this.doorLocks.cooldownRemaining - dt);
      }
      this.doorLocks.cha_dokan = Math.max(0, this.doorLocks.cha_dokan - dt);
      this.doorLocks.rickshaw_garage = Math.max(0, this.doorLocks.rickshaw_garage - dt);
      this.doorLocks.desco_power = Math.max(0, this.doorLocks.desco_power - dt);
      this.doorLocks.dish_roof = Math.max(0, this.doorLocks.dish_roof - dt);

      for (const hid of Array.from(this.holdingFixMap.keys())) {
        const hp = this.players.get(hid);
        if (!hp || !hp.alive || hp.isBot) {
          this.holdingFixMap.delete(hid);
        }
      }

      this.updateBots(dt);
      if (this.phase !== 'playing') return;

      const sabStep = advanceSabotageState(
        this.sabotage,
        Array.from(this.players.values()),
        dt,
        this.holdingFixMap,
      );
      if (sabStep.fixed) {
        this.holdingFixMap.clear();
        this.broadcastState({ type: 'sfx:event', kind: 'task' });
      } else if (sabStep.expiredCritical) {
        this.holdingFixMap.clear();
        this.checkWin(true);
        return;
      } else if (sabStep.expiredNonCriticalType) {
        this.holdingFixMap.clear();
        this.pushSystemChat(
          sabStep.expiredNonCriticalType === 'loadshedding'
            ? 'Current ashche! DESCO line nijei thik hoye gese!'
            : 'Wi-Fi ashche! Dish line abar chaloo hoye gese!',
        );
      }
      this.broadcastState();
    } else if (this.phase === 'meeting') {
      this.updateBots(dt);
      if (this.discussionTimer > 0) {
        this.discussionTimer = Math.max(0, this.discussionTimer - dt);
        this.broadcastState();
      } else {
        this.meetingTimer -= dt;
        const alivePlayers = Array.from(this.players.values()).filter((p) => p.alive);
        const allVoted = alivePlayers.length > 0 && alivePlayers.every((p) => p.hasVoted);
        if (allVoted || this.meetingTimer <= 0) {
          this.resolveMeetingVotes();
        } else {
          this.broadcastState();
        }
      }
    } else if (this.phase === 'vote_results') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.justEjectedPlayer = null;
        if (this.ejection?.ejectedId) {
          const ejected = this.players.get(this.ejection.ejectedId);
          if (ejected) {
            ejected.alive = false;
            this.justEjectedPlayer = ejected;
          }
        }
        this.bodies = [];
        this.phase = 'ejecting';
        this.phaseTimer = this.ejection?.reason === 'voted' ? 7.5 : 5.0;
        if (this.ejection?.reason === 'voted' && this.ejection.ejectedId) {
          this.broadcastState({ type: 'sfx:event', kind: 'eject' });
        }
        this.broadcastState();
      }
    } else if (this.phase === 'ejecting') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (!this.checkWin()) {
          this.justEjectedPlayer = null;
          let idx = 0;
          for (const p of this.players.values()) {
            const sp = SPAWN_RING[idx % SPAWN_RING.length];
            p.x = sp.x;
            p.z = sp.z;
            p.yaw = sp.yaw;
            p.hasVoted = false;
            p.votedFor = null;
            if (p.role === 'vondo') {
              p.killCooldownRemaining = this.settings.killCooldownSec;
            }
            idx++;
          }
          this.emergencyCooldownRemaining = this.settings.emergencyCooldownSec;
          this.phase = 'playing';
          this.broadcastState();
        }
      }
    }
  }

  public handleMessage(clientId: string, msg: ClientMessage): void {
    if (msg.type === 'room:join') {
      const targetCode = normalizeRoomCode(msg.roomCode);
      if (targetCode !== this.roomCode) {
        this.transport.sendToClient(clientId, {
          type: 'room:error',
          message: `Ei code e kono room nai (${targetCode} not found).`,
        });
        return;
      }
      this.addClient(clientId, msg.name, msg.color, false, msg.reconnectToken);
      return;
    }

    if (msg.type === 'room:leave') {
      this.removeClient(clientId, true);
      return;
    }

    const playerId = this.clientToPlayer.get(clientId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case 'lobby:settings': {
        if (!player.isHost || this.phase !== 'lobby') return;
        const sanitized = sanitizeSoloConfig(
          Math.max(MIN_MATCH_PLAYERS, this.players.size),
          { ...this.settings, ...msg.settings },
        );
        this.settings = sanitized.settings;
        this.broadcastState();
        break;
      }
      case 'lobby:customize': {
        if (this.phase !== 'lobby') return;
        if (typeof msg.name === 'string') {
          const otherNames = Array.from(this.players.values())
            .filter((p) => p.id !== player.id)
            .map((p) => p.name);
          player.name = sanitizePlayerName(msg.name, otherNames);
        }
        if (
          msg.color &&
          !Array.from(this.players.values()).some((p) => p.id !== player.id && p.color === msg.color)
        ) {
          player.color = msg.color;
        }
        this.broadcastState();
        break;
      }
      case 'lobby:ready': {
        if (this.phase !== 'lobby' || player.isHost || player.isBot) return;
        player.ready = Boolean(msg.ready);
        if (!player.ready) {
          this.cancelLobbyCountdown();
        }
        this.broadcastState({ type: 'sfx:event', kind: 'lobby_ready' });
        this.broadcastState();
        break;
      }
      case 'lobby:kick': {
        if (!player.isHost || this.phase !== 'lobby') return;
        const target = this.players.get(msg.targetPlayerId);
        if (!target || target.id === player.id) return;
        if (target.isBot) {
          this.players.delete(target.id);
        } else {
          const targetCid = this.playerToClient.get(target.id);
          if (targetCid) {
            this.transport.sendToClient(targetCid, {
              type: 'room:kicked',
              message: 'Host tomake room theke kick korse.',
            });
            this.clientToPlayer.delete(targetCid);
          }
          this.playerToClient.delete(target.id);
          this.playerReconnectTokens.delete(target.id);
          this.players.delete(target.id);
        }
        if (!canStartLobbyMatch(Array.from(this.players.values())).ok) {
          this.cancelLobbyCountdown();
        }
        this.broadcastState();
        break;
      }
      case 'lobby:chat': {
        if (this.phase !== 'lobby') return;
        const now = Date.now();
        const prevAt = this.lastLobbyChatAt.get(player.id) ?? 0;
        if (now - prevAt < 500) return;
        const clean = msg.text.trim().slice(0, LOBBY_CHAT_MAX_CHARS);
        if (!clean) return;
        this.lastLobbyChatAt.set(player.id, now);
        this.lobbyChat.push({
          id: `lchat_${now}_${Math.random().toString(36).slice(2, 5)}`,
          senderId: player.id,
          senderName: player.name,
          senderColor: player.color,
          text: clean,
          timestamp: now,
        });
        if (this.lobbyChat.length > 40) {
          this.lobbyChat = this.lobbyChat.slice(-40);
        }
        this.broadcastState();
        break;
      }
      case 'lobby:add_bot': {
        if (!player.isHost || this.phase !== 'lobby' || this.players.size >= MAX_PLAYERS) return;
        if (this.spawnBotPlayer()) {
          this.broadcastState({ type: 'sfx:event', kind: 'lobby_join' });
          this.broadcastState();
        }
        break;
      }
      case 'lobby:remove_bot': {
        if (!player.isHost || this.phase !== 'lobby') return;
        let removed = false;
        if (msg.targetPlayerId) {
          const target = this.players.get(msg.targetPlayerId);
          if (target?.isBot) {
            this.players.delete(target.id);
            removed = true;
          }
        } else {
          const bots = Array.from(this.players.values()).filter((p) => p.isBot);
          const last = bots.at(-1);
          if (last) {
            this.players.delete(last.id);
            removed = true;
          }
        }
        if (removed) {
          if (!canStartLobbyMatch(Array.from(this.players.values())).ok) {
            this.cancelLobbyCountdown();
          }
          this.broadcastState();
        }
        break;
      }
      case 'lobby:remove_bots': {
        if (!player.isHost || this.phase !== 'lobby') return;
        for (const [id, pl] of this.players.entries()) {
          if (pl.isBot) this.players.delete(id);
        }
        this.cancelLobbyCountdown();
        this.broadcastState();
        break;
      }
      case 'lobby:start': {
        if (!player.isHost || this.phase !== 'lobby') return;
        const check = canStartLobbyMatch(Array.from(this.players.values()));
        if (!check.ok) {
          this.transport.sendToClient(clientId, {
            type: 'room:error',
            message: check.reason ?? `Aro players lagbe (min ${MIN_MATCH_PLAYERS})!`,
          });
          return;
        }
        if (this.lobbyCountdownSec === null) {
          this.lobbyCountdownSec = 5;
          this.lobbyCountdownTimer = 5.0;
          this.broadcastState({ type: 'sfx:event', kind: 'lobby_tick' });
          this.broadcastState();
        }
        break;
      }
      case 'lobby:cancel_start': {
        if (!player.isHost || this.phase !== 'lobby') return;
        this.cancelLobbyCountdown();
        this.broadcastState();
        break;
      }
      case 'player:move': {
        if (this.phase !== 'playing' && this.phase !== 'lobby') return;
        if (player.inVent) return;
        const resolved = player.alive
          ? resolveCircleWallCollision(msg.x, msg.z, PLAYER_RADIUS, WALLS, this.doorLocks)
          : { x: msg.x, z: msg.z };
        const moved = Math.hypot(resolved.x - player.x, resolved.z - player.z);
        player.x = resolved.x;
        player.z = resolved.z;
        player.vx = msg.vx;
        player.vz = msg.vz;
        player.yaw = msg.yaw;
        if (this.phase === 'playing') {
          this.recordFootprint(player, moved);
        } else if (this.phase === 'lobby') {
          this.broadcastState();
        }
        break;
      }
      case 'player:visual_task_start': {
        if (
          this.phase !== 'playing' ||
          !this.settings.visualTasks ||
          player.role !== 'parabasi' ||
          player.specialRole === 'pagol'
        ) {
          return;
        }
        player.visualTaskTimer = 3.0;
        this.broadcastState();
        break;
      }
      case 'player:task_complete': {
        if (this.phase !== 'playing') return;
        if (isTaskLockedBySabotage(msg.taskId, this.sabotage)) return;
        const station = TASK_STATIONS.find((s) => s.id === msg.taskId);
        if (!station || distance2D(player.x, player.z, station.x, station.z) > station.radius + 1.5) return;
        const taskItem = player.tasks.find((t) => t.taskId === msg.taskId);
        if (taskItem && !taskItem.completed) {
          taskItem.completed = true;
          if (canCompleteTasks(player) && !taskItem.isFake && station.isVisual && this.settings.visualTasks) {
            player.visualTaskTimer = 2.6;
          }
          this.transport.sendToClient(clientId, { type: 'sfx:event', kind: 'task' });
          if (!this.checkWin()) {
            this.broadcastState();
          }
        }
        break;
      }
      case 'player:use_ability': {
        if (this.phase !== 'playing') return;
        if (!player.alive) {
          if ((player.pranksLeft ?? 0) <= 0) {
            this.transport.sendToClient(clientId, {
              type: 'clue:result',
              title: 'Lamp Prank Used',
              detail: 'Ei round e lamp prank shesh — next Shalish er por abar parbe!',
            });
            return;
          }
          player.pranksLeft = 0;
          this.prankedLampUntil = Date.now() + 3500;
          this.broadcastState({ type: 'sfx:event', kind: 'prank' });
          this.transport.sendToClient(clientId, {
            type: 'clue:result',
            title: 'Moholla Lamp Flicker!',
            detail: 'Harmless ghost prank — streetlamps 3.5s flicker korche!',
          });
          this.broadcastState();
          return;
        }
        if (player.inVent) return;
        if (player.specialRole === 'goyenda') {
          const scan = executeGoyendaScan(player, this.bodies, Date.now());
          if (!scan.ok) {
            this.transport.sendToClient(clientId, {
              type: 'clue:result',
              title: 'Goyenda Scanner',
              detail:
                scan.reason === 'no_scans_left'
                  ? 'Shob forensic scan (2/2) shesh hoye gese!'
                  : 'Move near a fallen neighbor body to scan forensic clues.',
            });
            return;
          }
          this.transport.sendToClient(clientId, { type: 'sfx:event', kind: 'clue' });
          this.transport.sendToClient(clientId, {
            type: 'clue:result',
            title: scan.clue!.title,
            detail: scan.clue!.detail,
          });
          this.broadcastState();
          return;
        }
        if (player.specialRole === 'kobiraj') {
          if (player.abilityCooldown > 0.05) return;
          const nearby = msg.targetId
            ? this.players.get(msg.targetId)
            : findNearestShieldTarget(player, Array.from(this.players.values()));
          const receiver =
            nearby && nearby.alive && !nearby.inVent ? nearby : !player.shielded ? player : null;
          if (!receiver) return;
          receiver.shielded = true;
          player.abilityCooldown = KOBIRAJ_COOLDOWN_SEC;
          this.transport.sendToClient(clientId, { type: 'sfx:event', kind: 'shield' });
          this.transport.sendToClient(clientId, {
            type: 'clue:result',
            title: 'Tabiz Shield Active',
            detail:
              receiver.id === player.id
                ? 'You placed a protective Tabiz shield on yourself!'
                : `Protected ${receiver.name} with a Kobiraj Tabiz shield!`,
          });
          this.broadcastState();
          return;
        }
        if (player.specialRole === 'bohurupi') {
          if (player.disguiseTimer > 0 && (!msg.targetId || msg.targetId === player.id)) {
            player.disguiseColor = null;
            player.disguiseName = null;
            player.disguiseTimer = 0;
            this.broadcastState({ type: 'sfx:event', kind: 'disguise' });
            this.broadcastState();
            return;
          }
          if (player.abilityCooldown > 0.05) return;
          const candidates = Array.from(this.players.values()).filter(
            (p) => p.alive && p.id !== player.id && p.role !== 'vondo',
          );
          const chosen =
            (msg.targetId ? candidates.find((c) => c.id === msg.targetId) : candidates[0]) ?? candidates[0];
          if (!chosen) return;
          player.disguiseColor = chosen.color;
          player.disguiseName = chosen.name;
          player.disguiseTimer = BOHURUPI_DISGUISE_DURATION_SEC;
          player.abilityCooldown = BOHURUPI_COOLDOWN_SEC;
          this.broadcastState({ type: 'sfx:event', kind: 'disguise' });
          this.transport.sendToClient(clientId, {
            type: 'clue:result',
            title: 'Bohurupi Shapeshift',
            detail: `Disguised as ${chosen.name} for ${BOHURUPI_DISGUISE_DURATION_SEC}s!`,
          });
          this.broadcastState();
          return;
        }
        if (player.specialRole === 'daroga') {
          if ((player.shotsLeft ?? 1) <= 0) {
            this.transport.sendToClient(clientId, {
              type: 'clue:result',
              title: 'Para Daroga',
              detail: 'Tomar 1 ta Sheriff shot already use hoye gese!',
            });
            return;
          }
          if (player.abilityCooldown > 0.05) return;
          const target = msg.targetId
            ? this.players.get(msg.targetId)
            : findNearestDarogaTarget(player, Array.from(this.players.values()));
          if (!target) {
            this.transport.sendToClient(clientId, {
              type: 'clue:result',
              title: 'Para Daroga',
              detail: 'Move close to a suspect to make an Arrest Shot!',
            });
            return;
          }
          const res = resolveDarogaShot(player, target);
          if (!res.allowed) return;
          player.shotsLeft = Math.max(0, (player.shotsLeft ?? 1) - 1);
          this.broadcastState({ type: 'sfx:event', kind: 'daroga' });
          if (res.hitVondo) {
            target.alive = false;
            target.watchingCams = false;
            player.abilityCooldown = DAROGA_COOLDOWN_SEC;
            this.bodies.push({
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
            this.transport.sendToClient(clientId, {
              type: 'clue:result',
              title: 'Daroga Bullseye!',
              detail: `${target.name} CHILO ASLI BATPAR! Size kore diso!`,
            });
          } else {
            player.alive = false;
            player.watchingCams = false;
            this.bodies.push({
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
            this.transport.sendToClient(clientId, {
              type: 'clue:result',
              title: 'Daroga Misfire!',
              detail: `${target.name} niraparadh Para-basi chilo! Ulto tomar job gelo!`,
            });
          }
          if (!this.checkWin()) {
            this.broadcastState();
          }
          return;
        }
        if (player.specialRole === 'daktar') {
          if ((player.revivesLeft ?? 0) <= 0) return;
          const body = findNearestRevivableBody(player, this.bodies);
          if (!body) {
            this.transport.sendToClient(clientId, {
              type: 'clue:result',
              title: 'Para Daktar',
              detail: 'Move near an unreported fallen body to apply Saline!',
            });
            return;
          }
          const victim = this.players.get(body.victimId);
          if (!victim) return;
          this.bodies = this.bodies.filter((b) => b.id !== body.id);
          victim.alive = true;
          victim.x = body.x;
          victim.z = body.z;
          player.revivesLeft = Math.max(0, (player.revivesLeft ?? 1) - 1);
          player.abilityCooldown = 10;
          this.broadcastState({ type: 'sfx:event', kind: 'revive' });
          this.transport.sendToClient(clientId, {
            type: 'clue:result',
            title: 'Saline Revive Success!',
            detail: `${victim.name} ke Para Daktar bachaye tulsen!`,
          });
          this.broadcastState();
          return;
        }
        if (player.specialRole === 'jharudar') {
          if ((player.cleansLeft ?? JHARUDAR_CLEAN_USES) <= 0) {
            this.transport.sendToClient(clientId, {
              type: 'clue:result',
              title: 'Safai Batpar',
              detail: 'Shob clean (3/3) use hoye gese!',
            });
            return;
          }
          if (player.abilityCooldown > 0.05) return;
          const body = findNearestCleanableBody(player, this.bodies);
          if (!body) {
            this.transport.sendToClient(clientId, {
              type: 'clue:result',
              title: 'Safai Batpar',
              detail: 'Move near an unreported fallen body to clean it!',
            });
            return;
          }
          player.jharuTargetBodyId = body.id;
          player.jharuTimer = JHARUDAR_CLEAN_CHANNEL_SEC;
          this.transport.sendToClient(clientId, {
            type: 'clue:result',
            title: 'Jharu Dichhe...',
            detail: `Hold steady near ${body.victimName} for 2s to sweep the body!`,
          });
          this.broadcastState();
        }
        break;
      }
      case 'player:kill': {
        if (this.phase !== 'playing') return;
        const target = this.players.get(msg.targetId);
        if (!target) return;
        const check = canExecuteKill(player, target);
        if (!check.allowed) return;
        if (target.shielded) {
          target.shielded = false;
          player.killCooldownRemaining = 6;
          this.broadcastState({ type: 'sfx:event', kind: 'shield' });
          this.transport.sendToClient(clientId, {
            type: 'clue:result',
            title: 'Tabiz Shield Shattered!',
            detail: `${target.name} was protected by the Kobiraj!`,
          });
          this.sendToPlayer(target.id, {
            type: 'clue:result',
            title: 'Tabiz Saved You!',
            detail: 'Ekjon Batpar attack korsilo, kintu tomar Tabiz shield bachay dise!',
          });
          this.broadcastState();
          return;
        }
        target.alive = false;
        target.watchingCams = false;
        player.killCooldownRemaining = this.settings.killCooldownSec;
        player.x = target.x;
        player.z = target.z;
        this.bodies.push({
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
        this.broadcastState({ type: 'sfx:event', kind: 'kill' });
        recordKillWitnesses(
          this.botMemories,
          Array.from(this.players.values()),
          player,
          target,
          this.sabotage.active,
          this.doorLocks,
        );
        if (!this.checkWin()) {
          this.broadcastState();
        }
        break;
      }
      case 'player:vent_toggle': {
        if (this.phase !== 'playing' || !canUseVent(player)) return;
        const emitVentSfx = () => {
          if (player.specialRole === 'mistri') {
            for (const listener of this.players.values()) {
              if (!listener.isBot && isMistriVentAudibleTo(player, listener)) {
                this.sendToPlayer(listener.id, { type: 'sfx:event', kind: 'vent' });
              }
            }
          } else {
            this.broadcastState({ type: 'sfx:event', kind: 'vent' });
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
        this.broadcastState();
        break;
      }
      case 'player:sabotage': {
        if (this.phase !== 'playing' || !player.alive || player.role !== 'vondo') return;
        if (this.sabotage.active || this.sabotage.cooldownRemaining > 0) return;
        this.sabotage = createSabotageState(msg.sabotageType, SABOTAGE_COOLDOWN_SEC);
        this.holdingFixMap.clear();
        this.broadcastState({ type: 'sfx:event', kind: 'sabotage' });
        this.broadcastState();
        break;
      }
      case 'player:lock_doors': {
        if (this.phase !== 'playing' || !player.alive || player.role !== 'vondo') return;
        if (this.doorLocks.cooldownRemaining > 0) return;
        this.doorLocks[msg.zoneId] = DOOR_LOCK_DURATION_SEC;
        this.doorLocks.cooldownRemaining = DOOR_LOCK_COOLDOWN_SEC;
        this.broadcastState({ type: 'sfx:event', kind: 'door' });
        this.broadcastState();
        break;
      }
      case 'player:watch_cams': {
        if (this.phase !== 'playing') return;
        player.watchingCams = msg.watching;
        this.broadcastState();
        break;
      }
      case 'player:fix_sabotage': {
        if (this.phase !== 'playing' || !player.alive || !this.sabotage.active) {
          this.holdingFixMap.delete(player.id);
          return;
        }
        if (msg.holding === false) {
          this.holdingFixMap.delete(player.id);
          return;
        }
        const range = player.specialRole === 'mistri' ? MISTRI_FIX_RANGE : SABOTAGE_FIX_RANGE;
        if (this.sabotage.active === 'gas_leak') {
          const nearValve = msg.valveId
            ? GAS_LEAK_VALVES.find((v) => v.id === msg.valveId && distance2D(player.x, player.z, v.x, v.z) <= range)
            : findNearestGasValve(player.x, player.z, this.sabotage, range);
          if (nearValve) {
            this.holdingFixMap.set(player.id, { valveId: nearValve.id });
          } else {
            this.holdingFixMap.delete(player.id);
          }
          break;
        }
        if (distance2D(player.x, player.z, this.sabotage.fixStationX, this.sabotage.fixStationZ) <= range) {
          this.holdingFixMap.set(player.id, {});
        } else {
          this.holdingFixMap.delete(player.id);
        }
        break;
      }
      case 'player:report_body': {
        if (this.phase !== 'playing' || !player.alive) return;
        const body = this.bodies.find((b) => b.id === msg.bodyId && !b.reported);
        if (!body) return;
        if (distance2D(player.x, player.z, body.x, body.z) > REPORT_RANGE + 1.0) return;
        if (!hasLineOfSight(player.x, player.z, body.x, body.z, WALLS, this.doorLocks)) return;
        body.reported = true;
        this.startMeeting(player, 'body', body.victimName);
        break;
      }
      case 'player:emergency_meeting': {
        if (
          this.phase !== 'playing' ||
          !player.alive ||
          isCriticalSabotage(this.sabotage.active) ||
          this.emergencyCooldownRemaining > 0 ||
          player.emergencyMeetingsLeft <= 0
        ) {
          return;
        }
        if (
          distance2D(player.x, player.z, EMERGENCY_BELL_POS.x, EMERGENCY_BELL_POS.z) <=
          EMERGENCY_BELL_POS.interactRadius
        ) {
          player.emergencyMeetingsLeft--;
          this.startMeeting(player, 'emergency');
        }
        break;
      }
      case 'meeting:chat': {
        if (this.phase !== 'meeting') return;
        const text = msg.text.trim().slice(0, 140);
        if (!text) return;
        this.chat.push({
          id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          senderId: player.id,
          senderName: player.alive ? player.name : `${player.name} (Ghost)`,
          senderColor: player.color,
          text,
          timestamp: Date.now(),
          ghostOnly: !player.alive,
        });
        this.broadcastState();
        break;
      }
      case 'meeting:vote': {
        if (this.phase !== 'meeting' || this.discussionTimer > 0 || !player.alive || player.hasVoted) {
          return;
        }
        player.votedFor = msg.targetId;
        player.hasVoted = true;
        this.broadcastState();
        break;
      }
      case 'player:meme_sfx': {
        const allowed = new Set(['vine_boom', 'bonk', 'sad_trombone', 'airhorn', 'dun_dun', 'chubani']);
        if (allowed.has(msg.memeId)) {
          this.broadcastState({ type: 'meme:play', memeId: msg.memeId });
        }
        break;
      }
      case 'room:play_again': {
        if (!player.isHost) return;
        this.phase = 'lobby';
        this.bodies = [];
        this.footprints = [];
        this.footprintAccum.clear();
        this.holdingFixMap.clear();
        this.chat = [];
        this.outcome = null;
        this.ejection = null;
        this.justEjectedPlayer = null;
        this.meetingCallerId = null;
        this.meetingReason = null;
        this.meetingTimer = 0;
        this.discussionTimer = 0;
        this.lobbyCountdownSec = null;
        this.netaRevealedId = null;
        this.prankedLampUntil = 0;
        this.emergencyCooldownRemaining = 0;
        this.sabotage = createEmptySabotageState(SABOTAGE_INITIAL_LOCKOUT_SEC);
        this.doorLocks = makeEmptyDoorLocks();
        let idx = 0;
        for (const p of this.players.values()) {
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
          p.emergencyMeetingsLeft = this.settings.emergencyMeetingsPerPlayer;
          p.ready = p.isHost || p.isBot;
          p.hasVoted = false;
          p.votedFor = null;
          idx++;
        }
        this.broadcastState();
        break;
      }
    }
  }
}
