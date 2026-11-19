# Ke Batpar? (Ke Vondo) — Game Rules & Design Document

Bangla "para / moholla" 3D social-deduction game (Among Us × Super Sus) built on a shared pure-rule engine (`src/shared/gameRules.ts`) and shared corridor bot AI (`src/shared/botAi.ts`) used identically across Solo, P2P Host, Node/WS Server, and Cloudflare Durable Object sessions.

---

## 1. Player Flow & Lobby

1. **Title Screen**: Choose **Solo (with bots)**, **Create Room**, or **Join Room (4–6 char code)**.
   - Solo enters the unified **Waiting Lobby** (`Solo Room`, host = local player, bots fill slots; `?autostart=1` jumps straight to active 3D gameplay for quick testing).
2. **Waiting Lobby (`lobby`)**:
   - **3D Cha-er Dokan Corner**: Joined players idle around the Moholla intersection; local player can walk around freely.
   - **Slots**: Minimum **5**, maximum **8** players. Host can **Add/Remove bots** and **Kick** human players.
   - **Customize**: Any player can change their **name** (max 12 chars, profanity-filtered, auto-suffixed if duplicate) and pick from **8 distinct colors** (taken colors disabled).
   - **Ready System**: Non-host humans must toggle **Ready**. Host **Play** stays disabled until `players >= 5` AND all humans are Ready, showing the exact Banglish blocker reason (`"Aro X jon lagbe"` or `"{Name} ready na"`).
   - **Host Settings**: Live-synced `Batpar Count (1–2)`, `Kill Cooldown`, `Discussion Time`, `Voting Time`, `Move Speed`, `Tasks Per Player`, `Emergency Meetings`, `Emergency Cooldown`, `Confirm Ejects`, `Anonymous Votes`, `Visual Tasks`, `Special Roles`, `Neutral Roles`, and `Auto-Fill Bots`. Displays a live **Role Pool Preview** for the active player count.
   - **Lobby Chat**: Rate-limited (500ms cooldown), max 120 chars.
   - **Start Countdown**: 5-4-3-2-1 live countdown visible to all (host can cancel; unreadying cancels). Late joiners are blocked once countdown begins (`"Khela shuru hoye gese"`).
   - **Edge Cases**: Host disconnect promotes the oldest remaining human automatically; unexpected disconnect reserves the player's slot for **20 seconds** via `reconnectToken`; invalid room codes return `"Ei code e kono room nai"`.
3. **Match Sequence**:
   - `role_reveal` (8s skippable Role Card Reveal + Game Niyom rules overview) → `playing` → `meeting` (`discussionTimer` 15s lock → `meetingTimer` 30s voting) → `vote_results` (2.6s tally) → `ejecting` (7.5s Pukur Chubani splash if voted, 5.0s if tie/skip) → repeat or `gameover` (3s dramatic Finale Banner beat → full `OutcomeModal` breakdown with Play Again back to the **same lobby**).

---

## 2. Core Rules & Win Conditions (`src/shared/gameRules.ts`)

### 2.1 Win Priority Order (evaluated each tick)
1. **Pagol Ejected (`pagol_ejected`)**: A Neutral role (e.g., `Pagla Baba` / `Pagol`) is ejected by vote → match ends immediately in Neutral victory.
2. **Parabasi Task Completion (`tasks_completed`)**: 100% of assigned **Parabasi** tasks completed (dead Ghost Parabasi tasks continue to count; Batpar fake tasks & Neutral roles are excluded from task totals).
3. **All Batpars Eliminated (`batpars_out`)**: Zero alive Batpar players remain.
4. **Critical Sabotage Timeout (`critical_sabotage_timeout`)**: Only `gas_leak` reaching `0s` ends the game in Batpar victory (`"Gas Phute Pura Para Uthhe Gese!"`). Non-critical sabotages never end the game.
5. **Batpar Parity (`batpars_outnumber`)**: `alive Batpar >= alive NON-Batpar` (counts **all** alive non-Batpar players, including Neutral roles).

---

## 3. Sabotage Rules

- **Global Rules**: One sabotage active at a time; **40s initial lockout** at match start; **35s global cooldown** after any fix or auto-expiry.
- **Non-Critical Sabotages** (never end the match, no win/lose timer, emergency bell remains usable, continue running across meetings):
  - **`loadshedding`**: Crew vision `×0.45` + dark HUD (Batpar unaffected). Fix at **DESCO Powerhouse** (`hold E 3s`, 1 player). Auto-expires after **90s** (`"Current ashche!"`).
  - **`wifi_down`**: Hides crew task list/bar and locks `digital` task stations (`physical` tasks still work). Fix at **Dish Cable Hub** (`hold E 3s`, 1 player). Auto-expires after **90s** (`"Wi-Fi ashche!"`).
- **Critical Sabotage** (blocks Emergency Bell; cancelled cleanly if a body-report meeting starts, resetting 35s cooldown):
  - **`gas_leak` ("Gas Phutche!")**: **45s** critical countdown. Requires **two different alive players** holding **both** far valves (`Cha-er Dokan` & `Rickshaw Stand`) simultaneously for **2 seconds**.
- **Door Shutters ("Shutter namay dise")**: Separate **10s** lock per zone with **18s** cooldown; never ends the match.

---

## 4. Tasks, Kills, Vents & Meetings

