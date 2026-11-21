import type {
  DoorLockState,
  DoorSpec,
  GasValveState,
  RoofDeckDef,
  SabotageSeverity,
  SabotageType,
  SecurityCamDef,
  StairRampDef,
  TaskStation,
  VentNode,
  WallAABB,
  ZoneDef,
} from './types';

export const MAP_HALF_SIZE = 104;
export const PLAYER_RADIUS = 0.55;
export const RAILWAY_TRACK_Z = 86.5;

export const ZONES: ZoneDef[] = [
  // Core 9 Inner Moholla Districts
  {
    id: 'adda_chowk',
    name: 'Adda Chowk',
    banglaName: 'আড্ডা চক',
    x: 0,
    z: 0,
    width: 18,
    depth: 18,
    color: '#334155',
  },
  {
    id: 'cha_dokan',
    name: 'Cha-er Dokan',
    banglaName: 'চায়ের দোকান',
    x: -35,
    z: -32,
    width: 18,
    depth: 17,
    color: '#78350f',
  },
  {
    id: 'rickshaw_garage',
    name: 'Rickshaw Stand',
    banglaName: 'রিকশা গ্যারেজ',
    x: 35,
    z: -32,
    width: 18,
    depth: 17,
    color: '#065f46',
  },
  {
    id: 'desco_power',
    name: 'DESCO Powerhouse',
    banglaName: 'লোডশেডিং ঘর',
    x: -35,
    z: 32,
    width: 18,
    depth: 17,
    color: '#7f1d1d',
  },
  {
    id: 'dish_roof',
    name: 'Dish Cable Hub',
    banglaName: 'ডিশ কন্ট্রোল',
    x: 35,
    z: 32,
    width: 18,
    depth: 17,
    color: '#1e3a8a',
  },
  {
    id: 'pukur_ghat',
    name: 'Pukur Ghat',
    banglaName: 'পুকুর ঘাট',
    x: -40,
    z: 0,
    width: 18,
    depth: 18,
    color: '#0e7490',
  },
  {
    id: 'bazar_stall',
    name: 'Moholla Bazar',
    banglaName: 'মহল্লা বাজার',
    x: 40,
    z: 0,
    width: 18,
    depth: 18,
    color: '#9a3412',
  },
  {
    id: 'eidgah_north',
    name: 'Eidgah Maidan',
    banglaName: 'ঈদগাহ মাঠ',
    x: 0,
    z: -37,
    width: 20,
    depth: 15,
    color: '#064e3b',
  },
  {
    id: 'south_tank',
    name: 'WASA Water Tower',
    banglaName: 'পানির ট্যাংক',
    x: 0,
    z: 37,
    width: 20,
    depth: 15,
    color: '#1e293b',
  },

  // 5 Mid-Ring Moholla Districts
  {
    id: 'fuchka_corner',
    name: 'Fuchka Chottor',
    banglaName: 'ফুচকা চত্বর',
    x: 0,
    z: -66,
    width: 24,
    depth: 15,
    color: '#b45309',
  },
  {
    id: 'saloon_goli',
    name: 'Hero Saloon',
    banglaName: 'হিরো সেলুন',
    x: -66,
    z: -26,
    width: 18,
    depth: 18,
    color: '#9d174d',
  },
  {
    id: 'cricket_math',
    name: 'Para Cricket Math',
    banglaName: 'ক্রিকেট মাঠ',
    x: 66,
    z: -26,
    width: 18,
    depth: 22,
    color: '#15803d',
  },
  {
    id: 'pharmacy_mor',
    name: 'Dadu Pharmacy',
    banglaName: 'দাদু ফার্মেসি',
    x: -66,
    z: 26,
    width: 18,
    depth: 18,
    color: '#0369a1',
  },
  {
    id: 'biyer_pandal',
    name: 'Biyer Bari Pandal',
    banglaName: 'বিয়ে বাড়ি প্যান্ডেল',
    x: 66,
    z: 26,
    width: 18,
    depth: 22,
    color: '#be123c',
  },

  // 5 Expanded Outer Districts: 4 Para Bari Residential Houses + Moholla Rail Station (208m × 208m)
  {
    id: 'kakar_bari',
    name: "Kaka-r Bari",
    banglaName: 'কাকার বাড়ি',
    x: -74,
    z: -88,
    width: 16,
    depth: 16,
    color: '#b45309',
  },
  {
    id: 'master_bari',
    name: 'Master Bari',
    banglaName: 'মাস্টার বাড়ি',
    x: -32,
    z: -88,
    width: 16,
    depth: 16,
    color: '#92400e',
  },
  {
    id: 'chacha_bari',
    name: "Chacha-r Bari",
    banglaName: 'চাচার বাড়ি',
    x: 32,
    z: -88,
    width: 16,
    depth: 16,
    color: '#9f1239',
  },
  {
    id: 'khalar_bari',
    name: "Khala-r Bari",
    banglaName: 'খালার বাড়ি',
    x: 74,
    z: -88,
    width: 16,
    depth: 16,
    color: '#0f766e',
  },
  {
    id: 'rail_station',
    name: 'Moholla Rail Station',
    banglaName: 'মোহল্লা রেল স্টেশন',
    x: 0,
    z: 74,
    width: 40,
    depth: 11,
    color: '#0369a1',
  },
];

