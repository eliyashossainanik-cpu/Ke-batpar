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
  getBanglaZoneNameAt,
  getZoneIdAt,
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
  { zoneId: 'cha_dokan', label: 'চায়ের দোকান' },
  { zoneId: 'rickshaw_garage', label: 'রিকশা গ্যারেজ' },
  { zoneId: 'desco_power', label: 'ডেসকো' },
  { zoneId: 'dish_roof', label: 'ডিশ হাব' },
];

const SHORT_ZONE_LABELS: Record<string, string> = {
  adda_chowk: 'আড্ডা',
  cha_dokan: 'চা',
  rickshaw_garage: 'গ্যারেজ',
  desco_power: 'ডেসকো',
  dish_roof: 'ডিশ',
  pukur_ghat: 'পুকুর',
  bazar_stall: 'বাজার',
  eidgah_north: 'ঈদগাহ',
  south_tank: 'ওয়াসা',
  fuchka_corner: 'ফুচকা',
  saloon_goli: 'সেলুন',
  cricket_math: 'মাঠ',
  pharmacy_mor: 'ফার্মেসি',
  biyer_pandal: 'প্যান্ডেল',
  kakar_bari: 'কাকা',
  master_bari: 'মাস্টার',
  chacha_bari: 'চাচা',
  khalar_bari: 'খালা',
  rail_station: 'স্টেশন',
  nanar_bari: 'নানা',
  cinema_hall: 'সিনেমা',
  bhai_duplex: 'ডুপ্লেক্স',
  coaching_center: 'কোচিং',
  khalur_bari: 'খালু',
  jheel_par: 'ঝিল',
  shishu_park: 'পার্ক',
  kacchi_house: 'কাচ্চি',
  cyber_cafe: 'সাইবার',
  dorji_bari: 'দর্জি',
  tiger_gym: 'জিম',
  mach_bazar: 'মাছ',
  rail_colony: 'কলোনি',
  signal_yard: 'সিগন্যাল',
  fufu_bari: 'ফুফু',
};

const COMPASS_LABELS: Record<number, string> = {
  0: 'উ',
  45: 'উ-পূ',
  90: 'পূ',
  135: 'দ-পূ',
  180: 'দ',
  225: 'দ-প',
  270: 'প',
  315: 'উ-প',
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
      aria-label={`কম্পাস দিক ${Math.round(centerDeg)} ডিগ্রি`}
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
        x={-MAP_HALF_SIZE - 80}
        y={-MAP_HALF_SIZE - 80}
        width={(MAP_HALF_SIZE + 80) * 2}
        height={(MAP_HALF_SIZE + 80) * 2}
        fill="#060b14"
      />
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
      <line x1={-154} y1={-114} x2={154} y2={-114} stroke="#334155" strokeWidth="3.4" />
      <line x1={-154} y1={-72} x2={154} y2={-72} stroke="#334155" strokeWidth="3.2" />
      <line x1={-154} y1={-52} x2={154} y2={-52} stroke="#334155" strokeWidth="3.2" />
      <line x1={-154} y1={52} x2={154} y2={52} stroke="#334155" strokeWidth="3.2" />
      <line x1={-154} y1={72} x2={154} y2={72} stroke="#334155" strokeWidth="3.2" />
      <line x1={-154} y1={96} x2={154} y2={96} stroke="#334155" strokeWidth="2.8" />
      <line x1={-154} y1={112} x2={154} y2={112} stroke="#334155" strokeWidth="3.4" />
      <line x1={-154} y1={144} x2={154} y2={144} stroke="#334155" strokeWidth="3.4" />
      <line x1={-118} y1={-154} x2={-118} y2={154} stroke="#334155" strokeWidth="3.4" />
      <line x1={-86} y1={-154} x2={-86} y2={154} stroke="#334155" strokeWidth="3.0" />
      <line x1={-52} y1={-154} x2={-52} y2={154} stroke="#334155" strokeWidth="3.2" />
      <line x1={52} y1={-154} x2={52} y2={154} stroke="#334155" strokeWidth="3.2" />
      <line x1={86} y1={-154} x2={86} y2={154} stroke="#334155" strokeWidth="3.0" />
      <line x1={118} y1={-154} x2={118} y2={154} stroke="#334155" strokeWidth="3.4" />
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

      {/* Precision WALLS + Pukur & Jheel Par Water */}
      {WALLS.map((w) =>
        w.id === 'pukur_water' || w.id === 'jheel_water' ? (
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
          {SHORT_ZONE_LABELS[z.id] ?? z.banglaName}
        </text>
      ))}
    </>
  );
});

