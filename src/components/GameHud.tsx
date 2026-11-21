import { memo, useEffect, useState } from 'react';
import {
  PLAYER_COLORS,
  SPECIAL_ROLES,
  type DoorZoneId,
  type RoomSnapshot,
  type SabotageType,
} from '../shared/types';
import {
  ADMIN_TABLE_POS,
  DOORS,
  EMERGENCY_BELL_POS,
  GAS_LEAK_VALVES,
  MAP_HALF_SIZE,
  RAILWAY_TRACK_Z,
  ROOFTOPS,
  SECURITY_CAMS_POS,
  STAIR_RAMPS,
  TASK_STATIONS,
  VENTS,
  VITALS_POS,
  WALLS,
  ZONES,
  distance2D,
  getZoneIdAt,
  getZoneNameAt,
} from '../shared/mapData';
import {
  MISTRI_FIX_RANGE,
  SABOTAGE_FIX_RANGE,
  VENT_RANGE,
  canCompleteTasks,
  canUseVent,
  findGhotokPairCandidates,
  findNearestChamchaPatron,
  findNearestChandabazTarget,
  findNearestCleanableBody,
  findNearestDarogaTarget,
  findNearestGasValve,
  findNearestHaturTarget,
  findNearestInspectableBody,
  findNearestKillTarget,
  findNearestMasterTarget,
  findNearestReportableBody,
  findNearestRevivableBody,
  findNearestShieldTarget,
  getConnectedVents,
  getDirectionCompass,
  isCriticalSabotage,
  isNeutralRole,
  isTaskLockedBySabotage,
} from '../shared/gameRules';
import type { StationModalKind } from './StationModals';
import { getQuickMemeList, soundEngine, type MemeSoundId } from '../audio/soundEngine';
import { subscribeMemePack } from '../audio/memePackStore';
import {
  Volume2,
  VolumeX,
  Pause,
  Map as MapIcon,
  Zap,
  Skull,
  Bell,
  Wrench,
  DoorOpen,
  Video,
  Radar,
  Activity,
  Lock,
  Gamepad2,
  Crosshair,
  RotateCcw,
  Sparkles,
  Shield,
  Search,
  Smile,
  Music,
  Music2,
  HelpCircle,
  Navigation,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Smartphone,
  X,
  Gavel,
  HeartPulse,
  Sparkle,
  Heart,
  BookOpen,
  Radio,
  UserCheck,
  DollarSign,
  Camera,
} from 'lucide-react';
import {
  enterMobileFullscreenAndLandscape,
  isFullscreenActive,
  subscribeFullscreenChange,
  toggleFullscreenMode,
} from '../utils/mobileFullscreen';

export interface GameHudProps {
  snapshot: RoomSnapshot;
  localPlayerId: string;
  muted: boolean;
  touchControlsEnabled: boolean;
  pointerLookEnabled: boolean;
  clueNotice: { title: string; detail: string } | null;
  killFlash?: boolean;
  compassYaw?: number;
  onToggleTouchControls: () => void;
  onTogglePointerLook: () => void;
  onResetCamera: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onOpenTacticalMap: () => void;
  onOpenGuide: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenStation: (station: StationModalKind) => void;
  onReportBody: (bodyId: string) => void;
  onEmergencyMeeting: () => void;
  onKill: (targetId: string) => void;
  onSabotage: (type: SabotageType) => void;
  onLockDoors: (zoneId: DoorZoneId) => void;
  onFixSabotageHold: (holding: boolean, valveId?: 'valve_cha' | 'valve_rickshaw') => void;
  onVentToggle: (destVentId?: string) => void;
  onUseAbility: (targetId?: string) => void;
  onPlayMeme: (memeId: MemeSoundId) => void;
  onOpenMemePack?: () => void;
}

const DOOR_OPTIONS: Array<{ zoneId: DoorZoneId; label: string }> = [
  { zoneId: 'cha_dokan', label: 'Cha Dokan' },
  { zoneId: 'rickshaw_garage', label: 'Rickshaw' },
  { zoneId: 'desco_power', label: 'DESCO' },
  { zoneId: 'dish_roof', label: 'Dish Hub' },
];

const SHORT_ZONE_LABELS: Record<string, string> = {
  adda_chowk: 'Adda',
  cha_dokan: 'Cha',
  rickshaw_garage: 'Garage',
  desco_power: 'DESCO',
  dish_roof: 'Dish',
  pukur_ghat: 'Pukur',
  bazar_stall: 'Bazar',
  eidgah_north: 'Eidgah',
  south_tank: 'WASA',
  fuchka_corner: 'Fuchka',
  saloon_goli: 'Saloon',
  cricket_math: 'Cricket',
  pharmacy_mor: 'Pharma',
  biyer_pandal: 'Pandal',
  kakar_bari: 'Kaka',
  master_bari: 'Master',
  chacha_bari: 'Chacha',
  khalar_bari: 'Khala',
  rail_station: 'Rail',
};

const COMPASS_LABELS: Record<number, string> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
};