export const WALLS: WallAABB[] = [
  // Expanded 208m × 208m Outer Brick Compound Perimeter Walls
  { id: 'outer_n', minX: -104, maxX: 104, minZ: -104, maxZ: -102.2, height: 3.6 },
  { id: 'outer_s', minX: -104, maxX: 104, minZ: 102.2, maxZ: 104, height: 3.6 },
  { id: 'outer_w', minX: -104, maxX: -102.2, minZ: -104, maxZ: 104, height: 3.6 },
  { id: 'outer_e', minX: 102.2, maxX: 104, minZ: -104, maxZ: 104, height: 3.6 },

  { id: 'adda_table', minX: -2.0, maxX: 2.0, minZ: -2.0, maxZ: 2.0, height: 1.2, zone: 'adda_chowk' },

  // Sightline-breaking Moholla Alley Walls (ambush pockets, flanks, and blind corners)
  { id: 'alley_nw', minX: -17.5, maxX: -15.5, minZ: -20.5, maxZ: -9.5, height: 2.7 },
  { id: 'alley_ne', minX: 15.5, maxX: 17.5, minZ: -20.5, maxZ: -9.5, height: 2.7 },
  { id: 'alley_sw', minX: -17.5, maxX: -15.5, minZ: 9.5, maxZ: 20.5, height: 2.7 },
  { id: 'alley_se', minX: 15.5, maxX: 17.5, minZ: 9.5, maxZ: 20.5, height: 2.7 },
  { id: 'lane_nw', minX: -22.0, maxX: -12.5, minZ: -35.5, maxZ: -33.8, height: 2.7 },
  { id: 'lane_ne', minX: 12.5, maxX: 22.0, minZ: -35.5, maxZ: -33.8, height: 2.7 },
  { id: 'lane_sw', minX: -22.0, maxX: -12.5, minZ: 33.8, maxZ: 35.5, height: 2.7 },
  { id: 'lane_se', minX: 12.5, maxX: 22.0, minZ: 33.8, maxZ: 35.5, height: 2.7 },

  // Cha-er Dokan (NW)
  { id: 'cha_n_wall', minX: -45.0, maxX: -25.0, minZ: -41.0, maxZ: -40.1, height: 3.0, zone: 'cha_dokan' },
  { id: 'cha_w_wall', minX: -45.0, maxX: -44.1, minZ: -41.0, maxZ: -22.5, height: 3.0, zone: 'cha_dokan' },
  { id: 'cha_e_wall', minX: -25.9, maxX: -25.0, minZ: -41.0, maxZ: -22.5, height: 3.0, zone: 'cha_dokan' },
  { id: 'cha_s_stub', minX: -45.0, maxX: -36.5, minZ: -23.4, maxZ: -22.5, height: 3.0, zone: 'cha_dokan' },
  { id: 'cha_counter', minX: -39.5, maxX: -31.5, minZ: -37.2, maxZ: -35.2, height: 1.15, zone: 'cha_dokan' },

  // Rickshaw Garage (NE)
  { id: 'rick_n_wall', minX: 25.0, maxX: 45.0, minZ: -41.0, maxZ: -40.1, height: 3.0, zone: 'rickshaw_garage' },
  { id: 'rick_e_wall', minX: 44.1, maxX: 45.0, minZ: -41.0, maxZ: -22.5, height: 3.0, zone: 'rickshaw_garage' },
  { id: 'rick_w_wall', minX: 25.0, maxX: 25.9, minZ: -41.0, maxZ: -22.5, height: 3.0, zone: 'rickshaw_garage' },
  { id: 'rick_s_stub', minX: 36.5, maxX: 45.0, minZ: -23.4, maxZ: -22.5, height: 3.0, zone: 'rickshaw_garage' },

  // DESCO Powerhouse (SW)
  { id: 'desco_s_wall', minX: -45.0, maxX: -25.0, minZ: 40.1, maxZ: 41.0, height: 3.0, zone: 'desco_power' },
  { id: 'desco_w_wall', minX: -45.0, maxX: -44.1, minZ: 22.5, maxZ: 41.0, height: 3.0, zone: 'desco_power' },
  { id: 'desco_e_wall', minX: -25.9, maxX: -25.0, minZ: 22.5, maxZ: 41.0, height: 3.0, zone: 'desco_power' },
  { id: 'desco_n_stub', minX: -45.0, maxX: -36.5, minZ: 22.5, maxZ: 23.4, height: 3.0, zone: 'desco_power' },
  { id: 'desco_gen', minX: -40.5, maxX: -36.0, minZ: 30.5, maxZ: 34.8, height: 2.1, zone: 'desco_power' },

  // Dish Cable Hub (SE)
  { id: 'dish_s_wall', minX: 25.0, maxX: 45.0, minZ: 40.1, maxZ: 41.0, height: 3.0, zone: 'dish_roof' },
  { id: 'dish_e_wall', minX: 44.1, maxX: 45.0, minZ: 22.5, maxZ: 41.0, height: 3.0, zone: 'dish_roof' },
  { id: 'dish_w_wall', minX: 25.0, maxX: 25.9, minZ: 22.5, maxZ: 41.0, height: 3.0, zone: 'dish_roof' },
  { id: 'dish_n_stub', minX: 36.5, maxX: 45.0, minZ: 22.5, maxZ: 23.4, height: 3.0, zone: 'dish_roof' },
  { id: 'dish_desk', minX: 32.5, maxX: 37.5, minZ: 33.2, maxZ: 35.8, height: 1.15, zone: 'dish_roof' },

  // Pukur Water (West)
  { id: 'pukur_water', minX: -51.0, maxX: -42.0, minZ: -8.0, maxZ: 8.0, height: 0.4, zone: 'pukur_ghat' },

  // Bazar Counter (East)
  { id: 'bazar_counter', minX: 42.5, maxX: 46.5, minZ: -5.0, maxZ: 5.0, height: 1.2, zone: 'bazar_stall' },

  // South WASA Water Tower Core
  { id: 'tank_core', minX: -2.4, maxX: 2.4, minZ: 36.5, maxZ: 41.5, height: 4.5, zone: 'south_tank' },

  // Parked Green CNG Auto-Rickshaw along South-East Avenue
  { id: 'cng_parked', minX: 10.0, maxX: 12.0, minZ: 21.4, maxZ: 24.6, height: 1.9 },

  // Tactical Supply Crate & Drum Clusters + Perimeter Sandbag Barricades
  { id: 'supply_rickshaw', minX: 39.8, maxX: 42.8, minZ: -38.4, maxZ: -36.0, height: 1.85, zone: 'rickshaw_garage' },
  { id: 'supply_desco', minX: -43.0, maxX: -39.8, minZ: 36.4, maxZ: 38.8, height: 1.85, zone: 'desco_power' },
  { id: 'supply_dish', minX: 39.8, maxX: 42.8, minZ: 25.0, maxZ: 27.4, height: 1.85, zone: 'dish_roof' },
  { id: 'supply_bazar', minX: 41.8, maxX: 44.8, minZ: 7.0, maxZ: 9.4, height: 1.85, zone: 'bazar_stall' },
  { id: 'barricade_nw', minX: -16.0, maxX: -11.4, minZ: -46.0, maxZ: -44.4, height: 1.1 },
  { id: 'barricade_ne', minX: 11.4, maxX: 16.0, minZ: -46.0, maxZ: -44.4, height: 1.1 },
  { id: 'barricade_sw', minX: -14.0, maxX: -9.4, minZ: 44.4, maxZ: 46.0, height: 1.1 },
  { id: 'barricade_se', minX: 9.4, maxX: 14.0, minZ: 44.4, maxZ: 46.0, height: 1.1 },

  // --- Mid-Ring Moholla Buildings & Landmarks ---
  // 1. Fuchka Chottor (North)
  { id: 'fuchka_cart', minX: -2.6, maxX: 2.6, minZ: -69.5, maxZ: -66.5, height: 2.3, zone: 'fuchka_corner' },
  { id: 'supply_fuchka', minX: 7.6, maxX: 10.6, minZ: -71.4, maxZ: -69.0, height: 1.85, zone: 'fuchka_corner' },

  // 2. Hero Saloon (Mid-West) — open East doorway z: -29.5 .. -22.5
  { id: 'saloon_w_wall', minX: -75.0, maxX: -74.1, minZ: -35.0, maxZ: -17.0, height: 3.1, zone: 'saloon_goli' },
  { id: 'saloon_n_wall', minX: -75.0, maxX: -57.0, minZ: -35.0, maxZ: -34.1, height: 3.1, zone: 'saloon_goli' },
  { id: 'saloon_s_wall', minX: -75.0, maxX: -57.0, minZ: -17.9, maxZ: -17.0, height: 3.1, zone: 'saloon_goli' },
  { id: 'saloon_e_n', minX: -57.9, maxX: -57.0, minZ: -35.0, maxZ: -29.5, height: 3.1, zone: 'saloon_goli' },
  { id: 'saloon_e_s', minX: -57.9, maxX: -57.0, minZ: -22.5, maxZ: -17.0, height: 3.1, zone: 'saloon_goli' },
  { id: 'saloon_counter', minX: -73.8, maxX: -71.8, minZ: -32.0, maxZ: -20.0, height: 1.15, zone: 'saloon_goli' },

  // 3. Para Cricket Math (Mid-East)
  { id: 'cricket_dugout', minX: 72.2, maxX: 74.2, minZ: -30.5, maxZ: -21.5, height: 1.3, zone: 'cricket_math' },

  // 4. Dadu Pharmacy (Mid-SW) — open East doorway z: 22.5 .. 29.5
  { id: 'pharm_w_wall', minX: -75.0, maxX: -74.1, minZ: 17.0, maxZ: 35.0, height: 3.1, zone: 'pharmacy_mor' },
  { id: 'pharm_n_wall', minX: -75.0, maxX: -57.0, minZ: 17.0, maxZ: 17.9, height: 3.1, zone: 'pharmacy_mor' },
  { id: 'pharm_s_wall', minX: -75.0, maxX: -57.0, minZ: 34.1, maxZ: 35.0, height: 3.1, zone: 'pharmacy_mor' },
  { id: 'pharm_e_n', minX: -57.9, maxX: -57.0, minZ: 17.0, maxZ: 22.5, height: 3.1, zone: 'pharmacy_mor' },
  { id: 'pharm_e_s', minX: -57.9, maxX: -57.0, minZ: 29.5, maxZ: 35.0, height: 3.1, zone: 'pharmacy_mor' },
  { id: 'pharm_counter', minX: -73.8, maxX: -71.6, minZ: 20.0, maxZ: 32.0, height: 1.2, zone: 'pharmacy_mor' },

  // 5. Biyer Bari Pandal (Mid-SE)
  { id: 'pandal_stage', minX: 70.5, maxX: 74.2, minZ: 22.5, maxZ: 29.5, height: 1.4, zone: 'biyer_pandal' },
  { id: 'supply_pandal', minX: 60.5, maxX: 63.5, minZ: 33.0, maxZ: 35.4, height: 1.85, zone: 'biyer_pandal' },

  // --- 4 Outer North Residential Para Houses (All with Full Walkable Chhad Rooftops!) ---
  // Kaka-r Bari (-82..-66, -96..-80) — open South doorway x: -77..-71
  { id: 'kaka_n_wall', minX: -82.0, maxX: -66.0, minZ: -96.0, maxZ: -95.1, height: 3.1, zone: 'kakar_bari' },
  { id: 'kaka_w_wall', minX: -82.0, maxX: -81.1, minZ: -96.0, maxZ: -80.0, height: 3.1, zone: 'kakar_bari' },
  { id: 'kaka_e_wall', minX: -66.9, maxX: -66.0, minZ: -96.0, maxZ: -80.0, height: 3.1, zone: 'kakar_bari' },
  { id: 'kaka_s_w', minX: -82.0, maxX: -77.0, minZ: -80.9, maxZ: -80.0, height: 3.1, zone: 'kakar_bari' },
  { id: 'kaka_s_e', minX: -71.0, maxX: -66.0, minZ: -80.9, maxZ: -80.0, height: 3.1, zone: 'kakar_bari' },
  { id: 'kaka_sofa', minX: -79.8, maxX: -76.5, minZ: -93.8, maxZ: -91.5, height: 1.0, zone: 'kakar_bari' },

  // Master Bari (-40..-24, -96..-80) — open South doorway x: -35..-29
  { id: 'master_n_wall', minX: -40.0, maxX: -24.0, minZ: -96.0, maxZ: -95.1, height: 3.1, zone: 'master_bari' },
  { id: 'master_w_wall', minX: -40.0, maxX: -39.1, minZ: -96.0, maxZ: -80.0, height: 3.1, zone: 'master_bari' },
  { id: 'master_e_wall', minX: -24.9, maxX: -24.0, minZ: -96.0, maxZ: -80.0, height: 3.1, zone: 'master_bari' },
  { id: 'master_s_w', minX: -40.0, maxX: -35.0, minZ: -80.9, maxZ: -80.0, height: 3.1, zone: 'master_bari' },
  { id: 'master_s_e', minX: -29.0, maxX: -24.0, minZ: -80.9, maxZ: -80.0, height: 3.1, zone: 'master_bari' },
  { id: 'master_desk', minX: -37.5, maxX: -33.5, minZ: -93.6, maxZ: -91.4, height: 1.05, zone: 'master_bari' },

  // Chacha-r Bari (24..40, -96..-80) — open South doorway x: 29..35
  { id: 'chacha_n_wall', minX: 24.0, maxX: 40.0, minZ: -96.0, maxZ: -95.1, height: 3.1, zone: 'chacha_bari' },
  { id: 'chacha_w_wall', minX: 24.0, maxX: 24.9, minZ: -96.0, maxZ: -80.0, height: 3.1, zone: 'chacha_bari' },
  { id: 'chacha_e_wall', minX: 39.1, maxX: 40.0, minZ: -96.0, maxZ: -80.0, height: 3.1, zone: 'chacha_bari' },
  { id: 'chacha_s_w', minX: 24.0, maxX: 29.0, minZ: -80.9, maxZ: -80.0, height: 3.1, zone: 'chacha_bari' },
  { id: 'chacha_s_e', minX: 35.0, maxX: 40.0, minZ: -80.9, maxZ: -80.0, height: 3.1, zone: 'chacha_bari' },
  { id: 'chacha_table', minX: 33.0, maxX: 37.2, minZ: -93.5, maxZ: -91.2, height: 1.0, zone: 'chacha_bari' },

  // Khala-r Bari (66..82, -96..-80) — open South doorway x: 71..77
  { id: 'khala_n_wall', minX: 66.0, maxX: 82.0, minZ: -96.0, maxZ: -95.1, height: 3.1, zone: 'khalar_bari' },
  { id: 'khala_w_wall', minX: 66.0, maxX: 66.9, minZ: -96.0, maxZ: -80.0, height: 3.1, zone: 'khalar_bari' },
  { id: 'khala_e_wall', minX: 81.1, maxX: 82.0, minZ: -96.0, maxZ: -80.0, height: 3.1, zone: 'khalar_bari' },
  { id: 'khala_s_w', minX: 66.0, maxX: 71.0, minZ: -80.9, maxZ: -80.0, height: 3.1, zone: 'khalar_bari' },
  { id: 'khala_s_e', minX: 77.0, maxX: 82.0, minZ: -80.9, maxZ: -80.0, height: 3.1, zone: 'khalar_bari' },
  { id: 'khala_table', minX: 75.5, maxX: 79.5, minZ: -93.6, maxZ: -91.3, height: 1.0, zone: 'khalar_bari' },

  // Outer Boulevard Sightline Dividers & Moholla Rail Station Structures (z = 74..88)
  { id: 'outer_alley_nw', minX: -32.0, maxX: -29.8, minZ: -64.0, maxZ: -57.5, height: 2.7 },
  { id: 'outer_alley_ne', minX: 29.8, maxX: 32.0, minZ: -64.0, maxZ: -57.5, height: 2.7 },
  { id: 'outer_alley_sw', minX: -32.0, maxX: -29.8, minZ: 57.5, maxZ: 64.0, height: 2.7 },
  { id: 'outer_alley_se', minX: 29.8, maxX: 32.0, minZ: 57.5, maxZ: 64.0, height: 2.7 },
  { id: 'outer_west_wall', minX: -94.0, maxX: -91.8, minZ: -6.0, maxZ: 6.0, height: 2.7 },
  { id: 'outer_east_wall', minX: 91.8, maxX: 94.0, minZ: -6.0, maxZ: 6.0, height: 2.7 },
  { id: 'rail_station_booth', minX: -16.5, maxX: -10.0, minZ: 70.5, maxZ: 74.0, height: 3.0, zone: 'rail_station' },
  { id: 'rail_cabin_w', minX: -59.5, maxX: -56.0, minZ: 80.5, maxZ: 83.8, height: 2.8, zone: 'rail_station' },
  { id: 'rail_cabin_e', minX: 56.0, maxX: 59.5, minZ: 80.5, maxZ: 83.8, height: 2.8, zone: 'rail_station' },
  { id: 'rail_cabin_center_w', minX: -11.5, maxX: -7.8, minZ: 80.5, maxZ: 83.8, height: 2.8, zone: 'rail_station' },
  { id: 'rail_cabin_center_e', minX: 7.8, maxX: 11.5, minZ: 80.5, maxZ: 83.8, height: 2.8, zone: 'rail_station' },
];