const FF_RADAR_RADIUS = 54;
const FF_RIM_RADIUS = 49.5;

const FreeFireMinimap = memo(function FreeFireMinimap({
  px,
  pz,
  playerYaw,
  compassYaw,
  zoneLabel,
  showTasks,
  tasks,
  sabotage,
  doorLocks,
  sizeClass,
  compact,
  onOpenTacticalMap,
}: {
  px: number;
  pz: number;
  playerYaw: number;
  compassYaw: number;
  zoneLabel: string;
  showTasks: boolean;
  tasks: Array<{ taskId: string; completed: boolean }>;
  sabotage: RoomSnapshot['sabotage'];
  doorLocks: Record<DoorZoneId, number>;
  sizeClass: string;
  compact: boolean;
  onOpenTacticalMap: () => void;
}) {
  const sabTargets: Array<{ id: string; x: number; z: number; held: boolean }> =
    sabotage.active === 'gas_leak'
      ? sabotage.valves.map((v) => ({ id: v.id, x: v.x, z: v.z, held: Boolean(v.holderId) }))
      : sabotage.active
        ? [
            {
              id: 'sab-fix',
              x: sabotage.fixStationX,
              z: sabotage.fixStationZ,
              held: false,
            },
          ]
        : [];

  return (
    <div className="pointer-events-auto flex flex-col items-center shrink-0">
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onOpenTacticalMap();
        }}
        aria-label="ট্যাকটিক্যাল মিনিম্যাপ খোলো [Tab]"
        title="সম্পূর্ণ মহল্লার ম্যাপ দেখো [Tab]"
        className={`group relative rounded-full border-2 shadow-2xl transition-colors ${
          sabotage.active
            ? 'border-rose-400/90 hover:border-rose-300'
            : 'border-amber-400/65 hover:border-amber-300'
        } ${sizeClass}`}
        style={{ backgroundColor: '#070d18' }}
      >
        {/* Cardinal উ / পূ / দ / প Bezel Markers */}
        <span className="pointer-events-none absolute -top-1.5 left-1/2 -translate-x-1/2 px-1 rounded bg-slate-950 text-[8px] font-black text-amber-300 leading-tight border border-amber-400/40 z-20">
          উ
        </span>
        <span className="pointer-events-none absolute top-1/2 -right-1.5 -translate-y-1/2 px-0.5 rounded bg-slate-950 text-[7px] font-bold text-slate-300 leading-tight z-20">
          পূ
        </span>
        <span className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-0.5 rounded bg-slate-950 text-[7px] font-bold text-slate-300 leading-tight z-20">
          দ
        </span>
        <span className="pointer-events-none absolute top-1/2 -left-1.5 -translate-y-1/2 px-0.5 rounded bg-slate-950 text-[7px] font-bold text-slate-300 leading-tight z-20">
          প
        </span>

        {/* Inner Clipped Circular Radar Viewport (Player-Centered 108m x 108m Window) */}
        <div className="w-full h-full rounded-full overflow-hidden relative">
          <svg
            viewBox={`${px - FF_RADAR_RADIUS} ${pz - FF_RADAR_RADIUS} ${FF_RADAR_RADIUS * 2} ${FF_RADAR_RADIUS * 2}`}
            className="w-full h-full block"
            aria-hidden="true"
          >
            <MinimapStaticZones />

            {/* Live Door Shutter States */}
            {DOORS.map((d) => {
              const locked = doorLocks[d.zoneId] > 0;
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

            <MinimapStaticLabels />

            {/* Subtle Radar Concentric Range Ring & Crosshair Centered on Player */}
            <circle
              cx={px}
              cy={pz}
              r={27}
              fill="none"
              stroke="#38bdf8"
              strokeOpacity={0.22}
              strokeWidth="0.65"
              strokeDasharray="2 2"
            />
            <line
              x1={px - FF_RADAR_RADIUS}
              y1={pz}
              x2={px + FF_RADAR_RADIUS}
              y2={pz}
              stroke="#94a3b8"
              strokeOpacity={0.14}
              strokeWidth="0.5"
            />
            <line
              x1={px}
              y1={pz - FF_RADAR_RADIUS}
              x2={px}
              y2={pz + FF_RADAR_RADIUS}
              stroke="#94a3b8"
              strokeOpacity={0.14}
              strokeWidth="0.5"
            />

            {/* Incomplete Task Markers (directly on map if close, or rim-clamped arrow if distant) */}
            {showTasks &&
              tasks
                .filter((t) => !t.completed)
                .map((t) => {
                  const st = TASK_STATIONS.find((s) => s.id === t.taskId);
                  if (!st) return null;
                  const dx = st.x - px;
                  const dz = st.z - pz;
                  const dist = Math.hypot(dx, dz);
                  if (dist <= FF_RIM_RADIUS - 2) {
                    return (
                      <circle
                        key={st.id}
                        cx={st.x}
                        cy={st.z}
                        r={2.1}
                        fill="#fbbf24"
                        stroke="#090f1d"
                        strokeWidth="0.75"
                      />
                    );
                  }
                  const angle = Math.atan2(dz, dx);
                  const rx = px + Math.cos(angle) * FF_RIM_RADIUS;
                  const rz = pz + Math.sin(angle) * FF_RIM_RADIUS;
                  const deg = (angle * 180) / Math.PI + 90;
                  return (
                    <g key={`${st.id}-rim`} transform={`translate(${rx}, ${rz}) rotate(${deg})`}>
                      <polygon
                        points="0,-2.8 2.2,2.1 -2.2,2.1"
                        fill="#fbbf24"
                        stroke="#090f1d"
                        strokeWidth="0.65"
                      />
                    </g>
                  );
                })}

            {/* Sabotage Alert Markers (directly on map or clamped on radar rim) */}
            {sabTargets.map((st) => {
              const dx = st.x - px;
              const dz = st.z - pz;
              const dist = Math.hypot(dx, dz);
              const fillHex = st.held ? '#10b981' : '#ef4444';
              if (dist <= FF_RIM_RADIUS - 2) {
                return (
                  <g key={st.id}>
                    <circle
                      cx={st.x}
                      cy={st.z}
                      r={4.2}
                      fill={fillHex}
                      fillOpacity={0.28}
                    />
                    <circle
                      cx={st.x}
                      cy={st.z}
                      r={2.5}
                      fill={fillHex}
                      stroke="#ffffff"
                      strokeWidth="0.85"
                    />
                  </g>
                );
              }
              const angle = Math.atan2(dz, dx);
              const rx = px + Math.cos(angle) * FF_RIM_RADIUS;
              const rz = pz + Math.sin(angle) * FF_RIM_RADIUS;
              const deg = (angle * 180) / Math.PI + 90;
              return (
                <g key={`${st.id}-rim`} transform={`translate(${rx}, ${rz}) rotate(${deg})`}>
                  <polygon
                    points="0,-3.4 2.7,2.4 -2.7,2.4"
                    fill={fillHex}
                    stroke="#ffffff"
                    strokeWidth="0.75"
                  />
                </g>
              );
            })}

            {/* Camera FOV Cone + Local Player Arrow */}
            <g
              transform={`translate(${px}, ${pz}) rotate(${(((-compassYaw * 180) / Math.PI) % 360 + 360) % 360})`}
            >
              <path
                d="M 0 0 L -14 -28 A 31 31 0 0 1 14 -28 Z"
                fill="#38bdf8"
                fillOpacity={0.28}
              />
            </g>
            <g transform={`translate(${px}, ${pz}) rotate(${180 - (playerYaw * 180) / Math.PI})`}>
              <polygon
                points="0,-4.4 3.4,3.1 0,1.4 -3.4,3.1"
                fill="#38bdf8"
                stroke="#ffffff"
                strokeWidth="0.95"
                strokeLinejoin="round"
              />
            </g>
          </svg>
        </div>
      </button>

      {/* Zone Pill Docked Under Radar */}
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onOpenTacticalMap();
        }}
        className={`mt-1.5 rounded-lg border border-amber-400/35 bg-slate-950/90 text-slate-100 font-bold tracking-wide shadow flex items-center gap-1 ${
          compact ? 'px-2 py-0.5 text-[9px] max-w-[98px]' : 'px-2.5 py-0.5 text-[10px] max-w-[144px]'
        }`}
        title={zoneLabel}
      >
        <span className="truncate">{zoneLabel}</span>
        {!compact && <span className="text-amber-300 font-mono-tabular shrink-0">[Tab]</span>}
      </button>
    </div>
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
  const currentZone = getBanglaZoneNameAt(localPlayer.x, localPlayer.z);
  const currentZoneId = getZoneIdAt(localPlayer.x, localPlayer.z);
  const currentZoneDef = ZONES.find((z) => z.id === currentZoneId);

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
          label: snapshot.sabotage.active === 'loadshedding' ? 'ডেসকো ব্রেকার' : 'ডিশ হাব',
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
                <span>ফুলস্ক্রিন (আড়াআড়ি)</span>
                <Maximize2 className="w-3 h-3 text-amber-300" />
              </button>
              <button
                type="button"
                onClick={() => setDismissRotatePrompt(true)}
                aria-label="ফুলস্ক্রিন পরামর্শ বন্ধ করো"
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
            aria-label="ভূত মোড চালু"
            className="self-center pointer-events-none flex items-center gap-2 rounded-xl px-3 py-1 border border-sky-400/50 shadow-lg bg-slate-950/90 text-[11px] sm:text-xs font-bold text-sky-200 max-w-[95vw] text-center"
          >
            <span className="text-sky-300 font-display tracking-wide">ভূত মোড</span>
            <span className="text-slate-300 font-semibold truncate">
              {taskEligible
                ? 'তুমি এখন ভূত! জীবিত কেউ দেখবে না — দেয়াল ভেদ করে কাজ সেরে ফেলো!'
                : 'তুমি এখন ভূত! জীবিত কেউ দেখবে না — ঘুরে ঘুরে খেলা দেখো!'}
            </span>
          </div>
        )}

        {/* Top Row: Left Free Fire Radar + Task/Role Cluster · Center PUBG Compass · Right Utility Cluster */}
        <div className="flex items-start justify-between gap-2 sm:gap-3">
        {/* Top-Left Cluster: Free Fire Circular Radar + Tasks & Role Status */}
        <div className="flex flex-col sm:flex-row items-start gap-1.5 sm:gap-2.5 shrink-0">
          {showMinimap && (
            <FreeFireMinimap
              px={localPlayer.x}
              pz={localPlayer.z}
              playerYaw={localPlayer.yaw}
              compassYaw={compassYaw}
              zoneLabel={currentZoneDef ? currentZoneDef.banglaName : currentZone}
              showTasks={!isVondo && !isNeutral && !wifiHidden}
              tasks={localPlayer.tasks}
              sabotage={snapshot.sabotage}
              doorLocks={snapshot.doorLocks}
              sizeClass={
                isLandscapeCompact
                  ? 'w-[84px] h-[84px]'
                  : isNarrowMobile
                    ? 'w-[92px] h-[92px]'
                    : 'w-[138px] h-[138px]'
              }
              compact={isLandscapeCompact || isNarrowMobile}
              onOpenTacticalMap={onOpenTacticalMap}
            />
          )}

        <div
          className={`flex flex-col gap-1.5 shrink-0 w-full ${
            isLandscapeCompact ? 'max-w-[178px]' : isNarrowMobile ? 'max-w-[186px]' : 'max-w-[235px] lg:max-w-[258px]'
          }`}
        >
          <div
            className={`pointer-events-auto rounded-xl border border-white/12 shadow-lg ${
              isLandscapeCompact ? 'px-2.5 py-1.5' : 'px-3 py-2 sm:px-3.5 sm:py-2.5'
            }`}
            style={{ backgroundColor: 'rgba(12, 18, 30, 0.86)' }}
          >
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="text-slate-300">পাড়ার কাজ</span>
              <span className="font-mono-tabular text-amber-300">
                {wifiHidden
                  ? 'ওয়াই-ফাই নেই!'
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
                  ? specialMeta.banglaTitle
                  : isVondo
                    ? 'বাটপার'
                    : 'পাড়াবাসী'}
                {localPlayer.specialRole === 'neta' && localPlayer.alive ? ' · ২ গুণ ভোট' : ''}
                {!localPlayer.alive ? ' · ভূত' : ''}
              </span>
              <span className="text-slate-200 font-semibold truncate max-w-[130px] sm:max-w-[155px]" title={currentZone}>
                {currentZoneDef ? currentZoneDef.banglaName : currentZone}
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
                  {activeCompass.arrow} {activeCompass.distance}মি
                </span>
              </div>
            )}

            {!localPlayer.alive && taskEligible && (
              <div className="mt-1 text-[10px] font-semibold text-sky-300">
                ভূত মোড: দেয়াল ভেদ করে কাজ শেষ করো!
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
                    তাবিজ সুরক্ষিত
                  </span>
                )}
                {haturProtected && (
                  <span className="text-lime-300 flex items-center gap-1">
                    <HeartPulse className="w-3 h-3" />
                    ঝাঁঝালো সুরক্ষা
                  </span>
                )}
                {localPlayer.disguiseName && (
                  <span className="text-rose-300 font-mono-tabular">
                    ছদ্মবেশ: {localPlayer.disguiseName} ({Math.ceil(localPlayer.disguiseTimer)}সে.)
                  </span>
                )}
                {ghotokPartner && (
                  <span className="text-pink-300 flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    বন্ধন: {ghotokPartner.name}
                  </span>
                )}
                {supariTarget && (
                  <span className="text-rose-300 flex items-center gap-1">
                    <Crosshair className="w-3 h-3" />
                    সুপারি: {supariTarget.name}
                  </span>
                )}
                {chamchaPatron && (
                  <span className="text-purple-300 flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    বস: {chamchaPatron.name}
                  </span>
                )}
                {localPlayer.specialRole === 'chandabaz' && (
                  <span className="text-amber-300 font-mono-tabular">
                    চাঁদা: {localPlayer.chandabazTargets?.length ?? 0}/৩
                  </span>
                )}
                {localPlayer.specialRole === 'tiktok_star' && (
                  <span className="text-pink-300 font-mono-tabular">
                    রিল: {localPlayer.tiktokZones?.length ?? 0}/৩
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
                  {specialMeta.banglaTitle}
                </span>
                {specialMeta.shortDesc}
              </div>
            )
          ) : wifiHidden ? (
            <div
              className="rounded-xl px-3 py-2 border border-indigo-400/50 shadow-lg text-[11px] font-semibold text-indigo-200"
              style={{ backgroundColor: 'rgba(30, 27, 75, 0.92)' }}
            >
              ওয়াই-ফাই নেই! কাজের তালিকা উধাও — ডিশ হাবে গিয়ে ঠিক করো!
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
                  {isVondo ? 'ভুয়া কাজ' : 'কাজসমূহ'} (
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
                      ভুয়া কাজের তালিকা (দলের অগ্রগতি ০%)
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
                  ভুয়া কাজের তালিকা (দলের অগ্রগতি ০%)
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
                    <span>জরুরি: গ্যাস লিক! ২টি ভালভ চেপে ধরো!</span>
                  ) : snapshot.sabotage.active === 'loadshedding' ? (
                    <span>লোডশেডিং! ডেসকোতে E ৩সে. চেপে ধরো (অটো {Math.ceil(snapshot.sabotage.timeRemaining)}সে.)</span>
                  ) : (
                    <span>ওয়াই-ফাই নেই! ডিশে E ৩সে. চেপে ধরো (অটো {Math.ceil(snapshot.sabotage.timeRemaining)}সে.)</span>
                  )}
                </span>
                {isCriticalSabotage(snapshot.sabotage.active) && (
                  <span className="font-mono-tabular text-amber-300 shrink-0 text-sm">
                    {Math.ceil(snapshot.sabotage.timeRemaining)}সে.
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
                      {v.id === 'valve_cha' ? 'চায়ের দোকান' : 'গ্যারেজ'}: {v.holderId ? 'ধরা' : 'খোলা'}
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
              শাটার নামানো হয়েছে!
            </div>
          )}

          {commsJammed && (
            <div
              className="rounded-xl px-3 py-1.5 border border-rose-400/50 text-[11px] font-bold text-rose-200 flex items-center gap-1.5"
              style={{ backgroundColor: 'rgba(127, 29, 29, 0.88)' }}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              দালাল যোগাযোগ জ্যাম করেছে! (অ্যাডমিন/ভাইটালস বন্ধ)
            </div>
          )}
        </div>
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

        {/* Top-Right Cluster: Utility Buttons & Meme Drawer */}
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
              aria-label={isFullscreen ? 'ফুলস্ক্রিন বন্ধ করো' : 'ফুলস্ক্রিন চালু করো'}
              title={isFullscreen ? 'ফুলস্ক্রিন বন্ধ করো' : 'ফুলস্ক্রিন মোড'}
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
              aria-label="মিম সাউন্ডবোর্ড [1-6]"
              aria-expanded={showMemeDrawer}
              title="বাংলা মিম সাউন্ড [1-6]"
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
              {!isLandscapeCompact && <span className="hidden 2xl:inline">মিম</span>}
            </button>
            {!isMobileHud && (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onTogglePointerLook();
                }}
                aria-label="মাউস দিয়ে চারপাশ দেখা [C]"
                title="মাউস দিয়ে চারপাশ দেখা [C]"
                className={`hidden sm:flex min-w-[42px] min-h-[42px] 2xl:px-2.5 rounded-xl border items-center justify-center gap-1.5 text-xs font-semibold ${
                  pointerLookEnabled
                    ? 'border-amber-400 text-amber-300'
                    : 'border-white/12 text-slate-200 hover:text-white'
                }`}
                style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
              >
                <Crosshair className="w-4 h-4" />
                <span className="hidden 2xl:inline">{pointerLookEnabled ? 'লুক চালু' : 'লুক'}</span>
              </button>
            )}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onResetCamera();
              }}
              aria-label="ক্যামেরা ঠিক করো [Y]"
              title="ক্যামেরা রিসেট [Y]"
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
                aria-label="টাচ জয়স্টিক চালু/বন্ধ"
                title="টাচ কন্ট্রোল"
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
              aria-label="সম্পূর্ণ ম্যাপ খোলো [Tab]"
              title="মহল্লার ম্যাপ [Tab]"
              className={`${
                isLandscapeCompact
                  ? 'min-w-[34px] min-h-[34px]'
                  : 'min-w-[36px] min-h-[36px] sm:min-w-[42px] sm:min-h-[42px] 2xl:px-2.5'
              } rounded-xl border border-white/12 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-amber-300`}
              style={{ backgroundColor: 'rgba(12, 18, 30, 0.88)' }}
            >
              <MapIcon className="w-4 h-4" />
              {!isLandscapeCompact && <span className="hidden 2xl:inline">ম্যাপ</span>}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenGuide();
              }}
              aria-label="নিয়ম ও চরিত্র গাইড খোলো [H]"
              title="নিয়ম ও চরিত্রসমূহ [H]"
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
              aria-label={bgmEnabled ? 'মিউজিক বন্ধ করো' : 'মিউজিক চালু করো'}
              title={bgmEnabled ? 'মিউজিক চালু (বন্ধ করতে চাপ দাও)' : 'মিউজিক বন্ধ (চালু করতে চাপ দাও)'}
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
              aria-label={muted ? 'সাউন্ড চালু করো [M]' : 'সাউন্ড মিউট করো [M]'}
              title="সব সাউন্ড মিউট [M]"
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
              aria-label="গেম বিরতি [P]"
              title="বিরতি [P]"
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
              aria-label="বাংলা মিম সাউন্ডবোর্ড"
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
                  নিজের মিম অডিও আপলোড ও সেট করো
                </button>
              )}
            </div>
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
            WASD হাঁটা · Space লাফ · Shift দৌড় · ড্র্যাগ ৩৬০° · Tab মানচিত্র · E ব্যবহার · R রিপোর্ট · F সালিশ · H গাইড
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
                {ventGraph.currentVent ? `${ventGraph.currentVent.label}-এর ভেতরে:` : 'গোপন ড্রেন:'}
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
                বাইরে এসো! [V]
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
                  গ্যাস লিক! (জরুরি ৪৫সে.)
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
                  লোডশেডিং দাও! (৯০সে. অন্ধকার)
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
                  ওয়াই-ফাই লাইন কাটো!
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-800">
                <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1 mr-1">
                  <Lock className="w-3 h-3" />
                  শাটার নামাও{snapshot.doorLocks.cooldownRemaining > 0 ? ` (${Math.ceil(snapshot.doorLocks.cooldownRemaining)}সে.)` : ':'}
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
              <span className="text-[11px] font-bold text-rose-300 mr-1">ছদ্মবেশ বাছো:</span>
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
                    label: 'মজা',
                    subLabel: `${localPlayer.pranksLeft ?? 0}বার`,
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
                      label: inspectableBody ? 'স্ক্যান' : 'সূত্র',
                      subLabel: `${localPlayer.scansLeft ?? 2}বার`,
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
                      label: 'তাবিজ',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}সে.` : shieldTarget ? shieldTarget.name : 'নিজে',
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
                      label: 'গ্রেপ্তার',
                      subLabel:
                        (localPlayer.shotsLeft ?? 1) <= 0
                          ? 'শেষ'
                          : cd > 0.05
                            ? `${Math.ceil(cd)}সে.`
                            : darogaTarget?.name ?? 'গুলি',
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
                      label: 'বাঁচাও',
                      subLabel:
                        (localPlayer.revivesLeft ?? 0) <= 0
                          ? 'শেষ'
                          : revivableBody?.victimName ?? `${localPlayer.revivesLeft ?? 0}বার`,
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
                      label: 'সাফাই',
                      subLabel: localPlayer.jharuTargetBodyId
                        ? `${(localPlayer.jharuTimer ?? 0).toFixed(1)}সে.`
                        : cd > 0.05
                          ? `${Math.ceil(cd)}সে.`
                          : cleanableBody?.victimName ?? `${localPlayer.cleansLeft ?? 3}বার`,
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
                      label: localPlayer.disguiseColor ? 'আসল রূপ' : 'বদলাও',
                      subLabel: localPlayer.disguiseColor
                        ? `${Math.ceil(localPlayer.disguiseTimer)}সে.`
                        : cd > 0.05
                          ? `${Math.ceil(cd)}সে.`
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
                      label: 'বন্ধন',
                      subLabel: snapshot.ghotokLinkedIds ? 'সেট ✓' : ghotokPair?.[0].name,
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
                      label: 'খাতা',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}সে.` : masterTarget?.name,
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
                      label: 'সিসিটিভি',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}সে.` : 'ক্যামেরা',
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
                      label: 'ইনজেকশন',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}সে.` : haturTarget?.name ?? 'নিজে',
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
                      label: 'সুপারি',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}সে.` : supariTarget?.name,
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
                      label: 'জ্যাম',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}সে.` : 'নেট',
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
                      label: 'বস',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}সে.` : chamchaTarget?.name,
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
                      label: 'চাঁদা',
                      subLabel:
                        cd > 0.05
                          ? `${Math.ceil(cd)}সে.`
                          : chandabazTarget?.name ?? `${localPlayer.chandabazTargets?.length ?? 0}/৩`,
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
                      label: filmedHere ? 'শুটিং শেষ' : 'রিল',
                      subLabel: cd > 0.05 ? `${Math.ceil(cd)}সে.` : `${localPlayer.tiktokZones?.length ?? 0}/৩`,
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
                    label: 'মেরামত',
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
                      label: nearbyTaskLocked ? 'নেট নেই' : isVondo ? 'ভুয়া' : 'কাজ',
                      subLabel: nearbyTask.zoneName,
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
                        label: 'সিসিটিভি',
                        icon: <Video className="w-5 h-5" />,
                        accentHex: '#fb7185',
                        bgClass: 'bg-rose-500 border-2 border-rose-200 text-white',
                        onClick: () => onOpenStation('cams'),
                      }
                    : nearAdmin
                      ? {
                          id: 'admin',
                          label: 'অ্যাডমিন',
                          icon: <Radar className="w-5 h-5" />,
                          accentHex: '#38bdf8',
                          bgClass: 'bg-sky-500 border-2 border-sky-200 text-slate-950',
                          onClick: () => onOpenStation('admin'),
                        }
                      : nearVitals
                        ? {
                            id: 'vitals',
                            label: 'ভাইটালস',
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
                          ? `${Math.ceil(localPlayer.killCooldownRemaining)}সে.`
                          : 'ঘায়েল',
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
                      label: 'ব্যবহার',
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
                  label: 'রিপোর্ট',
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
                  label: 'সালিশ',
                  subLabel:
                    localPlayer.emergencyMeetingsLeft <= 0
                      ? '০বার'
                      : emergencyCd > 0
                        ? `${emergencyCd}সে.`
                        : `${localPlayer.emergencyMeetingsLeft}বার`,
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
                  label: 'ড্রেন',
                  subLabel:
                    localPlayer.specialRole === 'mistri' && !localPlayer.inVent && localPlayer.abilityCooldown > 0.05
                      ? `${Math.ceil(localPlayer.abilityCooldown)}সে.`
                      : localPlayer.inVent
                        ? 'বের হও'
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
                  label: 'নাশকতা',
                  subLabel:
                    snapshot.sabotage.cooldownRemaining > 0
                      ? `${Math.ceil(snapshot.sabotage.cooldownRemaining)}সে.`
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
                        ? `ভালভ চেপে ধরো (${Math.round(snapshot.sabotage.fixProgress * 100)}%)`
                        : `মেরামতে চেপে ধরো (${Math.round(snapshot.sabotage.fixProgress * 100)}%)`}
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
                        ? `${nearbyTask.title} (ওয়াই-ফাই নেই!)`
                        : isVondo
                          ? `ভুয়া কাজ: ${nearbyTask.title}`
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
                    <span>সিসিটিভি</span>
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
                    <span>অ্যাডমিন ম্যাপ</span>
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
                    <span>ভাইটালস</span>
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
                        ? 'ঘণ্টা শেষ!'
                        : emergencyCd > 0
                          ? `সালিশ অপেক্ষা ${emergencyCd}সে.`
                          : `সালিশ ডাকো! (${localPlayer.emergencyMeetingsLeft})`}
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
                    <span>লাশ: {nearbyBody.victimName}! রিপোর্ট করো</span>
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
                    <span>{(localPlayer.pranksLeft ?? 0) <= 0 ? 'মজা শেষ' : 'বাতি নিভাও!'}</span>
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
                        ? 'স্ক্যান শেষ'
                        : inspectableBody
                          ? `স্ক্যান (${localPlayer.scansLeft ?? 2})`
                          : `সূত্র (${localPlayer.scansLeft ?? 2})`}
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
                        ? `তাবিজ (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : shieldTarget
                          ? `তাবিজ দাও: ${shieldTarget.name}`
                          : 'নিজেকে তাবিজ'}
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
                        ? 'গুলি শেষ'
                        : localPlayer.abilityCooldown > 0.05
                          ? `দারোগা (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                          : darogaTarget
                            ? `গ্রেপ্তার ${darogaTarget.name}`
                            : 'গ্রেপ্তার গুলি'}
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
                        ? 'স্যালাইন শেষ'
                        : revivableBody
                          ? `বাঁচাও: ${revivableBody.victimName}`
                          : `স্যালাইন দিয়ে বাঁচাও (${localPlayer.revivesLeft ?? 0})`}
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
                        ? `সাফ হচ্ছে... ${(localPlayer.jharuTimer ?? 0).toFixed(1)}সে.`
                        : (localPlayer.cleansLeft ?? 3) <= 0
                          ? 'সাফাই শেষ'
                          : localPlayer.abilityCooldown > 0.05
                            ? `সাফাই (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                            : cleanableBody
                              ? `সাফ করো: ${cleanableBody.victimName} (${localPlayer.cleansLeft ?? 3})`
                              : `লাশ সাফ (${localPlayer.cleansLeft ?? 3})`}
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
                        ? `আসল রূপে ফেরো (${Math.ceil(localPlayer.disguiseTimer)}সে.)`
                        : localPlayer.abilityCooldown > 0.05
                          ? `ছদ্মবেশ (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                          : 'রূপ বদলাও'}
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
                        ? 'বন্ধন তৈরি ✓'
                        : ghotokPair
                          ? `বন্ধন: ${ghotokPair[0].name}`
                          : 'মহল্লা বন্ধন'}
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
                        ? `খাতা (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : masterTarget
                          ? `চেক: ${masterTarget.name}`
                          : 'খাতা চেক'}
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
                        ? `সিসিটিভি (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : 'পকেট সিসিটিভি'}
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
                        ? `ইনজেকশন (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : haturTarget
                          ? `ইনজেকশন: ${haturTarget.name}`
                          : 'নিজেকে ইনজেকশন'}
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
                        ? `সুপারি (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : supariTarget
                          ? `বদলাও (${supariTarget.name})`
                          : 'সুপারি বাছাই'}
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
                        ? `জ্যাম (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : 'যোগাযোগ জ্যাম'}
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
                        ? `বস (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : chamchaTarget
                          ? `বস: ${chamchaTarget.name}`
                          : 'বস বাছাই'}
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
                        ? `চাঁদা (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : chandabazTarget
                          ? `চাঁদা তোলো: ${chandabazTarget.name} (${localPlayer.chandabazTargets?.length ?? 0}/৩)`
                          : `চাঁদা (${localPlayer.chandabazTargets?.length ?? 0}/৩)`}
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
                        ? `রিল (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : !currentZoneId
                          ? 'এলাকায় ঢোকো'
                          : localPlayer.tiktokZones?.includes(currentZoneId)
                            ? `শুটিং শেষ (${localPlayer.tiktokZones.length}/৩)`
                            : `রিল বানাও (${localPlayer.tiktokZones?.length ?? 0}/৩)`}
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
                        ? `ড্রেন (${Math.ceil(localPlayer.abilityCooldown)}সে.)`
                        : 'ড্রেনে ঢোকো'}
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
                          ? `নাশকতা (${Math.ceil(snapshot.sabotage.cooldownRemaining)}সে.)`
                          : 'নাশকতা করো'}
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
                          ? `${Math.ceil(localPlayer.killCooldownRemaining)}সে.`
                          : killTarget
                            ? `ঘায়েল করো: ${killTarget.name}`
                            : 'কাছে যাও!'}
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
