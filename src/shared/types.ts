export type GamePhase =
  | 'title'
  | 'lobby'
  | 'role_reveal'
  | 'playing'
  | 'meeting'
  | 'vote_results'
  | 'ejecting'
  | 'paused'
  | 'gameover';

export type PlayerRole = 'parabasi' | 'vondo';

export type SpecialRole =
  | 'none'
  | 'goyenda'
  | 'kobiraj'
  | 'mistri'
  | 'daroga'
  | 'neta'
  | 'daktar'
  | 'ghotok_khala'
  | 'master_moshai'
  | 'cctv_kaku'
  | 'hatur_daktar'
  | 'bohurupi'
  | 'jharudar'
  | 'supari_killer'
  | 'dalal'
  | 'pagol'
  | 'chamcha'
  | 'chandabaz'
  | 'tiktok_star';

export interface SpecialRoleMeta {
  id: SpecialRole;
  title: string;
  banglaTitle: string;
  faction: 'parabasi' | 'vondo' | 'neutral';
  accentHex: string;
  abilityLabel: string;
  shortDesc: string;
}

export const SPECIAL_ROLES: Record<SpecialRole, SpecialRoleMeta> = {
  none: {
    id: 'none',
    title: 'Moholla Neighbor',
    banglaTitle: 'পাড়াবাসী',
    faction: 'parabasi',
    accentHex: '#38bdf8',
    abilityLabel: 'Complete Tasks',
    shortDesc: 'Mohollar shob kaaj shesh koro ar Shalish e Batpar ke dhoraye dao!',
  },
  goyenda: {
    id: 'goyenda',
    title: 'Goyenda (CID Mofiz)',
    banglaTitle: 'গোয়েন্দা মফিজ',
    faction: 'parabasi',
    accentHex: '#22d3ee',
    abilityLabel: 'CID Check [G]',
    shortDesc: '3D footprints dekhte pabe ar lash scan kore Batpar er color hint ber korte parbe!',
  },
  kobiraj: {
    id: 'kobiraj',
    title: 'Kobiraj (Tabiz Baba)',
    banglaTitle: 'তাবিজ বাবা',
    faction: 'parabasi',
    accentHex: '#34d399',
    abilityLabel: 'Tabiz Shield [G]',
    shortDesc: 'Neighbor ke golden Tabiz shield poraye daw — 1 bar Gap e neowa theke bachabe!',
  },
  mistri: {
    id: 'mistri',
    title: 'Mistri (Current Babu)',
    banglaTitle: 'মিস্ত্রি বাবু',
    faction: 'parabasi',
    accentHex: '#fbbf24',
    abilityLabel: 'Dren e Dhuko [V]',
    shortDesc: 'Dren diye palay jete parbe ar dur thekei DESCO/Wi-Fi jhamela thik korte parbe!',
  },
  daroga: {
    id: 'daroga',
    title: 'Daroga (Para Sheriff)',
    banglaTitle: 'পাড়া দারোগা',
    faction: 'parabasi',
    accentHex: '#f97316',
    abilityLabel: 'Batpar Arrest [G]',
    shortDesc: 'Asli Batpar ke dhorle ek shot e size! Kintu niraparadh Para-basi ke marle nijei out hobe!',
  },
  neta: {
    id: 'neta',
    title: 'Neta (Moholla Mayor)',
    banglaTitle: 'মহল্লা নেতা',
    faction: 'parabasi',
    accentHex: '#facc15',
    abilityLabel: '2x Vote + Extra Bell',
    shortDesc: 'Shalish e tomar vote 2 ta hisebe count hobe ar extra 1 ta Adda Bell pabe!',
  },
  daktar: {
    id: 'daktar',
    title: 'Daktar (Para Doctor)',
    banglaTitle: 'পাড়া ডাক্তার',
    faction: 'parabasi',
    accentHex: '#2dd4bf',
    abilityLabel: 'Saline Revive [G]',
    shortDesc: 'Match e 1 bar unreported fallen neighbor ke Saline diye live bachaye tulte parbe!',
  },
  ghotok_khala: {
    id: 'ghotok_khala',
    title: 'Ghotok Khala (Matchmaker)',
    banglaTitle: 'ঘটক খালা',
    faction: 'parabasi',
    accentHex: '#f472b6',
    abilityLabel: 'Moholla Bond [G]',
    shortDesc: '2 jon player ke Ghotok Bond e joro koro — ekjon morlei onnojon ar Khala alert pabe!',
  },
  master_moshai: {
    id: 'master_moshai',
    title: 'Master Moshai (Teacher)',
    banglaTitle: 'মাস্টার মশাই',
    faction: 'parabasi',
    accentHex: '#60a5fa',
    abilityLabel: 'Khata Check [G]',
    shortDesc: 'Kacher player er Khata check kore ber koro shey Asol Para-basi naki Fake Batpar!',
  },
  cctv_kaku: {
    id: 'cctv_kaku',
    title: 'CCTV Kaku (Security)',
    banglaTitle: 'সিসিটিভি কাকু',
    faction: 'parabasi',
    accentHex: '#fb923c',
    abilityLabel: 'Remote CCTV [G]',
    shortDesc: 'Mohollar jekono jayga thekei pocket phone e live Security CCTV feed dekhte parbe!',
  },
  hatur_daktar: {
    id: 'hatur_daktar',
    title: 'Hatur Daktar (Quack)',
    banglaTitle: 'হাতুড়ে ডাক্তার',
    faction: 'parabasi',
    accentHex: '#a3e635',
    abilityLabel: 'Jhajhro Shot [G]',
    shortDesc: 'Neighbor ke 12s er Jhajhro Injection daw — 12s er moddhe Batpar marle bache jabe!',
  },
  bohurupi: {
    id: 'bohurupi',
    title: 'Bohurupi Batpar',
    banglaTitle: 'বহুরূপী বাটপার',
    faction: 'vondo',
    accentHex: '#fb7185',
    abilityLabel: 'Chehara Bodlaw [G]',
    shortDesc: 'Onno Para-basir besh dhore tader ke CCTV te fashaye daw!',
  },
  jharudar: {
    id: 'jharudar',
    title: 'Jharudar (Safai Batpar)',
    banglaTitle: 'সাফাই বাটপার',
    faction: 'vondo',
    accentHex: '#f43f5e',
    abilityLabel: 'Clean Lash [G]',
    shortDesc: 'Size korar por fallen body clean kore gayeb kore dao jeno keu report korte na pare!',
  },
  supari_killer: {
    id: 'supari_killer',
    title: 'Supari Killer (Hitman)',
    banglaTitle: 'সুপারি কিলার',
    faction: 'vondo',
    accentHex: '#ef4444',
    abilityLabel: 'Switch Supari [G]',
    shortDesc: 'Marked Supari Target ke size korle porer Kill Cooldown ORDHKE (50%) neme jabe!',
  },
  dalal: {
    id: 'dalal',
    title: 'Dalal (Para Broker)',
    banglaTitle: 'দালাল বাটপার',
    faction: 'vondo',
    accentHex: '#dc2626',
    abilityLabel: 'Broker Jam [G]',
    shortDesc: 'Shutter lock +8s baray ar 10s er jonne Admin Radar & Vitals Comms jam kore dey!',
  },
  pagol: {
    id: 'pagol',
    title: 'Pagol (Pagla Baba)',
    banglaTitle: 'পাগলা বাবা',
    faction: 'neutral',
    accentHex: '#c084fc',
    abilityLabel: 'Bait Shalish Votes',
    shortDesc: 'Chaos neutral! Shobai ke shondeho lagao jeno tomake Pukur e chubani dey — taholei WIN!',
  },
  chamcha: {
    id: 'chamcha',
    title: 'Chamcha (Sidekick)',
    banglaTitle: 'চামচা',
    faction: 'neutral',
    accentHex: '#a855f7',
    abilityLabel: 'Pick Patron [G]',
    shortDesc: 'Ekjon Dada/Apa ke Patron banao! Alive thakle Patron er team jitle tumio CO-WIN korbe!',
  },
  chandabaz: {
    id: 'chandabaz',
    title: 'Chandabaz (Extortionist)',
    banglaTitle: 'চাঁদাবাজ',
    faction: 'neutral',
    accentHex: '#eab308',
    abilityLabel: 'Vasool Chanda [G]',
    shortDesc: '3 jon alada neighbor er kach theke Chanda vasool korte parlei Solo Victory!',
  },
  tiktok_star: {
    id: 'tiktok_star',
    title: 'TikTok Star (Viral)',
    banglaTitle: 'টিকটক স্টার',
    faction: 'neutral',
    accentHex: '#ec4899',
    abilityLabel: 'Shoot Reel [G]',
    shortDesc: '3 ta alada Moholla zone e Viral Reel banao ar sesh 4 jon e tike thaklei Solo WIN!',
  },
};