// Rolling Tin Shutters across building doorways when Vondo triggers Door Lock Sabotage
export const DOORS: DoorSpec[] = [
  {
    id: 'door_cha_s',
    zoneId: 'cha_dokan',
    label: 'Cha-er Dokan Shutter',
    minX: -36.5,
    maxX: -25.9,
    minZ: -23.4,
    maxZ: -22.5,
    height: 2.9,
  },
  {
    id: 'door_rick_s',
    zoneId: 'rickshaw_garage',
    label: 'Rickshaw Garage Shutter',
    minX: 25.9,
    maxX: 36.5,
    minZ: -23.4,
    maxZ: -22.5,
    height: 2.9,
  },
  {
    id: 'door_desco_n',
    zoneId: 'desco_power',
    label: 'DESCO Shutter',
    minX: -36.5,
    maxX: -25.9,
    minZ: 22.5,
    maxZ: 23.4,
    height: 2.9,
  },
  {
    id: 'door_dish_n',
    zoneId: 'dish_roof',
    label: 'Dish Hub Shutter',
    minX: 25.9,
    maxX: 36.5,
    minZ: 22.5,
    maxZ: 23.4,
    height: 2.9,
  },
];

// Walkable Moholla Building Rooftops + Para Houses + Rail Foot-Overbridge
export const ROOFTOPS: RoofDeckDef[] = [
  {
    id: 'cha_roof',
    zoneId: 'cha_dokan',
    label: 'Cha-er Dokan Chhad',
    minX: -45.0,
    maxX: -25.0,
    minZ: -41.0,
    maxZ: -22.5,
    elevationY: 3.15,
    stairOpenings: [{ minX: -45.8, maxX: -43.5, minZ: -37.2, maxZ: -32.8 }],
  },
  {
    id: 'rick_roof',
    zoneId: 'rickshaw_garage',
    label: 'Rickshaw Garage Chhad',
    minX: 25.0,
    maxX: 45.0,
    minZ: -41.0,
    maxZ: -22.5,
    elevationY: 3.15,
    stairOpenings: [{ minX: 43.5, maxX: 45.8, minZ: -37.2, maxZ: -32.8 }],
  },
  {
    id: 'desco_roof',
    zoneId: 'desco_power',
    label: 'DESCO Chhad',
    minX: -45.0,
    maxX: -25.0,
    minZ: 22.5,
    maxZ: 41.0,
    elevationY: 3.15,
    stairOpenings: [{ minX: -45.8, maxX: -43.5, minZ: 32.8, maxZ: 37.2 }],
  },
  {
    id: 'dish_deck',
    zoneId: 'dish_roof',
    label: 'Dish Hub Terrace',
    minX: 25.0,
    maxX: 45.0,
    minZ: 22.5,
    maxZ: 41.0,
    elevationY: 3.15,
    stairOpenings: [{ minX: 43.5, maxX: 45.8, minZ: 32.8, maxZ: 37.2 }],
  },
  {
    id: 'saloon_roof',
    zoneId: 'saloon_goli',
    label: 'Hero Saloon Chhad',
    minX: -75.0,
    maxX: -57.0,
    minZ: -35.0,
    maxZ: -17.0,
    elevationY: 3.25,
    stairOpenings: [{ minX: -71.8, maxX: -67.5, minZ: -35.8, maxZ: -33.5 }],
  },
  {
    id: 'pharm_roof',
    zoneId: 'pharmacy_mor',
    label: 'Dadu Pharmacy Chhad',
    minX: -75.0,
    maxX: -57.0,
    minZ: 17.0,
    maxZ: 35.0,
    elevationY: 3.25,
    stairOpenings: [{ minX: -71.8, maxX: -67.5, minZ: 33.5, maxZ: 35.8 }],
  },
  {
    id: 'kaka_roof',
    zoneId: 'kakar_bari',
    label: "Kaka-r Bari Chhad",
    minX: -82.0,
    maxX: -66.0,
    minZ: -96.0,
    maxZ: -80.0,
    elevationY: 3.25,
    stairOpenings: [{ minX: -67.5, maxX: -65.2, minZ: -90.4, maxZ: -86.0 }],
  },
  {
    id: 'master_roof',
    zoneId: 'master_bari',
    label: 'Master Bari Chhad',
    minX: -40.0,
    maxX: -24.0,
    minZ: -96.0,
    maxZ: -80.0,
    elevationY: 3.25,
    stairOpenings: [{ minX: -25.5, maxX: -23.2, minZ: -90.4, maxZ: -86.0 }],
  },
  {
    id: 'chacha_roof',
    zoneId: 'chacha_bari',
    label: "Chacha-r Bari Chhad",
    minX: 24.0,
    maxX: 40.0,
    minZ: -96.0,
    maxZ: -80.0,
    elevationY: 3.25,
    stairOpenings: [{ minX: 23.2, maxX: 25.5, minZ: -90.4, maxZ: -86.0 }],
  },
  {
    id: 'khala_roof',
    zoneId: 'khalar_bari',
    label: "Khala-r Bari Chhad",
    minX: 66.0,
    maxX: 82.0,
    minZ: -96.0,
    maxZ: -80.0,
    elevationY: 3.25,
    stairOpenings: [{ minX: 65.2, maxX: 67.5, minZ: -90.4, maxZ: -86.0 }],
  },
  {
    id: 'rail_overbridge',
    zoneId: 'rail_station',
    label: 'Rail Foot-Overbridge',
    minX: 14.0,
    maxX: 18.0,
    minZ: 79.5,
    maxZ: 93.5,
    elevationY: 3.95,
    stairOpenings: [
      { minX: 14.0, maxX: 18.0, minZ: 79.0, maxZ: 80.5 },
      { minX: 14.0, maxX: 18.0, minZ: 92.5, maxZ: 94.0 },
    ],
  },
];

