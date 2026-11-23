import { useEffect, useState } from 'react';
import {
  PLAYER_COLORS,
  SPECIAL_ROLES,
  type PlayerColorId,
  type PublicRoomSummary,
  type RoomSettings,
  type SpecialRole,
} from '../shared/types';
import { getLoadedCustomCount, subscribeMemePack } from '../audio/memePackStore';
import { soundEngine } from '../audio/soundEngine';
import { loadCareerStats } from '../game/statsStore';
import { BATPAR_SPECIAL_ROLES, isNeutralRole } from '../shared/gameRules';
import {
  Users,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Music2,
  SlidersHorizontal,
  BookOpen,
  Trophy,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Shuffle,
  Pencil,
} from 'lucide-react';
import { pickAutoMultiplayerIdentity } from '../shared/banglaComedy';
import {
  isFullscreenActive,
  subscribeFullscreenChange,
  toggleFullscreenMode,
} from '../utils/mobileFullscreen';

export interface TitleOverlayProps {
  playerName: string;
  playerColor: PlayerColorId;
  publicRooms: PublicRoomSummary[];
  errorMsg: string | null;
  connecting?: boolean;
  soloPlayerCount: number;
  soloSettings: RoomSettings;
  onChangeName: (name: string) => void;
  onChangeColor: (color: PlayerColorId) => void;
  onChangeSoloPlayerCount: (count: number) => void;
  onUpdateSoloSettings: (settings: Partial<RoomSettings>) => void;
  onStartSolo: (forceRole?: 'parabasi' | 'vondo', forceSpecialRole?: SpecialRole) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onRefreshRooms: () => void;
  onOpenMemePack?: () => void;
  onOpenGuide: () => void;
  initialJoinCode?: string | null;
}

const SOLO_SPECIAL_OPTIONS: Array<{ value: SpecialRole | 'random'; label: string }> = [
  { value: 'random', label: 'র‍্যান্ডম স্পেশাল রোল' },
  { value: 'goyenda', label: 'সিআইডি মফিজ (গোয়েন্দা)' },
  { value: 'kobiraj', label: 'তাবিজ বাবা (কবিরাজ)' },
  { value: 'mistri', label: 'কারেন্ট বাবু (মিস্ত্রি)' },
  { value: 'daroga', label: 'পাড়া দারোগা (পুলিশ)' },
  { value: 'neta', label: 'মহল্লা নেতা (২ গুণ ভোট)' },
  { value: 'daktar', label: 'পাড়া ডাক্তার (চিকিৎসক)' },
  { value: 'ghotok_khala', label: 'ঘটক খালা (জুটি বাঁধে)' },
  { value: 'master_moshai', label: 'মাস্টার মশাই (শিক্ষক)' },
  { value: 'cctv_kaku', label: 'সিসিটিভি কাকু (রিমোট ক্যাম)' },
  { value: 'hatur_daktar', label: 'হাতুড়ে ডাক্তার (ঢাল)' },
  { value: 'bohurupi', label: 'বহুরূপী বাটপার (ছদ্মবেশী)' },
  { value: 'jharudar', label: 'সাফাই বাটপার (লাশ গায়েব)' },
  { value: 'supari_killer', label: 'সুপারি কিলার (খুনি)' },
  { value: 'dalal', label: 'দালাল বাটপার (জ্যামার)' },
  { value: 'pagol', label: 'পাগলা বাবা (উল্টা জয়)' },
  { value: 'chamcha', label: 'চামচা (সহ-বিজয়ী)' },
  { value: 'chandabaz', label: 'চাঁদাবাজ (চাঁদাবাজি)' },
  { value: 'tiktok_star', label: 'টিকটক স্টার (ভাইরাল রিল)' },
];