function PubgCompassStrip({
  bearingDeg,
  compact,
}: {
  bearingDeg: number;
  compact: boolean;
}) {
  const pxPerDeg = compact ? 1.35 : 1.7;
  const centerDeg = ((bearingDeg % 360) + 360) % 360;
  const ticks: Array<{ key: string; offsetPx: number; major: boolean; label?: string }> = [];

  for (let d = -90; d <= 450; d += 15) {
    const diff = d - centerDeg;
    if (Math.abs(diff) > 78) continue;
    const norm = ((d % 360) + 360) % 360;
    const label = COMPASS_LABELS[norm] ?? (norm % 30 === 0 ? String(norm) : undefined);
    ticks.push({
      key: `${d}`,
      offsetPx: diff * pxPerDeg,
      major: Boolean(COMPASS_LABELS[norm]) || norm % 30 === 0,
      label,
    });
  }

  return (
    <div
      aria-label={`Compass heading ${Math.round(centerDeg)} degrees`}
      className={`pointer-events-none flex flex-col items-center select-none ${
        compact ? 'w-[172px]' : 'w-[220px] sm:w-[270px]'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="px-1.5 py-[1px] rounded bg-slate-950/90 border border-amber-400/50 font-mono-tabular text-[10px] font-black text-amber-300 tracking-wider shadow">
          {String(Math.round(centerDeg)).padStart(3, '0')}°
        </span>
      </div>
      <div
        className="relative w-full h-5 rounded-lg border border-white/15 overflow-hidden shadow-md"
        style={{ backgroundColor: 'rgba(10, 16, 28, 0.82)' }}
      >
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-amber-400 z-10"
        />
        {ticks.map((tk) => (
          <div
            key={tk.key}
            className="absolute top-0 flex flex-col items-center -translate-x-1/2"
            style={{ left: `calc(50% + ${tk.offsetPx.toFixed(1)}px)` }}
          >
            <div className={tk.major ? 'w-[1.5px] h-1.5 bg-amber-300/80' : 'w-[1px] h-1 bg-slate-400/55'} />
            {tk.label && (
              <span
                className={`text-[9px] font-display leading-none mt-[1px] ${
                  COMPASS_LABELS[((Math.round(Number(tk.key)) % 360) + 360) % 360]
                    ? 'font-black text-amber-200'
                    : 'font-semibold text-slate-300/85'
                }`}
              >
                {tk.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface MobileArcSlot {
  id: string;
  label: string;
  subLabel?: string;
  icon: React.ReactNode;
  accentHex: string;
  bgClass: string;
  disabled?: boolean;
  progress01?: number;
  pulse?: boolean;
  onClick?: () => void;
  onHold?: (holding: boolean) => void;
}

function MobileThumbArcButton({
  slot,
  hero = false,
}: {
  slot: MobileArcSlot;
  hero?: boolean;
}) {
  const sizePx = hero ? 62 : 50;
  const r = sizePx / 2 - 3;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, slot.progress01 ?? 0));
  const dashOffset = circumference * (1 - pct);

  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={slot.disabled}
      onClick={(e) => {
        if (slot.onHold) return;
        e.currentTarget.blur();
        slot.onClick?.();
      }}
      onPointerDown={(e) => {
        if (!slot.onHold) return;
        e.preventDefault();
        e.stopPropagation();
        slot.onHold(true);
      }}
      onPointerUp={(e) => {
        if (!slot.onHold) return;
        e.preventDefault();
        slot.onHold(false);
      }}
      onPointerLeave={() => {
        slot.onHold?.(false);
      }}
      onPointerCancel={() => {
        slot.onHold?.(false);
      }}
      aria-label={slot.subLabel ? `${slot.label} ${slot.subLabel}` : slot.label}
      className={`relative rounded-full flex flex-col items-center justify-center select-none active:scale-90 transition-transform shadow-[0_6px_20px_rgba(0,0,0,0.68)] disabled:opacity-35 ${slot.bgClass} ${
        slot.pulse ? 'animate-pulse' : ''
      }`}
      style={{
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        touchAction: 'none',
      }}
    >
      <svg
        width={sizePx}
        height={sizePx}
        viewBox={`0 0 ${sizePx} ${sizePx}`}
        className="absolute inset-0 -rotate-90 pointer-events-none"
        aria-hidden="true"
      >
        <circle
          cx={sizePx / 2}
          cy={sizePx / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={hero ? 2.5 : 2}
        />
        {pct > 0 && (
          <circle
            cx={sizePx / 2}
            cy={sizePx / 2}
            r={r}
            fill="none"
            stroke={slot.accentHex}
            strokeWidth={hero ? 3 : 2.5}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="relative z-10 flex flex-col items-center justify-center leading-none">
        {slot.icon}
        <span
          className={`font-display font-black tracking-wide mt-0.5 ${
            hero ? 'text-[9px]' : 'text-[8px]'
          }`}
        >
          {slot.label}
        </span>
        {slot.subLabel && (
          <span className="font-mono-tabular text-[8px] font-bold opacity-90 mt-[1px] max-w-[44px] truncate">
            {slot.subLabel}
          </span>
        )}
      </span>
    </button>
  );
}

const MinimapStaticZones = memo(function MinimapStaticZones() {
  return (
    <>
      <rect
        x={-MAP_HALF_SIZE}
        y={-MAP_HALF_SIZE}
        width={MAP_HALF_SIZE * 2}
        height={MAP_HALF_SIZE * 2}
        fill="#0b1322"
        rx="2"
      />
      {/* Main Crossroads, Outer Boulevard & South Rail Crossing */}
      <rect x={-9} y={-MAP_HALF_SIZE} width={18} height={MAP_HALF_SIZE * 2} fill="#1e293b" opacity={0.68} />
      <rect x={-MAP_HALF_SIZE} y={-9} width={MAP_HALF_SIZE * 2} height={18} fill="#1e293b" opacity={0.68} />
      <rect
        x={-54}
        y={-54}
        width={108}
        height={108}
        fill="none"
        stroke="#334155"
        strokeWidth="3.6"
        strokeDasharray="3 2"
      />
      <line x1={-90} y1={-72} x2={90} y2={-72} stroke="#334155" strokeWidth="3.2" />
      <line x1={-90} y1={72} x2={90} y2={72} stroke="#334155" strokeWidth="3.2" />
      <line x1={-90} y1={96} x2={90} y2={96} stroke="#334155" strokeWidth="2.8" />
      <line x1={-86} y1={-94} x2={-86} y2={94} stroke="#334155" strokeWidth="3.0" />
      <line x1={86} y1={-94} x2={86} y2={94} stroke="#334155" strokeWidth="3.0" />
      <line
        x1={-MAP_HALF_SIZE + 2}
        y1={RAILWAY_TRACK_Z}
        x2={MAP_HALF_SIZE - 2}
        y2={RAILWAY_TRACK_Z}
        stroke="#64748b"
        strokeWidth="2.6"
        strokeDasharray="1.4 1.6"
      />

      {ZONES.map((z) => (
        <rect
          key={z.id}
          x={z.x - z.width / 2}
          y={z.z - z.depth / 2}
          width={z.width}
          height={z.depth}
          fill={z.color}
          fillOpacity={0.52}
          stroke="#64748b"
          strokeWidth="0.55"
          rx="1.5"
        />
      ))}

      {/* Precision WALLS + Pukur Water */}
      {WALLS.map((w) =>
        w.id === 'pukur_water' ? (
          <rect
            key={w.id}
            x={w.minX}
            y={w.minZ}
            width={w.maxX - w.minX}
            height={w.maxZ - w.minZ}
            fill="#0284c7"
            fillOpacity={0.85}
            stroke="#7dd3fc"
            strokeWidth="0.6"
            rx="1"
          />
        ) : (
          <rect
            key={w.id}
            x={w.minX}
            y={w.minZ}
            width={Math.max(1.0, w.maxX - w.minX)}
            height={Math.max(1.0, w.maxZ - w.minZ)}
            fill={w.id.startsWith('outer_') ? '#475569' : w.height <= 1.9 ? '#78350f' : '#94a3b8'}
            fillOpacity={0.9}
          />
        ),
      )}

      {/* Walkable Chhad Rooftops + Exterior Stairways */}
      {ROOFTOPS.map((r) => (
        <rect
          key={r.id}
          x={r.minX}
          y={r.minZ}
          width={r.maxX - r.minX}
          height={r.maxZ - r.minZ}
          fill="#38bdf8"
          fillOpacity={0.12}
          stroke="#38bdf8"
          strokeOpacity={0.6}
          strokeWidth="0.5"
          strokeDasharray="1.8 1.2"
        />
      ))}
      {STAIR_RAMPS.map((st) => (
        <rect
          key={st.id}
          x={st.minX}
          y={st.minZ}
          width={st.maxX - st.minX}
          height={st.maxZ - st.minZ}
          fill="#f59e0b"
          fillOpacity={0.48}
          stroke="#fde68a"
          strokeWidth="0.5"
          rx="0.4"
        />
      ))}

      <circle cx={SECURITY_CAMS_POS.x} cy={SECURITY_CAMS_POS.z} r={1.6} fill="#fb7185" />
      <circle cx={ADMIN_TABLE_POS.x} cy={ADMIN_TABLE_POS.z} r={1.6} fill="#38bdf8" />
      <circle cx={VITALS_POS.x} cy={VITALS_POS.z} r={1.6} fill="#34d399" />
    </>
  );
});

const MinimapStaticLabels = memo(function MinimapStaticLabels() {
  return (
    <>
      {ZONES.map((z) => (
        <text
          key={`${z.id}-lbl`}
          x={z.x}
          y={z.z - z.depth / 2 + 4.4}
          textAnchor="middle"
          fill="#f8fafc"
          stroke="#090f1d"
          strokeWidth="1.5"
          paintOrder="stroke"
          fontSize="4.1"
          fontWeight="800"
        >
          {SHORT_ZONE_LABELS[z.id] ?? z.name}
        </text>
      ))}
    </>
  );
});

export function GameHud({
  snapshot,
  localPlayerId,
  muted,
  touchControlsEnabled,
  pointerLookEnabled,
  clueNotice,
  killFlash = false,
  compassYaw = 0,
  onToggleTouchControls,
  onTogglePointerLook,
  onResetCamera,
  onToggleMute,
  onPause,
  onOpenTacticalMap,
  onOpenGuide,
  onOpenTask,
  onOpenStation,
  onReportBody,
  onEmergencyMeeting,
  onKill,
  onSabotage,
  onLockDoors,
  onFixSabotageHold,
  onVentToggle,
  onUseAbility,
  onPlayMeme,
  onOpenMemePack,
}: GameHudProps) {
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const [isFullscreen, setIsFullscreen] = useState(() => isFullscreenActive());
  const [mobileTasksExpanded, setMobileTasksExpanded] = useState(false);
  const [dismissRotatePrompt, setDismissRotatePrompt] = useState(false);
  const [showSabotageMenu, setShowSabotageMenu] = useState(false);
  const [showDisguiseMenu, setShowDisguiseMenu] = useState(false);
  const [showMemeDrawer, setShowMemeDrawer] = useState(false);
  const [bgmEnabled, setBgmEnabled] = useState(() => soundEngine.isBgmEnabled());
  const [, setPackVer] = useState(0);

  useEffect(() => subscribeMemePack(() => setPackVer((v) => v + 1)), []);
  useEffect(() => subscribeFullscreenChange(setIsFullscreen), []);
  useEffect(
    () => soundEngine.subscribeBgmState(() => setBgmEnabled(soundEngine.isBgmEnabled())),
    [],
  );
  useEffect(() => {
    const updateVp = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', updateVp);
    window.visualViewport?.addEventListener('resize', updateVp);
    return () => {
      window.removeEventListener('resize', updateVp);
      window.visualViewport?.removeEventListener('resize', updateVp);
    };
  }, []);

  const isLandscapeCompact = viewport.h <= 540;
  const isNarrowMobile = viewport.w < 640;
  const isMobileHud = isLandscapeCompact || isNarrowMobile || touchControlsEnabled;
  const showMinimap = true;
  const quickMemes = getQuickMemeList();

  const localPlayer = snapshot.players.find((p) => p.id === localPlayerId);
  if (!localPlayer) return null;

  const isVondo = localPlayer.role === 'vondo';
  const isNeutral = isNeutralRole(localPlayer.specialRole);
  const taskEligible = canCompleteTasks(localPlayer);
  const wifiHidden = snapshot.sabotage.active === 'wifi_down' && !isVondo;
  const specialMeta = SPECIAL_ROLES[localPlayer.specialRole];
  const currentZone = getZoneNameAt(localPlayer.x, localPlayer.z);
  const currentZoneId = getZoneIdAt(localPlayer.x, localPlayer.z);
  const currentZoneDef = ZONES.find((z) => z.name === currentZone);

  // Alive OR ghost Para-basi (non-Pagol) complete real tasks; Batpar can open fake tasks for cover
  const nearbyTask =
    taskEligible || isVondo
      ? TASK_STATIONS.find((st) => {
          const hasUndone = localPlayer.tasks.some((t) => t.taskId === st.id && !t.completed);
          return hasUndone && distance2D(localPlayer.x, localPlayer.z, st.x, st.z) <= st.radius;
        }) ?? null
      : null;
  const nearbyTaskLocked = nearbyTask ? isTaskLockedBySabotage(nearbyTask.id, snapshot.sabotage) : false;

  const nearCams =
    localPlayer.alive &&
    distance2D(localPlayer.x, localPlayer.z, SECURITY_CAMS_POS.x, SECURITY_CAMS_POS.z) <=
      SECURITY_CAMS_POS.radius;
  const nearAdmin =
    localPlayer.alive &&
    distance2D(localPlayer.x, localPlayer.z, ADMIN_TABLE_POS.x, ADMIN_TABLE_POS.z) <=
      ADMIN_TABLE_POS.radius;
  const nearVitals =
    localPlayer.alive &&
    distance2D(localPlayer.x, localPlayer.z, VITALS_POS.x, VITALS_POS.z) <= VITALS_POS.radius;

  const fixRange = localPlayer.specialRole === 'mistri' ? MISTRI_FIX_RANGE : SABOTAGE_FIX_RANGE;
  const nearGasValve =
    snapshot.sabotage.active === 'gas_leak' && localPlayer.alive
      ? findNearestGasValve(localPlayer.x, localPlayer.z, snapshot.sabotage, fixRange)
      : null;
  const nearSabotageFix = Boolean(
    snapshot.sabotage.active &&
      localPlayer.alive &&
      (snapshot.sabotage.active === 'gas_leak'
        ? nearGasValve
        : distance2D(
            localPlayer.x,
            localPlayer.z,
            snapshot.sabotage.fixStationX,
            snapshot.sabotage.fixStationZ,
          ) <= fixRange),
  );

  const nearbyBody = findNearestReportableBody(localPlayer, snapshot.bodies, snapshot.doorLocks);
  const inspectableBody = findNearestInspectableBody(localPlayer, snapshot.bodies);
  const shieldTarget = findNearestShieldTarget(localPlayer, snapshot.players);
  const darogaTarget = findNearestDarogaTarget(localPlayer, snapshot.players);
  const cleanableBody = findNearestCleanableBody(localPlayer, snapshot.bodies);
  const revivableBody = findNearestRevivableBody(localPlayer, snapshot.bodies);
  const ghotokPair = findGhotokPairCandidates(localPlayer, snapshot.players);
  const masterTarget = findNearestMasterTarget(localPlayer, snapshot.players);
  const haturTarget = findNearestHaturTarget(localPlayer, snapshot.players);
  const chamchaTarget = findNearestChamchaPatron(localPlayer, snapshot.players);
  const chandabazTarget = findNearestChandabazTarget(localPlayer, snapshot.players);
  const supariTarget = localPlayer.supariTargetId
    ? snapshot.players.find((p) => p.id === localPlayer.supariTargetId && p.alive) ?? null
    : null;
  const chamchaPatron = localPlayer.chamchaPatronId
    ? snapshot.players.find((p) => p.id === localPlayer.chamchaPatronId) ?? null
    : null;
  const ghotokPartner = localPlayer.ghotokPartnerId
    ? snapshot.players.find((p) => p.id === localPlayer.ghotokPartnerId) ?? null
    : null;
  const commsJammed = (snapshot.commsJammedUntil ?? 0) > Date.now();
  const haturProtected = (localPlayer.haturProtectedUntil ?? 0) > Date.now();

  const nearBell =
    localPlayer.alive &&
    !isCriticalSabotage(snapshot.sabotage.active) &&
    distance2D(localPlayer.x, localPlayer.z, EMERGENCY_BELL_POS.x, EMERGENCY_BELL_POS.z) <=
      EMERGENCY_BELL_POS.interactRadius;

  const killTarget = isVondo ? findNearestKillTarget(localPlayer, snapshot.players) : null;
  const playerCanVent = canUseVent(localPlayer);
  const nearVent =
    (isVondo || localPlayer.specialRole === 'mistri') && localPlayer.alive
      ? VENTS.find((v) => distance2D(localPlayer.x, localPlayer.z, v.x, v.z) <= VENT_RANGE)
      : null;

  const disguiseTargets =
    localPlayer.specialRole === 'bohurupi'
      ? snapshot.players.filter((p) => p.alive && p.id !== localPlayer.id && p.role !== 'vondo')
      : [];

  const taskPct = Math.round(snapshot.taskProgress * 100);
  const emergencyCd = Math.ceil(snapshot.emergencyCooldownRemaining);
  const canCallEmergency =
    nearBell && emergencyCd <= 0 && localPlayer.emergencyMeetingsLeft > 0;
  const anyDoorLocked =
    snapshot.doorLocks.cha_dokan > 0 ||
    snapshot.doorLocks.rickshaw_garage > 0 ||
    snapshot.doorLocks.desco_power > 0 ||
    snapshot.doorLocks.dish_roof > 0;

  const ventGraph = localPlayer.inVent
    ? getConnectedVents(localPlayer.x, localPlayer.z)
    : { currentVent: null, targets: [] };

  // Compute nearest incomplete task or active sabotage compass bearing
  const nextTaskStation =
    (taskEligible || isVondo) && !wifiHidden
      ? localPlayer.tasks
          .filter((t) => !t.completed)
          .map((t) => TASK_STATIONS.find((s) => s.id === t.taskId))
          .filter((s): s is NonNullable<typeof s> => Boolean(s))
          .sort(
            (a, b) =>
              distance2D(localPlayer.x, localPlayer.z, a.x, a.z) -
              distance2D(localPlayer.x, localPlayer.z, b.x, b.z),
          )[0] ?? null
      : null;

  const nearestTargetValve =
    snapshot.sabotage.active === 'gas_leak'
      ? [...snapshot.sabotage.valves].sort((a, b) => {
          const aScore = (a.holderId ? 100 : 0) + distance2D(localPlayer.x, localPlayer.z, a.x, a.z);
          const bScore = (b.holderId ? 100 : 0) + distance2D(localPlayer.x, localPlayer.z, b.x, b.z);
          return aScore - bScore;
        })[0] ?? GAS_LEAK_VALVES[0]
      : null;

  const activeCompass = snapshot.sabotage.active
    ? snapshot.sabotage.active === 'gas_leak' && nearestTargetValve
      ? {
          urgent: true,
          label: nearestTargetValve.label,
          ...getDirectionCompass(
            localPlayer.x,
            localPlayer.z,
            nearestTargetValve.x,
            nearestTargetValve.z,
          ),
        }
      : {
          urgent: true,
          label: snapshot.sabotage.active === 'loadshedding' ? 'DESCO Breaker' : 'Dish Hub',
          ...getDirectionCompass(
            localPlayer.x,
            localPlayer.z,
            snapshot.sabotage.fixStationX,
            snapshot.sabotage.fixStationZ,
          ),
        }
    : nextTaskStation
      ? {
          urgent: false,
          label: nextTaskStation.title,
          ...getDirectionCompass(
            localPlayer.x,
            localPlayer.z,
            nextTaskStation.x,
            nextTaskStation.z,
          ),
        }
      : null;

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-5"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.65rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.65rem, env(safe-area-inset-right))',
      }}
    >
      {/* Subtle Crimson Vignette Flash on Kill / Size Event */}
      {killFlash && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-20 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 110px rgba(225, 29, 72, 0.72)',
            backgroundColor: 'rgba(159, 18, 57, 0.16)',
          }}
        />
      )}

      {/* Loadshedding Dark HUD Overlay for Non-Batpar */}
      {snapshot.sabotage.active === 'loadshedding' && !isVondo && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(2, 6, 23, 0.08) 28%, rgba(2, 6, 23, 0.72) 85%)',
          }}
        />
      )}

      {/* Top Container: Portrait Fullscreen Banner (when in portrait) + Left/Center/Right HUD Clusters */}
      <div className="flex flex-col gap-1.5">
        {/* Non-blocking Portrait Mobile Fullscreen Landscape Quick Chip */}
        {touchControlsEnabled &&
          !isFullscreen &&
          viewport.w < viewport.h &&
          !dismissRotatePrompt &&
          !clueNotice && (
            <div className="self-center pointer-events-auto flex items-center gap-1.5 rounded-xl px-2.5 py-1 border border-amber-400/45 shadow-lg bg-slate-950/92 text-[11px] font-bold text-amber-200 whitespace-nowrap shrink-0">
              <button
                type="button"
                onClick={() => {
                  void enterMobileFullscreenAndLandscape();
                }}
                className="flex items-center gap-1.5 text-amber-200 hover:text-white"
              >
                <Smartphone className="w-3.5 h-3.5 text-amber-300" />
                <span>Fullscreen Landscape</span>
                <Maximize2 className="w-3 h-3 text-amber-300" />
              </button>
              <button
                type="button"
                onClick={() => setDismissRotatePrompt(true)}
                aria-label="Dismiss fullscreen tip"
                className="p-0.5 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

        {/* Ghost Mode Status Banner when dead */}
        {!localPlayer.alive && (
          <div
            role="status"
            aria-label="Ghost Mode Active"
            className="self-center pointer-events-none flex items-center gap-2 rounded-xl px-3 py-1 border border-sky-400/50 shadow-lg bg-slate-950/90 text-[11px] sm:text-xs font-bold text-sky-200 max-w-[95vw] text-center"
          >
            <span className="text-sky-300 font-display tracking-wide">GHOST MODE</span>
            <span className="text-slate-300 font-semibold truncate">
              {taskEligible
                ? 'Tumi Adrishyo! Alive keu tomake dekhbe na — deyal bhed kore Tasks sesh koro!'
                : 'Tumi Adrishyo! Alive keu tomake dekhbe na — ghoraghuri kore match dekho!'}
            </span>
          </div>
        )}

        {/* Top Row: Left Task/Role Cluster · Center PUBG Compass · Right Utility/Minimap Cluster */}
        <div className="flex items-start justify-between gap-2 sm:gap-3">
        {/* Top-Left Cluster */}
        <div
          className={`flex flex-col gap-1.5 shrink-0 w-full ${
            isLandscapeCompact ? 'max-w-[205px]' : 'max-w-[200px] sm:max-w-[285px]'
          }`}
        >
          <div
            className={`pointer-events-auto rounded-xl border border-white/12 shadow-lg ${
              isLandscapeCompact ? 'px-2.5 py-1.5' : 'px-3 py-2 sm:px-4 sm:py-3'
            }`}
            style={{ backgroundColor: 'rgba(12, 18, 30, 0.86)' }}
          >
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="text-slate-300">Para Tasks</span>
              <span className="font-mono-tabular text-amber-300">
                {wifiHidden
                  ? 'Wi-Fi Nai!'
                  : `${snapshot.completedTasks}/${snapshot.totalTasks} · ${taskPct}%`}
              </span>
            </div>
            <div className="w-full h-2 sm:h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  wifiHidden ? 'bg-indigo-500/70 animate-pulse' : 'bg-emerald-400'
                }`}
                style={{ width: wifiHidden ? '100%' : `${taskPct}%` }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] sm:text-xs gap-2">
              <span
                className="font-display font-bold truncate"
                style={{
                  color:
                    localPlayer.specialRole !== 'none'
                      ? specialMeta.accentHex
                      : isVondo
                        ? '#fb7185'
                        : '#7dd3fc',
                }}
              >
                {localPlayer.specialRole !== 'none'
                  ? specialMeta.title.split(' ')[0].toUpperCase()
                  : isVondo
                    ? 'BATPAR'
                    : 'PARA-BASI'}
                {localPlayer.specialRole === 'neta' && localPlayer.alive ? ' · 2x Vote' : ''}
                {!localPlayer.alive ? ' · Ghost' : ''}
              </span>
              <span className="text-slate-200 font-semibold truncate max-w-[130px] sm:max-w-[155px]" title={currentZone}>
                {currentZoneDef ? `${currentZoneDef.name}` : currentZone}
              </span>
            </div>

            {activeCompass && (
              <div
                className={`mt-1.5 pt-1.5 border-t border-slate-800/90 flex items-center justify-between gap-2 text-[11px] font-semibold ${
                  activeCompass.urgent ? 'text-rose-300' : 'text-amber-200'
                }`}
              >
                <span className="flex items-center gap-1 truncate">
                  <Navigation className="w-3 h-3 shrink-0" />
                  <span className="truncate">{activeCompass.label}</span>
                </span>
                <span className="font-mono-tabular shrink-0 px-1.5 py-0.5 rounded bg-slate-800/90 text-white">
                  {activeCompass.arrow} {activeCompass.distance}m
                </span>
              </div>
            )}

            {!localPlayer.alive && taskEligible && (
              <div className="mt-1 text-[10px] font-semibold text-sky-300">
                Ghost Mode: Fly through walls &amp; finish tasks!
              </div>
            )}

            {(localPlayer.shielded ||
              haturProtected ||
              localPlayer.disguiseName ||
              ghotokPartner ||
              supariTarget ||
              chamchaPatron ||
              localPlayer.specialRole === 'chandabaz' ||
              localPlayer.specialRole === 'tiktok_star') && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[11px] font-semibold flex flex-wrap items-center gap-2">
                {localPlayer.shielded && (
                  <span className="text-amber-300 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Tabiz Shielded
                  </span>
                )}
                {haturProtected && (
                  <span className="text-lime-300 flex items-center gap-1">
                    <HeartPulse className="w-3 h-3" />
                    Jhajhro Active
                  </span>
                )}
                {localPlayer.disguiseName && (
                  <span className="text-rose-300 font-mono-tabular">
                    Shifted: {localPlayer.disguiseName} ({Math.ceil(localPlayer.disguiseTimer)}s)
                  </span>
                )}
                {ghotokPartner && (
                  <span className="text-pink-300 flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    Bond: {ghotokPartner.name}
                  </span>
                )}
                {supariTarget && (
                  <span className="text-rose-300 flex items-center gap-1">
                    <Crosshair className="w-3 h-3" />
                    Supari: {supariTarget.name}
                  </span>
                )}
                {chamchaPatron && (
                  <span className="text-purple-300 flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    Patron: {chamchaPatron.name}
                  </span>
                )}
                {localPlayer.specialRole === 'chandabaz' && (
                  <span className="text-amber-300 font-mono-tabular">
                    Chanda: {localPlayer.chandabazTargets?.length ?? 0}/3
                  </span>
                )}
                {localPlayer.specialRole === 'tiktok_star' && (
                  <span className="text-pink-300 font-mono-tabular">
                    Reels: {localPlayer.tiktokZones?.length ?? 0}/3
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Assigned Task List (hidden during wifi_down for crew; Batpar sees Fake Task Cover) */}
          {isNeutral ? (
            !isLandscapeCompact && (
              <div
                className="hidden sm:block rounded-xl px-3.5 py-2.5 border border-purple-500/40 shadow-lg text-xs text-purple-200"
                style={{ backgroundColor: 'rgba(28, 14, 44, 0.9)' }}
              >
                <span className="font-display font-bold text-purple-300 block mb-0.5">
                  {specialMeta.banglaTitle} · {specialMeta.title}
                </span>
                {specialMeta.shortDesc}
              </div>
            )
          ) : wifiHidden ? (
            <div
              className="rounded-xl px-3 py-2 border border-indigo-400/50 shadow-lg text-[11px] font-semibold text-indigo-200"
              style={{ backgroundColor: 'rgba(30, 27, 75, 0.92)' }}
            >
              Wi-Fi Nai! Task List &amp; Bar Gayeb — Dish Hub e giye thik koro!
            </div>
          ) : isLandscapeCompact || isNarrowMobile ? (
            <div className="pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setMobileTasksExpanded((v) => !v);
                }}
                className="px-2.5 py-1 rounded-lg border border-white/12 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5 shadow"
                style={{ backgroundColor: 'rgba(10, 15, 28, 0.84)' }}
              >
                <span>
                  {isVondo ? 'Fake Tasks' : 'Tasks'} (
                  {localPlayer.tasks.filter((t) => t.completed).length}/{localPlayer.tasks.length})
                </span>
                {mobileTasksExpanded ? (
                  <ChevronUp className="w-3 h-3 text-amber-300" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-amber-300" />
                )}
              </button>
              {mobileTasksExpanded && (
                <div
                  className="mt-1 rounded-xl px-2.5 py-2 border border-white/15 shadow-lg text-[11px] space-y-1 max-h-[120px] overflow-y-auto"
                  style={{ backgroundColor: 'rgba(10, 15, 28, 0.94)' }}
                >
                  {isVondo && (
                    <div className="text-[10px] font-bold text-rose-300 pb-0.5 border-b border-slate-800">
                      Fake Task Cover (0% Team Progress)
                    </div>
                  )}
                  {localPlayer.tasks.map((t) => {
                    const st = TASK_STATIONS.find((s) => s.id === t.taskId);
                    if (!st) return null;
                    return (
                      <div
                        key={t.taskId}
                        className={`flex items-center justify-between gap-2 ${
                          t.completed
                            ? 'text-emerald-400 line-through opacity-75'
                            : 'text-slate-100 font-medium'
                        }`}
                      >
                        <span className="truncate">{st.title}</span>
                        <span className="text-[10px] text-slate-300 shrink-0">{st.zoneName}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div
              className="rounded-xl px-3.5 py-2.5 border border-white/15 shadow-lg text-xs space-y-1"
              style={{ backgroundColor: 'rgba(10, 15, 28, 0.92)' }}
            >
              {isVondo && (
                <div className="text-[11px] font-bold text-rose-300 pb-1 border-b border-slate-800">
                  Fake Task Cover (0% Team Progress)
                </div>
              )}
              {localPlayer.tasks.map((t) => {
                const st = TASK_STATIONS.find((s) => s.id === t.taskId);
                if (!st) return null;
                return (
                  <div
                    key={t.taskId}
                    className={`flex items-center justify-between gap-2 ${
                      t.completed ? 'text-emerald-400 line-through opacity-75' : 'text-slate-100 font-medium'
                    }`}
                  >
                    <span className="truncate">{st.title}</span>
                    <span className="text-[11px] text-slate-300 shrink-0">{st.zoneName}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active Sabotage Alert */}
          {snapshot.sabotage.active && (
            <div
              role="alert"
              className={`rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 border text-[11px] sm:text-xs font-bold flex flex-col gap-1 ${
                isCriticalSabotage(snapshot.sabotage.active)
                  ? 'border-rose-400 text-rose-100 animate-pulse'
                  : snapshot.sabotage.active === 'loadshedding'
                    ? 'border-amber-400/60 text-amber-100'
                    : 'border-indigo-400/60 text-indigo-100'
              }`}
              style={{
                backgroundColor: isCriticalSabotage(snapshot.sabotage.active)
                  ? 'rgba(153, 27, 27, 0.94)'
                  : 'rgba(30, 41, 59, 0.92)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate">
                  <Zap className="w-4 h-4 text-amber-300 shrink-0" />
                  {snapshot.sabotage.active === 'gas_leak' ? (
                    <span>CRITICAL: GAS PHUTCHE! 2 Valve Hold Koro!</span>
                  ) : snapshot.sabotage.active === 'loadshedding' ? (
                    <span>BATTI GELO! DESCO Hold-E 3s (Auto {Math.ceil(snapshot.sabotage.timeRemaining)}s)</span>
                  ) : (
                    <span>WI-FI NAI! Dish Hold-E 3s (Auto {Math.ceil(snapshot.sabotage.timeRemaining)}s)</span>
                  )}
                </span>
                {isCriticalSabotage(snapshot.sabotage.active) && (
                  <span className="font-mono-tabular text-amber-300 shrink-0 text-sm">
                    {Math.ceil(snapshot.sabotage.timeRemaining)}s
                  </span>
                )}
              </div>
              {snapshot.sabotage.active === 'gas_leak' && (
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-amber-200">
                  {snapshot.sabotage.valves.map((v) => (
                    <span
                      key={v.id}
                      className={`px-1.5 py-0.5 rounded ${
                        v.holderId ? 'bg-emerald-600/80 text-white' : 'bg-slate-900/70 text-rose-200'
                      }`}
                    >
                      {v.id === 'valve_cha' ? 'Cha Dokan' : 'Garage'}: {v.holderId ? 'HELD' : 'OPEN'}
                    </span>
                  ))}
                  {snapshot.sabotage.fixProgress > 0 && (
                    <span className="text-emerald-300">
                      {Math.round(snapshot.sabotage.fixProgress * 100)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {anyDoorLocked && (
            <div
              className="rounded-xl px-3 py-1.5 border border-amber-400/50 text-[11px] font-bold text-amber-200 flex items-center gap-1.5"
              style={{ backgroundColor: 'rgba(120, 53, 15, 0.9)' }}
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              SHUTTER NAMAY DISE!
            </div>
          )}

          {commsJammed && (
            <div
              className="rounded-xl px-3 py-1.5 border border-rose-400/50 text-[11px] font-bold text-rose-200 flex items-center gap-1.5"
              style={{ backgroundColor: 'rgba(127, 29, 29, 0.88)' }}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              DALAL COMMS JAMMED! (Admin/Vitals off)
            </div>
          )}
        </div>

        {/* Top-Center PUBG Bearing Compass Strip (auto-sized flex center slot -> zero overlap) */}
        {!clueNotice && viewport.w >= 540 && (
          <div className="flex-1 min-w-0 flex justify-center pt-0.5 pointer-events-none">
            <PubgCompassStrip
              bearingDeg={(((-compassYaw * 180) / Math.PI) % 360 + 360) % 360}
              compact={isLandscapeCompact || viewport.w < 960}
            />
          </div>
        )}

        {/* Top-Right Cluster: Utility Buttons + Live Moholla SVG Minimap */}
        <div className="flex flex-col items-end gap-1.5 sm:gap-2 shrink-0">
          <div
            className={`pointer-events-auto ${
              isLandscapeCompact
                ? 'flex items-center justify-end gap-1'
                : 'grid grid-cols-4 sm:flex sm:flex-wrap items-center justify-end gap-1.5'
            }`}
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                void toggleFullscreenMode(true);
              }}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              title={isFullscreen ? 'Exit Fullscreen' : 'PUBG Fullscreen Mode'}
              className={`${
                isLandscapeCompact
                  ? 'min-w-[34px] min-h-[34px]'
                  : 'min-w-[36px] min-h-[36px] sm:min-w-[42px] sm:min-h-[42px]'
              } rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold ${
                isFullscreen
                  ? 'border-emerald-400/60 text-emerald-300'
                  : 'border-amber-400/45 text-amber-200 hover:text-white'
              }`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setShowMemeDrawer((v) => !v);
              }}
              aria-label="Toggle Meme Soundboard [1-6]"
              aria-expanded={showMemeDrawer}
              title="Bangla Meme SFX [1-6]"
              className={`${
                isLandscapeCompact
                  ? 'min-w-[34px] min-h-[34px]'
                  : 'min-w-[36px] min-h-[36px] sm:min-w-[42px] sm:min-h-[42px] 2xl:px-2.5'
              } rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold ${
                showMemeDrawer
                  ? 'border-amber-400 text-amber-300'
                  : 'border-white/12 text-amber-200 hover:text-amber-100'
              }`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
            >
              <Smile className="w-4 h-4" />
              {!isLandscapeCompact && <span className="hidden 2xl:inline">Memes</span>}
            </button>
            {!isMobileHud && (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onTogglePointerLook();
                }}
                aria-label="Toggle Free Mouse Look [C]"
                title="PUBG Free Mouse Look [C]"
                className={`hidden sm:flex min-w-[42px] min-h-[42px] 2xl:px-2.5 rounded-xl border items-center justify-center gap-1.5 text-xs font-semibold ${
                  pointerLookEnabled
                    ? 'border-amber-400 text-amber-300'
                    : 'border-white/12 text-slate-200 hover:text-white'
                }`}
                style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
              >
                <Crosshair className="w-4 h-4" />
                <span className="hidden 2xl:inline">{pointerLookEnabled ? 'Look ON' : 'Look'}</span>
              </button>
            )}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onResetCamera();
              }}
              aria-label="Reset Camera Angle [Y]"
              title="Reset Camera [Y]"
              className={`${
                isLandscapeCompact
                  ? 'min-w-[34px] min-h-[34px]'
                  : 'min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px]'
              } rounded-xl border border-white/12 flex items-center justify-center text-slate-200 hover:text-white`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            {!isLandscapeCompact && (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleTouchControls();
                }}
                aria-label="Toggle Touch Joystick"
                title="Touch Controls"
                className={`min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] rounded-xl border flex items-center justify-center ${
                  touchControlsEnabled
                    ? 'border-amber-400/60 text-amber-300'
                    : 'border-white/12 text-slate-200 hover:text-white'
                }`}
                style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
              >
                <Gamepad2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenTacticalMap();
              }}
              aria-label="Open Full Tactical Map [Tab]"
              title="Full Moholla Map [Tab]"
              className={`${
                isLandscapeCompact
                  ? 'min-w-[34px] min-h-[34px]'
                  : 'min-w-[36px] min-h-[36px] sm:min-w-[42px] sm:min-h-[42px] 2xl:px-2.5'
              } rounded-xl border border-white/12 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-amber-300`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
            >
              <MapIcon className="w-4 h-4" />
              {!isLandscapeCompact && <span className="hidden 2xl:inline">Map</span>}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenGuide();
              }}
              aria-label="Open Rules and Roles Guide [H]"
              title="Rules & Roles [H]"
              className={`${
                isLandscapeCompact
                  ? 'min-w-[34px] min-h-[34px]'
                  : 'min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px]'
              } rounded-xl border border-white/12 flex items-center justify-center text-slate-200 hover:text-amber-300`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                soundEngine.toggleBgm();
              }}
              aria-label={bgmEnabled ? 'Turn Off Background Music' : 'Turn On Background Music'}
              title={bgmEnabled ? 'BGM On (Click to Mute Music)' : 'BGM Off (Click to Play Music)'}
              className={`${
                isLandscapeCompact
                  ? 'min-w-[34px] min-h-[34px]'
                  : 'min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px]'
              } rounded-xl border flex items-center justify-center ${
                bgmEnabled
                  ? 'border-emerald-400/50 text-emerald-300 hover:text-emerald-200'
                  : 'border-white/12 text-slate-400 hover:text-white'
              }`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
            >
              <Music className="w-4 h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-label={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
              title="Mute All [M]"
              className={`${
                isLandscapeCompact
                  ? 'min-w-[34px] min-h-[34px]'
                  : 'min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px]'
              } rounded-xl border border-white/12 flex items-center justify-center text-slate-200 hover:text-white`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              aria-label="Pause Game [P]"
              title="Pause [P]"
              className={`${
                isLandscapeCompact
                  ? 'min-w-[34px] min-h-[34px]'
                  : 'min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px]'
              } rounded-xl border border-white/12 flex items-center justify-center text-slate-200 hover:text-white`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>

          {showMemeDrawer && (
            <div
              role="region"
              aria-label="Bangla Meme Soundboard"
              className="pointer-events-auto rounded-xl p-2.5 border border-amber-400/40 shadow-2xl grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-[210px] sm:w-[376px]"
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.96)' }}
            >
              {quickMemes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onPlayMeme(m.id);
                  }}
                  className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-[11px] font-bold text-amber-200 text-left flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="truncate">{m.label}</span>
                  <span className="font-mono-tabular text-[10px] opacity-75 shrink-0">[{m.shortKey}]</span>
                </button>
              ))}
              {onOpenMemePack && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setShowMemeDrawer(false);
                    onOpenMemePack();
                  }}
                  className="sm:col-span-2 mt-1 px-3 py-2 rounded-lg bg-amber-400/15 hover:bg-amber-400 hover:text-slate-950 border border-amber-400/40 text-[11px] font-bold text-amber-300 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Music2 className="w-3.5 h-3.5" />
                  Upload / Customize Original Memes
                </button>
              )}
            </div>
          )}

          {showMinimap && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenTacticalMap();
              }}
              aria-label="Expand Moholla Tactical Map"
              title="Click to Expand Tactical Map [Tab]"
              className={`pointer-events-auto rounded-xl border border-white/12 hover:border-amber-400/50 shadow-lg transition-colors ${
                isLandscapeCompact || isNarrowMobile ? 'p-1' : 'p-2'
              }`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.84)' }}
            >
              <svg
                viewBox={`${-MAP_HALF_SIZE} ${-MAP_HALF_SIZE} ${MAP_HALF_SIZE * 2} ${MAP_HALF_SIZE * 2}`}
                className={
                  isLandscapeCompact
                    ? 'w-[92px] h-[92px]'
                    : isNarrowMobile
                      ? 'w-24 h-24'
                      : 'w-44 h-44'
                }
                aria-hidden="true"
              >
                <MinimapStaticZones />

                {/* Dynamic Incomplete Task Markers (hidden during wifi_down for crew) */}
                {!isVondo &&
                  !isNeutral &&
                  !wifiHidden &&
                  localPlayer.tasks
                    .filter((t) => !t.completed)
                    .map((t) => {
                      const st = TASK_STATIONS.find((s) => s.id === t.taskId);
                      if (!st) return null;
                      return (
                        <circle
                          key={st.id}
                          cx={st.x}
                          cy={st.z}
                          r={1.9}
                          fill="#fbbf24"
                          stroke="#0f172a"
                          strokeWidth="0.7"
                        />
                      );
                    })}

                {/* Sabotage Marker(s) */}
                {snapshot.sabotage.active === 'gas_leak' ? (
                  snapshot.sabotage.valves.map((v) => (
                    <circle
                      key={v.id}
                      cx={v.x}
                      cy={v.z}
                      r={2.5}
                      fill={v.holderId ? '#10b981' : '#ef4444'}
                      stroke="#ffffff"
                      strokeWidth="0.8"
                    />
                  ))
                ) : snapshot.sabotage.active ? (
                  <circle
                    cx={snapshot.sabotage.fixStationX}
                    cy={snapshot.sabotage.fixStationZ}
                    r={2.5}
                    fill="#ef4444"
                    stroke="#ffffff"
                    strokeWidth="0.8"
                  />
                ) : null}

                {/* Live Door Shutter States */}
                {DOORS.map((d) => {
                  const locked = snapshot.doorLocks[d.zoneId] > 0;
                  return (
                    <rect
                      key={d.id}
                      x={d.minX}
                      y={d.minZ}
                      width={Math.max(1.4, d.maxX - d.minX)}
                      height={Math.max(1.4, d.maxZ - d.minZ)}
                      fill={locked ? '#f59e0b' : '#334155'}
                      fillOpacity={locked ? 0.95 : 0.45}
                    />
                  );
                })}

                {/* Local Player Directional Chevron + 60-deg Camera FOV Cone */}
                <g>
                  <g
                    transform={`translate(${localPlayer.x}, ${localPlayer.z}) rotate(${(((-compassYaw * 180) / Math.PI) % 360 + 360) % 360})`}
                  >
                    <path
                      d="M 0 0 L -8 -16 A 17.5 17.5 0 0 1 8 -16 Z"
                      fill="#38bdf8"
                      fillOpacity={0.28}
                    />
                  </g>
                  <g
                    transform={`translate(${localPlayer.x}, ${localPlayer.z}) rotate(${180 - (localPlayer.yaw * 180) / Math.PI})`}
                  >
                    <polygon
                      points="0,-4.4 3.4,3.1 0,1.4 -3.4,3.1"
                      fill="#38bdf8"
                      stroke="#ffffff"
                      strokeWidth="0.9"
                      strokeLinejoin="round"
                    />
                  </g>
                </g>

                <MinimapStaticLabels />
              </svg>
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Top-Center Clue / Ability Toast */}
      {clueNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-30 max-w-md w-[90vw] rounded-xl px-4 py-2.5 border border-cyan-400/50 shadow-2xl text-center"
          style={{ backgroundColor: 'rgba(10, 18, 32, 0.94)' }}
        >
          <div className="text-xs font-display font-bold text-cyan-300">{clueNotice.title}</div>
          <div className="text-[11px] sm:text-xs text-slate-100 mt-0.5">{clueNotice.detail}</div>
        </div>
      )}

      {/* Bottom Row: Vent/Sabotage/Disguise Drawers + Thumb-Friendly Action Buttons */}
      <div className="flex items-end justify-between gap-2 sm:gap-4">
        {!isMobileHud && (
          <div
            className="text-xs text-slate-200 hidden md:block px-3 py-1.5 rounded-lg border border-slate-700/50"
            style={{ backgroundColor: 'rgba(10, 15, 25, 0.84)' }}
          >
            WASD Move · Space Jump · Shift Sprint · Drag 360°/Sky · Tab Map · E Use · R Report · F Shalish · H Guide
          </div>
        )}

        <div
          className={`flex flex-col items-end gap-2 ml-auto ${
            isMobileHud ? 'pointer-events-none' : 'pointer-events-auto max-w-[54vw] sm:max-w-none'
          }`}
        >
          {localPlayer.inVent && (
            <div
              className="pointer-events-auto rounded-xl p-2.5 border border-emerald-500/40 flex flex-wrap items-center justify-end gap-2"
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.94)' }}
            >
              <span className="text-xs font-bold text-emerald-300 mr-1">
                {ventGraph.currentVent ? `Inside ${ventGraph.currentVent.label}:` : 'Gopon Dren:'}
              </span>
              {ventGraph.targets.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onVentToggle(v.id)}
                  className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-xs font-semibold text-white"
                >
                  → {v.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onVentToggle()}
                className="min-h-[40px] px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold"
              >
                Uki Maro! [V]
              </button>
            </div>
          )}

          {showSabotageMenu && isVondo && (
            <div
              className="pointer-events-auto rounded-xl p-3 border border-rose-500/40 flex flex-col gap-2"
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.95)' }}
            >
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={Boolean(snapshot.sabotage.active) || snapshot.sabotage.cooldownRemaining > 0}
                  onClick={() => {
                    onSabotage('gas_leak');
                    setShowSabotageMenu(false);
                  }}
                  className="min-h-[42px] px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-xs font-bold text-white"
                >
                  Gas Leak! (CRITICAL 45s)
                </button>
                <button
                  type="button"
                  disabled={Boolean(snapshot.sabotage.active) || snapshot.sabotage.cooldownRemaining > 0}
                  onClick={() => {
                    onSabotage('loadshedding');
                    setShowSabotageMenu(false);
                  }}
                  className="min-h-[42px] px-3 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-xs font-bold text-white"
                >
                  Current Khao! (90s Dark)
                </button>
                <button
                  type="button"
                  disabled={Boolean(snapshot.sabotage.active) || snapshot.sabotage.cooldownRemaining > 0}
                  onClick={() => {
                    onSabotage('wifi_down');
                    setShowSabotageMenu(false);
                  }}
                  className="min-h-[42px] px-3 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-xs font-bold text-white"
                >
                  MB Shesh! Wi-Fi Kat!
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-800">
                <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1 mr-1">
                  <Lock className="w-3 h-3" />
                  Shutter Namaw{snapshot.doorLocks.cooldownRemaining > 0 ? ` (${Math.ceil(snapshot.doorLocks.cooldownRemaining)}s)` : ':'}
                </span>
                {DOOR_OPTIONS.map((d) => (
                  <button
                    key={d.zoneId}
                    type="button"
                    disabled={snapshot.doorLocks.cooldownRemaining > 0}
                    onClick={() => {
                      onLockDoors(d.zoneId);
                      setShowSabotageMenu(false);
                    }}
                    className="min-h-[38px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-600 disabled:opacity-40 text-[11px] font-semibold text-white"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showDisguiseMenu && localPlayer.specialRole === 'bohurupi' && !localPlayer.disguiseColor && (
            <div
              className="pointer-events-auto rounded-xl p-2.5 border border-rose-500/40 flex flex-wrap items-center justify-end gap-1.5 max-w-md"
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.95)' }}
            >
              <span className="text-[11px] font-bold text-rose-300 mr-1">Shapeshift Into:</span>
              {disguiseTargets.map((target) => {
                const c = PLAYER_COLORS.find((col) => col.id === target.color) ?? PLAYER_COLORS[0];
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => {
                      onUseAbility(target.id);
                      setShowDisguiseMenu(false);
                    }}
                    className="min-h-[38px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-700 text-xs font-semibold text-white flex items-center gap-1.5"
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.hex }} />
                    {target.name}
                  </button>
                );
              })}
            </div>
          )}

          {(() => {
            if (isMobileHud) {
              const abilitySlot: MobileArcSlot | null = (() => {
                if (!localPlayer.alive) {
                  return {
                    id: 'prank',
                    label: 'PRANK',
                    subLabel: `${localPlayer.pranksLeft ?? 0}x`,
                    icon: <Sparkles className="w-4 h-4" />,
                    accentHex: '#38bdf8',
                    bgClass: 'bg-sky-600/90 border-2 border-sky-300 text-slate-950',
                    disabled: (localPlayer.pranksLeft ?? 0) <= 0,
                    onClick: () => onUseAbility(),
                  };
                }
                switch (localPlayer.specialRole) {
                  case 'goyenda':
                    return {
                      id: 'goyenda',
                      label: inspectableBody ? 'SCAN' : 'CLUE',
                      subLabel: `${localPlayer.scansLeft ?? 2}x`,
                      icon: <Search className="w-4 h-4" />,
                      accentHex: '#22d3ee',
                      bgClass: 'bg-cyan-500/92 border-2 border-cyan-200 text-slate-950',
                      disabled: !inspectableBody || (localPlayer.scansLeft ?? 2) <= 0,
                      onClick: () => onUseAbility(),
                    };
                  case 'kobiraj': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'kobiraj',
                      label: 'TABIZ',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}s` : shieldTarget ? shieldTarget.name : 'SELF',
                      icon: <Shield className="w-4 h-4" />,
                      accentHex: '#34d399',
                      bgClass: 'bg-emerald-500/92 border-2 border-emerald-200 text-slate-950',
                      disabled: cd > 0.05,
                      progress01: cd > 0.05 ? Math.min(1, cd / 25) : 1,
                      onClick: () => onUseAbility(),
                    };
                  }
                  case 'daroga': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'daroga',
                      label: 'ARREST',
                      subLabel:
                        (localPlayer.shotsLeft ?? 1) <= 0
                          ? 'USED'
                          : cd > 0.05
                            ? `${Math.ceil(cd)}s`
                            : darogaTarget?.name ?? 'SHOT',
                      icon: <Gavel className="w-4 h-4" />,
                      accentHex: '#fb923c',
                      bgClass: 'bg-orange-500/92 border-2 border-orange-200 text-slate-950',
                      disabled: (localPlayer.shotsLeft ?? 1) <= 0 || !darogaTarget || cd > 0.05,
                      progress01: cd > 0.05 ? Math.min(1, cd / 20) : 1,
                      onClick: () => darogaTarget && onUseAbility(darogaTarget.id),
                    };
                  }
                  case 'daktar':
                    return {
                      id: 'daktar',
                      label: 'REVIVE',
                      subLabel:
                        (localPlayer.revivesLeft ?? 0) <= 0
                          ? 'USED'
                          : revivableBody?.victimName ?? `${localPlayer.revivesLeft ?? 0}x`,
                      icon: <HeartPulse className="w-4 h-4" />,
                      accentHex: '#2dd4bf',
                      bgClass: 'bg-teal-400/92 border-2 border-teal-100 text-slate-950',
                      disabled: !revivableBody || (localPlayer.revivesLeft ?? 0) <= 0,
                      onClick: () => revivableBody && onUseAbility(revivableBody.id),
                    };
                  case 'jharudar': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'jharudar',
                      label: 'CLEAN',
                      subLabel: localPlayer.jharuTargetBodyId
                        ? `${(localPlayer.jharuTimer ?? 0).toFixed(1)}s`
                        : cd > 0.05
                          ? `${Math.ceil(cd)}s`
                          : cleanableBody?.victimName ?? `${localPlayer.cleansLeft ?? 3}x`,
                      icon: <Sparkle className="w-4 h-4" />,
                      accentHex: '#fb7185',
                      bgClass: 'bg-rose-500/92 border-2 border-rose-200 text-white',
                      disabled:
                        Boolean(localPlayer.jharuTargetBodyId) ||
                        (localPlayer.cleansLeft ?? 3) <= 0 ||
                        !cleanableBody ||
                        cd > 0.05,
                      progress01: cd > 0.05 ? Math.min(1, cd / 18) : 1,
                      onClick: () => cleanableBody && onUseAbility(cleanableBody.id),
                    };
                  }
                  case 'bohurupi': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'bohurupi',
                      label: localPlayer.disguiseColor ? 'UNSHIFT' : 'SHIFT',
                      subLabel: localPlayer.disguiseColor
                        ? `${Math.ceil(localPlayer.disguiseTimer)}s`
                        : cd > 0.05
                          ? `${Math.ceil(cd)}s`
                          : undefined,
                      icon: <Sparkles className="w-4 h-4" />,
                      accentHex: '#e879f9',
                      bgClass: 'bg-fuchsia-600/92 border-2 border-fuchsia-200 text-white',
                      disabled: !localPlayer.disguiseColor && cd > 0.05,
                      progress01: cd > 0.05 ? Math.min(1, cd / 25) : 1,
                      onClick: () => {
                        if (localPlayer.disguiseColor) {
                          onUseAbility();
                          setShowDisguiseMenu(false);
                        } else {
                          setShowDisguiseMenu((s) => !s);
                        }
                      },
                    };
                  }
                  case 'ghotok_khala':
                    return {
                      id: 'ghotok',
                      label: 'BOND',
                      subLabel: snapshot.ghotokLinkedIds ? 'SET ✓' : ghotokPair?.[0].name,
                      icon: <Heart className="w-4 h-4" />,
                      accentHex: '#f472b6',
                      bgClass: 'bg-pink-500/92 border-2 border-pink-100 text-slate-950',
                      disabled: Boolean(snapshot.ghotokLinkedIds) || !ghotokPair,
                      onClick: () => onUseAbility(),
                    };
                  case 'master_moshai': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'master',
                      label: 'KHATA',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}s` : masterTarget?.name,
                      icon: <BookOpen className="w-4 h-4" />,
                      accentHex: '#60a5fa',
                      bgClass: 'bg-blue-500/92 border-2 border-blue-200 text-slate-950',
                      disabled: !masterTarget || cd > 0.05,
                      progress01: cd > 0.05 ? Math.min(1, cd / 24) : 1,
                      onClick: () => masterTarget && onUseAbility(masterTarget.id),
                    };
                  }
                  case 'cctv_kaku': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'cctv_kaku',
                      label: 'CCTV',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}s` : 'CAM',
                      icon: <Video className="w-4 h-4" />,
                      accentHex: '#fb923c',
                      bgClass: 'bg-orange-400/92 border-2 border-orange-100 text-slate-950',
                      disabled: cd > 0.05 || localPlayer.inVent,
                      progress01: cd > 0.05 ? Math.min(1, cd / 18) : 1,
                      onClick: () => {
                        onUseAbility();
                        onOpenStation('cams');
                      },
                    };
                  }
                  case 'hatur_daktar': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'hatur',
                      label: 'JHAJHRO',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}s` : haturTarget?.name ?? 'SELF',
                      icon: <HeartPulse className="w-4 h-4" />,
                      accentHex: '#a3e635',
                      bgClass: 'bg-lime-400/92 border-2 border-lime-100 text-slate-950',
                      disabled: cd > 0.05,
                      progress01: cd > 0.05 ? Math.min(1, cd / 22) : 1,
                      onClick: () => onUseAbility(haturTarget?.id),
                    };
                  }
                  case 'supari_killer': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'supari',
                      label: 'SUPARI',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}s` : supariTarget?.name,
                      icon: <Crosshair className="w-4 h-4" />,
                      accentHex: '#f87171',
                      bgClass: 'bg-red-600/92 border-2 border-red-200 text-white',
                      disabled: cd > 0.05,
                      onClick: () => onUseAbility(),
                    };
                  }
                  case 'dalal': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'dalal',
                      label: 'JAM',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}s` : 'COMMS',
                      icon: <Radio className="w-4 h-4" />,
                      accentHex: '#fb7185',
                      bgClass: 'bg-rose-700/92 border-2 border-rose-200 text-white',
                      disabled: cd > 0.05,
                      progress01: cd > 0.05 ? Math.min(1, cd / 26) : 1,
                      onClick: () => onUseAbility(),
                    };
                  }
                  case 'chamcha': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'chamcha',
                      label: 'PATRON',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}s` : chamchaTarget?.name,
                      icon: <UserCheck className="w-4 h-4" />,
                      accentHex: '#c084fc',
                      bgClass: 'bg-purple-500/92 border-2 border-purple-100 text-white',
                      disabled: !chamchaTarget || cd > 0.05,
                      onClick: () => chamchaTarget && onUseAbility(chamchaTarget.id),
                    };
                  }
                  case 'chandabaz': {
                    const cd = localPlayer.abilityCooldown;
                    return {
                      id: 'chandabaz',
                      label: 'CHANDA',
                      subLabel:
                        cd > 0.05
                          ? `${Math.ceil(cd)}s`
                          : chandabazTarget?.name ?? `${localPlayer.chandabazTargets?.length ?? 0}/3`,
                      icon: <DollarSign className="w-4 h-4" />,
                      accentHex: '#fbbf24',
                      bgClass: 'bg-amber-400/92 border-2 border-amber-100 text-slate-950',
                      disabled: !chandabazTarget || cd > 0.05,
                      progress01: cd > 0.05 ? Math.min(1, cd / 18) : 1,
                      onClick: () => chandabazTarget && onUseAbility(chandabazTarget.id),
                    };
                  }
                  case 'tiktok_star': {
                    const cd = localPlayer.abilityCooldown;
                    const filmedHere = Boolean(currentZoneId && localPlayer.tiktokZones?.includes(currentZoneId));
                    return {
                      id: 'tiktok',
                      label: filmedHere ? 'FILMED' : 'REEL',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}s` : `${localPlayer.tiktokZones?.length ?? 0}/3`,
                      icon: <Camera className="w-4 h-4" />,
                      accentHex: '#f472b6',
                      bgClass: 'bg-pink-500/92 border-2 border-pink-100 text-white',
                      disabled: !currentZoneId || cd > 0.05 || filmedHere,
                      progress01: cd > 0.05 ? Math.min(1, cd / 16) : 1,
                      onClick: () => onUseAbility(),
                    };
                  }
                  default:
                    return null;
                }
              })();

              const interactSlot: MobileArcSlot | null = nearSabotageFix
                ? {
                    id: 'fix',
                    label: 'FIX',
                    subLabel: `${Math.round(snapshot.sabotage.fixProgress * 100)}%`,
                    icon: <Wrench className="w-5 h-5" />,
                    accentHex: '#fde047',
                    bgClass: 'bg-amber-400 border-2 border-amber-100 text-slate-950',
                    progress01: snapshot.sabotage.fixProgress,
                    pulse: true,
                    onHold: (holding) => onFixSabotageHold(holding, nearGasValve?.id),
                  }
                : nearbyTask
                  ? {
                      id: 'task',
                      label: nearbyTaskLocked ? 'NO WIFI' : isVondo ? 'FAKE' : 'TASK',
                      subLabel: nearbyTask.zoneName.split(' ')[0],
                      icon: <Wrench className="w-5 h-5" />,
                      accentHex: '#fbbf24',
                      bgClass: nearbyTaskLocked
                        ? 'bg-indigo-900/95 border-2 border-indigo-400/50 text-indigo-200'
                        : 'bg-amber-400 border-2 border-amber-100 text-slate-950',
                      disabled: nearbyTaskLocked,
                      onClick: () => !nearbyTaskLocked && onOpenTask(nearbyTask.id),
                    }
                  : nearCams
                    ? {
                        id: 'cams',
                        label: 'CCTV',
                        icon: <Video className="w-5 h-5" />,
                        accentHex: '#fb7185',
                        bgClass: 'bg-rose-500 border-2 border-rose-200 text-white',
                        onClick: () => onOpenStation('cams'),
                      }
                    : nearAdmin
                      ? {
                          id: 'admin',
                          label: 'ADMIN',
                          icon: <Radar className="w-5 h-5" />,
                          accentHex: '#38bdf8',
                          bgClass: 'bg-sky-500 border-2 border-sky-200 text-slate-950',
                          onClick: () => onOpenStation('admin'),
                        }
                      : nearVitals
                        ? {
                            id: 'vitals',
                            label: 'VITALS',
                            icon: <Activity className="w-5 h-5" />,
                            accentHex: '#34d399',
                            bgClass: 'bg-emerald-500 border-2 border-emerald-200 text-slate-950',
                            onClick: () => onOpenStation('vitals'),
                          }
                        : null;

              const heroSlot: MobileArcSlot =
                isVondo && localPlayer.alive
                  ? {
                      id: 'kill',
                      label:
                        localPlayer.killCooldownRemaining > 0.05
                          ? `${Math.ceil(localPlayer.killCooldownRemaining)}s`
                          : 'SIZE',
                      subLabel: killTarget ? killTarget.name : undefined,
                      icon: <Skull className="w-5 h-5" />,
                      accentHex: '#fda4af',
                      bgClass: killTarget && localPlayer.killCooldownRemaining <= 0.05
                        ? 'bg-rose-600 border-2 border-rose-200 text-white'
                        : 'bg-rose-950/90 border-2 border-rose-500/45 text-rose-200',
                      disabled: !killTarget || localPlayer.killCooldownRemaining > 0.05,
                      progress01:
                        localPlayer.killCooldownRemaining > 0.05
                          ? Math.min(1, localPlayer.killCooldownRemaining / Math.max(10, snapshot.settings.killCooldownSec))
                          : 1,
                      pulse: Boolean(killTarget && localPlayer.killCooldownRemaining <= 0.05),
                      onClick: () => killTarget && onKill(killTarget.id),
                    }
                  : interactSlot ?? {
                      id: 'use_idle',
                      label: 'USE',
                      icon: <Wrench className="w-5 h-5" />,
                      accentHex: '#94a3b8',
                      bgClass: 'bg-slate-900/90 border-2 border-slate-600/60 text-slate-400',
                      disabled: true,
                    };

              const arcQueue: MobileArcSlot[] = [];
              if (isVondo && localPlayer.alive && interactSlot) {
                arcQueue.push(interactSlot);
              }
              if (nearbyBody) {
                arcQueue.push({
                  id: 'report',
                  label: 'REPORT',
                  subLabel: nearbyBody.victimName,
                  icon: <Bell className="w-4 h-4" />,
                  accentHex: '#fed7aa',
                  bgClass: 'bg-orange-500 border-2 border-orange-100 text-slate-950',
                  pulse: true,
                  onClick: () => onReportBody(nearbyBody.id),
                });
              }
              if (abilitySlot) {
                arcQueue.push(abilitySlot);
              }
              if (nearBell) {
                arcQueue.push({
                  id: 'bell',
                  label: 'SHALISH',
                  subLabel:
                    localPlayer.emergencyMeetingsLeft <= 0
                      ? '0x'
                      : emergencyCd > 0
                        ? `${emergencyCd}s`
                        : `${localPlayer.emergencyMeetingsLeft}x`,
                  icon: <Bell className="w-4 h-4" />,
                  accentHex: '#7dd3fc',
                  bgClass: 'bg-sky-500 border-2 border-sky-100 text-slate-950',
                  disabled: !canCallEmergency,
                  onClick: onEmergencyMeeting,
                });
              }
              if (localPlayer.alive && (isVondo || localPlayer.specialRole === 'mistri')) {
                arcQueue.push({
                  id: 'vent',
                  label: 'DREN',
                  subLabel:
                    localPlayer.specialRole === 'mistri' && !localPlayer.inVent && localPlayer.abilityCooldown > 0.05
                      ? `${Math.ceil(localPlayer.abilityCooldown)}s`
                      : localPlayer.inVent
                        ? 'OUT'
                        : undefined,
                  icon: <DoorOpen className="w-4 h-4" />,
                  accentHex: '#6ee7b7',
                  bgClass: 'bg-emerald-600 border-2 border-emerald-200 text-white',
                  disabled: (!nearVent && !localPlayer.inVent) || !playerCanVent,
                  onClick: () => onVentToggle(),
                });
              }
              if (isVondo && localPlayer.alive) {
                arcQueue.push({
                  id: 'sabo',
                  label: 'SABO',
                  subLabel:
                    snapshot.sabotage.cooldownRemaining > 0
                      ? `${Math.ceil(snapshot.sabotage.cooldownRemaining)}s`
                      : undefined,
                  icon: <Zap className="w-4 h-4" />,
                  accentHex: '#fcd34d',
                  bgClass: 'bg-amber-600 border-2 border-amber-200 text-white',
                  onClick: () => setShowSabotageMenu((s) => !s),
                });
              }

              const arcPositions: Array<{ right: number; bottom: number }> = [
                { right: 72, bottom: 4 },
                { right: 64, bottom: 64 },
                { right: 130, bottom: 10 },
                { right: 124, bottom: 70 },
                { right: 188, bottom: 16 },
              ];
              const maxSlots = viewport.w < 440 ? 4 : 5;
              const visibleArcSlots = arcQueue.slice(0, maxSlots);

              return (
                <div
                  className="relative pointer-events-none shrink-0"
                  style={{ width: viewport.w < 440 ? '196px' : '244px', height: '126px' }}
                >
                  <div className="absolute right-0 bottom-0 pointer-events-auto">
                    <MobileThumbArcButton slot={heroSlot} hero />
                  </div>
                  {visibleArcSlots.map((slot, idx) => {
                    const pos = arcPositions[idx];
                    if (!pos) return null;
                    return (
                      <div
                        key={slot.id}
                        className="absolute pointer-events-auto"
                        style={{ right: `${pos.right}px`, bottom: `${pos.bottom}px` }}
                      >
                        <MobileThumbArcButton slot={slot} />
                      </div>
                    );
                  })}
                </div>
              );
            }

            return (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {nearSabotageFix && (
                  <button
                    type="button"
                    onPointerDown={() => onFixSabotageHold(true, nearGasValve?.id)}
                    onPointerUp={() => onFixSabotageHold(false)}
                    onPointerLeave={() => onFixSabotageHold(false)}
                    onPointerCancel={() => onFixSabotageHold(false)}
                    className="relative min-h-[48px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-95 transition-transform text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg font-mono-tabular select-none border-2 border-amber-200"
                  >
                    <Wrench className="w-4 h-4" />
                    <span>
                      {nearGasValve
                        ? `Hold Valve (${Math.round(snapshot.sabotage.fixProgress * 100)}%)`
                        : `Hold to Fix (${Math.round(snapshot.sabotage.fixProgress * 100)}%)`}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 text-[10px] font-black">E</kbd>
                  </button>
                )}

                {nearbyTask && (
                  <button
                    type="button"
                    disabled={nearbyTaskLocked}
                    onClick={() => !nearbyTaskLocked && onOpenTask(nearbyTask.id)}
                    className={`min-h-[48px] px-4 py-2 rounded-xl font-display font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-transform border-2 ${
                      nearbyTaskLocked
                        ? 'bg-indigo-950/95 text-indigo-200 border-indigo-400/50 cursor-not-allowed'
                        : 'bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 border-amber-200'
                    }`}
                  >
                    <Wrench className="w-4 h-4" />
                    <span>
                      {nearbyTaskLocked
                        ? `${nearbyTask.title} (Wi-Fi Nai!)`
                        : isVondo
                          ? `Fake: ${nearbyTask.title}`
                          : nearbyTask.title}
                    </span>
                    {!nearbyTaskLocked && (
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 text-[10px] font-black">E</kbd>
                    )}
                  </button>
                )}

                {nearCams && (
                  <button
                    type="button"
                    onClick={() => onOpenStation('cams')}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 transition-transform text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-lg border-2 border-rose-300/60"
                  >
                    <Video className="w-4 h-4" />
                    <span>CCTV</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-rose-200 text-[10px] font-black">E</kbd>
                  </button>
                )}

                {nearAdmin && (
                  <button
                    type="button"
                    onClick={() => onOpenStation('admin')}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 transition-transform text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-lg border-2 border-sky-200/70"
                  >
                    <Radar className="w-4 h-4" />
                    <span>Admin Map</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-sky-300 text-[10px] font-black">E</kbd>
                  </button>
                )}

                {nearVitals && (
                  <button
                    type="button"
                    onClick={() => onOpenStation('vitals')}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-transform text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-lg border-2 border-emerald-200/70"
                  >
                    <Activity className="w-4 h-4" />
                    <span>Vitals</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-emerald-300 text-[10px] font-black">E</kbd>
                  </button>
                )}

                {nearBell && (
                  <button
                    type="button"
                    disabled={!canCallEmergency}
                    onClick={onEmergencyMeeting}
                    className="min-h-[48px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 transition-transform disabled:opacity-45 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg font-mono-tabular border-2 border-sky-200/70"
                  >
                    <Bell className="w-4 h-4" />
                    <span>
                      {localPlayer.emergencyMeetingsLeft <= 0
                        ? 'Bell Shesh!'
                        : emergencyCd > 0
                          ? `Shalish CD ${emergencyCd}s`
                          : `Shalish Dako! (${localPlayer.emergencyMeetingsLeft})`}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-sky-300 text-[10px] font-black">F</kbd>
                  </button>
                )}

                {nearbyBody && (
                  <button
                    type="button"
                    onClick={() => onReportBody(nearbyBody.id)}
                    className="min-h-[48px] px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 active:scale-95 transition-transform text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg border-2 border-orange-200"
                  >
                    <Bell className="w-4 h-4" />
                    <span>Haire! {nearbyBody.victimName} Size!</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-orange-300 text-[10px] font-black">R</kbd>
                  </button>
                )}

                {/* Ghost Harmless Prank [G] */}
                {!localPlayer.alive && (
                  <button
                    type="button"
                    disabled={(localPlayer.pranksLeft ?? 0) <= 0}
                    onClick={() => onUseAbility()}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-sky-200/70"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{(localPlayer.pranksLeft ?? 0) <= 0 ? 'Prank Used' : 'Lamp Prank'}</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-sky-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {/* Special Role Active Ability [G] */}
                {localPlayer.alive && localPlayer.specialRole === 'goyenda' && (
                  <button
                    type="button"
                    disabled={!inspectableBody || (localPlayer.scansLeft ?? 2) <= 0}
                    onClick={() => onUseAbility()}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-cyan-200/70"
                  >
                    <Search className="w-4 h-4" />
                    <span>
                      {(localPlayer.scansLeft ?? 2) <= 0
                        ? 'Scan Shesh'
                        : inspectableBody
                          ? `Scan (${localPlayer.scansLeft ?? 2})`
                          : `Clue (${localPlayer.scansLeft ?? 2})`}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-cyan-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'kobiraj' && (
                  <button
                    type="button"
                    disabled={localPlayer.abilityCooldown > 0.05}
                    onClick={() => onUseAbility()}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-emerald-200/70"
                  >
                    <Shield className="w-4 h-4" />
                    <span>
                      {localPlayer.abilityCooldown > 0.05
                        ? `Tabiz (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : shieldTarget
                          ? `Shield ${shieldTarget.name}`
                          : 'Self Tabiz'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-emerald-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'daroga' && (
                  <button
                    type="button"
                    disabled={(localPlayer.shotsLeft ?? 1) <= 0 || !darogaTarget || localPlayer.abilityCooldown > 0.05}
                    onClick={() => darogaTarget && onUseAbility(darogaTarget.id)}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-orange-200/70"
                  >
                    <Gavel className="w-4 h-4" />
                    <span>
                      {(localPlayer.shotsLeft ?? 1) <= 0
                        ? 'Shot Used'
                        : localPlayer.abilityCooldown > 0.05
                          ? `Daroga (${Math.ceil(localPlayer.abilityCooldown)}s)`
                          : darogaTarget
                            ? `Arrest ${darogaTarget.name}`
                            : 'Arrest Shot'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-orange-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'daktar' && (
                  <button
                    type="button"
                    disabled={!revivableBody || (localPlayer.revivesLeft ?? 0) <= 0}
                    onClick={() => revivableBody && onUseAbility(revivableBody.id)}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-teal-100/70"
                  >
                    <HeartPulse className="w-4 h-4" />
                    <span>
                      {(localPlayer.revivesLeft ?? 0) <= 0
                        ? 'Saline Used'
                        : revivableBody
                          ? `Revive ${revivableBody.victimName}`
                          : `Saline Revive (${localPlayer.revivesLeft ?? 0})`}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-teal-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'jharudar' && (
                  <button
                    type="button"
                    disabled={
                      Boolean(localPlayer.jharuTargetBodyId) ||
                      (localPlayer.cleansLeft ?? 3) <= 0 ||
                      !cleanableBody ||
                      localPlayer.abilityCooldown > 0.05
                    }
                    onClick={() => cleanableBody && onUseAbility(cleanableBody.id)}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 active:scale-95 transition-transform disabled:opacity-35 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-rose-200/70"
                  >
                    <Sparkle className="w-4 h-4" />
                    <span>
                      {localPlayer.jharuTargetBodyId
                        ? `Jharu... ${(localPlayer.jharuTimer ?? 0).toFixed(1)}s`
                        : (localPlayer.cleansLeft ?? 3) <= 0
                          ? 'Clean Shesh'
                          : localPlayer.abilityCooldown > 0.05
                            ? `Clean (${Math.ceil(localPlayer.abilityCooldown)}s)`
                            : cleanableBody
                              ? `Clean ${cleanableBody.victimName} (${localPlayer.cleansLeft ?? 3})`
                              : `Clean (${localPlayer.cleansLeft ?? 3})`}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-rose-200 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'bohurupi' && (
                  <button
                    type="button"
                    disabled={!localPlayer.disguiseColor && localPlayer.abilityCooldown > 0.05}
                    onClick={() => {
                      if (localPlayer.disguiseColor) {
                        onUseAbility();
                        setShowDisguiseMenu(false);
                      } else {
                        setShowDisguiseMenu((s) => !s);
                      }
                    }}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 active:scale-95 transition-transform disabled:opacity-35 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-fuchsia-300/70"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {localPlayer.disguiseColor
                        ? `Drop Shift (${Math.ceil(localPlayer.disguiseTimer)}s)`
                        : localPlayer.abilityCooldown > 0.05
                          ? `Shift (${Math.ceil(localPlayer.abilityCooldown)}s)`
                          : 'Shapeshift'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-fuchsia-200 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'ghotok_khala' && (
                  <button
                    type="button"
                    disabled={Boolean(snapshot.ghotokLinkedIds) || !ghotokPair}
                    onClick={() => onUseAbility()}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-pink-500 hover:bg-pink-400 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-pink-200/70"
                  >
                    <Heart className="w-4 h-4" />
                    <span>
                      {snapshot.ghotokLinkedIds
                        ? 'Bond Set ✓'
                        : ghotokPair
                          ? `Bond ${ghotokPair[0].name}`
                          : 'Moholla Bond'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-pink-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'master_moshai' && (
                  <button
                    type="button"
                    disabled={!masterTarget || localPlayer.abilityCooldown > 0.05}
                    onClick={() => masterTarget && onUseAbility(masterTarget.id)}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-blue-200/70"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>
                      {localPlayer.abilityCooldown > 0.05
                        ? `Khata (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : masterTarget
                          ? `Check ${masterTarget.name}`
                          : 'Khata Check'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-blue-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'cctv_kaku' && (
                  <button
                    type="button"
                    disabled={localPlayer.abilityCooldown > 0.05 || localPlayer.inVent}
                    onClick={() => {
                      onUseAbility();
                      onOpenStation('cams');
                    }}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-orange-400 hover:bg-orange-300 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-orange-100/70"
                  >
                    <Video className="w-4 h-4" />
                    <span>
                      {localPlayer.abilityCooldown > 0.05
                        ? `CCTV (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : 'Remote CCTV'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-orange-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'hatur_daktar' && (
                  <button
                    type="button"
                    disabled={localPlayer.abilityCooldown > 0.05}
                    onClick={() => onUseAbility(haturTarget?.id)}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-lime-100/70"
                  >
                    <HeartPulse className="w-4 h-4" />
                    <span>
                      {localPlayer.abilityCooldown > 0.05
                        ? `Jhajhro (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : haturTarget
                          ? `Inject ${haturTarget.name}`
                          : 'Self Jhajhro'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-lime-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'supari_killer' && (
                  <button
                    type="button"
                    disabled={localPlayer.abilityCooldown > 0.05}
                    onClick={() => onUseAbility()}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 transition-transform disabled:opacity-35 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-red-300/70"
                  >
                    <Crosshair className="w-4 h-4" />
                    <span>
                      {localPlayer.abilityCooldown > 0.05
                        ? `Supari (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : supariTarget
                          ? `Switch (${supariTarget.name})`
                          : 'Pick Supari'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-red-200 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'dalal' && (
                  <button
                    type="button"
                    disabled={localPlayer.abilityCooldown > 0.05}
                    onClick={() => onUseAbility()}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 active:scale-95 transition-transform disabled:opacity-35 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-rose-300/60"
                  >
                    <Radio className="w-4 h-4" />
                    <span>
                      {localPlayer.abilityCooldown > 0.05
                        ? `Jam (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : 'Broker Jam'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-rose-200 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'chamcha' && (
                  <button
                    type="button"
                    disabled={!chamchaTarget || localPlayer.abilityCooldown > 0.05}
                    onClick={() => chamchaTarget && onUseAbility(chamchaTarget.id)}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 active:scale-95 transition-transform disabled:opacity-35 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-purple-200/70"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>
                      {localPlayer.abilityCooldown > 0.05
                        ? `Patron (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : chamchaTarget
                          ? `Patron: ${chamchaTarget.name}`
                          : 'Pick Patron'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-purple-200 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'chandabaz' && (
                  <button
                    type="button"
                    disabled={!chandabazTarget || localPlayer.abilityCooldown > 0.05}
                    onClick={() => chandabazTarget && onUseAbility(chandabazTarget.id)}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-95 transition-transform disabled:opacity-35 text-slate-950 font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-amber-100/70"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>
                      {localPlayer.abilityCooldown > 0.05
                        ? `Chanda (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : chandabazTarget
                          ? `Vasool ${chandabazTarget.name} (${localPlayer.chandabazTargets?.length ?? 0}/3)`
                          : `Chanda (${localPlayer.chandabazTargets?.length ?? 0}/3)`}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {localPlayer.alive && localPlayer.specialRole === 'tiktok_star' && (
                  <button
                    type="button"
                    disabled={
                      !currentZoneId ||
                      localPlayer.abilityCooldown > 0.05 ||
                      Boolean(localPlayer.tiktokZones?.includes(currentZoneId))
                    }
                    onClick={() => onUseAbility()}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-pink-500 hover:bg-pink-400 active:scale-95 transition-transform disabled:opacity-35 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-pink-200/70"
                  >
                    <Camera className="w-4 h-4" />
                    <span>
                      {localPlayer.abilityCooldown > 0.05
                        ? `Reel (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : !currentZoneId
                          ? 'Enter Zone'
                          : localPlayer.tiktokZones?.includes(currentZoneId)
                            ? `Filmed (${localPlayer.tiktokZones.length}/3)`
                            : `Shoot Reel (${localPlayer.tiktokZones?.length ?? 0}/3)`}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-pink-200 text-[10px] font-black">G</kbd>
                  </button>
                )}

                {/* Drain Vent Button (Batpar OR Current Babu) */}
                {localPlayer.alive && (isVondo || localPlayer.specialRole === 'mistri') && (
                  <button
                    type="button"
                    disabled={(!nearVent && !localPlayer.inVent) || !playerCanVent}
                    onClick={() => onVentToggle()}
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-transform disabled:opacity-35 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-emerald-300/60"
                  >
                    <DoorOpen className="w-4 h-4" />
                    <span>
                      {localPlayer.specialRole === 'mistri' && !localPlayer.inVent && localPlayer.abilityCooldown > 0.05
                        ? `Dren (${Math.ceil(localPlayer.abilityCooldown)}s)`
                        : 'Dren e Dhuko'}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-emerald-200 text-[10px] font-black">V</kbd>
                  </button>
                )}

                {isVondo && localPlayer.alive && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowSabotageMenu((s) => !s)}
                      className="min-h-[48px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 transition-transform text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-amber-300/60"
                    >
                      <Zap className="w-4 h-4" />
                      <span>
                        {snapshot.sabotage.cooldownRemaining > 0
                          ? `Jhamela (${Math.ceil(snapshot.sabotage.cooldownRemaining)}s)`
                          : 'Jhamela Koro'}
                      </span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-amber-200 text-[10px] font-black">X</kbd>
                    </button>

                    <button
                      type="button"
                      disabled={!killTarget || localPlayer.killCooldownRemaining > 0.05}
                      onClick={() => killTarget && onKill(killTarget.id)}
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 transition-transform disabled:opacity-35 text-white font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 font-mono-tabular shadow-lg border-2 border-rose-300/70"
                    >
                      <Skull className="w-4 h-4" />
                      <span>
                        {localPlayer.killCooldownRemaining > 0.05
                          ? `${Math.ceil(localPlayer.killCooldownRemaining)}s`
                          : killTarget
                            ? `Size Koro ${killTarget.name}`
                            : 'Gap e Nao!'}
                      </span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-950/80 text-rose-200 text-[10px] font-black">Q</kbd>
                    </button>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