export const STAIR_RAMPS: StairRampDef[] = [
  {
    id: 'cha_stair',
    roofId: 'cha_roof',
    label: 'Cha Dokan Stairs',
    minX: -48.0,
    maxX: -45.0,
    minZ: -37.0,
    maxZ: -25.5,
    axis: 'z',
    bottomCoord: -25.5,
    topCoord: -33.2,
    topY: 3.15,
    steps: 14,
  },
  {
    id: 'rick_stair',
    roofId: 'rick_roof',
    label: 'Rickshaw Garage Stairs',
    minX: 45.0,
    maxX: 48.0,
    minZ: -37.0,
    maxZ: -25.5,
    axis: 'z',
    bottomCoord: -25.5,
    topCoord: -33.2,
    topY: 3.15,
    steps: 14,
  },
  {
    id: 'desco_stair',
    roofId: 'desco_roof',
    label: 'DESCO Stairs',
    minX: -48.0,
    maxX: -45.0,
    minZ: 25.5,
    maxZ: 37.0,
    axis: 'z',
    bottomCoord: 25.5,
    topCoord: 33.2,
    topY: 3.15,
    steps: 14,
  },
  {
    id: 'dish_stair',
    roofId: 'dish_deck',
    label: 'Dish Hub Stairs',
    minX: 45.0,
    maxX: 48.0,
    minZ: 25.5,
    maxZ: 37.0,
    axis: 'z',
    bottomCoord: 25.5,
    topCoord: 33.2,
    topY: 3.15,
    steps: 14,
  },
  {
    id: 'saloon_stair',
    roofId: 'saloon_roof',
    label: 'Saloon Stairs',
    minX: -71.5,
    maxX: -60.2,
    minZ: -38.0,
    maxZ: -35.0,
    axis: 'x',
    bottomCoord: -60.2,
    topCoord: -67.9,
    topY: 3.25,
    steps: 14,
  },
  {
    id: 'pharm_stair',
    roofId: 'pharm_roof',
    label: 'Pharmacy Stairs',
    minX: -71.5,
    maxX: -60.2,
    minZ: 35.0,
    maxZ: 38.0,
    axis: 'x',
    bottomCoord: -60.2,
    topCoord: -67.9,
    topY: 3.25,
    steps: 14,
  },
  {
    id: 'kaka_stair',
    roofId: 'kaka_roof',
    label: "Kaka-r Bari Stairs",
    minX: -66.0,
    maxX: -63.0,
    minZ: -90.2,
    maxZ: -79.0,
    axis: 'z',
    bottomCoord: -79.0,
    topCoord: -86.4,
    topY: 3.25,
    steps: 14,
  },
  {
    id: 'master_stair',
    roofId: 'master_roof',
    label: 'Master Bari Stairs',
    minX: -24.0,
    maxX: -21.0,
    minZ: -90.2,
    maxZ: -79.0,
    axis: 'z',
    bottomCoord: -79.0,
    topCoord: -86.4,
    topY: 3.25,
    steps: 14,
  },
  {
    id: 'chacha_stair',
    roofId: 'chacha_roof',
    label: "Chacha-r Bari Stairs",
    minX: 21.0,
    maxX: 24.0,
    minZ: -90.2,
    maxZ: -79.0,
    axis: 'z',
    bottomCoord: -79.0,
    topCoord: -86.4,
    topY: 3.25,
    steps: 14,
  },
  {
    id: 'khala_stair',
    roofId: 'khala_roof',
    label: "Khala-r Bari Stairs",
    minX: 63.0,
    maxX: 66.0,
    minZ: -90.2,
    maxZ: -79.0,
    axis: 'z',
    bottomCoord: -79.0,
    topCoord: -86.4,
    topY: 3.25,
    steps: 14,
  },
  {
    id: 'rail_bridge_stair_n',
    roofId: 'rail_overbridge',
    label: 'Rail Overbridge North Stairs',
    minX: 14.0,
    maxX: 18.0,
    minZ: 71.0,
    maxZ: 79.5,
    axis: 'z',
    bottomCoord: 71.0,
    topCoord: 79.5,
    topY: 3.95,
    steps: 16,
  },
  {
    id: 'rail_bridge_stair_s',
    roofId: 'rail_overbridge',
    label: 'Rail Overbridge South Stairs',
    minX: 14.0,
    maxX: 18.0,
    minZ: 93.5,
    maxZ: 101.0,
    axis: 'z',
    bottomCoord: 101.0,
    topCoord: 93.5,
    topY: 3.95,
    steps: 16,
  },
];