export type PlayerColorId =
  | 'lal'
  | 'neel'
  | 'shobuj'
  | 'holud'
  | 'beguni'
  | 'komola'
  | 'sada'
  | 'kalo'
  | 'golapi'
  | 'akashi'
  | 'badami'
  | 'tute'
  | 'jam'
  | 'olive'
  | 'tan';

export interface PlayerColorSpec {
  id: PlayerColorId;
  label: string;
  banglaName: string;
  hex: string;
  visorTint: string;
}

export const PLAYER_COLORS: PlayerColorSpec[] = [
  { id: 'lal', label: 'Lal Mia', banglaName: 'লাল মিয়া', hex: '#e11d48', visorTint: '#7dd3fc' },
  { id: 'neel', label: 'Neel Babu', banglaName: 'নীল বাবু', hex: '#2563eb', visorTint: '#bae6fd' },
  { id: 'shobuj', label: 'Shobuj Bhai', banglaName: 'সবুজ ভাই', hex: '#16a34a', visorTint: '#a7f3d0' },
  { id: 'holud', label: 'Holud Chacha', banglaName: 'হলুদ চাচা', hex: '#eab308', visorTint: '#fef08a' },
  { id: 'beguni', label: 'Beguni Apa', banglaName: 'বেগুনি আপা', hex: '#9333ea', visorTint: '#e9d5ff' },
  { id: 'komola', label: 'Komola Kaku', banglaName: 'কমলা কাকু', hex: '#ea580c', visorTint: '#fed7aa' },
  { id: 'sada', label: 'Sada Dada', banglaName: 'সাদা দাদা', hex: '#e2e8f0', visorTint: '#38bdf8' },
  { id: 'kalo', label: 'Kalo Ustad', banglaName: 'কালো ওস্তাদ', hex: '#334155', visorTint: '#67e8f9' },
  { id: 'golapi', label: 'Golapi Rani', banglaName: 'গোলাপি রানী', hex: '#ec4899', visorTint: '#fbcfe8' },
  { id: 'akashi', label: 'Akashi Tara', banglaName: 'আকাশী তারা', hex: '#06b6d4', visorTint: '#cffafe' },
  { id: 'badami', label: 'Badami Mama', banglaName: 'বাদামী মামা', hex: '#92400e', visorTint: '#fde68a' },
  { id: 'tute', label: 'Tute Chacha', banglaName: 'তুতে চাচা', hex: '#14b8a6', visorTint: '#ccfbf1' },
  { id: 'jam', label: 'Jam Kaka', banglaName: 'জাম কাকা', hex: '#6d28d9', visorTint: '#ddd6fe' },
  { id: 'olive', label: 'Pata Bhai', banglaName: 'পাতা ভাই', hex: '#65a30d', visorTint: '#ecfccb' },
  { id: 'tan', label: 'Shona Babu', banglaName: 'সোনা বাবু', hex: '#d97706', visorTint: '#fef3c7' },
];

