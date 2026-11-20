import {
  PLAYER_COLORS,
  type DoorZoneId,
  type PlayerColorId,
  type PlayerState,
  type RoomSettings,
  type RoomSnapshot,
  type SabotageType,
  type SpecialRole,
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
  getZoneIdAt,
  getZoneNameAt,
  hasLineOfSight,
  resolveCircleWallCollision,
  resolvePlayerMoveWithElevation,
} from '../shared/mapData';
import {
  BOHURUPI_COOLDOWN_SEC,
  BOHURUPI_DISGUISE_DURATION_SEC,
  CCTV_KAKU_COOLDOWN_SEC,
  CHAMCHA_COOLDOWN_SEC,
  CHANDABAZ_COOLDOWN_SEC,
  CHANDABAZ_GOAL,
  DALAL_COOLDOWN_SEC,
  DALAL_JAM_DURATION_MS,
  DAROGA_COOLDOWN_SEC,
  DOOR_LOCK_COOLDOWN_SEC,
  DOOR_LOCK_DURATION_SEC,
  HATUR_COOLDOWN_SEC,
  HATUR_DURATION_MS,
  INITIAL_KILL_COOLDOWN_SEC,
  JHARUDAR_CLEAN_CHANNEL_SEC,
  JHARUDAR_CLEAN_COOLDOWN_SEC,
  JHARUDAR_CLEAN_USES,
  KOBIRAJ_COOLDOWN_SEC,
  LOBBY_CHAT_MAX_CHARS,
  MASTER_COOLDOWN_SEC,
  MAX_MATCH_PLAYERS,
  MIN_MATCH_PLAYERS,
  MISTRI_FIX_RANGE,
  MISTRI_VENT_COOLDOWN_SEC,
  REPORT_RANGE,
  SABOTAGE_COOLDOWN_SEC,
  SABOTAGE_FIX_RANGE,
  SABOTAGE_INITIAL_LOCKOUT_SEC,
  SUPARI_COOLDOWN_SEC,
  TIKTOK_COOLDOWN_SEC,
  TIKTOK_ZONE_GOAL,
  VENT_RANGE,
  advanceSabotageState,
  applyDalalBrokerJam,
  assignMatchTasks,
  assignRoles,
  assignSpecialRoles,
  canCompleteTasks,
  canExecuteKill,
  canStartLobbyMatch,
  canUseVent,
  collectChandaFromTarget,
  computeTaskProgress,
  createEmptySabotageState,
  createSabotageState,
  evaluateMatchOutcome,
  executeGoyendaScan,
  findGhotokPairCandidates,
  findGhotokPartnerOnDeath,
  findNearestChamchaPatron,
  findNearestChandabazTarget,
  findNearestCleanableBody,
  findNearestDarogaTarget,
  findNearestGasValve,
  findNearestHaturTarget,
  findNearestKillTarget,
  findNearestMasterTarget,
  findNearestReportableBody,
  findNearestRevivableBody,
  findNearestShieldTarget,
  getColorShadeHint,
  inspectPlayerTaskAuthenticity,
  isCriticalSabotage,
  isMistriVentAudibleTo,
  isNeutralRole,
  isPlayerShieldedNow,
  isTaskLockedBySabotage,
  makeDefaultPlayerState,
  makeEmptyDoorLocks,
  pickSupariContractTarget,
  recordTiktokReelInZone,
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
import { soundEngine } from '../audio/soundEngine';

const BOT_ROSTER: Array<{ name: string; color: PlayerColorId }> = [
  { name: 'Chacha Miah', color: 'holud' },
  { name: 'Babu Bhai', color: 'neel' },
  { name: 'Tuktuki Apa', color: 'beguni' },
  { name: 'Pintu Da', color: 'shobuj' },
  { name: 'Komola Kaku', color: 'komola' },
  { name: 'Kalo Ustad', color: 'kalo' },
  { name: 'Sada Dada', color: 'sada' },
  { name: 'Golapi Rani', color: 'golapi' },
  { name: 'Akashi Tara', color: 'akashi' },
  { name: 'Badami Mama', color: 'badami' },
  { name: 'Tute Chacha', color: 'tute' },
  { name: 'Jam Kaka', color: 'jam' },
  { name: 'Pata Bhai', color: 'olive' },
  { name: 'Shona Babu', color: 'tan' },
  { name: 'Lal Mia', color: 'lal' },
];

const BOT_CHAT_LINES = [
  'Bhai ami toh Cha-er dokan e shingara ar dudh-cha khaitasilam, kasam!',
  'Orey Batpar! Gap e niye kaure size kore dise re mama!',
  'DESCO er fuse box er pashe ke jeno douraisilo, onek sus lagche!',
  'Ami 100% innocent Para-basi, amar shoshur bari eidgah er pashe!',
  'Rickshaw garage e keu chilo? Dren er moddhe uki martasilo!',
  'Current gelo ar amader matha ghuray gelo bhai!',
  'Ektu thik kore bolen toh, aajke ke Batpar — chokh dekhei dhora jay!',
  'Ami Fuchka Chottor e tetul tok khaitasilam, shobai shakkhi!',
  'Hero Saloon e chul katte gesilam, keu amake fashayen na pls!',
  'Para Cricket Math er dugout er piche keu chup kore chilo!',
  'Dadu Pharmacy te Napa ante gesilam bhai, amar kache bill ache!',
  'Biyer Bari Pandal er Kacchi khaitasilam, Batpar okhane chilo naki?!',
  'Bhai amar ping high chilo tai daray chilam, ami Batpar na!',
];

const PAGOL_CHAT_LINES = [
  'Hehe ami toh kichui kori nai, amake Pukur e chubani diyen na pls!',
  'Ami shudhu pukur ghat e mach dhortesilam bhai, kothao jai nai!',
  'Amake size korle kintu shobai milia afsos korben bhaiya!',
];

export class SoloMatchEngine {
  public localPlayerId = 'local_hero';
  private snapshot: RoomSnapshot;
  private brains = new Map<string, BotBrainState>();
  private phaseTimer = 0;
  private lobbyCountdownTimer = 0;
  private lastLobbyChatAt = 0;
  private footprintAccum = new Map<string, number>();
  private justEjectedPlayer: PlayerState | null = null;
  private holdingFixMap = new Map<string, { valveId?: 'valve_cha' | 'valve_rickshaw' }>();
  private forcedRole?: 'parabasi' | 'vondo';
  private forcedSpecialRole?: SpecialRole;
  private botCounter = 10;
  public onClueNotice?: (title: string, detail: string) => void;

  constructor(
    playerName: string,
    playerColor: PlayerColorId,
    forceRole?: 'parabasi' | 'vondo',
    skipRoleReveal = false,
    forceSpecialRole?: SpecialRole,
    onClueNotice?: (title: string, detail: string) => void,
    customSettings?: Partial<RoomSettings>,
    requestedPlayerCount: number = 7,
  ) {
    this.onClueNotice = onClueNotice;
    this.forcedRole = forceRole;
    this.forcedSpecialRole = forceSpecialRole;
    const cleanName = sanitizePlayerName(playerName);
    const { playerCount, settings } = sanitizeSoloConfig(requestedPlayerCount, customSettings);
    const pickedOthers = BOT_ROSTER.filter((b) => b.color !== playerColor).slice(0, playerCount - 1);

    const rawPlayers: PlayerState[] = [
      makeDefaultPlayerState({
        id: this.localPlayerId,
        name: cleanName,
        color: playerColor,
        x: SPAWN_RING[0].x,
        z: SPAWN_RING[0].z,
        yaw: SPAWN_RING[0].yaw,
        isBot: false,
        isHost: true,
        ready: true,
        emergencyMeetingsLeft: settings.emergencyMeetingsPerPlayer,
      }),
      ...pickedOthers.map((b, i) =>
        makeDefaultPlayerState({
          id: `bot_${i + 1}`,
          name: b.name,
          color: b.color,
          x: SPAWN_RING[(i + 1) % SPAWN_RING.length].x,
          z: SPAWN_RING[(i + 1) % SPAWN_RING.length].z,
          yaw: SPAWN_RING[(i + 1) % SPAWN_RING.length].yaw,
          isBot: true,
          isHost: false,
          ready: true,
          emergencyMeetingsLeft: settings.emergencyMeetingsPerPlayer,
        }),
      ),
    ];

    this.snapshot = {
      roomCode: 'SOLO',
      isSolo: true,
      phase: 'lobby',
      players: rawPlayers,
      bodies: [],
      footprints: [],
      sabotage: createEmptySabotageState(SABOTAGE_INITIAL_LOCKOUT_SEC),
      doorLocks: makeEmptyDoorLocks(),
      chat: [],
      lobbyChat: [],
      lobbyCountdownSec: null,
      meetingCallerId: null,
      meetingReason: null,
      meetingTimer: 0,
      discussionTimer: 0,
      emergencyCooldownRemaining: 0,
      ejection: null,
      outcome: null,
      settings: { ...settings },
      taskProgress: 0,
      totalTasks: 0,
      completedTasks: 0,
      netaRevealedId: null,
      prankedLampUntil: 0,
      commsJammedUntil: 0,
      ghotokLinkedIds: null,
    };

    if (skipRoleReveal) {
      this.startMatchInternal(true);
    }
  }

  private startMatchInternal(skipRoleReveal = false): void {
    const check = canStartLobbyMatch(this.snapshot.players);
    if (!check.ok) {
      this.onClueNotice?.('Lobby', check.reason ?? 'Aro players lagbe!');
      return;
    }

    const effectiveBaseRole =
      this.forcedSpecialRole === 'bohurupi' ||
      this.forcedSpecialRole === 'jharudar' ||
      this.forcedSpecialRole === 'supari_killer' ||
      this.forcedSpecialRole === 'dalal'
        ? 'vondo'
        : this.forcedSpecialRole && this.forcedSpecialRole !== 'none'
          ? 'parabasi'
          : this.forcedRole;

    const sanitized = sanitizeSoloConfig(this.snapshot.players.length, this.snapshot.settings);
    this.snapshot.settings = sanitized.settings;

    let assigned = assignRoles(this.snapshot.players, sanitized.settings.vondoCount);
    if (effectiveBaseRole) {
      assigned = assigned.map((p, idx) => ({
        ...p,
        role:
          effectiveBaseRole === 'vondo'
            ? idx === 0
              ? 'vondo'
              : 'parabasi'
            : idx === 1
              ? 'vondo'
              : 'parabasi',
      }));
    }

    assigned = assignSpecialRoles(
      assigned,
      sanitized.settings.enableSpecialRoles,
      this.forcedSpecialRole,
      this.localPlayerId,
      Math.random,
      sanitized.settings.enableNeutralRoles,
    );

    assignMatchTasks(assigned, sanitized.settings.tasksPerPlayer);
    this.brains.clear();
    this.footprintAccum.clear();
    this.holdingFixMap.clear();
    this.justEjectedPlayer = null;

    assigned.forEach((p, idx) => {
      const sp = SPAWN_RING[idx % SPAWN_RING.length];
      p.x = sp.x;
      p.z = sp.z;
      p.y = 0;
      p.vx = 0;
      p.vz = 0;
      p.yaw = sp.yaw;
      p.alive = true;
      p.inVent = false;
      p.watchingCams = false;
      p.visualTaskTimer = 0;
      p.shielded = false;
      p.disguiseColor = null;
      p.disguiseName = null;
      p.disguiseTimer = 0;
      p.hasVoted = false;
      p.votedFor = null;
      p.killCooldownRemaining = p.role === 'vondo' ? INITIAL_KILL_COOLDOWN_SEC : 0;
      p.abilityCooldown =
        p.specialRole === 'bohurupi' ||
        p.specialRole === 'kobiraj' ||
        p.specialRole === 'daroga' ||
        p.specialRole === 'jharudar' ||
        p.specialRole === 'hatur_daktar' ||
        p.specialRole === 'dalal'
          ? 6
          : 0;
      p.revivesLeft = p.specialRole === 'daktar' ? 1 : 0;
      p.scansLeft = p.specialRole === 'goyenda' ? 2 : 0;
      p.shotsLeft = p.specialRole === 'daroga' ? 1 : 0;
      p.cleansLeft = p.specialRole === 'jharudar' ? 3 : 0;
      p.pranksLeft = 1;
      p.jharuTargetBodyId = null;
      p.jharuTimer = 0;
      p.haturProtectedUntil = 0;
      p.supariTargetId =
        p.specialRole === 'supari_killer' ? pickSupariContractTarget(p, assigned)?.id ?? null : null;
      p.chamchaPatronId = null;
      p.chandabazTargets = [];
      p.tiktokZones = [];
      p.ghotokPartnerId = null;
      p.emergencyMeetingsLeft =
        p.specialRole === 'neta'
          ? sanitized.settings.emergencyMeetingsPerPlayer + 1
          : sanitized.settings.emergencyMeetingsPerPlayer;
      if (p.isBot) {
        const brain = createBotBrainState();
        brain.lastX = p.x;
        brain.lastZ = p.z;
        this.brains.set(p.id, brain);
      }
    });

    const stats = computeTaskProgress(assigned);
    this.snapshot.players = assigned;
    this.snapshot.bodies = [];
    this.snapshot.footprints = [];
    this.snapshot.sabotage = createEmptySabotageState(SABOTAGE_INITIAL_LOCKOUT_SEC);
    this.snapshot.doorLocks = makeEmptyDoorLocks();
    this.snapshot.lobbyCountdownSec = null;
    this.lobbyCountdownTimer = 0;
    this.snapshot.meetingCallerId = null;
    this.snapshot.meetingReason = null;
    this.snapshot.meetingTimer = 0;
    this.snapshot.discussionTimer = 0;
    this.snapshot.emergencyCooldownRemaining = skipRoleReveal
      ? 0
      : sanitized.settings.emergencyCooldownSec;
    this.snapshot.ejection = null;
    this.snapshot.outcome = null;
    this.snapshot.netaRevealedId = null;
    this.snapshot.prankedLampUntil = 0;
    this.snapshot.commsJammedUntil = 0;
    this.snapshot.ghotokLinkedIds = null;
    this.snapshot.taskProgress = stats.progress;
    this.snapshot.totalTasks = stats.totalTasks;
    this.snapshot.completedTasks = stats.completedTasks;
    this.snapshot.chat = [
      {
        id: 'sys_start',
        senderId: 'system',
        senderName: 'Moholla Announcement',
        senderColor: 'holud',
        text: sanitized.settings.enableSpecialRoles
          ? 'Khela shuru! Special Moholla roles active — Batpar theke shabdhan!'
          : 'Khela shuru! Classic Moholla match — finish Para tasks or expose the Batpar in Shalish!',
        timestamp: Date.now(),
        system: true,
      },
    ];
    this.snapshot.phase = skipRoleReveal ? 'playing' : 'role_reveal';
    this.phaseTimer = skipRoleReveal ? 0 : 15.0;
  }

  public updateLobbySettings(partial: Partial<RoomSettings>): void {
    if (this.snapshot.phase !== 'lobby') return;
    const sanitized = sanitizeSoloConfig(
      Math.max(MIN_MATCH_PLAYERS, this.snapshot.players.length),
      { ...this.snapshot.settings, ...partial },
    );
    this.snapshot.settings = sanitized.settings;
  }

  public customizeLocal(name?: string, color?: PlayerColorId): void {
    if (this.snapshot.phase !== 'lobby') return;
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp) return;
    if (typeof name === 'string') {
      const otherNames = this.snapshot.players.filter((p) => p.id !== lp.id).map((p) => p.name);
      lp.name = sanitizePlayerName(name, otherNames);
    }
    if (color && !this.snapshot.players.some((p) => p.id !== lp.id && p.color === color)) {
      lp.color = color;
    }
  }

  public addBot(): void {
    if (this.snapshot.phase !== 'lobby' || this.snapshot.players.length >= MAX_MATCH_PLAYERS) return;
    const usedColors = new Set(this.snapshot.players.map((p) => p.color));
    const usedNames = this.snapshot.players.map((p) => p.name);
    const candidate =
      BOT_ROSTER.find((b) => !usedColors.has(b.color)) ??
      BOT_ROSTER[this.snapshot.players.length % BOT_ROSTER.length];
    const openColor = PLAYER_COLORS.find((c) => !usedColors.has(c.id))?.id ?? candidate.color;
    const idx = this.snapshot.players.length;
    const sp = SPAWN_RING[idx % SPAWN_RING.length];
    this.snapshot.players.push(
      makeDefaultPlayerState({
        id: `bot_${++this.botCounter}`,
        name: sanitizePlayerName(candidate.name, usedNames),
        color: openColor,
        x: sp.x,
        z: sp.z,
        yaw: sp.yaw,
        isBot: true,
        isHost: false,
        ready: true,
        emergencyMeetingsLeft: this.snapshot.settings.emergencyMeetingsPerPlayer,
      }),
    );
    soundEngine.playLobbyJoin(false);
  }

  public removeBot(targetPlayerId?: string): void {
    if (this.snapshot.phase !== 'lobby') return;
    const idx = targetPlayerId
      ? this.snapshot.players.findIndex((p) => p.id === targetPlayerId && p.isBot)
      : (() => {
          for (let i = this.snapshot.players.length - 1; i >= 0; i--) {
            if (this.snapshot.players[i].isBot) return i;
          }
          return -1;
        })();
    if (idx < 0) return;
    this.snapshot.players.splice(idx, 1);
    if (!canStartLobbyMatch(this.snapshot.players).ok) {
      this.cancelCountdown();
    }
    soundEngine.playLobbyJoin(true);
  }

  public removeBots(): void {
    if (this.snapshot.phase !== 'lobby') return;
    this.snapshot.players = this.snapshot.players.filter((p) => !p.isBot);
    this.cancelCountdown();
    soundEngine.playLobbyJoin(true);
  }

  public sendLobbyChat(text: string): void {
    if (this.snapshot.phase !== 'lobby') return;
    const now = Date.now();
    if (now - this.lastLobbyChatAt < 500) return;
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp) return;
    const clean = text.trim().slice(0, LOBBY_CHAT_MAX_CHARS);
    if (!clean) return;
    this.lastLobbyChatAt = now;
    const list = this.snapshot.lobbyChat ?? [];
    list.push({
      id: `lchat_${now}_${Math.random().toString(36).slice(2, 5)}`,
      senderId: lp.id,
      senderName: lp.name,
      senderColor: lp.color,
      text: clean,
      timestamp: now,
    });
    this.snapshot.lobbyChat = list.slice(-40);
  }

  public startCountdown(): boolean {
    if (this.snapshot.phase !== 'lobby') return false;
    const check = canStartLobbyMatch(this.snapshot.players);
    if (!check.ok) {
      this.onClueNotice?.('Start Blocked', check.reason ?? 'Aro players lagbe!');
      return false;
    }
    this.lobbyCountdownTimer = 5.0;
    this.snapshot.lobbyCountdownSec = 5;
    soundEngine.playLobbyTick();
    return true;
  }

  public cancelCountdown(): void {
    if (this.snapshot.lobbyCountdownSec !== null) {
      this.snapshot.lobbyCountdownSec = null;
      this.lobbyCountdownTimer = 0;
    }
  }

  public playAgainToLobby(): void {
    this.brains.clear();
    this.footprintAccum.clear();
    this.holdingFixMap.clear();
    this.justEjectedPlayer = null;
    this.snapshot.phase = 'lobby';
    this.snapshot.bodies = [];
    this.snapshot.footprints = [];
    this.snapshot.chat = [];
    this.snapshot.outcome = null;
    this.snapshot.ejection = null;
    this.snapshot.meetingCallerId = null;
    this.snapshot.meetingReason = null;
    this.snapshot.meetingTimer = 0;
    this.snapshot.discussionTimer = 0;
    this.snapshot.lobbyCountdownSec = null;
    this.lobbyCountdownTimer = 0;
    this.snapshot.netaRevealedId = null;
    this.snapshot.prankedLampUntil = 0;
    this.snapshot.commsJammedUntil = 0;
    this.snapshot.ghotokLinkedIds = null;
    this.snapshot.emergencyCooldownRemaining = 0;
    this.snapshot.sabotage = createEmptySabotageState(SABOTAGE_INITIAL_LOCKOUT_SEC);
    this.snapshot.doorLocks = makeEmptyDoorLocks();
    this.snapshot.players.forEach((p, idx) => {
      const sp = SPAWN_RING[idx % SPAWN_RING.length];
      p.x = sp.x;
      p.z = sp.z;
      p.y = 0;
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
      p.haturProtectedUntil = 0;
      p.supariTargetId = null;
      p.chamchaPatronId = null;
      p.chandabazTargets = [];
      p.tiktokZones = [];
      p.ghotokPartnerId = null;
      p.killCooldownRemaining = 0;
      p.emergencyMeetingsLeft = this.snapshot.settings.emergencyMeetingsPerPlayer;
      p.ready = true;
      p.hasVoted = false;
      p.votedFor = null;
    });
  }

  public dismissRoleReveal(): void {
    if (this.snapshot.phase === 'role_reveal') {
      this.snapshot.phase = 'playing';
      this.phaseTimer = 0;
    }
  }

  public dismissEjection(): void {
    if (this.snapshot.phase === 'ejecting') {
      this.phaseTimer = 0.01;
    }
  }

  public getSnapshot(): RoomSnapshot {
    const stats = computeTaskProgress(this.snapshot.players);
    return {
      ...this.snapshot,
      players: this.snapshot.players.map((p) => ({ ...p, tasks: p.tasks.map((t) => ({ ...t })) })),
      bodies: this.snapshot.bodies.map((b) => ({ ...b })),
      footprints: this.snapshot.footprints.map((f) => ({ ...f })),
      sabotage: {
        ...this.snapshot.sabotage,
        valves: this.snapshot.sabotage.valves.map((v) => ({ ...v })),
      },
      doorLocks: { ...this.snapshot.doorLocks },
      chat: [...this.snapshot.chat],
      lobbyChat: [...(this.snapshot.lobbyChat ?? [])],
      meetingTimer: Math.max(0, Math.ceil(this.snapshot.meetingTimer)),
      discussionTimer: Math.max(0, Math.ceil(this.snapshot.discussionTimer ?? 0)),
      emergencyCooldownRemaining: Math.max(0, Math.ceil(this.snapshot.emergencyCooldownRemaining)),
      taskProgress: stats.progress,
      totalTasks: stats.totalTasks,
      completedTasks: stats.completedTasks,
    };
  }

  private recordFootprint(p: PlayerState, distMoved: number): void {
    if (!p.alive || p.inVent || distMoved < 0.05) return;
    const prev = (this.footprintAccum.get(p.id) ?? 0) + distMoved;
    if (prev >= 2.2) {
      this.footprintAccum.set(p.id, 0);
      const shownColor = p.disguiseColor ?? p.color;
      this.snapshot.footprints.push({
        id: `fp_${Date.now()}_${p.id}_${Math.random().toString(36).slice(2, 5)}`,
        x: p.x,
        z: p.z,
        color: shownColor,
        expiresAt: Date.now() + 7500,
      });
      if (this.snapshot.footprints.length > 36) {
        this.snapshot.footprints.shift();
      }
    } else {
      this.footprintAccum.set(p.id, prev);
    }
  }

  public moveLocal(x: number, z: number, vx: number, vz: number, yaw: number, y?: number): void {
    if (this.snapshot.phase !== 'playing' && this.snapshot.phase !== 'lobby') return;
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp || lp.inVent) return;
    const prevY = lp.y ?? 0;
    const resolved = lp.alive
      ? resolvePlayerMoveWithElevation(
          lp.x,
          lp.z,
          y ?? prevY,
          x,
          z,
          PLAYER_RADIUS,
          WALLS,
          this.snapshot.doorLocks,
        )
      : { x, z, y: y ?? prevY };
    const moved = Math.hypot(resolved.x - lp.x, resolved.z - lp.z);
    lp.x = resolved.x;
    lp.z = resolved.z;
    lp.y = resolved.y;
    lp.vx = vx;
    lp.vz = vz;
    lp.yaw = yaw;
    if (this.snapshot.phase === 'playing') {
      this.recordFootprint(lp, moved);
    }
  }

  public setWatchingCams(watching: boolean): void {
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (lp) lp.watchingCams = watching;
  }

  public completeLocalTask(taskId: string): boolean {
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp) return false;
    if (isTaskLockedBySabotage(taskId, this.snapshot.sabotage)) return false;
    const st = TASK_STATIONS.find((s) => s.id === taskId);
    if (!st || distance2D(lp.x, lp.z, st.x, st.z) > st.radius + 1.5) return false;
    const t = lp.tasks.find((item) => item.taskId === taskId);
    if (!t || t.completed) return false;

    // Batpar fake tasks mark locally on their fake checklist ONLY — NO visual effect & NO team progress
    if (!canCompleteTasks(lp) || t.isFake) {
      t.completed = true;
      soundEngine.playTaskComplete();
      return false;
    }

    t.completed = true;
    if (st.isVisual && this.snapshot.settings.visualTasks) {
      lp.visualTaskTimer = 2.8;
    }
    soundEngine.playTaskComplete();
    this.checkWin();
    return true;
  }

  public useSpecialAbility(targetId?: string): void {
    if (this.snapshot.phase !== 'playing') return;
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp) return;

    if (!lp.alive) {
      if ((lp.pranksLeft ?? 0) <= 0) {
        this.onClueNotice?.('Lamp Prank Used', 'Ei round e lamp prank shesh — next Shalish er por abar parbe!');
        return;
      }
      lp.pranksLeft = 0;
      this.snapshot.prankedLampUntil = Date.now() + 3500;
      soundEngine.playDisguise();
      this.onClueNotice?.('Moholla Lamp Flicker!', 'Harmless ghost prank — streetlamps 3.5s flicker korche!');
      return;
    }

    if (lp.inVent) return;

    if (lp.specialRole === 'goyenda') {
      const scan = executeGoyendaScan(lp, this.snapshot.bodies, Date.now());
      if (!scan.ok) {
        this.onClueNotice?.(
          'Goyenda Scanner',
          scan.reason === 'no_scans_left'
            ? 'Shob forensic scan (2/2) shesh hoye gese!'
            : 'Move near a fallen neighbor body to scan forensic clues.',
        );
        return;
      }
      soundEngine.playClueScan();
      this.onClueNotice?.(scan.clue!.title, scan.clue!.detail);
      this.snapshot.chat.push({
        id: `clue_${Date.now()}`,
        senderId: 'system',
        senderName: 'Goyenda Notebook',
        senderColor: 'neel',
        text: `[${scan.clue!.title}] ${scan.clue!.detail}`,
        timestamp: Date.now(),
        system: true,
      });
      return;
    }

    if (lp.specialRole === 'kobiraj') {
      if (lp.abilityCooldown > 0.05) return;
      const nearby = targetId
        ? this.snapshot.players.find((p) => p.id === targetId && p.alive && !p.inVent)
        : findNearestShieldTarget(lp, this.snapshot.players);
      const receiver = nearby ?? (!lp.shielded ? lp : null);
      if (!receiver) return;
      receiver.shielded = true;
      lp.abilityCooldown = KOBIRAJ_COOLDOWN_SEC;
      soundEngine.playShieldBlock();
      this.onClueNotice?.(
        'Tabiz Shield Active',
        receiver.id === lp.id
          ? 'You placed a protective Tabiz shield on yourself!'
          : `Protected ${receiver.name} with a Kobiraj Tabiz shield!`,
      );
      return;
    }

    if (lp.specialRole === 'bohurupi') {
      if (lp.disguiseTimer > 0 && (!targetId || targetId === lp.id)) {
        lp.disguiseColor = null;
        lp.disguiseName = null;
        lp.disguiseTimer = 0;
        soundEngine.playDisguise();
        return;
      }
      if (lp.abilityCooldown > 0.05) return;
      const candidates = this.snapshot.players.filter(
        (p) => p.alive && p.id !== lp.id && p.role !== 'vondo',
      );
      const chosen =
        (targetId ? candidates.find((c) => c.id === targetId) : candidates[0]) ?? candidates[0];
      if (!chosen) return;
      lp.disguiseColor = chosen.color;
      lp.disguiseName = chosen.name;
      lp.disguiseTimer = BOHURUPI_DISGUISE_DURATION_SEC;
      lp.abilityCooldown = BOHURUPI_COOLDOWN_SEC;
      soundEngine.playDisguise();
      this.onClueNotice?.(
        'Bohurupi Shapeshift',
        `Disguised as ${chosen.name} for ${BOHURUPI_DISGUISE_DURATION_SEC}s!`,
      );
      return;
    }

    if (lp.specialRole === 'daroga') {
      if ((lp.shotsLeft ?? 1) <= 0) {
        this.onClueNotice?.('Para Daroga', 'Tomar 1 ta Sheriff shot already use hoye gese!');
        return;
      }
      if (lp.abilityCooldown > 0.05) return;
      const target = targetId
        ? this.snapshot.players.find((p) => p.id === targetId)
        : findNearestDarogaTarget(lp, this.snapshot.players);
      if (!target) {
        this.onClueNotice?.('Para Daroga', 'Move close to a suspect to make an Arrest Shot!');
        return;
      }
      const res = resolveDarogaShot(lp, target);
      if (!res.allowed) return;
      lp.shotsLeft = Math.max(0, (lp.shotsLeft ?? 1) - 1);
      soundEngine.playDarogaShot();
      if (res.hitVondo) {
        target.alive = false;
        target.watchingCams = false;
        lp.abilityCooldown = DAROGA_COOLDOWN_SEC;
        this.snapshot.bodies.push({
          id: `body_${Date.now()}_${target.id}`,
          victimId: target.id,
          victimName: target.name,
          color: target.color,
          x: target.x,
          z: target.z,
          reported: false,
          killedAt: Date.now(),
          killerColorHint: getColorShadeHint(lp.color),
          killerZoneHint: getZoneNameAt(target.x, target.z),
        });
        this.onClueNotice?.(
          'Daroga Bullseye!',
          `${target.name} CHILO ASLI BATPAR! Size kore diso!`,
        );
      } else {
        lp.alive = false;
        lp.watchingCams = false;
        this.snapshot.bodies.push({
          id: `body_${Date.now()}_${lp.id}`,
          victimId: lp.id,
          victimName: lp.name,
          color: lp.color,
          x: lp.x,
          z: lp.z,
          reported: false,
          killedAt: Date.now(),
          killerColorHint: getColorShadeHint(lp.color),
          killerZoneHint: getZoneNameAt(lp.x, lp.z),
        });
        this.onClueNotice?.(
          'Daroga Misfire!',
          `${target.name} niraparadh Para-basi chilo! Ulto tomar job gelo!`,
        );
      }
      this.handleDeathSideEffects(res.hitVondo ? target : lp);
      this.checkWin();
      return;
    }

    if (lp.specialRole === 'daktar') {
      if ((lp.revivesLeft ?? 0) <= 0) return;
      const body = findNearestRevivableBody(lp, this.snapshot.bodies);
      if (!body) {
        this.onClueNotice?.('Para Daktar', 'Move near an unreported fallen body to apply Saline!');
        return;
      }
      const victim = this.snapshot.players.find((p) => p.id === body.victimId);
      if (!victim) return;
      this.snapshot.bodies = this.snapshot.bodies.filter((b) => b.id !== body.id);
      victim.alive = true;
      victim.x = body.x;
      victim.z = body.z;
      lp.revivesLeft = Math.max(0, (lp.revivesLeft ?? 1) - 1);
      lp.abilityCooldown = 10;
      soundEngine.playRevive();
      this.onClueNotice?.(
        'Saline Revive Success!',
        `${victim.name} ke Para Daktar bachaye tulsen!`,
      );
      return;
    }

      if (lp.specialRole === 'jharudar') {
      if ((lp.cleansLeft ?? JHARUDAR_CLEAN_USES) <= 0) {
        this.onClueNotice?.('Safai Batpar', 'Shob clean (3/3) use hoye gese!');
        return;
      }
      if (lp.abilityCooldown > 0.05) return;
      const body = findNearestCleanableBody(lp, this.snapshot.bodies);
      if (!body) {
        this.onClueNotice?.('Safai Batpar', 'Move near an unreported fallen body to clean it!');
        return;
      }
      lp.jharuTargetBodyId = body.id;
      lp.jharuTimer = JHARUDAR_CLEAN_CHANNEL_SEC;
      this.onClueNotice?.(
        'Jharu Dichhe...',
        `Hold steady near ${body.victimName} for 2s to sweep the body!`,
      );
      return;
    }

    if (lp.specialRole === 'ghotok_khala') {
      if (this.snapshot.ghotokLinkedIds) {
        const [aId, bId] = this.snapshot.ghotokLinkedIds;
        const aName = this.snapshot.players.find((p) => p.id === aId)?.name ?? 'Player A';
        const bName = this.snapshot.players.find((p) => p.id === bId)?.name ?? 'Player B';
        this.onClueNotice?.('Ghotok Bond Active', `${aName} & ${bName} already bonded!`);
        return;
      }
      const pair = findGhotokPairCandidates(lp, this.snapshot.players);
      if (!pair) {
        this.onClueNotice?.('Ghotok Khala', 'Move close to 2 neighbors to form a Ghotok Bond!');
        return;
      }
      this.snapshot.ghotokLinkedIds = [pair[0].id, pair[1].id];
      pair[0].ghotokPartnerId = pair[1].id;
      pair[1].ghotokPartnerId = pair[0].id;
      soundEngine.playClueScan();
      this.onClueNotice?.(
        'Moholla Bond Formed!',
        `Linked ${pair[0].name} & ${pair[1].name} — ekjon morle arekjon alert pabe!`,
      );
      return;
    }

    if (lp.specialRole === 'master_moshai') {
      if (lp.abilityCooldown > 0.05) return;
      const target = findNearestMasterTarget(lp, this.snapshot.players);
      if (!target) {
        this.onClueNotice?.('Master Moshai', 'Move near a neighbor to check their Moholla Khata!');
        return;
      }
      const res = inspectPlayerTaskAuthenticity(target);
      lp.abilityCooldown = MASTER_COOLDOWN_SEC;
      soundEngine.playClueScan();
      this.onClueNotice?.(res.title, res.detail);
      return;
    }

    if (lp.specialRole === 'cctv_kaku') {
      if (lp.abilityCooldown > 0.05) return;
      lp.watchingCams = true;
      lp.abilityCooldown = CCTV_KAKU_COOLDOWN_SEC;
      soundEngine.playClueScan();
      this.onClueNotice?.('Remote CCTV Feed', 'Pocket Security Monitor activated!');
      return;
    }

    if (lp.specialRole === 'hatur_daktar') {
      if (lp.abilityCooldown > 0.05) return;
      const nowMs = Date.now();
      const target = findNearestHaturTarget(lp, this.snapshot.players, nowMs);
      const receiver = target ?? ((lp.haturProtectedUntil ?? 0) <= nowMs ? lp : null);
      if (!receiver) {
        this.onClueNotice?.('Hatur Daktar', 'Target already protected by Jhajhro Injection!');
        return;
      }
      receiver.haturProtectedUntil = nowMs + HATUR_DURATION_MS;
      lp.abilityCooldown = HATUR_COOLDOWN_SEC;
      soundEngine.playShieldBlock();
      this.onClueNotice?.(
        'Jhajhro Injection Active!',
        receiver.id === lp.id
          ? 'Self-injected! You survive any Batpar attack for the next 12s!'
          : `Injected ${receiver.name} — 12s death protection active!`,
      );
      return;
    }

    if (lp.specialRole === 'supari_killer') {
      if (lp.abilityCooldown > 0.05) return;
      const nextTarget = pickSupariContractTarget(lp, this.snapshot.players, lp.supariTargetId);
      if (!nextTarget) {
        this.onClueNotice?.('Supari Contract', 'No valid live contract target remaining!');
        return;
      }
      lp.supariTargetId = nextTarget.id;
      lp.abilityCooldown = SUPARI_COOLDOWN_SEC;
      soundEngine.playClueScan();
      this.onClueNotice?.(
        'New Supari Contract!',
        `Target: ${nextTarget.name} — take them out for 50% kill cooldown!`,
      );
      return;
    }

    if (lp.specialRole === 'dalal') {
      if (lp.abilityCooldown > 0.05) return;
      const res = applyDalalBrokerJam(this.snapshot.doorLocks);
      this.snapshot.commsJammedUntil = Date.now() + DALAL_JAM_DURATION_MS;
      lp.abilityCooldown = DALAL_COOLDOWN_SEC;
      soundEngine.playDoorSlam();
      this.onClueNotice?.(
        'Broker Jam Activated!',
        `Comms jammed for 10s! ${res.newlyLockedZone ? `Slammed ${res.newlyLockedZone} shutter!` : 'Extended active shutters +8s!'}`,
      );
      return;
    }

    if (lp.specialRole === 'chamcha') {
      if (lp.abilityCooldown > 0.05) return;
      const patron = findNearestChamchaPatron(lp, this.snapshot.players);
      if (!patron) {
        this.onClueNotice?.('Chamcha Sidekick', 'Move close to someone to pledge loyalty as your Patron!');
        return;
      }
      lp.chamchaPatronId = patron.id;
      lp.abilityCooldown = CHAMCHA_COOLDOWN_SEC;
      soundEngine.playClueScan();
      this.onClueNotice?.(
        'Patron Locked!',
        `${patron.name} is now your Patron — survive to win whenever ${patron.name}'s team wins!`,
      );
      return;
    }

    if (lp.specialRole === 'chandabaz') {
      if (lp.abilityCooldown > 0.05) return;
      const target = findNearestChandabazTarget(lp, this.snapshot.players);
      if (!target) {
        this.onClueNotice?.('Chandabaz', 'Move near a new neighbor to collect Chanda!');
        return;
      }
      const res = collectChandaFromTarget(lp, target);
      if (!res.ok) return;
      lp.abilityCooldown = CHANDABAZ_COOLDOWN_SEC;
      soundEngine.playTaskComplete();
      this.onClueNotice?.(
        `Chanda Vasool (${res.count}/${CHANDABAZ_GOAL})!`,
        `Collected Chanda from ${target.name}!`,
      );
      this.checkWin();
      return;
    }

    if (lp.specialRole === 'tiktok_star') {
      if (lp.abilityCooldown > 0.05) return;
      const zoneId = getZoneIdAt(lp.x, lp.z);
      const res = recordTiktokReelInZone(lp, zoneId);
      if (!res.ok) {
        this.onClueNotice?.(
          'TikTok Star',
          res.reason === 'already_filmed'
            ? 'Ei zone e already reel banano hoye gese! Onno zone e jao!'
            : 'Walk inside a named Moholla building/zone to film a Viral Reel!',
        );
        return;
      }
      lp.abilityCooldown = TIKTOK_COOLDOWN_SEC;
      soundEngine.playDisguise();
      this.onClueNotice?.(
        `Viral Reel Filmed (${res.zoneCount}/${TIKTOK_ZONE_GOAL})!`,
        `Filmed in ${getZoneNameAt(lp.x, lp.z)}! Survive to final 4 to win!`,
      );
      this.checkWin();
    }
  }

  public triggerKill(targetId: string): boolean {
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    const target = this.snapshot.players.find((p) => p.id === targetId);
    if (!lp || !target) return false;
    const check = canExecuteKill(lp, target);
    if (!check.allowed) return false;

    const nowMs = Date.now();
    if (isPlayerShieldedNow(target, nowMs)) {
      target.shielded = false;
      target.haturProtectedUntil = 0;
      lp.killCooldownRemaining = 6;
      soundEngine.playShieldBlock();
      this.onClueNotice?.(
        'Protection Shattered!',
        `${target.name} was protected by Tabiz/Jhajhro Injection! Strike blocked!`,
      );
      return false;
    }

    target.alive = false;
    target.watchingCams = false;
    const hitSupariContract = lp.specialRole === 'supari_killer' && target.id === lp.supariTargetId;
    lp.killCooldownRemaining = hitSupariContract
      ? this.snapshot.settings.killCooldownSec * 0.5
      : this.snapshot.settings.killCooldownSec;
    if (lp.specialRole === 'supari_killer') {
      lp.supariTargetId =
        pickSupariContractTarget(lp, this.snapshot.players, lp.supariTargetId)?.id ?? null;
    }
    lp.x = target.x;
    lp.z = target.z;
    this.snapshot.bodies.push({
      id: `body_${nowMs}`,
      victimId: target.id,
      victimName: target.name,
      color: target.color,
      x: target.x,
      z: target.z,
      reported: false,
      killedAt: nowMs,
      killerColorHint: getColorShadeHint(lp.color),
      killerZoneHint: getZoneNameAt(target.x, target.z),
    });
    soundEngine.playKill();
    const ghotokInfo = findGhotokPartnerOnDeath(
      target.id,
      this.snapshot.ghotokLinkedIds,
      this.snapshot.players,
    );
    if (
      ghotokInfo.partner?.id === this.localPlayerId ||
      ghotokInfo.ghotok?.id === this.localPlayerId
    ) {
      this.onClueNotice?.('Ghotok Bond Alert!', `Bonded neighbor ${target.name} just fell in Moholla!`);
    }
    recordKillWitnesses(
      this.brains,
      this.snapshot.players,
      lp,
      target,
      this.snapshot.sabotage.active,
      this.snapshot.doorLocks,
    );
    this.checkWin();
    return true;
  }

  public toggleVent(destinationVentId?: string): void {
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp || !canUseVent(lp)) return;
    if (!lp.inVent) {
      const near = VENTS.find((v) => distance2D(lp.x, lp.z, v.x, v.z) <= VENT_RANGE);
      if (!near) return;
      lp.inVent = true;
      lp.x = near.x;
      lp.z = near.z;
      if (lp.specialRole !== 'mistri' || isMistriVentAudibleTo(lp, lp)) {
        soundEngine.playVent();
      }
    } else if (destinationVentId) {
      const dest = resolveVentHopTarget(lp.x, lp.z, destinationVentId);
      if (dest) {
        lp.x = dest.x;
        lp.z = dest.z;
        if (lp.specialRole !== 'mistri' || isMistriVentAudibleTo(lp, lp)) {
          soundEngine.playVent();
        }
      }
    } else {
      lp.inVent = false;
      if (lp.specialRole === 'mistri') {
        lp.abilityCooldown = MISTRI_VENT_COOLDOWN_SEC;
      }
      if (lp.specialRole !== 'mistri' || isMistriVentAudibleTo(lp, lp)) {
        soundEngine.playVent();
      }
    }
  }

  public triggerSabotage(type: SabotageType): void {
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp || !lp.alive || lp.role !== 'vondo') return;
    if (this.snapshot.sabotage.active || this.snapshot.sabotage.cooldownRemaining > 0) return;
    this.snapshot.sabotage = createSabotageState(type, SABOTAGE_COOLDOWN_SEC);
    this.holdingFixMap.clear();
    soundEngine.playSabotage();
  }

  public lockDoors(zoneId: DoorZoneId): void {
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp || !lp.alive || lp.role !== 'vondo') return;
    if (this.snapshot.doorLocks.cooldownRemaining > 0) return;
    this.snapshot.doorLocks[zoneId] = DOOR_LOCK_DURATION_SEC;
    this.snapshot.doorLocks.cooldownRemaining = DOOR_LOCK_COOLDOWN_SEC;
    soundEngine.playDoorSlam();
  }

  public fixSabotage(holding = true, valveId?: 'valve_cha' | 'valve_rickshaw'): boolean {
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp || !lp.alive || !this.snapshot.sabotage.active) {
      this.holdingFixMap.delete(this.localPlayerId);
      return false;
    }
    if (!holding) {
      this.holdingFixMap.delete(this.localPlayerId);
      return false;
    }
    if (this.snapshot.sabotage.active === 'gas_leak') {
      const range = lp.specialRole === 'mistri' ? MISTRI_FIX_RANGE : SABOTAGE_FIX_RANGE;
      const nearValve = valveId
        ? GAS_LEAK_VALVES.find((v) => v.id === valveId && distance2D(lp.x, lp.z, v.x, v.z) <= range)
        : findNearestGasValve(lp.x, lp.z, this.snapshot.sabotage, range);
      if (!nearValve) {
        this.holdingFixMap.delete(this.localPlayerId);
        return false;
      }
      this.holdingFixMap.set(this.localPlayerId, { valveId: nearValve.id });
      return true;
    }
    const range = lp.specialRole === 'mistri' ? MISTRI_FIX_RANGE : SABOTAGE_FIX_RANGE;
    if (
      distance2D(lp.x, lp.z, this.snapshot.sabotage.fixStationX, this.snapshot.sabotage.fixStationZ) <= range
    ) {
      this.holdingFixMap.set(this.localPlayerId, {});
      return true;
    }
    this.holdingFixMap.delete(this.localPlayerId);
    return false;
  }

  public reportBody(bodyId: string): void {
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    const body = this.snapshot.bodies.find((b) => b.id === bodyId && !b.reported);
    if (!lp || !lp.alive || !body) return;
    if (distance2D(lp.x, lp.z, body.x, body.z) > REPORT_RANGE + 1.0) return;
    if (!hasLineOfSight(lp.x, lp.z, body.x, body.z, WALLS, this.snapshot.doorLocks)) return;
    body.reported = true;
    this.startMeeting(lp, 'body', body.victimName);
  }

  public callEmergencyMeeting(): void {
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (
      !lp ||
      !lp.alive ||
      isCriticalSabotage(this.snapshot.sabotage.active) ||
      this.snapshot.emergencyCooldownRemaining > 0 ||
      lp.emergencyMeetingsLeft <= 0
    ) {
      return;
    }
    if (distance2D(lp.x, lp.z, EMERGENCY_BELL_POS.x, EMERGENCY_BELL_POS.z) <= EMERGENCY_BELL_POS.interactRadius) {
      lp.emergencyMeetingsLeft--;
      this.startMeeting(lp, 'emergency');
    }
  }

  public sendChat(text: string): void {
    if (this.snapshot.phase !== 'meeting') return;
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp) return;
    const clean = text.trim().slice(0, 140);
    if (!clean) return;
    this.snapshot.chat.push({
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      senderId: lp.id,
      senderName: lp.alive ? lp.name : `${lp.name} (Ghost)`,
      senderColor: lp.color,
      text: clean,
      timestamp: Date.now(),
      ghostOnly: !lp.alive,
    });
  }

  public castVote(targetId: string | 'skip'): void {
    if (this.snapshot.phase !== 'meeting') return;
    if ((this.snapshot.discussionTimer ?? 0) > 0) return;
    const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
    if (!lp || !lp.alive || lp.hasVoted) return;
    lp.votedFor = targetId;
    lp.hasVoted = true;
    soundEngine.playVoteClick();
    const alive = this.snapshot.players.filter((p) => p.alive);
    if (alive.length > 0 && alive.every((p) => p.hasVoted)) {
      this.resolveVotes();
    }
  }

  private startMeeting(caller: PlayerState, reason: 'body' | 'emergency', victimName?: string): void {
    if (this.snapshot.phase !== 'playing') return;
    this.snapshot.phase = 'meeting';
    this.snapshot.meetingCallerId = caller.id;
    this.snapshot.meetingReason = reason;
    this.snapshot.discussionTimer = this.snapshot.settings.discussionTimeSec;
    this.snapshot.meetingTimer = this.snapshot.settings.meetingTimeSec;
    this.holdingFixMap.clear();
    if (isCriticalSabotage(this.snapshot.sabotage.active)) {
      this.snapshot.sabotage = createEmptySabotageState(SABOTAGE_COOLDOWN_SEC);
    } else {
      this.snapshot.sabotage.fixProgress = 0;
      this.snapshot.sabotage.fixerId = null;
    }
    this.snapshot.footprints = [];
    this.justEjectedPlayer = null;
    this.snapshot.commsJammedUntil = 0;
    this.snapshot.doorLocks = makeEmptyDoorLocks();

    for (const p of this.snapshot.players) {
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

    if (!this.snapshot.netaRevealedId) {
      const aliveNeta = this.snapshot.players.find((p) => p.alive && p.specialRole === 'neta');
      if (aliveNeta) {
        this.snapshot.netaRevealedId = aliveNeta.id;
        this.snapshot.chat.push({
          id: `neta_${Date.now()}`,
          senderId: 'system',
          senderName: 'Moholla Shalish',
          senderColor: 'holud',
          text: `${aliveNeta.name} mohollar Neta (Mayor) — tar Shalish vote 2x hisebe count hobe!`,
          timestamp: Date.now(),
          system: true,
        });
      }
    }

    resetBotBrainsForMeeting(this.brains);

    this.snapshot.chat.push({
      id: `sys_${Date.now()}`,
      senderId: 'system',
      senderName: 'Moholla Shalish',
      senderColor: 'holud',
      text:
        reason === 'body'
          ? `Haire! ${caller.name} dekhlo ${victimName ?? 'ekjon'} size hoye gese! Urgent Shalish!`
          : `${caller.name} Shalish er ghonta bajay dise!`,
      timestamp: Date.now(),
      system: true,
    });
    soundEngine.playMeetingBell(reason);
  }

  private resolveVotes(): void {
    const ejection = tallyVotes(this.snapshot.players, this.snapshot.settings.confirmEjects);
    this.snapshot.ejection = ejection;
    this.snapshot.phase = 'vote_results';
    this.phaseTimer = 2.6;
    soundEngine.playVoteClick();
  }

  private checkWin(sabotageExpired = false): boolean {
    const stats = computeTaskProgress(this.snapshot.players);
    const outcome = evaluateMatchOutcome(
      this.snapshot.players,
      stats.progress,
      sabotageExpired,
      this.justEjectedPlayer,
    );
    if (outcome) {
      this.snapshot.outcome = outcome;
      this.snapshot.phase = 'gameover';
      const lp = this.snapshot.players.find((p) => p.id === this.localPlayerId);
      const localWon =
        outcome.winner === 'pagol' || outcome.winner === 'chandabaz' || outcome.winner === 'tiktok_star'
          ? outcome.winnerPlayerId === lp?.id
          : Boolean(
              (lp && !isNeutralRole(lp.specialRole) && lp.role === outcome.winner) ||
                (lp && outcome.coWinnerIds?.includes(lp.id)),
            );
      soundEngine.playOutcome(Boolean(localWon));
      return true;
    }
    return false;
  }

  private handleDeathSideEffects(victim: PlayerState): void {
    const ghotokInfo = findGhotokPartnerOnDeath(
      victim.id,
      this.snapshot.ghotokLinkedIds,
      this.snapshot.players,
    );
    if (
      ghotokInfo.partner?.id === this.localPlayerId ||
      ghotokInfo.ghotok?.id === this.localPlayerId
    ) {
      this.onClueNotice?.('Ghotok Bond Alert!', `Bonded neighbor ${victim.name} just fell in Moholla!`);
    }
    for (const pl of this.snapshot.players) {
      if (pl.alive && pl.specialRole === 'supari_killer' && pl.supariTargetId === victim.id) {
        pl.supariTargetId =
          pickSupariContractTarget(pl, this.snapshot.players, victim.id)?.id ?? null;
      }
    }
  }

  public step(dt: number): void {
    if (this.snapshot.phase === 'lobby') {
      if (this.snapshot.lobbyCountdownSec !== null) {
        this.lobbyCountdownTimer -= dt;
        const nextSec = Math.max(0, Math.ceil(this.lobbyCountdownTimer));
        if (nextSec > 0 && nextSec !== this.snapshot.lobbyCountdownSec) {
          this.snapshot.lobbyCountdownSec = nextSec;
          soundEngine.playLobbyTick();
        }
        if (this.lobbyCountdownTimer <= 0) {
          soundEngine.playStartWhoosh();
          this.startMatchInternal(false);
        }
      }
      return;
    }

    if (this.snapshot.phase === 'role_reveal') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.snapshot.phase = 'playing';
      }
      return;
    }

    if (this.snapshot.phase === 'playing') {
      const now = Date.now();
      this.snapshot.footprints = this.snapshot.footprints.filter((f) => f.expiresAt > now);

      for (const p of this.snapshot.players) {
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
          const jRes = stepJharudarChannel(p, this.snapshot.bodies, dt);
          if (jRes.completedBody) {
            this.snapshot.bodies = this.snapshot.bodies.filter((b) => b.id !== jRes.completedBody!.id);
            if (p.id === this.localPlayerId) {
              soundEngine.playCleanBody();
              this.onClueNotice?.(
                'Lash Gayeb!',
                `Cleaned ${jRes.completedBody.victimName}'s body (${p.cleansLeft ?? 0} left)!`,
              );
            }
          } else if (jRes.cancelled && p.id === this.localPlayerId) {
            this.onClueNotice?.('Clean Cancelled', 'Body theke shore geso — Jharu deowa cancel!');
          }
        }
      }
      if (this.snapshot.emergencyCooldownRemaining > 0) {
        this.snapshot.emergencyCooldownRemaining = Math.max(0, this.snapshot.emergencyCooldownRemaining - dt);
      }
      if (this.snapshot.doorLocks.cooldownRemaining > 0) {
        this.snapshot.doorLocks.cooldownRemaining = Math.max(0, this.snapshot.doorLocks.cooldownRemaining - dt);
      }
      this.snapshot.doorLocks.cha_dokan = Math.max(0, this.snapshot.doorLocks.cha_dokan - dt);
      this.snapshot.doorLocks.rickshaw_garage = Math.max(0, this.snapshot.doorLocks.rickshaw_garage - dt);
      this.snapshot.doorLocks.desco_power = Math.max(0, this.snapshot.doorLocks.desco_power - dt);
      this.snapshot.doorLocks.dish_roof = Math.max(0, this.snapshot.doorLocks.dish_roof - dt);

      // Clear stale bot entries from holdingFixMap; keep human if still in range
      for (const hid of Array.from(this.holdingFixMap.keys())) {
        const hp = this.snapshot.players.find((pl) => pl.id === hid);
        if (!hp || !hp.alive || hp.isBot) {
          this.holdingFixMap.delete(hid);
        }
      }

      const interrupted = stepBotsPlaying({
        players: this.snapshot.players,
        bodies: this.snapshot.bodies,
        sabotage: this.snapshot.sabotage,
        doorLocks: this.snapshot.doorLocks,
        settings: this.snapshot.settings,
        holdingFixMap: this.holdingFixMap,
        brains: this.brains,
        dt,
        nowMs: now,
        onFootprint: (p, distMoved) => this.recordFootprint(p, distMoved),
        onReportBody: (reporter, body) => this.startMeeting(reporter, 'body', body.victimName),
        onKill: (_killer, victim, shieldBlocked) => {
          if (shieldBlocked) {
            soundEngine.playShieldBlock();
            if (victim.id === this.localPlayerId) {
              this.onClueNotice?.(
                'Protection Saved You!',
                'Ekjon Batpar tomake gap e nite chaisilo, kintu Tabiz/Injection bachay dise!',
              );
            }
          } else {
            soundEngine.playKill();
            this.handleDeathSideEffects(victim);
          }
        },
        onSabotage: () => soundEngine.playSabotage(),
        onDoorLock: (zoneId) => {
          this.snapshot.doorLocks[zoneId] = DOOR_LOCK_DURATION_SEC;
          this.snapshot.doorLocks.cooldownRemaining = DOOR_LOCK_COOLDOWN_SEC;
          soundEngine.playDoorSlam();
        },
        onRevive: () => soundEngine.playRevive(),
        onTaskCompletedCheckWin: () => this.checkWin(),
      });
      if (interrupted) return;

      const sabStep = advanceSabotageState(
        this.snapshot.sabotage,
        this.snapshot.players,
        dt,
        this.holdingFixMap,
      );
      if (sabStep.fixed) {
        this.holdingFixMap.clear();
        soundEngine.playTaskComplete();
      } else if (sabStep.expiredCritical) {
        this.holdingFixMap.clear();
        this.checkWin(true);
        return;
      } else if (sabStep.expiredNonCriticalType) {
        this.holdingFixMap.clear();
        this.snapshot.chat.push({
          id: `sys_sab_${Date.now()}`,
          senderId: 'system',
          senderName: 'Moholla Announcement',
          senderColor: 'holud',
          text:
            sabStep.expiredNonCriticalType === 'loadshedding'
              ? 'Current ashche! DESCO line nijei thik hoye gese!'
              : 'Wi-Fi ashche! Dish line abar chaloo hoye gese!',
          timestamp: Date.now(),
          system: true,
        });
      }
    } else if (this.snapshot.phase === 'meeting') {
      if ((this.snapshot.discussionTimer ?? 0) > 0) {
        this.snapshot.discussionTimer = Math.max(0, (this.snapshot.discussionTimer ?? 0) - dt);
      } else {
        this.snapshot.meetingTimer = Math.max(0, this.snapshot.meetingTimer - dt);
      }

      stepBotsMeeting({
        players: this.snapshot.players,
        bodies: this.snapshot.bodies,
        discussionTimer: this.snapshot.discussionTimer ?? 0,
        brains: this.brains,
        dt,
        onChat: (p, text) => {
          this.snapshot.chat.push({
            id: `chat_${Date.now()}_${p.id}`,
            senderId: p.id,
            senderName: p.name,
            senderColor: p.color,
            text,
            timestamp: Date.now(),
          });
        },
      });

      const alive = this.snapshot.players.filter((p) => p.alive);
      if ((this.snapshot.discussionTimer ?? 0) <= 0 && this.snapshot.meetingTimer <= 1.2) {
        for (const p of alive) {
          if (p.isBot && !p.hasVoted) {
            p.hasVoted = true;
            p.votedFor = 'skip';
          }
        }
      }
      if (
        ((this.snapshot.discussionTimer ?? 0) <= 0 &&
          (alive.length === 0 || alive.every((p) => p.hasVoted))) ||
        this.snapshot.meetingTimer <= 0
      ) {
        this.resolveVotes();
      }
    } else if (this.snapshot.phase === 'vote_results') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.justEjectedPlayer = null;
        if (this.snapshot.ejection?.ejectedId) {
          const target = this.snapshot.players.find((p) => p.id === this.snapshot.ejection?.ejectedId);
          if (target) {
            target.alive = false;
            this.justEjectedPlayer = target;
            this.handleDeathSideEffects(target);
            if (this.snapshot.ejection?.reason === 'voted') {
              soundEngine.playEjectBuildup();
            }
          }
        }
        this.snapshot.bodies = [];
        this.snapshot.phase = 'ejecting';
        this.phaseTimer = this.snapshot.ejection?.reason === 'voted' ? 7.5 : 5.0;
      }
    } else if (this.snapshot.phase === 'ejecting') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (!this.checkWin()) {
          this.justEjectedPlayer = null;
          this.snapshot.players.forEach((p, idx) => {
            const sp = SPAWN_RING[idx % SPAWN_RING.length];
            p.x = sp.x;
            p.z = sp.z;
            p.y = 0;
            p.yaw = sp.yaw;
            p.hasVoted = false;
            p.votedFor = null;
            if (p.role === 'vondo') p.killCooldownRemaining = this.snapshot.settings.killCooldownSec;
          });
          this.snapshot.emergencyCooldownRemaining = this.snapshot.settings.emergencyCooldownSec;
          this.snapshot.phase = 'playing';
        }
      }
    }
  }
}

export { PLAYER_COLORS };