export const TASK_STATIONS: TaskStation[] = [
  {
    id: 'task_cha',
    kind: 'cha_mix',
    title: 'Brew Dudh-Cha',
    banglaTitle: 'দুধ-চা বানানো',
    zoneName: 'Cha-er Dokan',
    x: -35.5,
    z: -32.2,
    radius: 2.8,
    category: 'common',
    medium: 'physical',
    holdDurationSec: 4,
    isVisual: true,
  },
  {
    id: 'task_rickshaw',
    kind: 'rickshaw_pump',
    title: 'Pump Rickshaw Tire',
    banglaTitle: 'রিকশার চাকা পাম্প',
    zoneName: 'Rickshaw Stand',
    x: 32.5,
    z: -29.5,
    radius: 2.8,
    category: 'short',
    medium: 'physical',
    holdDurationSec: 3,
  },
  {
    id: 'task_desco',
    kind: 'fuse_fix',
    title: 'Fix DESCO Fuse',
    banglaTitle: 'ফিউজ ঠিক করা',
    zoneName: 'DESCO Powerhouse',
    x: -31.2,
    z: 32.5,
    radius: 2.8,
    category: 'long',
    medium: 'digital',
    holdDurationSec: 5,
  },
  {
    id: 'task_dish',
    kind: 'dish_tune',
    title: 'Tune Dish Antenna',
    banglaTitle: 'ডিশ সিগন্যাল সেট',
    zoneName: 'Dish Cable Hub',
    x: 34.5,
    z: 29.0,
    radius: 2.8,
    category: 'long',
    medium: 'digital',
    holdDurationSec: 6,
  },
  {
    id: 'task_pukur',
    kind: 'pukur_check',
    title: 'Pukur Med-Scan',
    banglaTitle: 'পুকুর পানি ও স্ক্যান',
    zoneName: 'Pukur Ghat',
    x: -37.5,
    z: 0,
    radius: 2.9,
    category: 'common',
    medium: 'physical',
    holdDurationSec: 4,
    isVisual: true,
  },
  {
    id: 'task_bazar',
    kind: 'bazar_hisab',
    title: 'Verify Bazar Hisab',
    banglaTitle: 'বাজারের হিসাব',
    zoneName: 'Moholla Bazar',
    x: 38.5,
    z: 0,
    radius: 2.8,
    category: 'common',
    medium: 'digital',
    holdDurationSec: 3,
  },
  {
    id: 'task_eidgah',
    kind: 'fuse_fix',
    title: 'Light Eidgah Lamps',
    banglaTitle: 'ঈদগাহর বাতি জ্বালানো',
    zoneName: 'Eidgah Maidan',
    x: 0,
    z: -37.0,
    radius: 2.8,
    category: 'short',
    medium: 'physical',
    holdDurationSec: 3,
  },
  {
    id: 'task_wasa',
    kind: 'rickshaw_pump',
    title: 'Pressurize WASA Tank',
    banglaTitle: 'পানির ট্যাংক পাম্প',
    zoneName: 'WASA Water Tower',
    x: 0,
    z: 32.5,
    radius: 2.8,
    category: 'short',
    medium: 'physical',
    holdDurationSec: 4,
  },
  // Mid-Ring Moholla Locations
  {
    id: 'task_fuchka',
    kind: 'fuchka_serve',
    title: 'Serve Spicy Fuchka',
    banglaTitle: 'ঝাল ফুচকা বানানো',
    zoneName: 'Fuchka Chottor',
    x: 0,
    z: -63.8,
    radius: 3.1,
    category: 'short',
    medium: 'physical',
    holdDurationSec: 3,
  },
  {
    id: 'task_saloon',
    kind: 'saloon_trim',
    title: 'Hero Haircut & Perfume',
    banglaTitle: 'হিরো চুল কাটা',
    zoneName: 'Hero Saloon',
    x: -65.5,
    z: -26.0,
    radius: 3.1,
    category: 'long',
    medium: 'physical',
    holdDurationSec: 5,
  },
  {
    id: 'task_cricket',
    kind: 'cricket_tape',
    title: 'Wrap Tape Tennis Ball',
    banglaTitle: 'টেপ টেনিস বল রেডি',
    zoneName: 'Para Cricket Math',
    x: 65.5,
    z: -26.0,
    radius: 3.2,
    category: 'short',
    medium: 'physical',
    holdDurationSec: 3,
  },
  {
    id: 'task_pharmacy',
    kind: 'pharmacy_mix',
    title: 'Mix Napa & Saline',
    banglaTitle: 'ওরাল স্যালাইন ও নাপা',
    zoneName: 'Dadu Pharmacy',
    x: -65.5,
    z: 26.0,
    radius: 3.1,
    category: 'short',
    medium: 'physical',
    holdDurationSec: 4,
  },
  {
    id: 'task_pandal',
    kind: 'pandal_dj',
    title: 'Drop Biyer DJ Beat',
    banglaTitle: 'বিয়ে বাড়ির ডিজে বাজাও',
    zoneName: 'Biyer Bari Pandal',
    x: 64.0,
    z: 26.0,
    radius: 3.2,
    category: 'long',
    medium: 'digital',
    holdDurationSec: 6,
    isVisual: true,
  },
  // Outer Para Houses & Rail Station Tasks
  {
    id: 'task_kaka_bari',
    kind: 'cha_mix',
    title: "Brew Kaka's Lal-Cha",
    banglaTitle: 'কাকার লাল চা বানানো',
    zoneName: "Kaka-r Bari",
    x: -74.0,
    z: -86.5,
    radius: 3.0,
    category: 'short',
    medium: 'physical',
    holdDurationSec: 3,
  },
  {
    id: 'task_rail',
    kind: 'bazar_hisab',
    title: 'Punch Rail Tickets',
    banglaTitle: 'রেল টিকিট পাঞ্চ করা',
    zoneName: 'Moholla Rail Station',
    x: -5.5,
    z: 74.0,
    radius: 3.1,
    category: 'short',
    medium: 'digital',
    holdDurationSec: 4,
  },
];