export type TaskKind =
  | 'cha_mix'
  | 'fuse_fix'
  | 'rickshaw_pump'
  | 'dish_tune'
  | 'bazar_hisab'
  | 'pukur_check'
  | 'fuchka_serve'
  | 'saloon_trim'
  | 'cricket_tape'
  | 'pharmacy_mix'
  | 'pandal_dj';

export type TaskCategory = 'common' | 'short' | 'long';
export type TaskMedium = 'physical' | 'digital';

export interface TaskStation {
  id: string;
  kind: TaskKind;
  title: string;
  banglaTitle: string;
  zoneName: string;
  x: number;
  z: number;
  radius: number;
  category: TaskCategory;
  medium: TaskMedium;
  holdDurationSec: number;
  isVisual?: boolean;
}

export interface VentNode {
  id: string;
  label: string;
  x: number;
  z: number;
  targetIds: string[];
}

export interface WallAABB {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  zone?: string;
}

export type DoorZoneId = 'cha_dokan' | 'rickshaw_garage' | 'desco_power' | 'dish_roof';

export interface DoorSpec {
  id: string;
  zoneId: DoorZoneId;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  banglaName: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
}

export interface SecurityCamDef {
  id: string;
  label: string;
  zoneId: string;
  camX: number;
  camZ: number;
  viewCenterX: number;
  viewCenterZ: number;
  viewRadius: number;
}