- **Tasks**: Completed strictly **within station radius** (`hold/interact 3–6s`). Each player gets **2 common** (shared across all crew), **short**, and **long** tasks per `tasksPerPlayer` (default 5). Visual tasks (`Brew Dudh-Cha`, `Pukur Med-Scan`, `Drop Biyer DJ Beat`) broadcast a real 6m visible effect when `visualTasks` is ON; Batpar fake tasks produce no visual effect.
- **Kills & Vents**: **10s initial kill cooldown** at match start; resets to `killCooldownSec` after every meeting. Vents connect 13 Moholla drains in a symmetric graph usable by Batpar (and `Mistri`). Body reports require **unobstructed Line of Sight** past tall walls and locked shutters.
- **Meetings & Voting**:
  - **15s Discussion Lock (`discussionTimer`)**: Suspect & Skip buttons are locked during the first 15s (or `settings.discussionTimeSec`) so everyone can chat and debate clues before voting unlocks.
  - **Tie / Skip Plurality**: Nobody is thrown in Pukur.
  - **Ghosts**: Dead players move freely through walls, see everything, chat in `ghostOnly` channels hidden from living players, complete remaining crew tasks, and have **1 harmless Streetlamp Flicker Prank (`[G]`) per round** (resets after each meeting).

---

## 5. Role Distribution & Roster

### Distribution Guardrails (`assignSpecialRoles`)
- **5 players**: 1 Batpar, 1 Special Crew, 0 Neutral, 3 Plain Parabasi
- **6 players**: 1 Batpar, 2 Special Crew, 0–1 Neutral (60%), 2–3 Plain Parabasi
- **7 players**: 1 Batpar, 2–3 Special Crew, 0–1 Neutral (60%), 2+ Plain Parabasi
- **8 players**: 2 Batpar, 2–3 Special Crew, 0–1 Neutral (60%), 2+ Plain Parabasi
- Plain Parabasi always stays `>= 40%` of non-Batpar players (`>= 3` at 5P, `>= 2` at 6–8P). Maximum 1 Special Batpar for `<= 7` players, max 1 Neutral at `>= 6` players.

### Core Roles
- **Goyenda (`CID Mofiz`)** *(Crew)*: Sees fading footprints + **2 body clue scans per match** (`killerColorHint` + `killerZoneHint`).
- **Kobiraj (`Tabiz Baba`)** *(Crew)*: Places a 1-hit Tabiz kill shield on an adjacent neighbor (24s cooldown).
- **Mistri (`Current Babu`)** *(Crew)*: Uses drain vents (audible to nearby players within 8m) and fixes sabotages from 4.6m range.
- **Daroga (`Para Sheriff`)** *(Crew)*: **1 arrest shot per match** (`6m` range) — eliminates Batpar instantly, backfires on innocent Parabasi.
- **Neta (`Moholla Mayor`)** *(Crew)*: First meeting reveals `NETA · 2x` badge publicly; vote counts as **2×**, +1 extra Emergency Bell.
- **Daktar (`Para Doctor`)** *(Crew)*: Revives **1 unreported body per match**.
- **Bohurupi Batpar** *(Batpar)*: Disguises as another player (`14s`); subtle name/color glitch within `4m`.
- **Jharudar (`Safai Batpar`)** *(Batpar)*: **2-second stationary channel** to sweep and erase an unreported body (**3 cleans max**).
- **Pagol (`Pagla Baba`)** *(Neutral)*: No tasks; wins immediately if ejected by vote.

### Extended Special Roles (Enabled when `enableSpecialRoles` is ON)
- **Ghotok Khala** *(Crew)*: Links two neighbors once per match (or receives matchmaker bond info); if one dies, alerts the other.
- **Master Moshai** *(Crew)*: Teacher check (`1/round`) inspects whether a nearby player has completed/progressed real tasks vs faking.
- **CCTV Kaku** *(Crew)*: Can toggle remote Moholla Security CCTV feed anywhere (`[G]`, 18s cooldown) without walking to Dish Hub.
- **Hatur Daktar** *(Crew)*: Emergency speed-patch / temporary survival boost to a nearby neighbor (`24s` cooldown) that delays/blocks 1 kill attempt for `10s`.
- **Supari Killer** *(Batpar)*: Marks a contract target (`[G]`); killing the contract target cuts next kill cooldown in half.
- **Dalal** *(Batpar)*: Broker sabotage — can jam emergency/door comms briefly or double-extend shutter locks (`[G]`).
- **Chamcha** *(Neutral)*: Sidekick wildcard who guesses/latches onto a living patron (`[G]`) and wins alongside that patron's faction if alive at match end.
- **Chandabaz** *(Neutral)*: Extorts "Chanda" (`[G]`) from adjacent unique players (`3` collections = solo Chaos Victory or bonus vote pressure).
- **TikTok Star** *(Neutral)*: Wins if they survive to the final 3 players while pulling off `3` live Reel-viral stunts (`[G]`) across distinct zones!

---

## 6. Design Decisions & Security Notes

- **Authoritative Snapshot Redaction**: `redactSnapshotForPlayer` strips hidden `role`, `specialRole` (except revealed `Neta`), Batpar teammate identities from non-Batpar players, enemy task lists, and `ghostOnly` chat from living players across all transports.
- **Single Rule Source**: Solo, P2P WebRTC Host, Express/WS, and Cloudflare Durable Objects all invoke the exact same functions in `src/shared/gameRules.ts` and `src/shared/botAi.ts`.