// Official Utility Stations: Security Cams, Admin Radar Table, Vitals ECG Monitor
export const SECURITY_CAMS_POS = { x: 35.0, z: 38.0, radius: 2.8, label: 'Security CCTV [E]' };
export const ADMIN_TABLE_POS = { x: 36.5, z: -6.5, radius: 2.8, label: 'Admin Para Map [E]' };
export const VITALS_POS = { x: -36.5, z: 6.5, radius: 2.8, label: 'Para Vitals ECG [E]' };

export const SECURITY_CAMERAS: SecurityCamDef[] = [
  {
    id: 'cam_adda',
    label: 'CAM 01 · Adda Chowk',
    zoneId: 'adda_chowk',
    camX: -9.2,
    camZ: -9.2,
    viewCenterX: 0,
    viewCenterZ: 0,
    viewRadius: 13.5,
  },
  {
    id: 'cam_cha',
    label: 'CAM 02 · NW Cha & Alley',
    zoneId: 'cha_dokan',
    camX: -20.5,
    camZ: -20.5,
    viewCenterX: -29,
    viewCenterZ: -24,
    viewRadius: 13.0,
  },
  {
    id: 'cam_rickshaw',
    label: 'CAM 03 · NE Rickshaw Lane',
    zoneId: 'rickshaw_garage',
    camX: 20.5,
    camZ: -20.5,
    viewCenterX: 29,
    viewCenterZ: -24,
    viewRadius: 13.0,
  },
  {
    id: 'cam_desco',
    label: 'CAM 04 · SW DESCO Gate',
    zoneId: 'desco_power',
    camX: -20.5,
    camZ: 20.5,
    viewCenterX: -29,
    viewCenterZ: 24,
    viewRadius: 13.0,
  },
  {
    id: 'cam_dish',
    label: 'CAM 05 · SE Dish Road',
    zoneId: 'dish_roof',
    camX: 20.5,
    camZ: 20.5,
    viewCenterX: 29,
    viewCenterZ: 24,
    viewRadius: 13.0,
  },
  {
    id: 'cam_bazar',
    label: 'CAM 06 · East Bazar Crossing',
    zoneId: 'bazar_stall',
    camX: 24.0,
    camZ: -6.0,
    viewCenterX: 35,
    viewCenterZ: 0,
    viewRadius: 13.0,
  },
  {
    id: 'cam_fuchka',
    label: 'CAM 07 · North Para & Fuchka',
    zoneId: 'fuchka_corner',
    camX: 11.5,
    camZ: -55.0,
    viewCenterX: 0,
    viewCenterZ: -70,
    viewRadius: 16.0,
  },
  {
    id: 'cam_south_rail',
    label: 'CAM 08 · Moholla Rail Station',
    zoneId: 'rail_station',
    camX: -12.5,
    camZ: 66.0,
    viewCenterX: 0,
    viewCenterZ: 82,
    viewRadius: 18.0,
  },
];

export const VENTS: VentNode[] = [
  {
    id: 'vent_cha',
    label: 'Cha Drain',
    x: -28.0,
    z: -38.5,
    targetIds: ['vent_pukur', 'vent_eidgah', 'vent_saloon', 'vent_rickshaw', 'vent_north_para'],
  },
  {
    id: 'vent_rickshaw',
    label: 'Garage Manhole',
    x: 28.0,
    z: -38.5,
    targetIds: ['vent_cha', 'vent_eidgah', 'vent_bazar', 'vent_cricket', 'vent_north_para'],
  },
  {
    id: 'vent_desco',
    label: 'DESCO Drain',
    x: -28.0,
    z: 38.5,
    targetIds: ['vent_pukur', 'vent_wasa', 'vent_pharmacy', 'vent_rail'],
  },
  {
    id: 'vent_dish',
    label: 'Dish Culvert',
    x: 28.0,
    z: 38.5,
    targetIds: ['vent_bazar', 'vent_wasa', 'vent_pandal', 'vent_rail'],
  },
  {
    id: 'vent_pukur',
    label: 'Ghat Pipe',
    x: -33.0,
    z: -7.5,
    targetIds: ['vent_cha', 'vent_desco', 'vent_saloon'],
  },
  {
    id: 'vent_bazar',
    label: 'Bazar Alley Drain',
    x: 33.0,
    z: 7.5,
    targetIds: ['vent_rickshaw', 'vent_dish', 'vent_pandal'],
  },
  {
    id: 'vent_eidgah',
    label: 'Eidgah North Drain',
    x: -10.5,
    z: -39.0,
    targetIds: ['vent_cha', 'vent_rickshaw', 'vent_fuchka'],
  },
  {
    id: 'vent_wasa',
    label: 'WASA South Drain',
    x: 10.5,
    z: 39.0,
    targetIds: ['vent_desco', 'vent_dish', 'vent_pharmacy', 'vent_pandal', 'vent_rail'],
  },
  // Outer Sector Drains
  {
    id: 'vent_fuchka',
    label: 'Fuchka Gutter',
    x: 9.0,
    z: -62.5,
    targetIds: ['vent_eidgah', 'vent_saloon', 'vent_cricket', 'vent_north_para'],
  },
  {
    id: 'vent_saloon',
    label: 'Saloon Drain',
    x: -60.5,
    z: -32.5,
    targetIds: ['vent_fuchka', 'vent_cha', 'vent_pukur', 'vent_pharmacy'],
  },
  {
    id: 'vent_cricket',
    label: 'Cricket Culvert',
    x: 60.5,
    z: -32.5,
    targetIds: ['vent_fuchka', 'vent_rickshaw', 'vent_pandal'],
  },
  {
    id: 'vent_pharmacy',
    label: 'Pharmacy Drain',
    x: -60.5,
    z: 32.5,
    targetIds: ['vent_saloon', 'vent_desco', 'vent_wasa'],
  },
  {
    id: 'vent_pandal',
    label: 'Pandal Sewer',
    x: 60.5,
    z: 32.5,
    targetIds: ['vent_cricket', 'vent_dish', 'vent_bazar', 'vent_wasa'],
  },
  {
    id: 'vent_north_para',
    label: 'North Para Culvert',
    x: -14.0,
    z: -86.0,
    targetIds: ['vent_fuchka', 'vent_cha', 'vent_rickshaw'],
  },
  {
    id: 'vent_rail',
    label: 'Rail Station Culvert',
    x: -20.0,
    z: 74.5,
    targetIds: ['vent_wasa', 'vent_desco', 'vent_dish'],
  },
];

export const EMERGENCY_BELL_POS = { x: 0, z: 0, interactRadius: 4.8 };