export interface RoofDeckDef {
  id: string;
  zoneId: string;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  elevationY: number;
  stairOpenings: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
}

export interface StairRampDef {
  id: string;
  roofId: string;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: 'x' | 'z';
  bottomCoord: number;
  topCoord: number;
  topY: number;
  steps: number;
}

export interface PlayerTaskState {
  taskId: string;
  completed: boolean;
  isFake?: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColorId;
  x: number;
  z: number;
  y?: number;
  vx: number;
  vz: number;
  yaw: number;
  role: PlayerRole;
  specialRole: SpecialRole;
  alive: boolean;
  inVent: boolean;
  watchingCams: boolean;
  visualTaskTimer: number; // >0 shows 3D scan/steam visual task effect within 6m
  abilityCooldown: number;
  shielded: boolean;
  disguiseColor: PlayerColorId | null;
  disguiseName: string | null;
  disguiseTimer: number;
  isBot: boolean;
  isHost: boolean;
  ready: boolean;
  pingMs?: number;
  tasks: PlayerTaskState[];
  killCooldownRemaining: number;
  emergencyMeetingsLeft: number;
  scansLeft?: number;
  shotsLeft?: number;
  cleansLeft?: number;
  revivesLeft?: number;
  pranksLeft?: number;
  jharuTargetBodyId?: string | null;
  jharuTimer?: number;
  haturProtectedUntil?: number;
  supariTargetId?: string | null;
  chamchaPatronId?: string | null;
  chandabazTargets?: string[];
  tiktokZones?: string[];
  ghotokPartnerId?: string | null;
  votedFor: string | null; // playerId | 'skip' | null
  hasVoted: boolean;
}

export interface BodyMarker {
  id: string;
  victimId: string;
  victimName: string;
  color: PlayerColorId;
  x: number;
  z: number;
  reported: boolean;
  killedAt: number;
  killerColorHint: string;
  killerZoneHint: string;
}

export interface FootprintDot {
  id: string;
  x: number;
  z: number;
  color: PlayerColorId;
  expiresAt: number;
}

export type SabotageType = 'loadshedding' | 'wifi_down' | 'gas_leak';
export type SabotageSeverity = 'non_critical' | 'critical';

export interface GasValveState {
  id: 'valve_cha' | 'valve_rickshaw';
  label: string;
  zoneName: string;
  x: number;
  z: number;
  holderId: string | null;
}

export interface SabotageState {
  active: SabotageType | null;
  kind: SabotageSeverity | null;
  timeRemaining: number;
  fixStationX: number;
  fixStationZ: number;
  fixProgress: number; // 0..1 progress while holding E at fix station or both gas valves
  fixerId: string | null;
  valves: GasValveState[];
  cooldownRemaining: number;
}

export interface DoorLockState {
  cha_dokan: number; // seconds remaining
  rickshaw_garage: number;
  desco_power: number;
  dish_roof: number;
  cooldownRemaining: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: PlayerColorId;
  text: string;
  timestamp: number;
  system?: boolean;
  ghostOnly?: boolean;
}

export interface EjectionInfo {
  ejectedId: string | null;
  ejectedName: string | null;
  ejectedColor: PlayerColorId | null;
  wasVondo: boolean;
  wasSpecialRole: SpecialRole;
  reason: 'voted' | 'tie' | 'skipped';
  remainingVondos: number;
  confirmEjects: boolean;
}

export interface RoomSettings {
  vondoCount: number;
  killCooldownSec: number;
  meetingTimeSec: number;
  discussionTimeSec: number;
  moveSpeed: number;
  tasksPerPlayer: number;
  emergencyCooldownSec: number;
  emergencyMeetingsPerPlayer: number;
  confirmEjects: boolean;
  anonymousVotes: boolean;
  visualTasks: boolean;
  enableSpecialRoles: boolean;
  enableNeutralRoles: boolean;
  autoFillBots: boolean;
}

export type MatchOutcomeReason =
  | 'pagol_ejected'
  | 'chandabaz_extorted'
  | 'tiktok_viral'
  | 'tasks_completed'
  | 'batpars_out'
  | 'batpars_outnumber'
  | 'critical_sabotage_timeout';

export interface MatchOutcome {
  winner: 'parabasi' | 'vondo' | 'pagol' | 'chandabaz' | 'tiktok_star';
  reason: MatchOutcomeReason;
  winnerPlayerId?: string;
  winnerPlayerName?: string;
  coWinnerIds?: string[];
  coWinnerNames?: string[];
}