export function TitleOverlay({
  playerName,
  playerColor,
  publicRooms,
  errorMsg,
  connecting = false,
  soloPlayerCount,
  soloSettings,
  onChangeName,
  onChangeColor,
  onChangeSoloPlayerCount,
  onUpdateSoloSettings,
  onStartSolo,
  onCreateRoom,
  onJoinRoom,
  onRefreshRooms,
  onOpenMemePack,
  onOpenGuide,
  initialJoinCode,
}: TitleOverlayProps) {
  const [joinCode, setJoinCode] = useState(() => (initialJoinCode ? initialJoinCode.toUpperCase() : ''));
  const [modeTab, setModeTab] = useState<'solo' | 'multi'>(() => (initialJoinCode ? 'multi' : 'solo'));
  const [soloSpecial, setSoloSpecial] = useState<SpecialRole | 'random'>('random');
  const [showSoloSettings, setShowSoloSettings] = useState(false);
  const [editingMultiIdentity, setEditingMultiIdentity] = useState(false);
  const [multiAutoApplied, setMultiAutoApplied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => isFullscreenActive());
  const [bgmEnabled, setBgmEnabled] = useState(() => soundEngine.isBgmEnabled());
  const [, setPackVer] = useState(0);

  const applyAutoIdentity = () => {
    const auto = pickAutoMultiplayerIdentity([playerName], [playerColor]);
    onChangeName(auto.name);
    onChangeColor(auto.color);
    setMultiAutoApplied(true);
  };

  useEffect(() => {
    if (initialJoinCode) {
      setJoinCode(initialJoinCode.toUpperCase());
      setModeTab('multi');
      if (!multiAutoApplied && playerName.trim() === 'Lal Mia') {
        const auto = pickAutoMultiplayerIdentity([playerName], [playerColor]);
        onChangeName(auto.name);
        onChangeColor(auto.color);
        setMultiAutoApplied(true);
      }
      onRefreshRooms();
    }
  }, [initialJoinCode, multiAutoApplied, onChangeColor, onChangeName, onRefreshRooms, playerColor, playerName]);

  useEffect(() => subscribeMemePack(() => setPackVer((v) => v + 1)), []);
  useEffect(() => subscribeFullscreenChange(setIsFullscreen), []);
  useEffect(
    () => soundEngine.subscribeBgmState(() => setBgmEnabled(soundEngine.isBgmEnabled())),
    [],
  );
  const customMemeCount = getLoadedCustomCount();
  const career = loadCareerStats();

  const selectedSpec = PLAYER_COLORS.find((c) => c.id === playerColor) ?? PLAYER_COLORS[0];

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none overflow-y-auto"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Top-Right Quick BGM & Fullscreen Toggles */}
      <div className="fixed top-3 right-3 sm:top-5 sm:right-5 z-30 pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            soundEngine.toggleBgm();
          }}
          aria-label={bgmEnabled ? 'মিউজিক বন্ধ করো' : 'মিউজিক চালু করো'}
          title="ব্যাকগ্রাউন্ড মিউজিক"
          className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-lg ${
            bgmEnabled
              ? 'border-emerald-400/40 bg-slate-950/85 hover:bg-slate-900 text-emerald-200'
              : 'border-white/15 bg-slate-950/85 hover:bg-slate-900 text-slate-400'
          }`}
        >
          {bgmEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          <span>{bgmEnabled ? 'মিউজিক চালু' : 'মিউজিক বন্ধ'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            void toggleFullscreenMode(true);
          }}
          aria-label={isFullscreen ? 'ফুলস্ক্রিন বন্ধ করো' : 'ফুলস্ক্রিন চালু করো'}
          className="px-3 py-2 rounded-xl border border-amber-400/40 bg-slate-950/85 hover:bg-slate-900 text-amber-200 text-xs font-bold flex items-center gap-1.5 shadow-lg"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          <span>{isFullscreen ? 'ছোট স্ক্রিন' : 'ফুলস্ক্রিন'}</span>
        </button>
      </div>

      {/* Subtle left-side scrim for crisp typography contrast over the live 3D Moholla flyover */}
      <div
        className="fixed inset-y-0 left-0 w-full max-w-2xl pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(10,15,25,0.92) 0%, rgba(10,15,25,0.72) 65%, rgba(10,15,25,0) 100%)',
        }}
      />

      <main className="relative z-10 flex flex-col justify-center [@media(max-height:540px)]:justify-start flex-1 px-4 py-4 [@media(max-height:540px)]:py-2 sm:px-12 [@media(max-height:540px)]:px-5 max-w-xl [@media(max-height:540px)]:max-w-lg pointer-events-auto">
        {/* Custom Inline SVG Emblem Lockup */}
        <div className="mb-3 sm:mb-6 [@media(max-height:540px)]:mb-1.5">
          <svg
            viewBox="0 0 470 114"
            className="w-full max-w-[300px] sm:max-w-[420px] [@media(max-height:540px)]:max-w-[235px] h-auto"
            role="img"
            aria-label="KE BATPAR? - বাংলার থ্রিডি সামাজিক ধাঁধা ও কমেডি খেলা"
          >
            <g transform="translate(8, 12)">
              {/* Cute Chibi Moholla Crewmate with Sprout, Rosy Cheeks & Visor Sparkle */}
              <path d="M33 14 L33 4 M33 7 Q22 1 20 8 Q26 11 33 7 M33 7 Q44 1 46 8 Q40 11 33 7" fill="#4ade80" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" />
              <rect x="6" y="14" width="54" height="70" rx="26" fill={selectedSpec.hex} stroke="#fbbf24" strokeWidth="4" />
              <rect x="26" y="27" width="32" height="19" rx="9.5" fill="#bae6fd" stroke="#0f172a" strokeWidth="3" />
              <ellipse cx="48" cy="33" rx="4.5" ry="2.2" fill="#ffffff" />
              <ellipse cx="23" cy="52" rx="4.5" ry="2.6" fill="#fb7185" opacity="0.8" />
              <ellipse cx="52" cy="52" rx="4.5" ry="2.6" fill="#fb7185" opacity="0.8" />
              <rect x="0" y="34" width="12" height="32" rx="5" fill="#cbd5e1" stroke="#0f172a" strokeWidth="2.5" />
              <path d="M58 46 L68 46 L66 57 L60 57 Z" fill="#b45309" stroke="#fbbf24" strokeWidth="1.8" />
              <path d="M16 82 L16 94 M46 82 L46 94" stroke="#fbbf24" strokeWidth="8" strokeLinecap="round" />
            </g>
            <text
              x="82"
              y="56"
              fill="#f8fafc"
              fontFamily="'Bricolage Grotesque', 'Plus Jakarta Sans', sans-serif"
              fontWeight="800"
              fontSize="44"
              letterSpacing="-1"
            >
              KE BATPAR?
            </text>
            <text
              x="84"
              y="88"
              fill="#fbbf24"
              fontFamily="'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif"
              fontWeight="700"
              fontSize="20"
            >
              কে বাটপার? · Moholla Comedy
            </text>
          </svg>
          <p className="hidden sm:block [@media(max-height:540px)]:hidden mt-2 text-sm sm:text-base text-slate-300 leading-relaxed max-w-md">
            দুধ-চা খাও, লোডশেডিং সামলাও, আর পাড়া থেকে আসল বাটপারকে খুঁজে পুকুরে চুবানি দাও!
          </p>
        </div>

        {/* Character Setup Card */}
        <section
          aria-label="খেলোয়াড়ের পরিচয়"
          className="rounded-2xl p-4 sm:p-5 [@media(max-height:540px)]:p-3 border border-white/12 shadow-2xl"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          {modeTab === 'solo' || editingMultiIdentity ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 [@media(max-height:540px)]:gap-2.5 mb-4 [@media(max-height:540px)]:mb-2.5">
              <div>
                <div className="flex items-center justify-between mb-1.5 [@media(max-height:540px)]:mb-1">
                  <label htmlFor="player-name-input" className="block text-xs font-semibold text-slate-300">
                    পাড়ার ডাকনাম
                  </label>
                  {modeTab === 'multi' && (
                    <button
                      type="button"
                      onClick={() => setEditingMultiIdentity(false)}
                      className="text-[11px] font-semibold text-amber-300 hover:text-amber-200"
                    >
                      সম্পন্ন
                    </button>
                  )}
                </div>
                <input
                  id="player-name-input"
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={(e) => onChangeName(e.target.value)}
                  placeholder="যেমন: Lal Mia"
                  className="w-full px-3.5 py-2.5 [@media(max-height:540px)]:py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-medium focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-300 mb-1.5 [@media(max-height:540px)]:mb-1">
                  রঙ · {selectedSpec.label}
                </span>
                <div className="grid grid-cols-5 gap-1.5 w-fit [@media(max-height:540px)]:gap-1" role="radiogroup" aria-label="চরিত্রের রঙ বেছে নাও">
                  {PLAYER_COLORS.map((c) => {
                    const active = c.id === playerColor;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onChangeColor(c.id)}
                        aria-label={`রঙ ${c.label}`}
                        aria-checked={active}
                        role="radio"
                        className={`w-6 h-6 [@media(max-height:540px)]:w-5 [@media(max-height:540px)]:h-5 rounded-full border-2 transition-transform ${
                          active ? 'border-amber-300 scale-110' : 'border-white/25 hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-3 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-8 h-8 rounded-full border-2 border-amber-300 shrink-0"
                  style={{ backgroundColor: selectedSpec.hex }}
                />
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate">
                    {playerName.trim() || 'Para Hero'}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    রঙ: {selectedSpec.label} · নাম: অটো
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={applyAutoIdentity}
                  aria-label="অটো নাম ও রঙ বদলাও"
                  title="মজার আরেকটি নাম ও রঙ নাও"
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold flex items-center gap-1"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">অটো</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMultiIdentity(true)}
                  aria-label="নাম বা রঙ পরিবর্তন করো"
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">বদলাও</span>
                </button>
              </div>
            </div>
          )}

          {/* Mode Segmented Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 mb-4 [@media(max-height:540px)]:mb-2.5">
            <button
              type="button"
              onClick={() => {
                setModeTab('solo');
                setEditingMultiIdentity(false);
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                modeTab === 'solo' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              সলো ম্যাচ (বট)
            </button>
            <button
              type="button"
              onClick={() => {
                setModeTab('multi');
                if (!multiAutoApplied || playerName.trim() === 'Lal Mia') {
                  applyAutoIdentity();
                }
                onRefreshRooms();
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                modeTab === 'multi' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              অনলাইন রুম
            </button>
          </div>

          {errorMsg && (
            <div role="alert" className="mb-3 px-3 py-2 rounded-lg bg-rose-950/90 border border-rose-500/40 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {modeTab === 'solo' ? (
            <div className="space-y-2.5 [@media(max-height:540px)]:space-y-1.5">
              <div className="flex items-center justify-between gap-2 px-3 py-2 [@media(max-height:540px)]:py-1.5 rounded-xl bg-slate-900 border border-slate-800">
                <label
                  htmlFor="solo-role-select"
                  className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  স্পেশাল রোল
                </label>
                <select
                  id="solo-role-select"
                  value={soloSpecial}
                  onChange={(e) => setSoloSpecial(e.target.value as SpecialRole | 'random')}
                  className="flex-1 max-w-[230px] px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-semibold text-amber-200 focus:outline-none focus:border-amber-400"
                >
                  {SOLO_SPECIAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {soloSpecial !== 'random' && (
                <p className="text-[11px] text-slate-300/90 px-1 leading-snug">
                  {SPECIAL_ROLES[soloSpecial].shortDesc}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowSoloSettings((v) => !v)}
                  aria-expanded={showSoloSettings}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-300" />
                  ম্যাচের নিয়ম ({soloPlayerCount} জন · {soloSettings.vondoCount} বাটপার · {soloSettings.tasksPerPlayer} কাজ)
                </button>
                {career.matchesPlayed > 0 && (
                  <span className="text-[11px] font-mono-tabular font-semibold text-emerald-300 flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-300" />
                    {career.wins} জয় / {career.matchesPlayed} ম্যাচ
                  </span>
                )}
              </div>

              {showSoloSettings && (
                <div className="rounded-xl p-3 bg-slate-900/95 border border-slate-700/80 grid grid-cols-2 gap-2 text-xs text-slate-200">
                  <label className="flex items-center justify-between gap-1.5">
                    <span className="text-slate-400">খেলোয়াড়</span>
                    <select
                      value={soloPlayerCount}
                      onChange={(e) => onChangeSoloPlayerCount(Number(e.target.value))}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white"
                    >
                      {[5, 6, 7, 8, 9, 10, 12, 15].map((cnt) => (
                        <option key={cnt} value={cnt}>
                          {cnt} জন
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-1.5">
                    <span className="text-slate-400">বাটপার</span>
                    <select
                      value={soloSettings.vondoCount}
                      onChange={(e) => onUpdateSoloSettings({ vondoCount: Number(e.target.value) })}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white"
                    >
                      <option value={1}>১ জন বাটপার</option>
                      <option value={2} disabled={soloPlayerCount < 6}>
                        ২ জন বাটপার {soloPlayerCount < 6 ? '(৬+ জন)' : ''}
                      </option>
                      <option value={3} disabled={soloPlayerCount < 11}>
                        ৩ জন বাটপার {soloPlayerCount < 11 ? '(১১+ জন)' : ''}
                      </option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-1.5">
                    <span className="text-slate-400">কিল বিরতি</span>
                    <select
                      value={soloSettings.killCooldownSec}
                      onChange={(e) => onUpdateSoloSettings({ killCooldownSec: Number(e.target.value) })}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white"
                    >
                      <option value={12}>১২ সে.</option>
                      <option value={18}>১৮ সে.</option>
                      <option value={25}>২৫ সে.</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-1.5">
                    <span className="text-slate-400">কাজ</span>
                    <select
                      value={soloSettings.tasksPerPlayer}
                      onChange={(e) => onUpdateSoloSettings({ tasksPerPlayer: Number(e.target.value) })}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white"
                    >
                      <option value={4}>৪টি কাজ</option>
                      <option value={5}>৫টি কাজ</option>
                      <option value={6}>৬টি কাজ</option>
                      <option value={8}>৮টি কাজ</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={soloSettings.confirmEjects}
                      onChange={(e) => onUpdateSoloSettings({ confirmEjects: e.target.checked })}
                      className="accent-amber-400 w-3.5 h-3.5"
                    />
                    <span>আসল পরিচয় দেখাও</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={soloSettings.anonymousVotes}
                      onChange={(e) => onUpdateSoloSettings({ anonymousVotes: e.target.checked })}
                      className="accent-amber-400 w-3.5 h-3.5"
                    />
                    <span>গোপন ভোট</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={soloSettings.visualTasks}
                      onChange={(e) => onUpdateSoloSettings({ visualTasks: e.target.checked })}
                      className="accent-amber-400 w-3.5 h-3.5"
                    />
                    <span>লাইভ কাজের দৃশ্য</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={soloSettings.enableSpecialRoles}
                      onChange={(e) => onUpdateSoloSettings({ enableSpecialRoles: e.target.checked })}
                      className="accent-amber-400 w-3.5 h-3.5"
                    />
                    <span>স্পেশাল রোল</span>
                  </label>
                </div>
              )}

              <button
                type="button"
                data-start="true"
                onClick={() =>
                  onStartSolo(undefined, soloSpecial === 'random' ? undefined : soloSpecial)
                }
                className="w-full py-3.5 [@media(max-height:540px)]:py-2.5 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-base [@media(max-height:540px)]:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                সলো ম্যাচ শুরু করো
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onStartSolo(
                      'parabasi',
                      soloSpecial !== 'random' &&
                        !BATPAR_SPECIAL_ROLES.includes(soloSpecial) &&
                        !isNeutralRole(soloSpecial)
                        ? soloSpecial
                        : undefined,
                    )
                  }
                  className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                >
                  পাড়াবাসী প্র্যাকটিস
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onStartSolo(
                      'vondo',
                      soloSpecial !== 'random' && BATPAR_SPECIAL_ROLES.includes(soloSpecial)
                        ? soloSpecial
                        : undefined,
                    )
                  }
                  className="flex-1 py-2 px-3 rounded-lg bg-rose-950/90 hover:bg-rose-900 border border-rose-500/30 text-rose-200 text-xs font-semibold transition-colors"
                >
                  বাটপার প্র্যাকটিস
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {initialJoinCode && (
                <div className="px-3 py-2 rounded-lg bg-emerald-950/80 border border-emerald-400/40 text-xs text-emerald-200 font-semibold">
                  আমন্ত্রণ লিংক প্রস্তুত — রুম <span className="font-mono-tabular text-amber-300">{initialJoinCode.toUpperCase()}</span> বসানো আছে! নাম লিখে যোগ দাও।
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  disabled={connecting}
                  onClick={onCreateRoom}
                  className="py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  {connecting ? 'কানেক্ট হচ্ছে...' : 'রুম বানাও'}
                </button>
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    type="text"
                    maxLength={6}
                    aria-label="রুম কোড"
                    placeholder="রুম কোড"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && joinCode.trim().length >= 3 && !connecting) {
                        onJoinRoom(joinCode.trim());
                      }
                    }}
                    className="flex-1 min-w-0 px-3 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-mono-tabular uppercase tracking-widest focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    aria-label="রুম কোড দিয়ে জয়েন করো"
                    disabled={connecting || joinCode.trim().length < 3}
                    onClick={() => onJoinRoom(joinCode.trim())}
                    className="px-4 py-3 rounded-xl bg-amber-400 disabled:opacity-40 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-colors whitespace-nowrap"
                  >
                    জয়েন করো
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                <strong className="text-slate-200">রুম বানাও</strong> দিয়ে বন্ধুদের কোড দাও, অথবা বন্ধুর <strong className="text-amber-300">রুম কোড</strong> লিখে জয়েন করো!
              </p>

              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-400">সচল পাবলিক রুম</span>
                  <button
                    type="button"
                    onClick={onRefreshRooms}
                    aria-label="পাবলিক রুম রিফ্রেশ করো"
                    className="text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    রিফ্রেশ
                  </button>
                </div>
                {publicRooms.length === 0 ? (
                  <p className="text-xs text-slate-400 py-1">নতুন রুম খুলে বন্ধুদের রুম কোড শেয়ার করো!</p>
                ) : (
                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {publicRooms.map((r) => (
                      <div
                        key={r.roomCode}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-slate-800"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono-tabular font-bold text-amber-300">{r.roomCode}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-200">{r.hostName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono-tabular text-slate-400 flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {r.playerCount}/{r.maxPlayers}
                          </span>
                          <button
                            type="button"
                            onClick={() => onJoinRoom(r.roomCode)}
                            className="px-2.5 py-1 rounded bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300"
                          >
                            যোগ দাও
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Original Meme Pack (Admin only) & Rules Guide Bar */}
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-2">
            {onOpenMemePack && (
              <button
                type="button"
                onClick={onOpenMemePack}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-400/35 text-amber-200 text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2 truncate">
                  <Music2 className="w-4 h-4 text-amber-300 shrink-0" />
                  <span className="truncate">মিম প্যাক</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 font-mono-tabular text-[11px] shrink-0">
                  {customMemeCount > 0 ? `${customMemeCount} ক্লিপ` : 'আপলোড'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenGuide}
              className={`${onOpenMemePack ? '' : 'flex-1 justify-center '}py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-sky-400/35 text-sky-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0`}
            >
              <BookOpen className="w-4 h-4 text-sky-300 shrink-0" />
              নিয়ম ও চরিত্র
            </button>
          </div>
        </section>
      </main>

      {/* Clean Single-Line Bottom Control Hint (hidden on small/touch mobile) */}
      <footer className="hidden md:block relative z-10 px-6 sm:px-12 pb-5">
        <p className="text-xs text-slate-300/85 font-medium tracking-wide">
          WASD হাঁটা · Space লাফ · Shift দৌড় · ড্র্যাগ ৩৬০° · হুইল জুম · ১–৬ মিম সাউন্ড · E কাজ · R রিপোর্ট · F সালিশ
        </p>
      </footer>
    </div>
  );
}