export const GAS_LEAK_VALVES: Array<Omit<GasValveState, 'holderId'>> = [
  {
    id: 'valve_cha',
    label: 'Cha Dokan Gas Valve',
    zoneName: 'Cha-er Dokan',
    x: -29.0,
    z: -32.0,
  },
  {
    id: 'valve_rickshaw',
    label: 'Rickshaw Garage Valve',
    zoneName: 'Rickshaw Stand',
    x: 38.0,
    z: -29.5,
  },
];

export const SABOTAGE_TARGETS: Record<
  SabotageType,
  {
    x: number;
    z: number;
    label: string;
    banglaLabel: string;
    severity: SabotageSeverity;
    durationSec: number;
  }
> = {
  loadshedding: {
    x: -31.2,
    z: 32.5,
    label: 'DESCO Main Breaker',
    banglaLabel: 'লোডশেডিং মেইন সুইচ',
    severity: 'non_critical',
    durationSec: 90,
  },
  wifi_down: {
    x: 34.5,
    z: 29.0,
    label: 'Dish Router Reset',
    banglaLabel: 'ওয়াইফাই রাউটার রিসেট',
    severity: 'non_critical',
    durationSec: 90,
  },
  gas_leak: {
    x: -29.0,
    z: -32.0,
    label: 'Dual Gas Leak Valves (Cha + Garage)',
    banglaLabel: 'গ্যাস পাইপ ফেটে গেছে!',
    severity: 'critical',
    durationSec: 45,
  },
};

export const SPAWN_RING: Array<{ x: number; z: number; yaw: number }> = Array.from(
  { length: 15 },
  (_, idx) => {
    const theta = (idx * Math.PI * 2) / 15;
    const radius = 5.2;
    const x = Number((Math.sin(theta) * radius).toFixed(2));
    const z = Number((Math.cos(theta) * radius).toFixed(2));
    const yaw = Number(Math.atan2(-x, -z).toFixed(3));
    return { x, z, yaw };
  },
);

export const BOT_WAYPOINTS: Array<{ x: number; z: number }> = [
  { x: 0, z: 7.2 },
  { x: 7.5, z: 0 },
  { x: 0, z: -7.5 },
  { x: -7.5, z: 0 },
  { x: 0, z: -26.0 },
  { x: 0, z: -37.0 },
  { x: 0, z: 26.0 },
  { x: 0, z: 32.5 },
  { x: -31.0, z: -15.0 },
  { x: -35.5, z: -32.2 },
  { x: 31.0, z: -15.0 },
  { x: 32.5, z: -29.5 },
  { x: -31.0, z: 15.0 },
  { x: -31.2, z: 32.5 },
  { x: 31.0, z: 15.0 },
  { x: 34.5, z: 29.0 },
  { x: -37.5, z: 0 },
  { x: 38.5, z: 0 },
  // Outer Boulevard, 4 Residential Para Houses & Rail Station
  { x: 0, z: -52.0 },
  { x: 0, z: -63.5 },
  { x: -52.0, z: -26.0 },
  { x: -64.5, z: -26.0 },
  { x: 52.0, z: -26.0 },
  { x: 64.5, z: -26.0 },
  { x: -52.0, z: 26.0 },
  { x: -64.5, z: 26.0 },
  { x: 52.0, z: 26.0 },
  { x: 64.0, z: 26.0 },
  { x: -52.0, z: 0 },
  { x: 52.0, z: 0 },
  { x: 0, z: 52.0 },
  { x: -5.5, z: 74.0 },
  { x: 0, z: 74.0 },
  { x: -74.0, z: -72.0 },
  { x: -74.0, z: -86.5 },
  { x: -32.0, z: -72.0 },
  { x: -32.0, z: -86.5 },
  { x: 32.0, z: -72.0 },
  { x: 32.0, z: -86.5 },
  { x: 74.0, z: -72.0 },
  { x: 74.0, z: -86.5 },
  { x: -86.0, z: 0 },
  { x: 86.0, z: 0 },
  { x: -52.0, z: 96.0 },
  { x: 0, z: 96.0 },
  { x: 52.0, z: 96.0 },
];

export function resolveCircleWallCollision(
  x: number,
  z: number,
  radius: number = PLAYER_RADIUS,
  walls: WallAABB[] = WALLS,
  doorLocks?: DoorLockState,
): { x: number; z: number } {
  let nx = Math.max(-MAP_HALF_SIZE + radius, Math.min(MAP_HALF_SIZE - radius, x));
  let nz = Math.max(-MAP_HALF_SIZE + radius, Math.min(MAP_HALF_SIZE - radius, z));

  const activeObstacles: WallAABB[] = doorLocks
    ? [
        ...walls,
        ...DOORS.filter((d) => doorLocks[d.zoneId] > 0),
      ]
    : walls;

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < activeObstacles.length; i++) {
      const w = activeObstacles[i];
      const closestX = Math.max(w.minX, Math.min(w.maxX, nx));
      const closestZ = Math.max(w.minZ, Math.min(w.maxZ, nz));
      const dx = nx - closestX;
      const dz = nz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          nx += (dx / dist) * push;
          nz += (dz / dist) * push;
        } else {
          const penLeft = nx - w.minX;
          const penRight = w.maxX - nx;
          const penTop = nz - w.minZ;
          const penBottom = w.maxZ - nz;
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) nx = w.minX - radius;
          else if (minPen === penRight) nx = w.maxX + radius;
          else if (minPen === penTop) nz = w.minZ - radius;
          else nz = w.maxZ + radius;
        }
      }
    }
  }

  return { x: nx, z: nz };
}

function getRampHeightAt(r: StairRampDef, x: number, z: number): number {
  const coord = r.axis === 'x' ? x : z;
  const span = r.topCoord - r.bottomCoord;
  if (Math.abs(span) < 1e-5) return r.topY;
  const t = Math.max(0, Math.min(1, (coord - r.bottomCoord) / span));
  return t * r.topY;
}

export function getWalkableFloorY(x: number, z: number, currentY = 0): number {
  // Check roof decks first when already high up so transitions onto/off decks never flicker
  if (currentY >= 1.75) {
    for (let i = 0; i < ROOFTOPS.length; i++) {
      const d = ROOFTOPS[i];
      if (x >= d.minX - 0.3 && x <= d.maxX + 0.3 && z >= d.minZ - 0.3 && z <= d.maxZ + 0.3) {
        if (Math.abs(d.elevationY - currentY) <= 1.65) {
          return d.elevationY;
        }
      }
    }
  }
  for (let i = 0; i < STAIR_RAMPS.length; i++) {
    const r = STAIR_RAMPS[i];
    if (x >= r.minX - 0.25 && x <= r.maxX + 0.25 && z >= r.minZ - 0.25 && z <= r.maxZ + 0.25) {
      const rampY = getRampHeightAt(r, x, z);
      if (Math.abs(rampY - currentY) <= 1.55) {
        return rampY;
      }
    }
  }
  if (currentY >= 1.55) {
    for (let i = 0; i < ROOFTOPS.length; i++) {
      const d = ROOFTOPS[i];
      if (x >= d.minX - 0.3 && x <= d.maxX + 0.3 && z >= d.minZ - 0.3 && z <= d.maxZ + 0.3) {
        if (Math.abs(d.elevationY - currentY) <= 1.65) {
          return d.elevationY;
        }
      }
    }
  }
  return 0;
}

