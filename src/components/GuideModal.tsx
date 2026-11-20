import { useState } from 'react';
import { SPECIAL_ROLES, type SpecialRole } from '../shared/types';
import { BookOpen, CheckSquare, Compass, Gamepad2, ShieldAlert, Users, X, Zap } from 'lucide-react';

export interface GuideModalProps {
  onClose: () => void;
}

type GuideTab = 'wins' | 'tasks' | 'sabotage' | 'roles';

const ROLE_ORDER: SpecialRole[] = [
  'none',
  'goyenda',
  'kobiraj',
  'mistri',
  'daroga',
  'neta',
  'daktar',
  'ghotok_khala',
  'master_moshai',
  'cctv_kaku',
  'hatur_daktar',
  'bohurupi',
  'jharudar',
  'supari_killer',
  'dalal',
  'pagol',
  'chamcha',
  'chandabaz',
  'tiktok_star',
];

export function GuideModal({ onClose }: GuideModalProps) {
  const [activeTab, setActiveTab] = useState<GuideTab>('wins');

  const tabs: Array<{ id: GuideTab; label: string }> = [
    { id: 'wins', label: 'Win conditions' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'sabotage', label: 'Sabotage' },
    { id: 'roles', label: 'Roles' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ke Batpar Rules and Controls Guide"
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6"
      style={{ backgroundColor: 'rgba(6, 10, 18, 0.88)' }}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-amber-400/35 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ backgroundColor: 'rgba(13, 20, 34, 0.98)' }}
      >
        <header className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-amber-300 shrink-0" />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                Game Niyom — Moholla Rules &amp; Roles
              </h2>
              <p className="text-xs text-slate-400">
                Win conditions, station tasks, sabotage rules, special powers &amp; controls
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Guide"
            className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* 4 Tabs: Win conditions | Tasks | Sabotage | Roles */}
        <div
          role="tablist"
          aria-label="Rules sections"
          className="px-5 pt-3 pb-2 border-b border-slate-800 flex flex-wrap gap-2 bg-slate-950/50"
        >
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                  selected
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-200">
          {activeTab === 'wins' && (
            <div className="space-y-4">
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl p-4 bg-sky-950/45 border border-sky-400/30">
                  <h3 className="font-display font-bold text-sky-300 text-sm mb-1.5 flex items-center gap-1.5">
                    <Compass className="w-4 h-4" />
                    Parabasi (Moholla Crew) Win If:
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-300 list-disc pl-4">
                    <li>
                      <strong>100% Tasks Done:</strong> Shob Parabasi mile para tasks sesh korle (Ghost crew er tasks o count hoy!).
                    </li>
                    <li>
                      <strong>All Batpar Ejected:</strong> Shalish e shob Batpar ke Pukur e chubani dile ba Daroga size korle.
                    </li>
                  </ul>
                </div>
                <div className="rounded-xl p-4 bg-rose-950/45 border border-rose-400/30">
                  <h3 className="font-display font-bold text-rose-300 text-sm mb-1.5 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    Batpar (Impostors) Win If:
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-300 list-disc pl-4">
                    <li>
                      <strong>Parity:</strong> Alive Batpar &ge; ALL alive non-Batpar players (Neutrals including Pagla Baba count as non-Batpar!).
                    </li>
                    <li>
                      <strong>Critical Sabotage Timeout:</strong> Gas Leak (45s) timer 0 hoye gele! (Loadshedding ar Wi-Fi Down game sesh kore na.)
                    </li>
                  </ul>
                </div>
              </section>

              <section className="rounded-xl p-4 bg-purple-950/35 border border-purple-400/30">
                <h3 className="font-display font-bold text-purple-300 text-sm mb-1 flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Neutral Chaos Roles (5–15 Players) &amp; Ghost Rules
                </h3>
                <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
                  <li>
                    <strong>Pagla Baba:</strong> Nije eka jite jodi Shalish vote e Pukur e fele deowa hoy! Game tokhon e sesh, bakira hare.
                  </li>
                  <li>
                    <strong>Chamcha, Chandabaz &amp; TikTok Star:</strong> Chamcha Patron er team er sathe CO-WIN kore; Chandabaz 3 jon theke Chanda nile Solo jite; TikTok Star 3 zone e reel kore sesh 4 jon e thakle jite!
                  </li>
                  <li>
                    <strong>Ghosts:</strong> Morle Adrishyo Ghost hoye jabe — wall er bhitore diye jete parbe, dead chat e kotha bolte parbe, ar Parabasi hole Ghost hoyeo tasks sesh korte parbe!
                  </li>
                </ul>
              </section>

              <section className="rounded-xl p-3.5 bg-slate-900 border border-slate-800">
                <h3 className="font-display font-bold text-amber-300 text-sm mb-1.5 flex items-center gap-1.5">
                  <Gamepad2 className="w-4 h-4" />
                  Quick Controls
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-300 font-mono-tabular">
                  <div><strong>WASD / Arrows</strong> Move · <strong>Space</strong> Jump</div>
                  <div><strong>Drag / [C]</strong> Free Look · <strong>[Y]</strong> Reset Cam</div>
                  <div><strong>[E]</strong> Task / Fix / Cams · <strong>[R]</strong> Report Lash</div>
                  <div><strong>[F]</strong> Adda Bell · <strong>[G]</strong> Role Power</div>
                  <div><strong>[Q]</strong> Gap e Naw (Kill) · <strong>[V]</strong> Dren (Vent)</div>
                  <div><strong>[Tab]</strong> Map &amp; Sabotage · <strong>[1–6]</strong> Meme SFX</div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-3">
              <div className="rounded-xl p-4 bg-slate-900 border border-slate-800 space-y-2">
                <h3 className="font-display font-bold text-amber-300 text-sm flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4" />
                  How Moholla Tasks Work
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-300 list-disc pl-4">
                  <li>
                    Holud station er kache giye <strong>[E]</strong> chapo — 3–6s mini-task shesh korlei team Task Bar bare.
                  </li>
                  <li>
                    <strong>2 Common + 2 Short + 1 Long (default 5):</strong> Common task shob Parabasi er same; Long task dead-end room e thake (beshi risk!).
                  </li>
                  <li>
                    <strong>Visual Tasks:</strong> Visual tasks (jemon Cha steam, Pukur scan) 6m er moddhe onnora dekhte pay — Batpar fake task korle kono effect dekha jay na!
                  </li>
                  <li>
                    <strong>Batpar Fake List:</strong> Batpar same task names pay kintu tader task team progress baray na.
                  </li>
                </ul>
              </div>
              <div className="rounded-xl p-4 bg-slate-900 border border-slate-800">
                <h3 className="font-display font-bold text-sky-300 text-sm mb-1.5">
                  Surveillance Stations
                </h3>
                <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
                  <li><strong>CCTV Booth (North):</strong> Live camera feeds across Moholla hotspots.</li>
                  <li><strong>Admin Radar (East):</strong> Zone-wise live player headcount.</li>
                  <li><strong>Vitals Clinic (West):</strong> Check who is Alive vs Size in real time.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'sabotage' && (
            <div className="space-y-3">
              <div className="rounded-xl p-4 bg-amber-950/30 border border-amber-400/35 space-y-2">
                <h3 className="font-display font-bold text-amber-300 text-sm flex items-center gap-1.5">
                  <Zap className="w-4 h-4" />
                  Non-Critical Sabotage (Never Ends the Game)
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-300 list-disc pl-4">
                  <li>
                    <strong>Loadshedding:</strong> Parabasi vision 0.45x ar dark HUD (Batpar unaffected). DESCO panel e giye 3s <strong>[E]</strong> dhore thik koro, ba 90s pore nijei current ashbe!
                  </li>
                  <li>
                    <strong>Wi-Fi Down:</strong> Task list &amp; bar hide hoy, digital tasks lock hoy (physical tasks kaj kore). Dish roof e giye 3s <strong>[E]</strong> dhore fix koro, ba 90s pore auto-ends!
                  </li>
                  <li>
                    <strong>Shutter Door Lock:</strong> 10s door lock (18s cooldown) — never ends the game.
                  </li>
                </ul>
              </div>

              <div className="rounded-xl p-4 bg-rose-950/40 border border-rose-500/40 space-y-2">
                <h3 className="font-display font-bold text-rose-300 text-sm flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  CRITICAL Sabotage: Gas Leak (45s)
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-300 list-disc pl-4">
                  <li>
                    <strong>Only Gas Leak can end the game!</strong> 45s countdown — 0 hole Batpar immediate WIN!
                  </li>
                  <li>
                    <strong>Fix Rule:</strong> Dui ta alada zone er valve (Cha Dokan ar Rickshaw Garage) eksathe <strong>2 dui jon player</strong> mile 2s hold korte hobe.
                  </li>
                  <li>
                    <strong>Rules:</strong> Shuru te 40s sabotage lockout, fix/expiry er por 35s global cooldown. Adda Bell shudhu Gas Leak er shomoy blocked thake!
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'roles' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-xl p-3 bg-slate-900 border border-rose-500/30">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-rose-300">Batpar (আসল বাটপার)</span>
                  <span className="text-[11px] font-mono-tabular text-rose-200">Kill [Q] · Vent [V]</span>
                </div>
                <p className="text-xs text-slate-300">
                  Gap e niye size koro, Gopon Dren diye palao, ar Loadshedding/Wi-Fi/Gas Leak sabotage dao.
                </p>
              </div>
              {ROLE_ORDER.map((r) => {
                const meta = SPECIAL_ROLES[r];
                return (
                  <div key={r} className="rounded-xl p-3 bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold" style={{ color: meta.accentHex }}>
                        {meta.title}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-slate-400">{meta.abilityLabel}</span>
                    </div>
                    <p className="text-xs text-slate-300">{meta.shortDesc}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