export interface RoomSnapshot {
  roomCode: string;
  isSolo?: boolean;
  phase: 'lobby' | 'role_reveal' | 'playing' | 'meeting' | 'vote_results' | 'ejecting' | 'gameover';
  players: PlayerState[];
  bodies: BodyMarker[];
  footprints: FootprintDot[];
  sabotage: SabotageState;
  doorLocks: DoorLockState;
  chat: ChatMessage[];
  lobbyChat?: ChatMessage[];
  lobbyCountdownSec?: number | null;
  hostAbortedReason?: string | null;
  netaRevealedId?: string | null;
  prankedLampUntil?: number;
  commsJammedUntil?: number;
  ghotokLinkedIds?: [string, string] | null;
  meetingCallerId: string | null;
  meetingReason: 'body' | 'emergency' | null;
  meetingTimer: number;
  discussionTimer?: number;
  emergencyCooldownRemaining: number;
  ejection: EjectionInfo | null;
  outcome: MatchOutcome | null;
  settings: RoomSettings;
  taskProgress: number;
  totalTasks: number;
  completedTasks: number;
  typingPlayerIds?: string[];
}

export interface PublicRoomSummary {
  roomCode: string;
  playerCount: number;
  maxPlayers: number;
  phase: string;
  hostName: string;
}

export type ClientMessage =
  | { type: 'room:create'; name: string; color: PlayerColorId }
  | { type: 'room:join'; roomCode: string; name: string; color: PlayerColorId; reconnectToken?: string }
  | { type: 'room:list' }
  | { type: 'lobby:settings'; settings: Partial<RoomSettings> }
  | { type: 'lobby:customize'; name?: string; color?: PlayerColorId }
  | { type: 'lobby:ready'; ready: boolean }
  | { type: 'lobby:kick'; targetPlayerId: string }
  | { type: 'lobby:chat'; text: string }
  | { type: 'lobby:add_bot' }
  | { type: 'lobby:remove_bot'; targetPlayerId?: string }
  | { type: 'lobby:remove_bots' }
  | { type: 'lobby:start' }
  | { type: 'lobby:cancel_start' }
  | { type: 'player:move'; x: number; z: number; y?: number; vx: number; vz: number; yaw: number }
  | { type: 'player:task_complete'; taskId: string }
  | { type: 'player:visual_task_start'; taskId: string }
  | { type: 'player:kill'; targetId: string }
  | { type: 'player:vent_toggle'; ventId?: string; destinationVentId?: string }
  | { type: 'player:use_ability'; targetId?: string }
  | { type: 'player:sabotage'; sabotageType: SabotageType }
  | { type: 'player:lock_doors'; zoneId: DoorZoneId }
  | { type: 'player:fix_sabotage'; holding?: boolean; valveId?: 'valve_cha' | 'valve_rickshaw' }
  | { type: 'player:watch_cams'; watching: boolean }
  | { type: 'player:report_body'; bodyId: string }
  | { type: 'player:emergency_meeting' }
  | { type: 'meeting:chat'; text: string }
  | { type: 'meeting:typing'; typing: boolean }
  | { type: 'meeting:vote'; targetId: string | 'skip' }
  | { type: 'player:meme_sfx'; memeId: string }
  | { type: 'room:play_again' }
  | { type: 'room:leave' };

export type ServerMessage =
  | { type: 'room:joined'; playerId: string; snapshot: RoomSnapshot; reconnectToken?: string }
  | { type: 'room:list_result'; rooms: PublicRoomSummary[] }
  | { type: 'room:state'; snapshot: RoomSnapshot }
  | { type: 'room:error'; message: string }
  | { type: 'room:kicked'; message: string }
  | { type: 'clue:result'; title: string; detail: string }
  | { type: 'meme:play'; memeId: string }
  | { type: 'memes:updated'; updatedAt: number }
  | {
      type: 'sfx:event';
      kind:
        | 'kill'
        | 'report'
        | 'meeting'
        | 'sabotage'
        | 'sabotage_critical'
        | 'task'
        | 'eject'
        | 'vent'
        | 'door'
        | 'shield'
        | 'disguise'
        | 'daroga'
        | 'clean'
        | 'revive'
        | 'clue'
        | 'prank'
        | 'lobby_join'
        | 'lobby_ready'
        | 'lobby_tick'
        | 'lobby_start';
    };