export function resolvePlayerMoveWithElevation(
  prevX: number,
  prevZ: number,
  prevY: number,
  targetX: number,
  targetZ: number,
  radius: number = PLAYER_RADIUS,
  walls: WallAABB[] = WALLS,
  doorLocks?: DoorLockState,
): { x: number; z: number; y: number } {
  const safePrevY = Math.max(0, prevY);
  let nx = Math.max(-MAP_HALF_SIZE + radius, Math.min(MAP_HALF_SIZE - radius, targetX));
  let nz = Math.max(-MAP_HALF_SIZE + radius, Math.min(MAP_HALF_SIZE - radius, targetZ));

  // Detect active rooftop deck and/or exterior staircase for seamless climb & parapet containment
  const activeDeck =
    safePrevY >= 1.9
      ? ROOFTOPS.find(
          (d) =>
            prevX >= d.minX - 0.35 &&
            prevX <= d.maxX + 0.35 &&
            prevZ >= d.minZ - 0.35 &&
            prevZ <= d.maxZ + 0.35 &&
            Math.abs(d.elevationY - safePrevY) <= 1.4,
        )
      : undefined;

  const activeStair = STAIR_RAMPS.find((r) => {
    if (
      prevX < r.minX - 0.25 ||
      prevX > r.maxX + 0.25 ||
      prevZ < r.minZ - 0.25 ||
      prevZ > r.maxZ + 0.25
    ) {
      return false;
    }
    const ry = getRampHeightAt(r, prevX, prevZ);
    return Math.abs(ry - safePrevY) <= 1.55;
  });

  if (safePrevY >= 2.0 && activeDeck) {
    const steppingThroughOpening = activeDeck.stairOpenings.some(
      (op) =>
        nx >= op.minX - 0.45 &&
        nx <= op.maxX + 0.45 &&
        nz >= op.minZ - 0.45 &&
        nz <= op.maxZ + 0.45,
    );
    if (!steppingThroughOpening && !activeStair) {
      nx = Math.max(activeDeck.minX + radius, Math.min(activeDeck.maxX - radius, nx));
      nz = Math.max(activeDeck.minZ + radius, Math.min(activeDeck.maxZ - radius, nz));
    }
  }

  if (activeStair) {
    const rampY = getRampHeightAt(activeStair, prevX, prevZ);
    const linkedDeck = ROOFTOPS.find((d) => d.id === activeStair.roofId);
    const nearTopLanding = linkedDeck ? rampY >= linkedDeck.elevationY - 0.72 : rampY >= activeStair.topY - 0.72;
    const insideLinkedDeck = Boolean(
      linkedDeck &&
        nx >= linkedDeck.minX - 0.25 &&
        nx <= linkedDeck.maxX + 0.25 &&
        nz >= linkedDeck.minZ - 0.25 &&
        nz <= linkedDeck.maxZ + 0.25,
    );
    if (rampY >= 0.65 && !insideLinkedDeck) {
      if (nearTopLanding && linkedDeck) {
        // On upper landing: keep inside union of stair and roof opening so stepping onto the Chhad is effortless
        const unionMinX = Math.min(activeStair.minX + 0.28, linkedDeck.minX + radius);
        const unionMaxX = Math.max(activeStair.maxX - 0.28, linkedDeck.maxX - radius);
        const unionMinZ = Math.min(activeStair.minZ + 0.28, linkedDeck.minZ + radius);
        const unionMaxZ = Math.max(activeStair.maxZ - 0.28, linkedDeck.maxZ - radius);
        nx = Math.max(unionMinX, Math.min(unionMaxX, nx));
        nz = Math.max(unionMinZ, Math.min(unionMaxZ, nz));
      } else {
        // Mid-flight: keep safely inside stair side rails
        if (activeStair.axis === 'z') {
          nx = Math.max(activeStair.minX + 0.35, Math.min(activeStair.maxX - 0.35, nx));
        } else {
          nz = Math.max(activeStair.minZ + 0.35, Math.min(activeStair.maxZ - 0.35, nz));
        }
      }
    }
  }

  // While on upper stairs or rooftop, ignore ground-level building walls (height <= 3.35m) so top landings step smoothly onto Chhad
  let effectiveWalls =
    safePrevY >= 1.75
      ? walls.filter((w) => w.height > 3.45 || w.id.startsWith('outer_'))
      : walls;

  // On ground floor, prevent clipping sideways into the tall concrete back/under-side of exterior stairs
  if (safePrevY < 1.1) {
    const stairAbutments: WallAABB[] = [];
    for (let i = 0; i < STAIR_RAMPS.length; i++) {
      const r = STAIR_RAMPS[i];
      if (activeStair && activeStair.id === r.id) continue;
      // Block only the high elevated half (rampY > 1.35) so bottom steps stay 100% open to enter
      const highStart = r.bottomCoord + (r.topCoord - r.bottomCoord) * 0.45;
      if (r.axis === 'z') {
        const zLo = r.topCoord < r.bottomCoord ? r.minZ : Math.min(highStart, r.maxZ);
        const zHi = r.topCoord < r.bottomCoord ? Math.max(highStart, r.minZ) : r.maxZ;
        if (zHi - zLo > 0.4) {
          stairAbutments.push({
            id: `abut_${r.id}`,
            minX: r.minX + 0.05,
            maxX: r.maxX - 0.05,
            minZ: zLo,
            maxZ: zHi,
            height: r.topY,
          });
        }
      } else {
        const xLo = r.topCoord < r.bottomCoord ? r.minX : Math.min(highStart, r.maxX);
        const xHi = r.topCoord < r.bottomCoord ? Math.max(highStart, r.minX) : r.maxX;
        if (xHi - xLo > 0.4) {
          stairAbutments.push({
            id: `abut_${r.id}`,
            minX: xLo,
            maxX: xHi,
            minZ: r.minZ + 0.05,
            maxZ: r.maxZ - 0.05,
            height: r.topY,
          });
        }
      }
    }
    if (stairAbutments.length > 0) {
      effectiveWalls = [...effectiveWalls, ...stairAbutments];
    }
  }

  const activeDoors = safePrevY >= 2.0 ? undefined : doorLocks;
  const res = resolveCircleWallCollision(nx, nz, radius, effectiveWalls, activeDoors);
  const nextY = getWalkableFloorY(res.x, res.z, safePrevY);
  return { x: res.x, z: res.z, y: nextY };
}

export function distance2D(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function getZoneNameAt(x: number, z: number): string {
  for (const zone of ZONES) {
    const hw = zone.width / 2;
    const hd = zone.depth / 2;
    if (x >= zone.x - hw && x <= zone.x + hw && z >= zone.z - hd && z <= zone.z + hd) {
      return zone.name;
    }
  }
  return 'Moholla Boulevard';
}

export function getZoneIdAt(x: number, z: number): string | null {
  for (const zone of ZONES) {
    const hw = zone.width / 2;
    const hd = zone.depth / 2;
    if (x >= zone.x - hw && x <= zone.x + hw && z >= zone.z - hd && z <= zone.z + hd) {
      return zone.id;
    }
  }
  return null;
}

function segmentIntersectsAABB(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;

  const checks: Array<[number, number]> = [
    [-dx, ax - minX],
    [dx, maxX - ax],
    [-dz, az - minZ],
    [dz, maxZ - az],
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

/**
 * Returns true if there is an unobstructed line of sight between (ax, az) and (bx, bz)
 * past tall walls (>= 1.8m) and currently locked doors.
 */
export function hasLineOfSight(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  walls: WallAABB[] = WALLS,
  doorLocks?: DoorLockState,
): boolean {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.height < 1.8) continue;
    if (segmentIntersectsAABB(ax, az, bx, bz, w.minX, w.maxX, w.minZ, w.maxZ)) {
      return false;
    }
  }
  if (doorLocks) {
    for (let i = 0; i < DOORS.length; i++) {
      const d = DOORS[i];
      if (doorLocks[d.zoneId] <= 0) continue;
      if (segmentIntersectsAABB(ax, az, bx, bz, d.minX, d.maxX, d.minZ, d.maxZ)) {
        return false;
      }
    }
  }
  return true;
}
