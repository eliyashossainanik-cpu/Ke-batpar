import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  PLAYER_COLORS,
  type DoorZoneId,
  type GamePhase,
  type PlayerColorId,
  type RoomSnapshot,
} from '../shared/types';
import {
  ADMIN_TABLE_POS,
  BOT_WAYPOINTS,
  DOORS,
  GAS_LEAK_VALVES,
  MAP_HALF_SIZE,
  PLAYER_RADIUS,
  RAILWAY_TRACK_Z,
  ROOFTOPS,
  SECURITY_CAMERAS,
  STAIR_RAMPS,
  TASK_STATIONS,
  VENTS,
  VITALS_POS,
  WALLS,
  ZONES,
  resolveCircleWallCollision,
  resolvePlayerMoveWithElevation,
} from '../shared/mapData';
import { BOHURUPI_GLITCH_RANGE, VISUAL_TASK_VISIBLE_RANGE } from '../shared/gameRules';
import { createProceduralTextures } from './proceduralTextures';
import {
  createBanglaTrainModel,
  createBodyMarkerMesh,
  createCharacterRig,
  createClotheslineProp,
  createCngModel,
  createAlleyProps,
  createDrainVent,
  createInstancedGrassTufts,
  createKrishnachuraTree,
  createMoricbattiGarlands,
  createOverheadWires,
  createPalmTree,
  createPlanterPot,
  createRailCrossingGate,
  createRickshawModel,
  createRooftopMachanProp,
  createSandbagBarricade,
  createSecurityCamMesh,
  createShutterDoor,
  createStreetLamp,
  createSupplyCluster,
  createTerrainSkirt,
  createTwilightSkyline,
  createUtilityPole,
  createAdminTableModel,
  createVitalsKioskModel,
  type CharacterRig,
} from './models';
import {
  createAddaMonument,
  createBazarProps,
  createBiyerPandalProps,
  createChaStallProps,
  createCricketMathProps,
  createDescoTransformer,
  createDishHub,
  createEidgahGate,
  createFuchkaCartModel,
  createPharmacyProps,
  createPukurDetails,
  createRickshawGarageProps,
  createSaloonProps,
  createWaterTowerModel,
} from './shopInteriors';
import { soundEngine } from '../audio/soundEngine';
import { instantiateGroupAtTransforms, optimizeStaticGroup } from './geometryBatch';
import { isTouchOrMobileDevice } from '../utils/mobileFullscreen';

export interface WorldSceneProps {
  phase: GamePhase;
  snapshot: RoomSnapshot | null;
  localPlayerId: string | null;
  moveSpeed: number;
  isModalOpen: boolean;
  joystickInputRef: React.MutableRefObject<{ x: number; y: number }>;
  onLocalMove: (x: number, z: number, vx: number, vz: number, yaw: number, y?: number) => void;
  onShakeTriggerRef?: React.MutableRefObject<((amount: number) => void) | null>;
  pointerLookEnabled?: boolean;
  onPointerLookChange?: (enabled: boolean) => void;
  resetCameraRef?: React.MutableRefObject<(() => void) | null>;
  jumpTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onCompassYawChange?: (yawRad: number) => void;
}

const _desiredCamPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

function getColorSpec(colorId: PlayerColorId) {
  return PLAYER_COLORS.find((c) => c.id === colorId) ?? PLAYER_COLORS[0];
}

export function WorldScene({
  phase,
  snapshot,
  localPlayerId,
  moveSpeed,
  isModalOpen,
  joystickInputRef,
  onLocalMove,
  onShakeTriggerRef,
  pointerLookEnabled = false,
  onPointerLookChange,
  resetCameraRef,
  jumpTriggerRef,
  onCompassYawChange,
}: WorldSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const phaseRef = useRef(phase);
  const snapshotRef = useRef(snapshot);
  const localPlayerIdRef = useRef(localPlayerId);
  const moveSpeedRef = useRef(moveSpeed);
  const isModalOpenRef = useRef(isModalOpen);
  const onLocalMoveRef = useRef(onLocalMove);
  const pointerLookEnabledRef = useRef(pointerLookEnabled);
  const onPointerLookChangeRef = useRef(onPointerLookChange);
  const onCompassYawChangeRef = useRef(onCompassYawChange);

  phaseRef.current = phase;
  snapshotRef.current = snapshot;
  localPlayerIdRef.current = localPlayerId;
  moveSpeedRef.current = moveSpeed;
  isModalOpenRef.current = isModalOpen;
  onLocalMoveRef.current = onLocalMove;
  pointerLookEnabledRef.current = pointerLookEnabled;
  onPointerLookChangeRef.current = onPointerLookChange;
  onCompassYawChangeRef.current = onCompassYawChange;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const isMobileGpu = !isSoftwareGl && isTouchOrMobileDevice();
    let currentDpr = isSoftwareGl
      ? 1
      : isMobileGpu
        ? Math.min(window.devicePixelRatio || 1, 1.3)
        : Math.min(window.devicePixelRatio || 1, 1.5);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl && !isMobileGpu,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isMobileGpu ? 1.04 : 0.96;
    renderer.setPixelRatio(currentDpr);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = isMobileGpu ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    container.innerHTML = '';
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x0c1324);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(0x0c1324, 0.0038);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.26;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(54, width / height, 0.2, 420);
    camera.position.set(0, 18, 34);

    // Desktop-GPU HDR Post-Processing (high threshold 1.45 so only true emissives bloom, never characters/roads)
    // Mobile GPUs skip multi-pass UnrealBloomPass to maintain locked 60fps.
    let composer: EffectComposer | null = null;
    if (!isSoftwareGl && !isMobileGpu) {
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(currentDpr);
      composer.setSize(width, height);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.14, 0.3, 1.45));
      composer.addPass(new OutputPass());
    }

    // 3-Point Warm/Cool Lighting Rig + Dynamic Player-Tracking Shadow Frustum
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, isMobileGpu ? 0.54 : 0.45);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffdca8, 1.18);
    keyLight.position.set(34, 48, 28);
    keyLight.castShadow = !isSoftwareGl;
    const shadowRes = isSoftwareGl || isMobileGpu ? 1024 : 2048;
    const titleShadowSpan = 48;
    const playShadowSpan = isMobileGpu ? 22 : 26;
    keyLight.shadow.mapSize.set(shadowRes, shadowRes);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 155;
    keyLight.shadow.camera.left = -titleShadowSpan;
    keyLight.shadow.camera.right = titleShadowSpan;
    keyLight.shadow.camera.top = titleShadowSpan;
    keyLight.shadow.camera.bottom = -titleShadowSpan;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.36);
    rimLight.position.set(-34, 24, -34);
    scene.add(rimLight);

    // Emergency personal lantern (off during normal power so it never glares onto the player; activates during Loadshedding)
    const lanternLight = new THREE.PointLight(0xfbbf24, 0, 15, 1.8);
    lanternLight.position.set(0, 2.9, 0);
    scene.add(lanternLight);

    const textures = createProceduralTextures(renderer, isMobileGpu ? 2 : 8);

    // Distant Multi-Tier Skyline, Sunset Atmospheric Sky Shader & Moon
    const skyline = createTwilightSkyline();
    scene.add(skyline.group);

    // Sculpted Rolling Hills Terrain Skirt beyond the 208m compound
    const terrainSkirt = createTerrainSkirt();
    scene.add(terrainSkirt);

    textures.asphaltMap.repeat.set(16, 16);
    textures.asphaltNormal.repeat.set(16, 16);
    textures.asphaltRoughness.repeat.set(16, 16);

    // Compound Asphalt with Tangent Normal Map + Rain Puddle Specular Roughness Map
    const compoundFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_HALF_SIZE * 2, MAP_HALF_SIZE * 2),
      new THREE.MeshStandardMaterial({
        map: textures.asphaltMap,
        normalMap: textures.asphaltNormal,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughnessMap: textures.asphaltRoughness,
        roughness: 1.0,
        metalness: 0.08,
      }),
    );
    compoundFloor.rotation.x = -Math.PI / 2;
    compoundFloor.position.y = 0;
    compoundFloor.receiveShadow = true;
    scene.add(compoundFloor);

    // Moholla Main Avenues + Inner Ring + Outer Para & Rail Boulevards (208m × 208m Map)
    const roadNormNS = textures.asphaltNormal.clone();
    roadNormNS.repeat.set(1, 16);
    roadNormNS.needsUpdate = true;
    const roadRoughNS = textures.asphaltRoughness.clone();
    roadRoughNS.repeat.set(1, 16);
    roadRoughNS.needsUpdate = true;

    const roadNormEW = textures.asphaltNormal.clone();
    roadNormEW.repeat.set(16, 1);
    roadNormEW.needsUpdate = true;
    const roadRoughEW = textures.asphaltRoughness.clone();
    roadRoughEW.repeat.set(16, 1);
    roadRoughEW.needsUpdate = true;

    const roadSurfaceMatNS = new THREE.MeshStandardMaterial({
      color: '#18212f',
      normalMap: roadNormNS,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: roadRoughNS,
      roughness: 1.0,
      metalness: 0.08,
    });
    const roadSurfaceMatEW = new THREE.MeshStandardMaterial({
      color: '#18212f',
      normalMap: roadNormEW,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: roadRoughEW,
      roughness: 1.0,
      metalness: 0.08,
    });
    const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 202.0), roadSurfaceMatNS);
    roadNS.rotation.x = -Math.PI / 2;
    roadNS.position.y = 0.008;
    roadNS.receiveShadow = true;
    const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(202.0, 11.5), roadSurfaceMatEW);
    roadEW.rotation.x = -Math.PI / 2;
    roadEW.position.y = 0.009;
    roadEW.receiveShadow = true;
    scene.add(roadNS, roadEW);

    // Inner Ring Boulevard (x = ±52, z = ±52) extending to North Para & South Rail Crossings
    for (const rx of [-52, 52]) {
      const ringNS = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 196.0), roadSurfaceMatNS);
      ringNS.rotation.x = -Math.PI / 2;
      ringNS.position.set(rx, 0.006, 0);
      ringNS.receiveShadow = true;
      scene.add(ringNS);
    }
    for (const rz of [-52, 52]) {
      const ringEW = new THREE.Mesh(new THREE.PlaneGeometry(176.0, 8.5), roadSurfaceMatEW);
      ringEW.rotation.x = -Math.PI / 2;
      ringEW.position.set(0, 0.007, rz);
      ringEW.receiveShadow = true;
      scene.add(ringEW);
    }

    // Outer Para Avenues (North Houses z=-72, Rail Station z=72, South Bypass z=96, Outer W/E x=±86)
    for (const [rz, wid] of [
      [-72, 8.0],
      [72, 8.0],
      [96, 6.8],
    ] as const) {
      const aveEW = new THREE.Mesh(new THREE.PlaneGeometry(184.0, wid), roadSurfaceMatEW);
      aveEW.rotation.x = -Math.PI / 2;
      aveEW.position.set(0, 0.007, rz);
      aveEW.receiveShadow = true;
      scene.add(aveEW);
    }
    for (const rx of [-86, 86]) {
      const aveNS = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 192.0), roadSurfaceMatNS);
      aveNS.rotation.x = -Math.PI / 2;
      aveNS.position.set(rx, 0.006, 0);
      aveNS.receiveShadow = true;
      scene.add(aveNS);
    }

    const dashMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.92,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const dashPlacements: Array<{ x: number; y: number; z: number; sx: number; sz: number }> = [];
    for (let d = -96.0; d <= 96.0; d += 4.5) {
      if (Math.abs(d) >= 11.5 && Math.abs(d - RAILWAY_TRACK_Z) > 3.6) {
        dashPlacements.push({ x: 0, y: 0.015, z: d, sx: 0.24, sz: 1.8 });
      }
      if (Math.abs(d) >= 11.5) {
        dashPlacements.push({ x: d, y: 0.015, z: 0, sx: 1.8, sz: 0.24 });
      }
    }
    for (let d = -92.0; d <= 92.0; d += 5.0) {
      if (Math.abs(d) >= 6.0 && Math.abs(d - RAILWAY_TRACK_Z) > 3.6) {
        for (const rx of [-52, 52]) {
          dashPlacements.push({ x: rx, y: 0.014, z: d, sx: 0.24, sz: 1.8 });
        }
      }
      if (Math.abs(d) >= 6.0 && Math.abs(d) <= 80.0) {
        for (const rz of [-52, 52]) {
          dashPlacements.push({ x: d, y: 0.014, z: rz, sx: 1.8, sz: 0.24 });
        }
      }
      if (Math.abs(d) > 8.0) {
        dashPlacements.push({ x: d, y: 0.014, z: -72, sx: 1.8, sz: 0.22 });
        dashPlacements.push({ x: d, y: 0.014, z: 96, sx: 1.8, sz: 0.22 });
      }
    }
    for (let d = -84.0; d <= 68.0; d += 5.2) {
      if (Math.abs(d) < 6.0) continue;
      for (const rx of [-86, 86]) {
        dashPlacements.push({ x: rx, y: 0.014, z: d, sx: 0.22, sz: 1.8 });
      }
    }
    // Zebra Crossings approaching Adda Chowk from all 4 avenues
    for (let s = -4; s <= 4; s += 1.3) {
      for (const zPos of [-10.8, 10.8]) {
        dashPlacements.push({ x: s, y: 0.018, z: zPos, sx: 0.55, sz: 2.2 });
      }
      for (const xPos of [-10.8, 10.8]) {
        dashPlacements.push({ x: xPos, y: 0.018, z: s, sx: 2.2, sz: 0.55 });
      }
    }
    const instDummy = new THREE.Object3D();
    const dashUnitGeo = new THREE.PlaneGeometry(1, 1);
    dashUnitGeo.rotateX(-Math.PI / 2);
    const dashInst = new THREE.InstancedMesh(dashUnitGeo, dashMat, dashPlacements.length);
    dashPlacements.forEach((p, idx) => {
      instDummy.position.set(p.x, p.y, p.z);
      instDummy.rotation.set(0, 0, 0);
      instDummy.scale.set(p.sx, 1, p.sz);
      instDummy.updateMatrix();
      dashInst.setMatrixAt(idx, instDummy.matrix);
    });
    dashInst.instanceMatrix.needsUpdate = true;
    dashInst.computeBoundingSphere();
    scene.add(dashInst);

    // Textured District Plazas + Shop-Authentic Interior Floors + Instanced Beveled Stone Curbs
    const curbMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.78 });
    const shopTintByZone: Record<string, string> = {
      cha_dokan: '#d6bfa9',
      desco_power: '#9ca3af',
      dish_roof: '#b8c4d9',
      bazar_stall: '#d9c2ae',
      south_tank: '#b8c1cc',
      fuchka_corner: '#e2c29b',
      biyer_pandal: '#e6becc',
    };
    const borderCurbPlacements: Array<{ x: number; y: number; z: number; sx: number; sz: number }> = [];
    for (const zDef of ZONES) {
      if (zDef.id === 'pukur_ghat' || zDef.id === 'rail_station') continue;
      const isCentral = zDef.id === 'adda_chowk';
      const isEidgah = zDef.id === 'eidgah_north';
      const isCricket = zDef.id === 'cricket_math';
      const isSaloon = zDef.id === 'saloon_goli';
      const isPharmacy = zDef.id === 'pharmacy_mor';
      const isGarage = zDef.id === 'rickshaw_garage';
      const padMat = isCentral
        ? new THREE.MeshStandardMaterial({
            color: '#ffffff',
            map: textures.cobbleMap,
            normalMap: textures.cobbleNormal,
            normalScale: new THREE.Vector2(0.95, 0.95),
            roughness: 0.76,
            metalness: 0.08,
          })
        : isCricket
          ? new THREE.MeshStandardMaterial({
              color: '#ffffff',
              map: textures.cricketTurfMap,
              roughness: 0.88,
              metalness: 0.0,
            })
          : isEidgah
            ? new THREE.MeshStandardMaterial({
                color: '#ffffff',
                map: textures.grassMap,
                roughness: 0.92,
                metalness: 0.0,
              })
            : isSaloon
              ? new THREE.MeshStandardMaterial({
                  color: '#ffffff',
                  map: textures.saloonTileMap,
                  roughness: 0.36,
                  metalness: 0.08,
                })
              : isPharmacy
                ? new THREE.MeshStandardMaterial({
                    color: '#ffffff',
                    map: textures.pharmacyTileMap,
                    roughness: 0.28,
                    metalness: 0.06,
                  })
                : isGarage
                  ? new THREE.MeshStandardMaterial({
                      color: '#ffffff',
                      map: textures.garageFloorMap,
                      roughness: 0.86,
                      metalness: 0.05,
                    })
                  : new THREE.MeshStandardMaterial({
                      color: shopTintByZone[zDef.id] ?? '#cbd5e1',
                      map: textures.terracottaTileMap,
                      roughness: 0.82,
                      metalness: 0.04,
                    });
      const pad = new THREE.Mesh(new THREE.BoxGeometry(zDef.width, 0.07, zDef.depth), padMat);
      pad.position.set(zDef.x, 0.025, zDef.z);
      pad.receiveShadow = true;
      scene.add(pad);

      if (isCentral || isEidgah || isCricket || zDef.id === 'fuchka_corner' || zDef.id === 'biyer_pandal') {
        borderCurbPlacements.push(
          { x: zDef.x, y: 0.06, z: zDef.z - zDef.depth / 2, sx: zDef.width + 0.4, sz: 0.28 },
          { x: zDef.x, y: 0.06, z: zDef.z + zDef.depth / 2, sx: zDef.width + 0.4, sz: 0.28 },
          { x: zDef.x - zDef.width / 2, y: 0.06, z: zDef.z, sx: 0.28, sz: zDef.depth + 0.4 },
          { x: zDef.x + zDef.width / 2, y: 0.06, z: zDef.z, sx: 0.28, sz: zDef.depth + 0.4 },
        );
      }
    }
    const borderCurbGeo = new THREE.BoxGeometry(1, 0.12, 1);
    const borderCurbInst = new THREE.InstancedMesh(borderCurbGeo, curbMat, borderCurbPlacements.length);
    borderCurbPlacements.forEach((p, idx) => {
      instDummy.position.set(p.x, p.y, p.z);
      instDummy.rotation.set(0, 0, 0);
      instDummy.scale.set(p.sx, 1, p.sz);
      instDummy.updateMatrix();
      borderCurbInst.setMatrixAt(idx, instDummy.matrix);
    });
    borderCurbInst.instanceMatrix.needsUpdate = true;
    borderCurbInst.computeBoundingSphere();
    scene.add(borderCurbInst);

    // Concrete Sidewalk Kerbs + Dhaka Black/Yellow Kerb Edging & Storm Drains (Instanced into 4 draw calls)
    const sidewalkSlabMat = new THREE.MeshStandardMaterial({
      color: '#64748b',
      roughness: 0.84,
      metalness: 0.04,
    });
    const kerbYellowMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.55 });
    const kerbSlateMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.65 });
    const grateMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.72 });

    type BoxTransform = { x: number; y: number; z: number; sx: number; sy: number; sz: number };
    const slabTransforms: BoxTransform[] = [];
    const yellowKerbTransforms: BoxTransform[] = [];
    const slateKerbTransforms: BoxTransform[] = [];
    const grateTransforms: BoxTransform[] = [];

    for (const [cx, cz, isNS, roadSign] of [
      [-6.55, -18.5, true, 1],
      [6.55, -18.5, true, -1],
      [-6.55, 18.5, true, 1],
      [6.55, 18.5, true, -1],
      [-18.5, -6.55, false, 1],
      [-18.5, 6.55, false, -1],
      [18.5, -6.55, false, 1],
      [18.5, 6.55, false, -1],
    ] as const) {
      const len = 11.2;
      const wid = 1.15;
      slabTransforms.push({
        x: cx,
        y: 0.04,
        z: cz,
        sx: isNS ? wid : len,
        sy: 0.08,
        sz: isNS ? len : wid,
      });

      const segCount = 8;
      const segLen = len / segCount;
      for (let i = 0; i < segCount; i++) {
        const offset = -len / 2 + segLen * (i + 0.5);
        const list = i % 2 === 0 ? yellowKerbTransforms : slateKerbTransforms;
        list.push({
          x: isNS ? cx + roadSign * (wid / 2 - 0.11) : cx + offset,
          y: 0.065,
          z: isNS ? cz + offset : cz + roadSign * (wid / 2 - 0.11),
          sx: isNS ? 0.22 : segLen - 0.04,
          sy: 0.13,
          sz: isNS ? segLen - 0.04 : 0.22,
        });
      }

      grateTransforms.push({
        x: cx,
        y: 0.085,
        z: cz,
        sx: isNS ? 0.45 : 0.85,
        sy: 0.03,
        sz: isNS ? 0.85 : 0.45,
      });
    }

    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const buildInstancedBoxes = (transforms: BoxTransform[], mat: THREE.Material, receiveShadow: boolean) => {
      const inst = new THREE.InstancedMesh(unitBoxGeo, mat, transforms.length);
      inst.receiveShadow = receiveShadow;
      transforms.forEach((tr, idx) => {
        instDummy.position.set(tr.x, tr.y, tr.z);
        instDummy.rotation.set(0, 0, 0);
        instDummy.scale.set(tr.sx, tr.sy, tr.sz);
        instDummy.updateMatrix();
        inst.setMatrixAt(idx, instDummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      scene.add(inst);
    };
    buildInstancedBoxes(slabTransforms, sidewalkSlabMat, true);
    buildInstancedBoxes(yellowKerbTransforms, kerbYellowMat, true);
    buildInstancedBoxes(slateKerbTransforms, kerbSlateMat, true);
    buildInstancedBoxes(grateTransforms, grateMat, false);

    // Bengali Alpona Mandala around Adda Chowk center
    const alponaDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 8.4),
      new THREE.MeshBasicMaterial({
        map: textures.alponaMap,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    alponaDisc.rotation.x = -Math.PI / 2;
    alponaDisc.position.set(0, 0.066, 0);
    scene.add(alponaDisc);

    // Animated Shader-Wave Pukur Water + Stone Ghat Steps + Kolshi + Boat + Lotuses
    const waterUniforms = { uTime: { value: 0 } };
    const waterMat = new THREE.MeshStandardMaterial({
      map: textures.waterMap,
      roughness: 0.14,
      metalness: 0.38,
    });
    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waterUniforms.uTime;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.z += sin(position.x * 1.4 + uTime * 2.2) * 0.045 + cos(position.y * 1.2 + uTime * 1.7) * 0.04;`,
      );
    };
    const pukurWater = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 16.0, 22, 32), waterMat);
    pukurWater.rotation.x = -Math.PI / 2;
    pukurWater.position.set(-46.5, 0.05, 0);
    scene.add(pukurWater);

    const pukurDetails = createPukurDetails();
    scene.add(pukurDetails.group);

    for (let step = 0; step < 4; step++) {
      const ghatStep = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.12 + step * 0.055, 14.4),
        new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.8 }),
      );
      ghatStep.position.set(-41.5 + step * 0.98, 0.06 + step * 0.04, 0);
      ghatStep.receiveShadow = true;
      scene.add(ghatStep);
    }
    const pukurBorderMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.82 });
    const pukurEdgeW = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 16.9), pukurBorderMat);
    pukurEdgeW.position.set(-51.35, 0.12, 0);
    const pukurEdgeN = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.24, 0.55), pukurBorderMat);
    pukurEdgeN.position.set(-46.6, 0.12, -8.22);
    const pukurEdgeS = pukurEdgeN.clone();
    pukurEdgeS.position.z = 8.22;
    scene.add(pukurEdgeW, pukurEdgeN, pukurEdgeS);

    // Distinct Architectural Wall Materials & Coping Caps per Moholla District
    const wallMeshes: THREE.Object3D[] = [];
    const brickWallMat = new THREE.MeshStandardMaterial({
      map: textures.wallBrickMap,
      normalMap: textures.wallBrickNormal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.84,
      metalness: 0.02,
    });
    const alleyWallMat = new THREE.MeshStandardMaterial({
      map: textures.alleyStuccoMap,
      roughness: 0.82,
      metalness: 0.04,
    });
    const zoneWallMatMap: Record<string, THREE.MeshStandardMaterial> = {
      cha_dokan: new THREE.MeshStandardMaterial({ map: textures.chaWallMap, roughness: 0.78, metalness: 0.04 }),
      rickshaw_garage: new THREE.MeshStandardMaterial({ map: textures.garageWallMap, roughness: 0.72, metalness: 0.08 }),
      desco_power: new THREE.MeshStandardMaterial({ map: textures.descoWallMap, roughness: 0.44, metalness: 0.46 }),
      dish_roof: new THREE.MeshStandardMaterial({ map: textures.dishWallMap, roughness: 0.62, metalness: 0.14 }),
      saloon_goli: new THREE.MeshStandardMaterial({ map: textures.saloonWallMap, roughness: 0.32, metalness: 0.1 }),
      pharmacy_mor: new THREE.MeshStandardMaterial({ map: textures.pharmacyWallMap, roughness: 0.28, metalness: 0.08 }),
      kakar_bari: new THREE.MeshStandardMaterial({ map: textures.kakaWallMap, roughness: 0.74, metalness: 0.04 }),
      master_bari: new THREE.MeshStandardMaterial({ map: textures.masterWallMap, roughness: 0.72, metalness: 0.04 }),
      chacha_bari: new THREE.MeshStandardMaterial({ map: textures.chachaWallMap, roughness: 0.72, metalness: 0.05 }),
      khalar_bari: new THREE.MeshStandardMaterial({ map: textures.khalaWallMap, roughness: 0.72, metalness: 0.04 }),
    };
    const zoneCopingMatMap: Record<string, THREE.MeshStandardMaterial> = {
      cha_dokan: new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.68 }),
      rickshaw_garage: new THREE.MeshStandardMaterial({ color: '#065f46', roughness: 0.56 }),
      desco_power: new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.48, metalness: 0.35 }),
      dish_roof: new THREE.MeshStandardMaterial({ color: '#1e40af', roughness: 0.48, metalness: 0.25 }),
      saloon_goli: new THREE.MeshStandardMaterial({ color: '#be185d', roughness: 0.36, metalness: 0.15 }),
      pharmacy_mor: new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.35, metalness: 0.1 }),
      kakar_bari: new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.62 }),
      master_bari: new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.64 }),
      chacha_bari: new THREE.MeshStandardMaterial({ color: '#be123c', roughness: 0.58 }),
      khalar_bari: new THREE.MeshStandardMaterial({ color: '#0f766e', roughness: 0.58 }),
      rail_station: new THREE.MeshStandardMaterial({ color: '#0369a1', roughness: 0.45, metalness: 0.3 }),
    };
    const copingMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.65,
      metalness: 0.08,
    });
    const pillarMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.72,
      metalness: 0.04,
    });

    const skipWallIds = new Set([
      'adda_table',
      'pukur_water',
      'cha_counter',
      'desco_gen',
      'dish_desk',
      'bazar_counter',
      'tank_core',
      'cng_parked',
      'supply_rickshaw',
      'supply_desco',
      'supply_dish',
      'supply_bazar',
      'barricade_nw',
      'barricade_ne',
      'barricade_sw',
      'barricade_se',
      'fuchka_cart',
      'supply_fuchka',
      'saloon_counter',
      'cricket_dugout',
      'pharm_counter',
      'pandal_stage',
      'supply_pandal',
      'kaka_sofa',
      'master_desk',
      'chacha_table',
      'khala_table',
      'rail_station_booth',
      'rail_cabin_w',
      'rail_cabin_e',
      'rail_cabin_center_w',
      'rail_cabin_center_e',
    ]);

    const capsGroup = new THREE.Group();
    for (const w of WALLS) {
      if (skipWallIds.has(w.id)) {
        continue;
      }
      // Carve railway tunnel openings through outer_w and outer_e around RAILWAY_TRACK_Z (86.5)
      if (w.id === 'outer_w' || w.id === 'outer_e') {
        const cx = (w.minX + w.maxX) / 2;
        const wWidth = w.maxX - w.minX;
        const northSpan = RAILWAY_TRACK_Z - 3.0 - w.minZ;
        const southSpan = w.maxZ - (RAILWAY_TRACK_Z + 3.0);
        for (const [segMinZ, segSpan] of [
          [w.minZ, northSpan],
          [RAILWAY_TRACK_Z + 3.0, southSpan],
        ]) {
          const cz = segMinZ + segSpan / 2;
          const segMesh = new THREE.Mesh(new THREE.BoxGeometry(wWidth, w.height, segSpan), brickWallMat);
          segMesh.position.set(cx, w.height / 2, cz);
          segMesh.castShadow = !isSoftwareGl;
          segMesh.receiveShadow = true;
          scene.add(segMesh);
          wallMeshes.push(segMesh);
          const segCap = new THREE.Mesh(new THREE.BoxGeometry(wWidth + 0.16, 0.14, segSpan + 0.16), copingMat);
          segCap.position.set(cx, w.height + 0.07, cz);
          segCap.receiveShadow = true;
          capsGroup.add(segCap);
        }
        continue;
      }
      const wWidth = w.maxX - w.minX;
      const wDepth = w.maxZ - w.minZ;
      const cx = (w.minX + w.maxX) / 2;
      const cz = (w.minZ + w.maxZ) / 2;
      const isAlleyDivider = w.id.startsWith('alley_') || w.id.startsWith('lane_') || w.id.startsWith('outer_alley_') || w.id.startsWith('outer_west') || w.id.startsWith('outer_east');
      const mat = (w.zone && zoneWallMatMap[w.zone]) || (isAlleyDivider ? alleyWallMat : brickWallMat);
      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(wWidth, w.height, wDepth), mat);
      wallMesh.position.set(cx, w.height / 2, cz);
      wallMesh.castShadow = !isSoftwareGl;
      wallMesh.receiveShadow = true;
      scene.add(wallMesh);
      if (w.height >= 2.2) {
        wallMeshes.push(wallMesh);
      }

      const capMat = (w.zone && zoneCopingMatMap[w.zone]) || copingMat;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(wWidth + 0.16, 0.14, wDepth + 0.16), capMat);
      cap.position.set(cx, w.height + 0.07, cz);
      cap.receiveShadow = true;
      capsGroup.add(cap);
    }
    scene.add(optimizeStaticGroup(capsGroup));

    // Periodic Concrete Pilasters along the 208m Compound Perimeter Walls (1 InstancedMesh draw call)
    const pilasterTransforms: BoxTransform[] = [];
    for (let p = -96; p <= 96; p += 16) {
      for (const pz of [-102.8, 102.8]) {
        pilasterTransforms.push({ x: p, y: 1.925, z: pz, sx: 1.1, sy: 3.85, sz: 2.1 });
      }
      if (Math.abs(p - RAILWAY_TRACK_Z) > 5.5) {
        for (const px of [-102.8, 102.8]) {
          pilasterTransforms.push({ x: px, y: 1.925, z: p, sx: 2.1, sy: 3.85, sz: 1.1 });
        }
      }
    }
    const pilasterInst = new THREE.InstancedMesh(unitBoxGeo, pillarMat, pilasterTransforms.length);
    pilasterInst.receiveShadow = true;
    pilasterTransforms.forEach((tr, idx) => {
      instDummy.position.set(tr.x, tr.y, tr.z);
      instDummy.rotation.set(0, 0, 0);
      instDummy.scale.set(tr.sx, tr.sy, tr.sz);
      instDummy.updateMatrix();
      pilasterInst.setMatrixAt(idx, instDummy.matrix);
    });
    pilasterInst.instanceMatrix.needsUpdate = true;
    pilasterInst.computeBoundingSphere();
    scene.add(pilasterInst);

    // Distinct Building Columns + Colored Corrugated Eaves + Rooftop Architecture + Doorway Nameplates
    const cornerBuildings: Array<{
      id: string;
      bounds: [number, number, number, number];
      tint: string;
      eaveHex: string;
      pillarHex: string;
      signMap: THREE.CanvasTexture;
      signPos: [number, number, number];
      signRotY: number;
    }> = [
      {
        id: 'cha_dokan',
        bounds: [-45.0, -25.0, -41.0, -22.5],
        tint: '#fde68a',
        eaveHex: '#b45309',
        pillarHex: '#78350f',
        signMap: textures.chaSignMap,
        signPos: [-31.2, 3.72, -22.2],
        signRotY: 0,
      },
      {
        id: 'rickshaw_garage',
        bounds: [25.0, 45.0, -41.0, -22.5],
        tint: '#e0f2fe',
        eaveHex: '#047857',
        pillarHex: '#064e3b',
        signMap: textures.rickshawSignMap,
        signPos: [31.2, 3.72, -22.2],
        signRotY: 0,
      },
      {
        id: 'desco_power',
        bounds: [-45.0, -25.0, 22.5, 41.0],
        tint: '#fef08a',
        eaveHex: '#334155',
        pillarHex: '#991b1b',
        signMap: textures.descoSignMap,
        signPos: [-31.2, 3.72, 22.2],
        signRotY: 0,
      },
      {
        id: 'dish_roof',
        bounds: [25.0, 45.0, 22.5, 41.0],
        tint: '#bae6fd',
        eaveHex: '#1d4ed8',
        pillarHex: '#1e3a8a',
        signMap: textures.dishSignMap,
        signPos: [31.2, 3.72, 22.2],
        signRotY: 0,
      },
      {
        id: 'saloon_goli',
        bounds: [-75.0, -57.0, -35.0, -17.0],
        tint: '#fef3c7',
        eaveHex: '#be185d',
        pillarHex: '#831843',
        signMap: textures.saloonSignMap,
        signPos: [-56.7, 3.75, -26.0],
        signRotY: Math.PI / 2,
      },
      {
        id: 'pharmacy_mor',
        bounds: [-75.0, -57.0, 17.0, 35.0],
        tint: '#e0f2fe',
        eaveHex: '#0284c7',
        pillarHex: '#e0f2fe',
        signMap: textures.pharmacySignMap,
        signPos: [-56.7, 3.75, 26.0],
        signRotY: Math.PI / 2,
      },
      {
        id: 'kakar_bari',
        bounds: [-82.0, -66.0, -96.0, -80.0],
        tint: '#fef3c7',
        eaveHex: '#b45309',
        pillarHex: '#78350f',
        signMap: textures.kakaSignMap,
        signPos: [-74.0, 3.75, -79.7],
        signRotY: 0,
      },
      {
        id: 'master_bari',
        bounds: [-40.0, -24.0, -96.0, -80.0],
        tint: '#fef9c3',
        eaveHex: '#78350f',
        pillarHex: '#451a03',
        signMap: textures.masterSignMap,
        signPos: [-32.0, 3.75, -79.7],
        signRotY: 0,
      },
      {
        id: 'chacha_bari',
        bounds: [24.0, 40.0, -96.0, -80.0],
        tint: '#ffe4e6',
        eaveHex: '#be123c',
        pillarHex: '#881337',
        signMap: textures.chachaSignMap,
        signPos: [32.0, 3.75, -79.7],
        signRotY: 0,
      },
      {
        id: 'khalar_bari',
        bounds: [66.0, 82.0, -96.0, -80.0],
        tint: '#ccfbf1',
        eaveHex: '#0f766e',
        pillarHex: '#115e59',
        signMap: textures.khalaSignMap,
        signPos: [74.0, 3.75, -79.7],
        signRotY: 0,
      },
    ];
    const shopTubeMats: THREE.MeshStandardMaterial[] = [];
    const shopPoolMats: THREE.MeshBasicMaterial[] = [];
    const tubeFrameMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.65 });
    const signFrameMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.45, metalness: 0.55 });

    const addDoubleSidedBillboard = (
      tex: THREE.CanvasTexture,
      pos: [number, number, number],
      rotY: number,
      w = 4.8,
      h = 1.4,
      withPosts = false,
      postHex = '#475569',
    ) => {
      const grp = new THREE.Group();
      grp.position.set(pos[0], pos[1], pos[2]);
      grp.rotation.y = rotY;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, h + 0.18, 0.16), signFrameMat);
      const faceMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.35,
        emissive: '#ffffff',
        emissiveMap: tex,
        emissiveIntensity: 0.22,
      });
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
      front.position.z = 0.09;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
      back.rotation.y = Math.PI;
      back.position.z = -0.09;
      grp.add(frame, front, back);
      if (withPosts) {
        const pMat = new THREE.MeshStandardMaterial({ color: postHex, roughness: 0.5, metalness: 0.4 });
        for (const px of [-w * 0.44, w * 0.44]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, pos[1], 12), pMat);
          post.position.set(px, -pos[1] / 2, 0);
          grp.add(post);
        }
      }
      scene.add(grp);
      return grp;
    };

    for (const b of cornerBuildings) {
      const [bx1, bx2, bz1, bz2] = b.bounds;
      const midX = (bx1 + bx2) / 2;
      const midZ = (bz1 + bz2) / 2;
      const colMat = new THREE.MeshStandardMaterial({ color: b.pillarHex, roughness: 0.55, metalness: 0.12 });
      const eaveMat = new THREE.MeshStandardMaterial({
        color: b.eaveHex,
        roughness: 0.32,
        metalness: 0.68,
        normalMap: textures.tinNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
      });

      for (const cx of [bx1 + 0.45, bx2 - 0.45]) {
        for (const cz of [bz1 + 0.45, bz2 - 0.45]) {
          const col = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.35, 1.15), colMat);
          col.position.set(cx, 1.675, cz);
          col.castShadow = !isSoftwareGl;
          scene.add(col);
        }
      }
      // Overhanging perimeter eave canopies (never blocking interior view)
      const eaveN = new THREE.Mesh(new THREE.BoxGeometry(bx2 - bx1 + 1.4, 0.14, 2.2), eaveMat);
      eaveN.position.set(midX, 3.15, bz1 + 0.4);
      eaveN.rotation.x = -0.18;
      const eaveS = new THREE.Mesh(new THREE.BoxGeometry(bx2 - bx1 + 1.4, 0.14, 2.2), eaveMat);
      eaveS.position.set(midX, 3.15, bz2 - 0.4);
      eaveS.rotation.x = 0.18;
      const eaveW = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, bz2 - bz1 + 1.0), eaveMat);
      eaveW.position.set(bx1 + 0.4, 3.15, midZ);
      eaveW.rotation.z = 0.18;
      const eaveE = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, bz2 - bz1 + 1.0), eaveMat);
      eaveE.position.set(bx2 - 0.4, 3.15, midZ);
      eaveE.rotation.z = -0.18;
      scene.add(eaveN, eaveS, eaveW, eaveE);

      // Unique Location Facade Nameplate above Building Entrance
      addDoubleSidedBillboard(b.signMap, b.signPos, b.signRotY, 4.9, 1.35);

      // Location-specific architectural exterior flourishes
      if (b.id === 'desco_power') {
        // Rooftop steel exhaust pods + glowing amber/red warning beacons
        const podMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.4, metalness: 0.72 });
        const beaconMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
        for (const px of [bx1 + 3.5, bx2 - 3.5]) {
          const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.78, 0.7, 16), podMat);
          pod.position.set(px, 3.55, bz2 - 0.8);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), beaconMat);
          dome.position.set(px, 3.98, bz2 - 0.8);
          scene.add(pod, dome);
        }
      } else if (b.id === 'dish_roof') {
        // Rooftop 5G & Dish Signal Mast on East eave
        const mastMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.28, metalness: 0.85 });
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.4, 12), mastMat);
        mast.position.set(bx2 - 2.0, 4.3, bz1 + 2.0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 20), new THREE.MeshBasicMaterial({ color: '#38bdf8' }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(bx2 - 2.0, 5.2, bz1 + 2.0);
        scene.add(mast, ring);
      } else if (b.id === 'saloon_goli') {
        // Twin glowing rose-gold wall sconces flanking East doorway
        const sconceMat = new THREE.MeshBasicMaterial({ color: '#f472b6' });
        for (const sz of [-29.0, -23.0]) {
          const globe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), sconceMat);
          globe.position.set(-56.7, 2.45, sz);
          scene.add(globe);
        }
      } else if (b.id === 'pharmacy_mor') {
        // Glowing emerald medical cross beacon on East roofline
        const crossMat = new THREE.MeshStandardMaterial({
          color: '#10b981',
          emissive: '#10b981',
          emissiveIntensity: 1.4,
        });
        const cv = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, 0.34), crossMat);
        cv.position.set(-56.7, 4.95, 26.0);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 1.05), crossMat);
        ch.position.set(-56.7, 4.95, 26.0);
        scene.add(cv, ch);
      }

      // Emissive Interior Fluorescent Tube Light Bars under North/South Eaves + Soft Floor Light Pool
      const tubeMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: b.tint,
        emissiveIntensity: 1.7,
        roughness: 0.2,
      });
      shopTubeMats.push(tubeMat);
      for (const tz of [bz1 + 1.15, bz2 - 1.15]) {
        const casing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.14), tubeFrameMat);
        casing.position.set(midX, 2.96, tz);
        const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 3.2, 10), tubeMat);
        bulb.rotation.z = Math.PI / 2;
        bulb.position.set(midX, 2.91, tz);
        scene.add(casing, bulb);
      }
      const poolMat = new THREE.MeshBasicMaterial({
        color: b.tint,
        transparent: true,
        opacity: 0.052,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      shopPoolMats.push(poolMat);
      const interiorPool = new THREE.Mesh(
        new THREE.PlaneGeometry(bx2 - bx1 - 3.6, bz2 - bz1 - 3.6),
        poolMat,
      );
      interiorPool.rotation.x = -Math.PI / 2;
      interiorPool.position.set(midX, 0.068, midZ);
      scene.add(interiorPool);
    }

    // Architectural Finishing: Plinth Foundation Skirts, Recessed Glowing Windows with Grilles,
    // Walkable Rooftop Terraces, Parapet Railings, Exterior Stepped Staircases & Rooftop Props
    const archGroup = new THREE.Group();
    const plinthMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.88, metalness: 0.05 });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.55, metalness: 0.45 });
    const grilleMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.35, metalness: 0.78 });
    const windowGlassMat = new THREE.MeshStandardMaterial({
      color: '#fef08a',
      emissive: '#fbbf24',
      emissiveIntensity: 1.15,
      roughness: 0.25,
    });
    shopTubeMats.push(windowGlassMat);

    const concreteDeckMat = new THREE.MeshStandardMaterial({
      map: textures.cobbleMap,
      color: '#cbd5e1',
      roughness: 0.78,
      metalness: 0.06,
    });
    const stairTreadMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.72, metalness: 0.08 });
    const handrailMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.32, metalness: 0.75 });
    const sintexMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.38, metalness: 0.15 });
    const pvcPipeMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.45 });
    const roofAcBodyMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.5, metalness: 0.25 });
    const roofAcFans: THREE.Group[] = [];

    const addFramedWindow = (
      wx: number,
      wy: number,
      wz: number,
      rotY: number,
      width = 2.3,
      height = 1.15,
    ) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      wg.rotation.y = rotY;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.24, height + 0.22, 1.06), frameMat);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(width - 0.12, height - 0.12, 1.08), windowGlassMat);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.38, 0.11, 1.24), plinthMat);
      sill.position.y = -height * 0.5 - 0.06;
      wg.add(frame, pane, sill);
      // Security grille bars (classic Moholla iron window grills)
      for (const gx of [-width * 0.26, 0, width * 0.26]) {
        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.045, height - 0.12, 1.12), grilleMat);
        vBar.position.x = gx;
        wg.add(vBar);
      }
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(width - 0.12, 0.045, 1.12), grilleMat);
      wg.add(hBar);
      archGroup.add(wg);
    };

    for (const b of cornerBuildings) {
      const [bx1, bx2, bz1, bz2] = b.bounds;
      const midX = (bx1 + bx2) / 2;
      const midZ = (bz1 + bz2) / 2;
      const wSpan = bx2 - bx1;
      const dSpan = bz2 - bz1;
      const isParaHouse =
        b.id === 'kakar_bari' ||
        b.id === 'master_bari' ||
        b.id === 'chacha_bari' ||
        b.id === 'khalar_bari';
      const hasSouthDoor = b.id === 'cha_dokan' || b.id === 'rickshaw_garage' || isParaHouse;
      const hasNorthDoor = b.id === 'desco_power' || b.id === 'dish_roof';
      const hasEastDoor = b.id === 'saloon_goli' || b.id === 'pharmacy_mor';

      // Ground plinth foundation skirts
      if (!hasNorthDoor) {
        const pn = new THREE.Mesh(new THREE.BoxGeometry(wSpan + 0.3, 0.38, 1.18), plinthMat);
        pn.position.set(midX, 0.19, bz1 + 0.45);
        archGroup.add(pn);
        addFramedWindow(midX - 4.2, 1.78, bz1 + 0.45, 0);
        addFramedWindow(midX + 4.2, 1.78, bz1 + 0.45, 0);
      } else {
        const pnStub = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.38, 1.18), plinthMat);
        pnStub.position.set(b.id === 'desco_power' ? bx1 + 4.4 : bx2 - 4.4, 0.19, bz1 + 0.45);
        archGroup.add(pnStub);
      }
      if (!hasSouthDoor) {
        const ps = new THREE.Mesh(new THREE.BoxGeometry(wSpan + 0.3, 0.38, 1.18), plinthMat);
        ps.position.set(midX, 0.19, bz2 - 0.45);
        archGroup.add(ps);
        addFramedWindow(midX - 4.2, 1.78, bz2 - 0.45, 0);
        addFramedWindow(midX + 4.2, 1.78, bz2 - 0.45, 0);
      } else if (isParaHouse) {
        for (const px of [bx1 + 2.6, bx2 - 2.6]) {
          const psStub = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.38, 1.18), plinthMat);
          psStub.position.set(px, 0.19, bz2 - 0.45);
          archGroup.add(psStub);
        }
      } else {
        const psStub = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.38, 1.18), plinthMat);
        psStub.position.set(b.id === 'cha_dokan' ? bx1 + 4.4 : bx2 - 4.4, 0.19, bz2 - 0.45);
        archGroup.add(psStub);
      }
      const pw = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.38, dSpan + 0.3), plinthMat);
      pw.position.set(bx1 + 0.45, 0.19, midZ);
      archGroup.add(pw);
      addFramedWindow(bx1 + 0.45, 1.78, midZ - 4.0, Math.PI / 2);
      addFramedWindow(bx1 + 0.45, 1.78, midZ + 4.0, Math.PI / 2);

      if (!hasEastDoor) {
        const pe = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.38, dSpan + 0.3), plinthMat);
        pe.position.set(bx2 - 0.45, 0.19, midZ);
        archGroup.add(pe);
        addFramedWindow(bx2 - 0.45, 1.78, midZ - 4.0, Math.PI / 2);
        addFramedWindow(bx2 - 0.45, 1.78, midZ + 4.0, Math.PI / 2);
      }

      // Cozy Para House Interior Furniture (Sofas / Study Desk / Dining Tables matching WALLS AABBs)
      if (isParaHouse) {
        const woodFurnitureMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.65 });
        const sofaCushionMat = new THREE.MeshStandardMaterial({
          color: b.id === 'kakar_bari' ? '#b45309' : b.id === 'chacha_bari' ? '#be123c' : '#0f766e',
          roughness: 0.8,
        });
        const fx = b.id === 'kakar_bari' ? -78.15 : b.id === 'master_bari' ? -35.5 : b.id === 'chacha_bari' ? 35.1 : 77.5;
        const fz = -92.55;
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(b.id === 'master_bari' ? 4.0 : 3.6, 0.72, 2.1),
          b.id === 'kakar_bari' ? sofaCushionMat : woodFurnitureMat,
        );
        body.position.set(fx, 0.36, fz);
        body.castShadow = !isSoftwareGl;
        const top = new THREE.Mesh(
          new THREE.BoxGeometry(3.8, 0.14, 2.2),
          b.id === 'kakar_bari' ? woodFurnitureMat : sofaCushionMat,
        );
        top.position.set(fx, 0.82, fz);
        archGroup.add(body, top);
      }
    }

    // Walkable Rooftop Slabs + Parapet Railings + Rich Moholla Rooftop Props (per-building visibility when player is inside)
    const buildingRoofGroups: Array<{
      roofGroup: THREE.Group;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }> = [];

    for (const deck of ROOFTOPS) {
      const rw = deck.maxX - deck.minX;
      const rd = deck.maxZ - deck.minZ;
      const rcx = (deck.minX + deck.maxX) / 2;
      const rcz = (deck.minZ + deck.maxZ) / 2;
      const topY = deck.elevationY;
      const capMat = zoneCopingMatMap[deck.zoneId] ?? copingMat;
      const isOverbridge = deck.id === 'rail_overbridge';
      const targetRoofGroup = isOverbridge ? archGroup : new THREE.Group();
      const dynamicChildren: THREE.Object3D[] = [];

      const slab = new THREE.Mesh(new THREE.BoxGeometry(rw + 0.25, 0.26, rd + 0.25), concreteDeckMat);
      slab.position.set(rcx, topY - 0.13, rcz);
      slab.receiveShadow = true;
      slab.castShadow = !isSoftwareGl;
      targetRoofGroup.add(slab);

      const trim = new THREE.Mesh(new THREE.BoxGeometry(rw + 0.42, 0.1, rd + 0.42), capMat);
      trim.position.set(rcx, topY - 0.28, rcz);
      targetRoofGroup.add(trim);

      if (isOverbridge) {
        // Steel Bridge Support Piers flanking Railway Tracks (z = 80.2 and z = 92.8, clear of train clearance z = 83..90)
        const steelMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.72 });
        for (const px of [deck.minX + 0.25, deck.maxX - 0.25]) {
          for (const pz of [80.2, 92.8]) {
            const pier = new THREE.Mesh(new THREE.BoxGeometry(0.36, topY - 0.15, 0.36), steelMat);
            pier.position.set(px, (topY - 0.15) / 2, pz);
            pier.castShadow = !isSoftwareGl;
            targetRoofGroup.add(pier);
          }
          // Open Steel Side Safety Handrails along East & West spans
          for (const ry of [topY + 0.52, topY + 0.96]) {
            const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, rd), handrailMat);
            sideRail.position.set(px, ry, rcz);
            targetRoofGroup.add(sideRail);
          }
          for (let pz = deck.minZ + 0.5; pz <= deck.maxZ - 0.5; pz += 2.1) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), handrailMat);
            post.position.set(px, topY + 0.5, pz);
            targetRoofGroup.add(post);
          }
        }
        continue;
      }

      // Build Parapet walls around the 4 edges leaving openings where exterior stairs meet the deck
      const paraH = 0.88;
      const paraT = 0.28;
      const paraY = topY + paraH / 2;

      const addSegmentedEdge = (isNS: boolean, fixedCoord: number, start: number, end: number) => {
        const cuts = deck.stairOpenings
          .filter((op) =>
            isNS
              ? fixedCoord >= op.minZ - 0.4 && fixedCoord <= op.maxZ + 0.4
              : fixedCoord >= op.minX - 0.4 && fixedCoord <= op.maxX + 0.4,
          )
          .map((op) => (isNS ? [op.minX, op.maxX] : [op.minZ, op.maxZ]) as [number, number])
          .sort((a, b) => a[0] - b[0]);

        let cursor = start;
        const segments: Array<[number, number]> = [];
        for (const [cs, ce] of cuts) {
          if (cs > cursor + 0.25) segments.push([cursor, Math.min(end, cs)]);
          cursor = Math.max(cursor, ce);
        }
        if (cursor < end - 0.25) segments.push([cursor, end]);

        for (const [s0, s1] of segments) {
          const len = s1 - s0;
          if (len <= 0.2) continue;
          const mid = (s0 + s1) / 2;
          const para = new THREE.Mesh(
            new THREE.BoxGeometry(isNS ? len : paraT, paraH, isNS ? paraT : len),
            alleyWallMat,
          );
          para.position.set(isNS ? mid : fixedCoord, paraY, isNS ? fixedCoord : mid);
          para.castShadow = !isSoftwareGl;
          para.receiveShadow = true;
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(isNS ? len + 0.08 : paraT + 0.08, 0.09, isNS ? paraT + 0.08 : len + 0.08),
            capMat,
          );
          rail.position.set(isNS ? mid : fixedCoord, topY + paraH + 0.045, isNS ? fixedCoord : mid);
          targetRoofGroup.add(para, rail);
        }
      };

      addSegmentedEdge(true, deck.minZ + paraT / 2, deck.minX, deck.maxX);
      addSegmentedEdge(true, deck.maxZ - paraT / 2, deck.minX, deck.maxX);
      addSegmentedEdge(false, deck.minX + paraT / 2, deck.minZ, deck.maxZ);
      addSegmentedEdge(false, deck.maxX - paraT / 2, deck.minZ, deck.maxZ);

      // Rooftop Props: Sintex Ribbed Water Tank
      if (
        deck.id === 'cha_roof' ||
        deck.id === 'saloon_roof' ||
        deck.id === 'pharm_roof' ||
        deck.id === 'kaka_roof' ||
        deck.id === 'khala_roof'
      ) {
        const tx = deck.minX + 1.85;
        const tz = deck.minZ + 1.85;
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.26, 2.0), plinthMat);
        plinth.position.set(tx, topY + 0.13, tz);
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 1.55, 16), sintexMat);
        tank.position.set(tx, topY + 1.03, tz);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.76, 0.18, 16), capMat);
        lid.position.set(tx, topY + 1.86, tz);
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), pvcPipeMat);
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(tx + 1.15, topY + 0.45, tz);
        targetRoofGroup.add(plinth, tank, lid, pipe);
      }

      // Rooftop Props: Clotheslines (Roshi-te Kapor)
      if (
        deck.id === 'cha_roof' ||
        deck.id === 'saloon_roof' ||
        deck.id === 'kaka_roof' ||
        deck.id === 'chacha_roof'
      ) {
        const clothes = createClotheslineProp();
        clothes.position.set(rcx - 1.4, topY, rcz + 2.6);
        targetRoofGroup.add(clothes);
      }

      // Rooftop Props: Bamboo Machan Pergola + Woven Chatai & Moras
      if (deck.id === 'rick_roof' || deck.id === 'master_roof' || deck.id === 'khala_roof') {
        const machan = createRooftopMachanProp(isSoftwareGl);
        machan.position.set(rcx - 1.2, topY, rcz - 0.8);
        targetRoofGroup.add(machan);
      }

      // Rooftop Props: Adda Tea Benches + Warm Rooftop Lanterns
      if (deck.id === 'cha_roof' || deck.id === 'rick_roof' || deck.id === 'kaka_roof' || deck.id === 'chacha_roof') {
        const bx = rcx + 2.4;
        const bz = rcz - 1.6;
        const benchMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.72 });
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.85), benchMat);
        bench.position.set(bx, topY + 0.48, bz);
        for (const lx of [-0.9, 0.9]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.44, 0.76), handrailMat);
          leg.position.set(bx + lx, topY + 0.22, bz);
          targetRoofGroup.add(leg);
        }
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.85, 8), handrailMat);
        post.position.set(bx + 1.9, topY + 0.92, bz);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), windowGlassMat);
        bulb.position.set(bx + 1.9, topY + 1.88, bz);
        targetRoofGroup.add(bench, post, bulb);
      }

      // Rooftop Props: Spinning Outdoor AC Condenser Units on DESCO, Dish & Master Roofs
      if (deck.id === 'desco_roof' || deck.id === 'dish_deck' || deck.id === 'master_roof') {
        const acX = deck.id === 'desco_roof' ? deck.maxX - 2.2 : deck.minX + 1.6;
        const acZ = deck.id === 'desco_roof' ? deck.maxZ - 1.4 : deck.minZ + 2.2;
        const acBox = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.85, 0.65), roofAcBodyMat);
        acBox.position.set(acX, topY + 0.44, acZ);
        const grilleRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 18), frameMat);
        grilleRing.position.set(acX - 0.15, topY + 0.45, acZ + 0.34);
        const fanGrp = new THREE.Group();
        fanGrp.position.set(acX - 0.15, topY + 0.45, acZ + 0.32);
        const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.03), sintexMat);
        const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.46, 0.03), sintexMat);
        fanGrp.add(bladeA, bladeB);
        targetRoofGroup.add(acBox, grilleRing, fanGrp);
        dynamicChildren.push(fanGrp);
        roofAcFans.push(fanGrp);
      }

      // Rooftop Props: Dish Observatory Satellite Dish on Dish Terrace & Chacha Roof
      if (deck.id === 'dish_deck' || deck.id === 'chacha_roof') {
        const dx = rcx - 0.4;
        const dz = rcz - 3.2;
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.1, 10), handrailMat);
        stand.position.set(dx, topY + 0.55, dz);
        const dishBowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.95, 0.25, 0.36, 18),
          new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35, metalness: 0.3 }),
        );
        dishBowl.position.set(dx, topY + 1.28, dz);
        dishBowl.rotation.x = 0.65;
        dishBowl.rotation.z = -0.35;
        const lnb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), new THREE.MeshBasicMaterial({ color: '#38bdf8' }));
        lnb.position.set(dx + 0.22, topY + 1.72, dz + 0.42);
        targetRoofGroup.add(stand, dishBowl, lnb);
      }

      // Rooftop Potted Garden Plants (Chhad Bagan) on Para House Roofs
      if (
        deck.id === 'kaka_roof' ||
        deck.id === 'master_roof' ||
        deck.id === 'chacha_roof' ||
        deck.id === 'khala_roof'
      ) {
        const potSpots: Array<[number, number]> = [
          [deck.maxX - 1.6, deck.minZ + 1.6],
          [deck.maxX - 1.6, deck.maxZ - 1.6],
        ];
        for (const [px, pz] of potSpots) {
          const pot = createPlanterPot();
          pot.position.set(px, topY, pz);
          targetRoofGroup.add(pot);
        }
      }

      scene.add(optimizeStaticGroup(targetRoofGroup, dynamicChildren));
      buildingRoofGroups.push({
        roofGroup: targetRoofGroup,
        minX: deck.minX,
        maxX: deck.maxX,
        minZ: deck.minZ,
        maxZ: deck.maxZ,
      });
    }

    // Exterior Stepped Staircases with Stringers, Upper Landings & Tubular Handrails
    for (const st of STAIR_RAMPS) {
      const isZ = st.axis === 'z';
      const wX = st.maxX - st.minX;
      const wZ = st.maxZ - st.minZ;
      const cx = (st.minX + st.maxX) / 2;
      const cz = (st.minZ + st.maxZ) / 2;
      const stepSpan = st.topCoord - st.bottomCoord;
      const stepAbsSpan = Math.abs(stepSpan);
      const stepDepth = stepAbsSpan / st.steps;
      const stepRise = st.topY / st.steps;

      // Stepped solid concrete treads
      for (let i = 0; i < st.steps; i++) {
        const frac = (i + 0.5) / st.steps;
        const coord = st.bottomCoord + stepSpan * frac;
        const treadTop = stepRise * (i + 1);
        const tread = new THREE.Mesh(
          new THREE.BoxGeometry(isZ ? wX - 0.12 : stepDepth + 0.04, treadTop, isZ ? stepDepth + 0.04 : wZ - 0.12),
          stairTreadMat,
        );
        tread.position.set(isZ ? cx : coord, treadTop / 2, isZ ? coord : cz);
        tread.receiveShadow = true;
        tread.castShadow = !isSoftwareGl;
        archGroup.add(tread);
      }

      // Upper landing platform connecting flush into roof stairOpening
      const landMin = isZ ? Math.min(st.minZ, st.topCoord) : Math.min(st.minX, st.topCoord);
      const landMax = isZ ? Math.max(st.maxZ, st.topCoord) : Math.max(st.maxX, st.topCoord);
      const landSpan =
        Math.abs(st.topCoord - (st.bottomCoord > st.topCoord ? landMin : landMax));
      if (landSpan > 0.25) {
        const landMid =
          st.bottomCoord > st.topCoord
            ? (landMin + st.topCoord) / 2
            : (st.topCoord + landMax) / 2;
        const landing = new THREE.Mesh(
          new THREE.BoxGeometry(isZ ? wX : landSpan, 0.26, isZ ? landSpan : wZ),
          concreteDeckMat,
        );
        landing.position.set(isZ ? cx : landMid, st.topY - 0.13, isZ ? landMid : cz);
        landing.receiveShadow = true;
        archGroup.add(landing);
      }

      // Side Slanted Handrails + Vertical Stanchion Posts
      const railLen = Math.hypot(stepAbsSpan, st.topY);
      const slopeAngle = Math.atan2(st.topY, stepAbsSpan) * (stepSpan < 0 ? 1 : -1);
      const midRampCoord = (st.bottomCoord + st.topCoord) / 2;
      for (const side of [-1, 1]) {
        const offset = (isZ ? wX : wZ) * 0.46 * side;
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(isZ ? 0.07 : railLen, 0.07, isZ ? railLen : 0.07),
          handrailMat,
        );
        rail.position.set(
          isZ ? cx + offset : midRampCoord,
          st.topY * 0.5 + 0.92,
          isZ ? midRampCoord : cz + offset,
        );
        if (isZ) rail.rotation.x = slopeAngle;
        else rail.rotation.z = -slopeAngle;
        archGroup.add(rail);

        for (const pf of [0.1, 0.5, 0.92]) {
          const pCoord = st.bottomCoord + stepSpan * pf;
          const pBaseY = st.topY * pf;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.92, 6), handrailMat);
          post.position.set(
            isZ ? cx + offset : pCoord,
            pBaseY + 0.46,
            isZ ? pCoord : cz + offset,
          );
          archGroup.add(post);
        }
      }
    }

    scene.add(optimizeStaticGroup(archGroup));

    // Overhead District Arch Signboards for Open-Air Plazas (Adda Chowk, Pukur Ghat, Bazar, Eidgah, WASA)
    addDoubleSidedBillboard(textures.addaSignMap, [0, 5.75, -9.5], 0, 5.2, 1.45, true, '#b45309');
    addDoubleSidedBillboard(textures.pukurSignMap, [-37.8, 4.15, -8.2], 0, 4.6, 1.3, true, '#0e7490');
    addDoubleSidedBillboard(textures.bazarSignMap, [39.2, 4.45, -6.4], Math.PI / 2, 5.0, 1.4, true, '#b45309');
    addDoubleSidedBillboard(textures.eidgahSignMap, [0, 5.25, -45.2], 0, 5.0, 1.35, false);
    addDoubleSidedBillboard(textures.wasaSignMap, [0, 4.35, 35.8], 0, 4.8, 1.35, true, '#1e40af');

    // Rolling Door Shutters
    const shutterMeshes = new Map<DoorZoneId, { mesh: THREE.Group; targetY: number; openY: number }>();
    for (const d of DOORS) {
      const shutter = createShutterDoor(d, textures);
      scene.add(shutter);
      shutterMeshes.set(d.zoneId, { mesh: shutter, targetY: d.height + 0.15, openY: d.height + 0.15 });
    }

    // Bazar Stall with Festive Striped Awning, Crates & Woven Jhuri Baskets
    const bazarCounter = new THREE.Mesh(
      new THREE.BoxGeometry(4.0, 1.2, 10.0),
      new THREE.MeshStandardMaterial({ color: '#9a3412', roughness: 0.78 }),
    );
    bazarCounter.position.set(44.5, 0.6, 0);
    bazarCounter.castShadow = !isSoftwareGl;
    scene.add(bazarCounter);
    const bazarAwning = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.16, 10.6),
      new THREE.MeshStandardMaterial({ map: textures.bazarAwningMap, roughness: 0.52 }),
    );
    bazarAwning.position.set(43.8, 3.05, 0);
    bazarAwning.rotation.z = 0.15;
    scene.add(bazarAwning);
    const bazarTubeMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#fde68a',
      emissiveIntensity: 1.75,
      roughness: 0.2,
    });
    shopTubeMats.push(bazarTubeMat);
    const bazarTube = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 7.6, 10), bazarTubeMat);
    bazarTube.rotation.x = Math.PI / 2;
    bazarTube.position.set(42.5, 2.86, 0);
    scene.add(bazarTube);
    const bazarPoolMat = new THREE.MeshBasicMaterial({
      color: '#fde68a',
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    shopPoolMats.push(bazarPoolMat);
    const bazarPool = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 10.6), bazarPoolMat);
    bazarPool.rotation.x = -Math.PI / 2;
    bazarPool.position.set(41.2, 0.068, 0);
    scene.add(bazarPool);
    scene.add(createBazarProps(textures, isSoftwareGl));

    // Banglish Posters & Dustbins along the Tactical Alley Sightline Walls
    scene.add(createAlleyProps(textures, isSoftwareGl));

    // PUBG-Style Slatted Supply Crates, Ribbed Oil/Water Drums & Sandbag Jersey Barricades
    const supplySpots: Array<[number, number, number]> = [
      [40.8, -37.2, 0.15],
      [-41.8, 37.6, -0.25],
      [40.8, 26.2, 0.0],
      [42.8, 8.2, -0.18],
      [9.1, -70.2, 0.22],
      [62.0, 34.2, -0.3],
    ];
    instantiateGroupAtTransforms(
      createSupplyCluster(textures, isSoftwareGl),
      supplySpots.map(([x, z, rotY]) => ({ x, z, rotY })),
      scene,
    );

    const barricadeSpots: Array<[number, number, number]> = [
      [-13.5, -45.2, 0.08],
      [13.5, -45.2, -0.08],
      [-11.5, 45.2, -0.06],
      [11.5, 45.2, 0.06],
    ];
    instantiateGroupAtTransforms(
      createSandbagBarricade(isSoftwareGl),
      barricadeSpots.map(([x, z, rotY]) => ({ x, z, rotY })),
      scene,
    );

    // Wind-Swaying Instanced Grass Tufts across Eidgah, Pukur Bank & Outer Verges
    const instancedGrass = createInstancedGrassTufts();
    scene.add(instancedGrass.mesh);

    // Terracotta Planter Pots flanking plazas & entrances (InstancedMesh)
    const planterSpots: Array<[number, number]> = [
      [-8.4, -8.4],
      [8.4, -8.4],
      [-8.4, 8.4],
      [8.4, 8.4],
      [-36.5, -21.8],
      [-26.2, -21.8],
      [36.5, -21.8],
      [26.2, -21.8],
      [-36.5, 21.8],
      [-26.2, 21.8],
      [36.5, 21.8],
      [26.2, 21.8],
      [-6.5, -43.2],
      [6.5, -43.2],
      [-55.8, -19.5],
      [-55.8, -32.5],
      [-55.8, 19.5],
      [-55.8, 32.5],
      [-8.5, -59.5],
      [8.5, -59.5],
    ];
    instantiateGroupAtTransforms(
      createPlanterPot(),
      planterSpots.map(([x, z]) => ({ x, z })),
      scene,
    );

    // Moricbatti Fairy Garlands above Adda Chowk
    const garlands = createMoricbattiGarlands();
    scene.add(garlands.group);

    // Composite Hero Landmarks, Detailed Shop Interiors & Vehicles
    scene.add(createAddaMonument(isSoftwareGl));
    const chaStall = createChaStallProps(textures, isSoftwareGl);
    scene.add(chaStall.group);
    scene.add(createRickshawGarageProps(textures, isSoftwareGl));
    scene.add(createEidgahGate(isSoftwareGl));
    scene.add(createWaterTowerModel(isSoftwareGl));

    // 5 Hi-Poly Outer Moholla Landmarks + South Dhaka Rail Crossing
    scene.add(createFuchkaCartModel(textures, isSoftwareGl));
    const saloonProps = createSaloonProps(textures, isSoftwareGl);
    scene.add(saloonProps.group);
    scene.add(createCricketMathProps(textures, isSoftwareGl));
    scene.add(createPharmacyProps(textures, isSoftwareGl));
    const biyerPandal = createBiyerPandalProps(textures, isSoftwareGl);
    scene.add(biyerPandal.group);
    const railGate = createRailCrossingGate(textures, isSoftwareGl);
    scene.add(railGate.group);
    const banglaTrain = createBanglaTrainModel(isSoftwareGl);
    banglaTrain.group.position.set(-140, 0.16, RAILWAY_TRACK_Z);
    banglaTrain.group.visible = false;
    scene.add(banglaTrain.group);
    let lastHornCycle = -1;

    instantiateGroupAtTransforms(
      createRickshawModel(textures, isSoftwareGl),
      [
        { x: 36.5, z: -33.5, rotY: -0.55 },
        { x: 27.8, z: -32.2, rotY: 0.12 },
      ],
      scene,
    );

    // Iconic Dhaka Green CNG Auto-Rickshaw parked along the Moholla avenue
    const cng = createCngModel(isSoftwareGl);
    cng.position.set(11.0, 0, 23.0);
    cng.rotation.y = -0.38;
    scene.add(cng);

    const desco = createDescoTransformer(textures, isSoftwareGl);
    desco.group.position.set(-38.25, 0, 32.65);
    scene.add(desco.group);

    const dishHub = createDishHub(textures, isSoftwareGl);
    scene.add(dishHub.group);

    const adminTable = createAdminTableModel(isSoftwareGl);
    adminTable.position.set(ADMIN_TABLE_POS.x, 0, ADMIN_TABLE_POS.z);
    scene.add(adminTable);

    const vitalsKiosk = createVitalsKioskModel(isSoftwareGl);
    vitalsKiosk.position.set(VITALS_POS.x, 0, VITALS_POS.z);
    scene.add(vitalsKiosk);

    const securityCams: Array<{ head: THREE.Group; ledMat: THREE.MeshStandardMaterial; baseRotY: number }> = [];
    for (const camDef of SECURITY_CAMERAS) {
      const camObj = createSecurityCamMesh();
      camObj.group.position.set(camDef.camX, 0, camDef.camZ);
      const baseRotY = Math.atan2(camDef.viewCenterX - camDef.camX, camDef.viewCenterZ - camDef.camZ);
      camObj.head.rotation.y = baseRotY;
      scene.add(camObj.group);
      securityCams.push({ head: camObj.head, ledMat: camObj.ledMat, baseRotY });
    }

    // Concrete Utility Poles + Sagging Overhead Moholla Electric Wires
    const poleCoords: Array<[number, number, number]> = [
      [-14.5, -21.5, 0],
      [14.5, -21.5, 0],
      [-14.5, 21.5, 0],
      [14.5, 21.5, 0],
      [-24.0, 21.5, 0.4],
      [24.0, 21.5, -0.4],
    ];
    instantiateGroupAtTransforms(
      createUtilityPole(),
      poleCoords.map(([x, z, rotY]) => ({ x, z, rotY })),
      scene,
    );
    scene.add(
      createOverheadWires([
        [-14.5, -21.5, 14.5, -21.5],
        [-14.5, 21.5, 14.5, 21.5],
        [-14.5, -21.5, -14.5, 21.5],
        [14.5, -21.5, 14.5, 21.5],
        [-14.5, 21.5, -24.0, 21.5],
        [14.5, 21.5, 24.0, 21.5],
      ]),
    );

    // Palm Trees & Crimson Krishnachura Trees (Instanced across 208m Compound & Outer Groves)
    const palmCoords: Array<[number, number, number]> = [
      [-94.0, -94.0, 1.22],
      [94.0, -94.0, 1.18],
      [-94.0, 96.0, 1.18],
      [94.0, 96.0, 1.16],
      [-55.5, -94.0, 1.12],
      [55.5, -94.0, 1.12],
      [-55.5, 72.5, 1.06],
      [55.5, 72.5, 1.1],
      [-96.0, -42.0, 1.32],
      [96.0, -40.0, 1.28],
      [-96.0, 42.0, 1.35],
      [96.0, 40.0, 1.26],
      [-10.0, -95.0, 1.28],
      [10.0, -95.0, 1.24],
    ];
    instantiateGroupAtTransforms(
      createPalmTree(isSoftwareGl),
      palmCoords.map(([x, z, scale]) => ({ x, z, rotY: x * 0.7, scale })),
      scene,
    );

    const krishnachuraCoords: Array<[number, number, number]> = [
      [-18.0, -56.0, 1.12],
      [18.0, -56.0, 1.08],
      [-18.0, 56.0, 1.14],
      [18.0, 56.0, 1.08],
      [-73.5, 0, 1.22],
      [73.5, 0, 1.18],
      [-96.0, -8.0, 1.28],
      [96.0, 8.0, 1.25],
      [-72.0, 62.0, 1.16],
      [72.0, 62.0, 1.16],
    ];
    instantiateGroupAtTransforms(
      createKrishnachuraTree(isSoftwareGl),
      krishnachuraCoords.map(([x, z, scale]) => ({ x, z, rotY: z * 0.4, scale })),
      scene,
    );

    // 28 Instanced Street Lamps (0 static PointLights on Mobile GPU, 4 Adda Chowk PointLights on Desktop)
    const lampCoords: Array<[number, number, number]> = [
      [-9.2, -9.2, Math.PI / 4],
      [9.2, -9.2, (Math.PI * 3) / 4],
      [-9.2, 9.2, -Math.PI / 4],
      [9.2, 9.2, (-Math.PI * 3) / 4],
      [-23.5, -14.5, Math.PI / 3],
      [23.5, -14.5, (Math.PI * 2) / 3],
      [-23.5, 14.5, -Math.PI / 3],
      [23.5, 14.5, (-Math.PI * 2) / 3],
      [-6.5, -59.5, 0],
      [-55.5, -26.0, Math.PI / 2],
      [55.5, 26.0, -Math.PI / 2],
      [-10.5, -28.0, 0],
      [10.5, -28.0, Math.PI],
      [-10.5, 28.0, 0],
      [10.5, 28.0, Math.PI],
      [-52.0, -52.0, Math.PI / 4],
      [52.0, -52.0, (Math.PI * 3) / 4],
      [-52.0, 52.0, -Math.PI / 4],
      [52.0, 52.0, (-Math.PI * 3) / 4],
      [55.5, -26.0, -Math.PI / 2],
      [-74.0, -75.0, 0],
      [-32.0, -75.0, 0],
      [32.0, -75.0, 0],
      [74.0, -75.0, 0],
      [-85.5, 0, Math.PI / 2],
      [85.5, 0, -Math.PI / 2],
      [-24.0, 71.0, 0],
      [24.0, 71.0, 0],
    ];
    const lampBulbs: THREE.PointLight[] = [];
    const lampNormalPoolOpacity = isMobileGpu ? 0.095 : 0.06;
    const glowPoolMat = new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: lampNormalPoolOpacity,
      depthWrite: false,
    });
    const lampTemplate = createStreetLamp();
    lampTemplate.coneMesh.removeFromParent();
    if (isMobileGpu && lampTemplate.coneMesh.material instanceof THREE.MeshBasicMaterial) {
      lampTemplate.coneMesh.material.opacity = 0.048;
    }
    const lampTransforms = lampCoords.map(([x, z, rotY]) => ({ x, z, rotY }));
    instantiateGroupAtTransforms(lampTemplate.group, lampTransforms, scene);

    const coneHolder = new THREE.Group();
    coneHolder.add(lampTemplate.coneMesh);
    const [lampConesInst] = instantiateGroupAtTransforms(coneHolder, lampTransforms, scene);

    const poolGeo = new THREE.CircleGeometry(3.8, 24);
    poolGeo.rotateX(-Math.PI / 2);
    const lampGlowInst = new THREE.InstancedMesh(poolGeo, glowPoolMat, lampCoords.length);
    lampCoords.forEach(([lx, lz], idx) => {
      instDummy.position.set(lx, 0.024, lz);
      instDummy.rotation.set(0, 0, 0);
      instDummy.scale.set(1, 1, 1);
      instDummy.updateMatrix();
      lampGlowInst.setMatrixAt(idx, instDummy.matrix);
      if (!isMobileGpu && !isSoftwareGl && idx < 4) {
        const pt = new THREE.PointLight(0xfbbf24, 1.15, 16, 1.8);
        pt.position.set(lx, 4.1, lz);
        scene.add(pt);
        lampBulbs.push(pt);
      }
    });
    lampGlowInst.instanceMatrix.needsUpdate = true;
    lampGlowInst.computeBoundingSphere();
    scene.add(lampGlowInst);

    // 15 Instanced Drains / Vents across Inner & Outer Districts
    instantiateGroupAtTransforms(
      createDrainVent(),
      VENTS.map((v) => ({ x: v.x, y: 0.02, z: v.z })),
      scene,
    );

    // 180 GPU-Animated Twilight Fireflies across the 208x208m Moholla (zero CPU update loop)
    const fireflyCount = 180;
    const fireflyPositions = new Float32Array(fireflyCount * 3);
    const fireflyPhases = new Float32Array(fireflyCount);
    for (let i = 0; i < fireflyCount; i++) {
      const fx = ((i * 67) % 192) - 96;
      const fz = ((i * 89) % 192) - 96;
      const fy = 0.8 + (i % 5) * 0.48;
      fireflyPositions[i * 3] = fx;
      fireflyPositions[i * 3 + 1] = fy;
      fireflyPositions[i * 3 + 2] = fz;
      fireflyPhases[i] = i * 0.9;
    }
    const fireflyGeo = new THREE.BufferGeometry();
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
    fireflyGeo.setAttribute('aPhase', new THREE.BufferAttribute(fireflyPhases, 1));
    const fireflyUniforms = { uTime: { value: 0 } };
    const fireflyMat = new THREE.PointsMaterial({
      color: '#fde68a',
      size: 0.17,
      transparent: true,
      opacity: 0.74,
    });
    fireflyMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = fireflyUniforms.uTime;
      shader.vertexShader = `attribute float aPhase;\nuniform float uTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.x += sin(uTime * 0.7 + aPhase) * 0.65;
         transformed.y += sin(uTime * 1.4 + aPhase) * 0.25;
         transformed.z += cos(uTime * 0.8 + aPhase) * 0.65;`,
      );
    };
    const fireflyPoints = new THREE.Points(fireflyGeo, fireflyMat);
    scene.add(fireflyPoints);

    // Task Station Glowing Beacons
    const taskBeacons = new Map<string, THREE.Mesh>();
    const beaconGeo = new THREE.TorusGeometry(0.95, 0.07, 8, 28);
    for (const st of TASK_STATIONS) {
      const mat = new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.72 });
      const ring = new THREE.Mesh(beaconGeo, mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(st.x, 0.14, st.z);
      scene.add(ring);
      taskBeacons.set(st.id, ring);
    }

    // Sabotage Alert Beacons (beacon 2 used for dual-valve gas_leak)
    const sabotageBeacon = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.1, 8, 28),
      new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.9 }),
    );
    sabotageBeacon.rotation.x = Math.PI / 2;
    sabotageBeacon.visible = false;
    scene.add(sabotageBeacon);

    const sabotageBeacon2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.1, 8, 28),
      new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.9 }),
    );
    sabotageBeacon2.rotation.x = Math.PI / 2;
    sabotageBeacon2.visible = false;
    scene.add(sabotageBeacon2);

    // Pooled Pukur Chubani Water Splash Effect (torus ring + 14 sky-blue droplets)
    const splashRingMat = new THREE.MeshBasicMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const splashRingGeo = new THREE.RingGeometry(0.45, 0.85, 28);
    const splashRing = new THREE.Mesh(splashRingGeo, splashRingMat);
    splashRing.rotation.x = -Math.PI / 2;
    splashRing.position.set(-45.8, 0.14, 0);
    splashRing.visible = false;
    scene.add(splashRing);

    const SPLASH_DROPLET_COUNT = 14;
    const splashDropletGeo = new THREE.SphereGeometry(0.16, 8, 8);
    const splashDropletMat = new THREE.MeshBasicMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: 0.92,
    });
    const splashDroplets: Array<{ mesh: THREE.Mesh; angle: number; speed: number; peak: number }> = [];
    for (let i = 0; i < SPLASH_DROPLET_COUNT; i++) {
      const m = new THREE.Mesh(splashDropletGeo, splashDropletMat);
      m.visible = false;
      scene.add(m);
      splashDroplets.push({
        mesh: m,
        angle: (i / SPLASH_DROPLET_COUNT) * Math.PI * 2 + (i % 2) * 0.2,
        speed: 1.8 + (i % 4) * 0.65,
        peak: 2.0 + (i % 3) * 0.75,
      });
    }

    let lastObservedPhase: GamePhase = phaseRef.current;
    let ejectionStartAt = 0;
    let ejectionSplashFired = false;

    const playerRigs = new Map<
      string,
      {
        rig: CharacterRig;
        prevX: number;
        prevZ: number;
        targetX: number;
        targetZ: number;
        targetY: number;
        targetYaw: number;
        displayKey: string;
      }
    >();
    const bodyMeshes = new Map<string, THREE.Group>();

    // Pooled 36 Footprint Dots for Goyenda & Ghosts (zero per-frame allocations)
    const FOOTPRINT_POOL_SIZE = 36;
    const footprintGeo = new THREE.CircleGeometry(0.24, 14);
    const footprintPool: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }> = [];
    for (let i = 0; i < FOOTPRINT_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(footprintGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.032;
      mesh.visible = false;
      scene.add(mesh);
      footprintPool.push({ mesh, mat });
    }

    const titleShowActors: Array<{ rig: CharacterRig; x: number; z: number; wpIdx: number; yaw: number }> = [];
    for (let i = 0; i < 6; i++) {
      const cSpec = PLAYER_COLORS[i];
      const rig = createCharacterRig(cSpec, cSpec.label, textures.contactShadowMap, isSoftwareGl);
      const wp = BOT_WAYPOINTS[i * 2];
      rig.root.position.set(wp.x, 0, wp.z);
      scene.add(rig.root);
      titleShowActors.push({ rig, x: wp.x, z: wp.z, wpIdx: (i * 2 + 1) % BOT_WAYPOINTS.length, yaw: 0 });
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // PUBG-Style Spherical Free Orbit Camera + Multi-Touch Pinch + Optional Mouse-Look
    const DEFAULT_CAM_YAW = 0;
    const DEFAULT_CAM_PITCH = 0.54;
    const DEFAULT_CAM_DIST = 10.8;

    const keysPressed = new Set<string>();
    let targetCamYaw = DEFAULT_CAM_YAW;
    let camYaw = DEFAULT_CAM_YAW;
    let targetCamPitch = DEFAULT_CAM_PITCH;
    let camPitch = DEFAULT_CAM_PITCH;
    let targetCamDist = DEFAULT_CAM_DIST;
    let camDist = DEFAULT_CAM_DIST;

    const activePointers = new Map<number, { x: number; y: number }>();
    let prevPinchDist: number | null = null;
    let trauma = 0;

    if (onShakeTriggerRef) {
      onShakeTriggerRef.current = (amount: number) => {
        trauma = Math.min(1, trauma + amount);
      };
    }

    if (resetCameraRef) {
      resetCameraRef.current = () => {
        targetCamYaw = DEFAULT_CAM_YAW;
        targetCamPitch = DEFAULT_CAM_PITCH;
        targetCamDist = DEFAULT_CAM_DIST;
      };
    }

    const canOrbitNow = () =>
      (phaseRef.current === 'playing' || phaseRef.current === 'lobby') && !isModalOpenRef.current;

    let localPosX = 0;
    let localFloorY = 0;
    let localJumpY = 0;
    let localPosZ = 3.8;
    let localVelX = 0;
    let localVelY = 0;
    let localVelZ = 0;
    let localYaw = Math.PI;
    let localTurnBank = 0;
    let landSquash = 0;

    const triggerJump = () => {
      const curPhase = phaseRef.current;
      const snap = snapshotRef.current;
      const lp = snap?.players.find((p) => p.id === localPlayerIdRef.current);
      if (
        (curPhase === 'playing' || curPhase === 'lobby') &&
        lp &&
        !lp.inVent &&
        !isModalOpenRef.current &&
        localJumpY <= 0.04
      ) {
        localVelY = 8.4;
        localJumpY = 0.05;
        soundEngine.playJump();
      }
    };

    if (jumpTriggerRef) {
      jumpTriggerRef.current = triggerJump;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpenRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        if (phaseRef.current === 'playing' || phaseRef.current === 'lobby') {
          e.preventDefault();
          triggerJump();
        }
        return;
      }
      keysPressed.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };

    const onBlur = () => {
      keysPressed.clear();
      activePointers.clear();
      prevPinchDist = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== canvas) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        prevPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      }
      if (
        pointerLookEnabledRef.current &&
        canOrbitNow() &&
        e.pointerType === 'mouse' &&
        document.pointerLockElement !== canvas
      ) {
        try {
          canvas.requestPointerLock?.();
        } catch {
          // Graceful fallback in sandboxed iframes
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!canOrbitNow()) return;

      if (document.pointerLockElement === canvas) {
        targetCamYaw -= e.movementX * 0.0045;
        targetCamPitch = Math.max(-0.45, Math.min(1.38, targetCamPitch + e.movementY * 0.0046));
        return;
      }

      const prev = activePointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (prevPinchDist !== null) {
          const delta = prevPinchDist - dist;
          targetCamDist = Math.max(5.0, Math.min(15.5, targetCamDist + delta * 0.032));
        }
        prevPinchDist = dist;
        return;
      }

      if (activePointers.size === 1) {
        targetCamYaw -= dx * 0.0072;
        targetCamPitch = Math.max(-0.45, Math.min(1.38, targetCamPitch + dy * 0.0068));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        prevPinchDist = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!canOrbitNow()) return;
      e.preventDefault();
      targetCamDist = Math.max(5.2, Math.min(15.2, targetCamDist + e.deltaY * 0.0065));
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && pointerLookEnabledRef.current) {
        onPointerLookChangeRef.current?.(false);
      }
    };

    const onPointerLockError = () => {
      if (pointerLookEnabledRef.current) {
        onPointerLookChangeRef.current?.(false);
      }
    };

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(currentDpr);
      renderer.setSize(w, h);
      if (composer) {
        composer.setPixelRatio(currentDpr);
        composer.setSize(w, h);
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);
    document.addEventListener('webkitfullscreenchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onResize()) : null;
    resizeObserver?.observe(container);

    let initializedLocalFromSnap = false;
    let footstepAccum = 0;
    let lastNetSendAt = 0;
    let lastCompassSendAt = 0;
    let lastSentCompassYaw = NaN;
    let elapsed = 0;
    let lastTime = performance.now();
    let frameId = 0;
    let disposed = false;
    let slowFrameCount = 0;
    let slowFrameSum = 0;

    const _activeIds = new Set<string>();
    const _bodyIds = new Set<string>();
    const _completedTaskIds = new Set<string>();
    const _assignedTaskIds = new Set<string>();

    (window as unknown as Record<string, unknown>).__KE_BATPAR_STATS__ = () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      dpr: renderer.getPixelRatio(),
      isMobileGpu,
      hasComposer: Boolean(composer),
    });

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const syncActorsFromSnapshot = (snap: RoomSnapshot, dt: number) => {
      _activeIds.clear();
      const localId = localPlayerIdRef.current;
      const localPlayer = snap.players.find((p) => p.id === localId);

      for (const p of snap.players) {
        _activeIds.add(p.id);
        let entry = playerRigs.get(p.id);
        const visColorId = p.disguiseColor ?? p.color;
        const visName = p.disguiseName ?? p.name;
        const nextDisplayKey = `${visColorId}|${visName}`;

        if (!entry) {
          const rig = createCharacterRig(
            getColorSpec(visColorId),
            visName,
            textures.contactShadowMap,
            isSoftwareGl,
          );
          rig.root.position.set(p.x, p.y ?? 0, p.z);
          rig.root.rotation.y = p.yaw;
          scene.add(rig.root);
          entry = {
            rig,
            prevX: p.x,
            prevZ: p.z,
            targetX: p.x,
            targetZ: p.z,
            targetY: p.y ?? 0,
            targetYaw: p.yaw,
            displayKey: nextDisplayKey,
          };
          playerRigs.set(p.id, entry);
        } else if (entry.displayKey !== nextDisplayKey) {
          entry.rig.setAppearance(getColorSpec(visColorId), visName);
          entry.displayKey = nextDisplayKey;
        }

        const isLocal = p.id === localId;
        if (isLocal && !initializedLocalFromSnap) {
          localPosX = p.x;
          localFloorY = p.y ?? 0;
          localJumpY = 0;
          localPosZ = p.z;
          localYaw = p.yaw;
          initializedLocalFromSnap = true;
        }

        const isVotedEjectCutscene =
          snap.phase === 'ejecting' &&
          snap.ejection?.reason === 'voted' &&
          Boolean(snap.ejection.ejectedId);
        const ejectT = isVotedEjectCutscene ? Math.max(0, elapsed - ejectionStartAt) : 0;
        const isEjectedActor = isVotedEjectCutscene && p.id === snap.ejection?.ejectedId;

        const localAlive = localPlayer ? localPlayer.alive : true;
        const visible = isEjectedActor
          ? true
          : !p.inVent && (p.alive || isLocal || !localAlive);
        entry.rig.setVisibleState(Boolean(visible));
        entry.rig.setGhost(!p.alive && !isEjectedActor);
        const showVisualTaskGlow = Boolean(
          p.visualTaskTimer > 0 &&
            p.alive &&
            localPlayer &&
            (isLocal ||
              Math.hypot(p.x - localPosX, p.z - localPosZ) <= VISUAL_TASK_VISIBLE_RANGE),
        );
        entry.rig.setVisualScan(showVisualTaskGlow, elapsed);
        const showShield = Boolean(
          p.shielded &&
            p.alive &&
            (isLocal || localPlayer?.specialRole === 'kobiraj' || !localAlive),
        );
        entry.rig.setShielded(showShield, elapsed);
        const showBohurupiGlitch = Boolean(
          !isLocal &&
            p.disguiseColor &&
            p.alive &&
            Math.hypot(p.x - localPosX, p.z - localPosZ) <= BOHURUPI_GLITCH_RANGE,
        );
        entry.rig.setNameGlitch(showBohurupiGlitch, elapsed);

        if (isVotedEjectCutscene) {
          if (isEjectedActor) {
            if (ejectT < 1.4) {
              // Act 1: Crowd lifts & swings suspect at Pukur Ghat edge ("1... 2... 3... DHORO!")
              const windup = ejectT / 1.4;
              const swing = Math.sin(ejectT * 18) * (0.25 + windup * 0.45);
              entry.rig.root.position.set(
                -38.4 + swing * 0.4,
                0.65 + windup * 0.65 + Math.abs(Math.sin(ejectT * 14)) * 0.16,
                swing * 0.32,
              );
              entry.rig.root.rotation.set(0, -Math.PI / 2, swing * 0.55);
              entry.rig.animateWalk(0, 0, dt, elapsed, 0, 0.45, 2.0, 0);
            } else if (ejectT < 2.25) {
              // Act 2: High parabolic tumbling toss from stone bank into Pukur pond
              const u = (ejectT - 1.4) / 0.85;
              const px = THREE.MathUtils.lerp(-38.4, -45.8, u);
              const py = 1.3 + 5.4 * Math.sin(u * Math.PI) - 1.3 * u;
              entry.rig.root.position.set(px, py, Math.sin(u * Math.PI) * 0.45);
              entry.rig.root.rotation.x += dt * 9.5;
              entry.rig.root.rotation.z += dt * 6.8;
              entry.rig.animateWalk(0, 0, dt, elapsed, 0, 0.7, 1.0, 0);
            } else {
              // Act 3: Big splash & comical flailing/bobbing in Pukur water ("Porer Animation")
              const waterT = ejectT - 2.25;
              const bob = Math.sin(waterT * 4.2) * 0.14;
              entry.rig.root.position.set(
                -45.8 + Math.sin(waterT * 1.5) * 0.25,
                -0.32 + bob,
                Math.cos(waterT * 1.3) * 0.28,
              );
              entry.rig.root.rotation.set(
                0.35 + Math.sin(waterT * 3.4) * 0.2,
                -Math.PI / 2 + Math.sin(waterT * 1.6) * 0.35,
                0.28 + Math.cos(waterT * 2.8) * 0.16,
              );
              entry.rig.animateWalk(0, 0, dt, elapsed, 0, 0.18 + Math.abs(bob), 1.4, 0);
            }
          } else if (p.alive) {
            // Cheering, pointing & reacting Moholla crowd lined up on eastern Pukur bank
            const aliveCrowd = snap.players.filter(
              (pl) => pl.alive && pl.id !== snap.ejection?.ejectedId,
            );
            const cIdx = Math.max(0, aliveCrowd.findIndex((pl) => pl.id === p.id));
            const row = cIdx % 5;
            const col = Math.floor(cIdx / 5);
            const bankX = -37.1 + col * 1.35;
            const bankZ = -3.8 + row * 1.9 + (col % 2) * 0.7;
            const cheerFreq = ejectT > 2.25 ? 11.5 : 8.5;
            const hop = Math.abs(Math.sin(elapsed * cheerFreq + cIdx * 1.15)) * (ejectT > 2.25 ? 0.62 : 0.42);
            entry.rig.root.position.set(bankX, 0, bankZ);
            entry.rig.root.rotation.set(0, -Math.PI / 2 + Math.sin(elapsed * 4.5 + cIdx) * 0.18, 0);
            entry.rig.animateWalk(0, 0, dt, elapsed, 0, hop + 0.05, 1.8, 0);
          }
          entry.prevX = entry.rig.root.position.x;
          entry.prevZ = entry.rig.root.position.z;
          continue;
        }

        // Reset any cutscene tilt when back to normal gameplay
        entry.rig.root.rotation.x = 0;
        entry.rig.root.rotation.z = 0;

        if (isLocal) {
          entry.targetX = localPosX;
          entry.targetZ = localPosZ;
          entry.targetY = localFloorY;
          entry.targetYaw = localYaw;
          entry.rig.root.position.set(localPosX, localFloorY, localPosZ);
          entry.rig.root.rotation.y = localYaw;
        } else {
          entry.targetX = p.x;
          entry.targetZ = p.z;
          entry.targetY = p.y ?? 0;
          entry.targetYaw = p.yaw;
          entry.rig.root.position.x = THREE.MathUtils.damp(entry.rig.root.position.x, entry.targetX, 16, dt);
          entry.rig.root.position.y = THREE.MathUtils.damp(entry.rig.root.position.y, entry.targetY, 16, dt);
          entry.rig.root.position.z = THREE.MathUtils.damp(entry.rig.root.position.z, entry.targetZ, 16, dt);

          let diff = entry.targetYaw - entry.rig.root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          entry.rig.root.rotation.y += diff * Math.min(1, dt * 14);
        }

        const dx = entry.rig.root.position.x - entry.prevX;
        const dz = entry.rig.root.position.z - entry.prevZ;
        const dist = Math.hypot(dx, dz);
        const speed = dt > 0 ? dist / dt : 0;
        entry.rig.animateWalk(
          dist,
          speed,
          dt,
          elapsed,
          isLocal ? localTurnBank : 0,
          isLocal ? localJumpY : 0,
          isLocal ? localVelY : 0,
          isLocal ? landSquash : 0,
        );
        entry.prevX = entry.rig.root.position.x;
        entry.prevZ = entry.rig.root.position.z;
      }

      for (const [id, entry] of playerRigs.entries()) {
        if (!_activeIds.has(id)) {
          scene.remove(entry.rig.root);
          playerRigs.delete(id);
        }
      }

      _bodyIds.clear();
      for (const b of snap.bodies) {
        if (b.reported) continue;
        _bodyIds.add(b.id);
        if (!bodyMeshes.has(b.id)) {
          const mesh = createBodyMarkerMesh(getColorSpec(b.color), textures.contactShadowMap);
          mesh.position.set(b.x, 0, b.z);
          scene.add(mesh);
          bodyMeshes.set(b.id, mesh);
        }
      }
      for (const [id, mesh] of bodyMeshes.entries()) {
        if (!_bodyIds.has(id)) {
          scene.remove(mesh);
          bodyMeshes.delete(id);
        }
      }

      // Goyenda & Ghost Footprint Trail Pool
      const canSeeFootprints =
        snap.phase === 'playing' &&
        (localPlayer?.specialRole === 'goyenda' || !localPlayer?.alive);
      const nowWallMs = Date.now();
      const prints = canSeeFootprints ? snap.footprints : [];
      for (let i = 0; i < FOOTPRINT_POOL_SIZE; i++) {
        const slot = footprintPool[i];
        if (i < prints.length) {
          const fp = prints[prints.length - 1 - i];
          const remaining = Math.max(0, Math.min(1, (fp.expiresAt - nowWallMs) / 7500));
          if (remaining > 0.02) {
            slot.mesh.visible = true;
            slot.mesh.position.set(fp.x, 0.032, fp.z);
            slot.mat.color.set(getColorSpec(fp.color).hex);
            slot.mat.opacity = 0.72 * remaining;
          } else {
            slot.mesh.visible = false;
          }
        } else {
          slot.mesh.visible = false;
        }
      }
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      elapsed += dt;

      if (isMobileGpu && currentDpr > 1.01) {
        slowFrameCount += 1;
        slowFrameSum += rawDt;
        if (slowFrameCount >= 45) {
          const avgDt = slowFrameSum / slowFrameCount;
          slowFrameCount = 0;
          slowFrameSum = 0;
          if (avgDt > 0.028) {
            currentDpr = 1.0;
            renderer.setPixelRatio(1.0);
            const rw = container.clientWidth || window.innerWidth;
            const rh = container.clientHeight || window.innerHeight;
            renderer.setSize(rw, rh);
          }
        }
      }

      textures.waterMap.offset.y = (elapsed * 0.06) % 1;
      waterUniforms.uTime.value = elapsed;
      skyline.skyUniforms.uTime.value = elapsed;
      instancedGrass.grassUniforms.uTime.value = elapsed;
      fireflyUniforms.uTime.value = elapsed;

      // Gentle bobbing on Pukur wooden boat & Shapla lotuses + Shop & Landmark Animations
      pukurDetails.boat.position.y = 0.07 + Math.sin(elapsed * 1.8) * 0.025;
      pukurDetails.boat.rotation.z = Math.sin(elapsed * 1.4) * 0.035;
      pukurDetails.flowers.forEach((fl, idx) => {
        fl.position.y = 0.06 + Math.sin(elapsed * 2.1 + idx) * 0.015;
      });
      saloonProps.barberPole.rotation.y = elapsed * 2.4;
      chaStall.ceilingFan.rotation.y = elapsed * 7.5;
      saloonProps.ceilingFan.rotation.y = elapsed * 6.8;
      desco.exhaustFan.rotation.x = elapsed * 8.2;
      for (const acFan of roofAcFans) {
        acFan.rotation.z = elapsed * 9.6;
      }
      dishHub.serverLeds.forEach((led, idx) => {
        led.color.setHex((Math.floor(elapsed * 4 + idx) % 3 === 0) ? 0x38bdf8 : 0x22c55e);
      });
      const wooferPulse = 1 + Math.max(0, Math.sin(elapsed * 11.5)) * 0.14;
      for (const cone of biyerPandal.wooferCones) {
        cone.scale.set(wooferPulse, 1, wooferPulse);
      }
      // Animated Bangla Express Train along RAILWAY_TRACK_Z (86.5) + Dynamic Crossing Gates
      const TRAIN_CYCLE = 30.0;
      const TRAIN_PASS_SEC = 13.5;
      const cycleIdx = Math.floor(elapsed / TRAIN_CYCLE);
      const cycleT = elapsed - cycleIdx * TRAIN_CYCLE;
      const trainDir = cycleIdx % 2 === 0 ? 1 : -1;
      const isPassing = cycleT <= TRAIN_PASS_SEC;
      const isWarning = cycleT <= TRAIN_PASS_SEC + 1.8 || cycleT >= TRAIN_CYCLE - 4.2;
      const trainX = isPassing
        ? trainDir * (-132.0 + (cycleT / TRAIN_PASS_SEC) * 264.0)
        : trainDir * 140.0;

      banglaTrain.group.visible = isPassing;
      if (isPassing) {
        banglaTrain.group.position.set(trainX, 0.16, RAILWAY_TRACK_Z);
        banglaTrain.group.rotation.y = trainDir === 1 ? 0 : Math.PI;
        const wheelSpin = (elapsed * 19.5) / 0.36;
        for (const w of banglaTrain.wheels) {
          w.rotation.z = -wheelSpin;
        }
      }

      const targetBoomMag = isWarning ? 0.04 : 0.72;
      for (const b of railGate.boomArms) {
        b.arm.rotation.z = THREE.MathUtils.damp(b.arm.rotation.z, b.side * targetBoomMag, 7, dt);
      }

      const railPhase = Math.sin(elapsed * (isWarning ? 9.5 : 3.2)) > 0;
      railGate.beaconMats[0].emissiveIntensity = isWarning ? (railPhase ? 2.4 : 0.12) : 0.35;
      railGate.beaconMats[1].emissiveIntensity = isWarning ? (railPhase ? 0.12 : 2.4) : 0.12;

      const curPhase = phaseRef.current;
      if (isPassing && Math.abs(trainX) < 92 && lastHornCycle !== cycleIdx) {
        lastHornCycle = cycleIdx;
        if (curPhase === 'playing' || curPhase === 'lobby') {
          const distToTrain = Math.hypot(localPosX - trainX, localPosZ - RAILWAY_TRACK_Z);
          if (distToTrain < 95) {
            soundEngine.playTrainHorn(Math.max(0.25, 1 - distToTrain / 110));
          }
        }
      }
      if (curPhase !== lastObservedPhase) {
        if (curPhase === 'ejecting') {
          ejectionStartAt = elapsed;
          ejectionSplashFired = false;
        }
        lastObservedPhase = curPhase;
      }
      const snap = snapshotRef.current;

      const showTitleActors = curPhase === 'title';
      for (const actor of titleShowActors) {
        actor.rig.setVisibleState(showTitleActors);
        if (showTitleActors) {
          const wp = BOT_WAYPOINTS[actor.wpIdx];
          const dx = wp.x - actor.x;
          const dz = wp.z - actor.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.7) {
            actor.wpIdx = (actor.wpIdx + 3) % BOT_WAYPOINTS.length;
          } else {
            const step = Math.min(dist, 2.8 * dt);
            actor.x += (dx / dist) * step;
            actor.z += (dz / dist) * step;
            actor.yaw = Math.atan2(dx, dz);
            actor.rig.root.position.set(actor.x, 0, actor.z);
            actor.rig.root.rotation.y = actor.yaw;
            actor.rig.animateWalk(step, 2.8, dt, elapsed);
          }
        }
      }

      if (curPhase === 'title') {
        initializedLocalFromSnap = false;
        for (const [id, entry] of playerRigs.entries()) {
          scene.remove(entry.rig.root);
          playerRigs.delete(id);
        }
        for (const [id, mesh] of bodyMeshes.entries()) {
          scene.remove(mesh);
          bodyMeshes.delete(id);
        }
        for (const slot of footprintPool) {
          slot.mesh.visible = false;
        }
        for (const s of shutterMeshes.values()) {
          s.mesh.position.y = s.openY;
        }

        for (const br of buildingRoofGroups) {
          br.roofGroup.visible = true;
        }
        const orbitAngle = elapsed * 0.14;
        camera.position.set(
          Math.sin(orbitAngle) * 35,
          17.5 + Math.sin(elapsed * 0.35) * 1.8,
          Math.cos(orbitAngle) * 35,
        );
        camera.lookAt(0, 1.5, 0);
        hemiLight.intensity = isMobileGpu ? 0.54 : 0.45;
        keyLight.intensity = 1.18;
        lanternLight.intensity = 0;
        if (lampConesInst) lampConesInst.visible = true;

        keyLight.target.position.set(0, 0, 0);
        keyLight.position.set(34, 48, 28);
        keyLight.target.updateMatrixWorld();
        if (keyLight.shadow.camera.right !== titleShadowSpan) {
          keyLight.shadow.camera.left = -titleShadowSpan;
          keyLight.shadow.camera.right = titleShadowSpan;
          keyLight.shadow.camera.top = titleShadowSpan;
          keyLight.shadow.camera.bottom = -titleShadowSpan;
          keyLight.shadow.camera.updateProjectionMatrix();
        }
      } else if (snap) {
        if ((isModalOpenRef.current || !canOrbitNow()) && document.pointerLockElement === canvas) {
          try {
            document.exitPointerLock?.();
          } catch {
            // ignore
          }
        }

        const localPlayer = snap.players.find((p) => p.id === localPlayerIdRef.current);
        if (
          localPlayer &&
          (curPhase === 'meeting' ||
            curPhase === 'vote_results' ||
            curPhase === 'ejecting' ||
            curPhase === 'role_reveal')
        ) {
          localPosX = localPlayer.x;
          localFloorY = localPlayer.y ?? 0;
          localJumpY = 0;
          localPosZ = localPlayer.z;
          localYaw = localPlayer.yaw;
        }

        // Security camera active red LED blink + sweep
        const anyoneWatchingCams =
          snap.sabotage.active !== 'wifi_down' && snap.players.some((p) => p.alive && p.watchingCams);
        const blinkOn = Math.sin(elapsed * 7) > 0;
        for (const cam of securityCams) {
          cam.head.rotation.y = cam.baseRotY + Math.sin(elapsed * 0.7) * 0.35;
          cam.ledMat.emissiveIntensity = anyoneWatchingCams && blinkOn ? 2.2 : 0.05;
        }

        // Animate Rolling Shutter Doors smoothly
        for (const [zoneId, entry] of shutterMeshes.entries()) {
          const isLocked = snap.doorLocks[zoneId] > 0;
          const targetY = isLocked ? 0 : entry.openY;
          entry.mesh.position.y = THREE.MathUtils.damp(entry.mesh.position.y, targetY, 14, dt);
        }

        // Camera Keyboard Orbit + Smooth Spherical Damping
        if (canOrbitNow()) {
          if (keysPressed.has('BracketLeft')) targetCamYaw += 2.1 * dt;
          if (keysPressed.has('BracketRight')) targetCamYaw -= 2.1 * dt;
          if (keysPressed.has('PageUp') || keysPressed.has('Equal')) {
            targetCamPitch = Math.max(-0.45, targetCamPitch - 1.5 * dt);
          }
          if (keysPressed.has('PageDown') || keysPressed.has('Minus')) {
            targetCamPitch = Math.min(1.38, targetCamPitch + 1.5 * dt);
          }
        }
        const rotSmooth = 1 - Math.exp(-16 * dt);
        camYaw += (targetCamYaw - camYaw) * rotSmooth;
        camPitch += (targetCamPitch - camPitch) * rotSmooth;
        camDist += (targetCamDist - camDist) * rotSmooth;

        if (
          onCompassYawChangeRef.current &&
          now - lastCompassSendAt >= 65 &&
          (Number.isNaN(lastSentCompassYaw) || Math.abs(lastSentCompassYaw - camYaw) > 0.012)
        ) {
          lastCompassSendAt = now;
          lastSentCompassYaw = camYaw;
          onCompassYawChangeRef.current(camYaw);
        }

        // Movement: Smoothed Momentum WASD + Joystick + Shift Sprint + 2-Substep Wall & Rooftop Stair Sliding
        let isSprinting = false;
        localTurnBank = THREE.MathUtils.damp(localTurnBank, 0, 14, dt);

        if (
          (curPhase === 'playing' || curPhase === 'lobby') &&
          localPlayer &&
          !localPlayer.inVent &&
          !isModalOpenRef.current
        ) {
          let moveForward = 0;
          let moveRight = 0;
          if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) moveForward += 1;
          if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) moveForward -= 1;
          if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) moveRight += 1;
          if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) moveRight -= 1;

          const joy = joystickInputRef.current;
          const joyMag = Math.hypot(joy.x, joy.y);
          if (Math.abs(joy.x) > 0.08 || Math.abs(joy.y) > 0.08) {
            moveRight += joy.x;
            moveForward += -joy.y;
          }

          const len = Math.hypot(moveForward, moveRight);
          isSprinting =
            len > 0.1 &&
            localPlayer.alive &&
            (keysPressed.has('ShiftLeft') || keysPressed.has('ShiftRight') || joyMag >= 0.85);

          let targetVx = 0;
          let targetVz = 0;
          if (len > 0.05) {
            const nf = moveForward / Math.max(1, len);
            const nr = moveRight / Math.max(1, len);
            const sinY = Math.sin(camYaw);
            const cosY = Math.cos(camYaw);
            const dirX = -sinY * nf + cosY * nr;
            const dirZ = -cosY * nf - sinY * nr;

            const spd =
              moveSpeedRef.current * (localPlayer.alive ? (isSprinting ? 1.24 : 1.0) : 1.25);
            targetVx = dirX * spd;
            targetVz = dirZ * spd;
          }

          const velLerp = 1 - Math.exp(-(len > 0.05 ? 16 : 20) * dt);
          localVelX += (targetVx - localVelX) * velLerp;
          localVelZ += (targetVz - localVelZ) * velLerp;

          const curSpd = Math.hypot(localVelX, localVelZ);
          if (curSpd > 0.08) {
            let nextX = localPosX;
            let nextZ = localPosZ;
            let nextFloorY = localFloorY;
            const subDt = dt * 0.5;
            for (let sub = 0; sub < 2; sub++) {
              if (localPlayer.alive) {
                const res = resolvePlayerMoveWithElevation(
                  nextX,
                  nextZ,
                  nextFloorY,
                  nextX + localVelX * subDt,
                  nextZ + localVelZ * subDt,
                  PLAYER_RADIUS,
                  WALLS,
                  snap.doorLocks,
                );
                nextX = res.x;
                nextZ = res.z;
                nextFloorY = res.y;
              } else {
                nextX = Math.max(-MAP_HALF_SIZE + 1, Math.min(MAP_HALF_SIZE - 1, nextX + localVelX * subDt));
                nextZ = Math.max(-MAP_HALF_SIZE + 1, Math.min(MAP_HALF_SIZE - 1, nextZ + localVelZ * subDt));
                nextFloorY = 0;
              }
            }

            const stepDist = Math.hypot(nextX - localPosX, nextZ - localPosZ);
            localPosX = nextX;
            localPosZ = nextZ;
            localFloorY = nextFloorY;

            if (len > 0.05) {
              const targetYaw = Math.atan2(targetVx, targetVz);
              let yawDiff = targetYaw - localYaw;
              while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
              while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
              localYaw += yawDiff * Math.min(1, dt * 16);
              localTurnBank = THREE.MathUtils.clamp(yawDiff * 0.28, -0.16, 0.16);
            }

            if (localPlayer.alive && stepDist > 0.001 && localJumpY <= 0.04) {
              footstepAccum += stepDist;
              if (footstepAccum > (isSprinting ? 1.5 : 1.65)) {
                footstepAccum = 0;
                soundEngine.playFootstep();
              }
            }

            if (now - lastNetSendAt > 45) {
              lastNetSendAt = now;
              onLocalMoveRef.current(localPosX, localPosZ, localVelX, localVelZ, localYaw, localFloorY);
            }
          } else {
            localVelX = 0;
            localVelZ = 0;
            if (now - lastNetSendAt > 120 && (Math.abs(localPlayer.vx) > 0.1 || Math.abs(localPlayer.vz) > 0.1)) {
              lastNetSendAt = now;
              onLocalMoveRef.current(localPosX, localPosZ, 0, 0, localYaw, localFloorY);
            }
          }
        } else {
          localVelX = 0;
          localVelZ = 0;
        }

        // Safe Non-Lethal Lateral Push if player stands on active tracks while Bangla Express passes
        if (
          isPassing &&
          (curPhase === 'playing' || curPhase === 'lobby') &&
          localPlayer?.alive &&
          localFloorY < 1.5 &&
          Math.abs(localPosX - trainX) < 22.0 &&
          Math.abs(localPosZ - RAILWAY_TRACK_Z) < 2.2
        ) {
          localPosZ = localPosZ < RAILWAY_TRACK_Z ? RAILWAY_TRACK_Z - 2.35 : RAILWAY_TRACK_Z + 2.35;
          trauma = Math.min(1, trauma + 0.35);
          onLocalMoveRef.current(localPosX, localPosZ, 0, 0, localYaw, localFloorY);
        }

        // Toggle ONLY the roof of the single building the local player is standing inside on ground floor
        for (const br of buildingRoofGroups) {
          const insideGround =
            localFloorY < 1.5 &&
            localPosX > br.minX + 0.3 &&
            localPosX < br.maxX - 0.3 &&
            localPosZ > br.minZ + 0.3 &&
            localPosZ < br.maxZ - 0.3;
          br.roofGroup.visible = !insideGround;
        }

        // Vertical Jump & Landing Squash Kinematics (relative to walkable floor/stair/roof elevation)
        landSquash = Math.max(0, landSquash - dt * 4.5);
        if (localJumpY > 0 || localVelY > 0) {
          localJumpY += localVelY * dt;
          localVelY -= 22.0 * dt;
          if (localJumpY <= 0) {
            if (localVelY < -2.2) {
              landSquash = 0.85;
              soundEngine.playLand();
            }
            localJumpY = 0;
            localVelY = 0;
          }
        }

        const baseFov = camera.aspect < 1 ? 62 : 54;
        const targetFov =
          baseFov + (isSprinting && Math.hypot(localVelX, localVelZ) > 1.2 ? 3.5 : 0);
        if (Math.abs(camera.fov - targetFov) > 0.04) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 10, dt);
          camera.updateProjectionMatrix();
        }

        syncActorsFromSnapshot(snap, dt);

        _completedTaskIds.clear();
        _assignedTaskIds.clear();
        if (localPlayer?.tasks) {
          for (const t of localPlayer.tasks) {
            _assignedTaskIds.add(t.taskId);
            if (t.completed) _completedTaskIds.add(t.taskId);
          }
        }
        for (const [taskId, ring] of taskBeacons.entries()) {
          const isRelevant =
            localPlayer?.role === 'parabasi' &&
            _assignedTaskIds.has(taskId) &&
            !_completedTaskIds.has(taskId);
          ring.visible = Boolean(isRelevant && curPhase === 'playing');
          if (ring.visible) {
            const s = 1 + Math.sin(elapsed * 4) * 0.1;
            ring.scale.set(s, s, 1);
          }
        }

        const isLoadshedding = snap.sabotage.active === 'loadshedding';
        const crewBlinded =
          isLoadshedding && Boolean(localPlayer && localPlayer.alive && localPlayer.role !== 'vondo');
        const targetHemi = isLoadshedding ? (crewBlinded ? 0.06 : 0.28) : isMobileGpu ? 0.54 : 0.45;
        const targetKey = isLoadshedding ? (crewBlinded ? 0.1 : 0.72) : 1.18;
        const targetLamp = isLoadshedding ? 0.08 : 1.15;
        const targetLantern = isLoadshedding ? (crewBlinded ? 1.45 : 2.15) : 0.0;
        const targetFogDensity = isLoadshedding ? (crewBlinded ? 0.068 : 0.0075) : 0.0038;

        hemiLight.intensity = THREE.MathUtils.damp(hemiLight.intensity, targetHemi, 5, dt);
        keyLight.intensity = THREE.MathUtils.damp(keyLight.intensity, targetKey, 5, dt);
        lanternLight.intensity = THREE.MathUtils.damp(lanternLight.intensity, targetLantern, 6, dt);
        lanternLight.distance = crewBlinded ? 9.5 : 20;
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.density = THREE.MathUtils.damp(scene.fog.density, targetFogDensity, 5, dt);
        }
        const isLampPranked = !isLoadshedding && (snap.prankedLampUntil ?? 0) > Date.now();
        const prankFlicker = isLampPranked
          ? Math.sin(elapsed * 34) * Math.cos(elapsed * 21) > -0.15
            ? 1.0
            : 0.14
          : 1.0;
        glowPoolMat.opacity = isLoadshedding ? 0.015 : lampNormalPoolOpacity * prankFlicker;
        for (const tm of shopTubeMats) tm.emissiveIntensity = isLoadshedding ? 0.05 : 1.7;
        for (const pm of shopPoolMats) pm.opacity = isLoadshedding ? 0.008 : 0.052;
        garlands.group.visible = !isLoadshedding;
        if (lampConesInst) lampConesInst.visible = !isLoadshedding && (!isLampPranked || prankFlicker > 0.5);
        for (const lb of lampBulbs) {
          lb.intensity = THREE.MathUtils.damp(lb.intensity, targetLamp * prankFlicker, 12, dt);
        }

        lanternLight.position.set(localPosX, localFloorY + 2.9, localPosZ);

        // Dynamic Texel-Snapped Tight Shadow Frustum around local player for ultra-crisp shadows
        const sx = Math.round(localPosX);
        const sz = Math.round(localPosZ);
        keyLight.target.position.set(sx, localFloorY, sz);
        keyLight.position.set(sx + 24, localFloorY + 38, sz + 20);
        keyLight.target.updateMatrixWorld();
        if (keyLight.shadow.camera.right !== playShadowSpan) {
          keyLight.shadow.camera.left = -playShadowSpan;
          keyLight.shadow.camera.right = playShadowSpan;
          keyLight.shadow.camera.top = playShadowSpan;
          keyLight.shadow.camera.bottom = -playShadowSpan;
          keyLight.shadow.camera.updateProjectionMatrix();
        }

        if (snap.sabotage.active === 'gas_leak') {
          const ss = 1 + Math.sin(elapsed * 8) * 0.16;
          sabotageBeacon.visible = true;
          sabotageBeacon.position.set(GAS_LEAK_VALVES[0].x, 0.18, GAS_LEAK_VALVES[0].z);
          sabotageBeacon.scale.set(ss, ss, 1);
          sabotageBeacon2.visible = true;
          sabotageBeacon2.position.set(GAS_LEAK_VALVES[1].x, 0.18, GAS_LEAK_VALVES[1].z);
          sabotageBeacon2.scale.set(ss, ss, 1);
        } else if (snap.sabotage.active) {
          sabotageBeacon.visible = true;
          sabotageBeacon.position.set(snap.sabotage.fixStationX, 0.18, snap.sabotage.fixStationZ);
          const ss = 1 + Math.sin(elapsed * 7) * 0.15;
          sabotageBeacon.scale.set(ss, ss, 1);
          sabotageBeacon2.visible = false;
        } else {
          sabotageBeacon.visible = false;
          sabotageBeacon2.visible = false;
        }

        const inPukurCutscene =
          curPhase === 'ejecting' &&
          snap.ejection?.reason === 'voted' &&
          Boolean(snap.ejection.ejectedId);

        if (inPukurCutscene) {
          const ejectT = Math.max(0, elapsed - ejectionStartAt);
          if (ejectT >= 2.25) {
            if (!ejectionSplashFired) {
              ejectionSplashFired = true;
              trauma = Math.min(1, trauma + 0.62);
            }
            const spT = Math.min(2.2, ejectT - 2.25);
            const ringScale = 0.9 + spT * 4.2;
            splashRing.visible = spT < 2.0;
            splashRing.scale.set(ringScale, ringScale, 1);
            splashRingMat.opacity = Math.max(0, 0.94 * (1 - spT / 2.0));

            const showDrops = spT < 1.55;
            splashDropletMat.opacity = Math.max(0, 0.95 * (1 - spT / 1.55));
            for (const d of splashDroplets) {
              d.mesh.visible = showDrops;
              if (showDrops) {
                const du = spT / 1.55;
                d.mesh.position.set(
                  -45.8 + Math.cos(d.angle) * d.speed * du * 2.6,
                  0.14 + 4.4 * d.peak * du * (1 - du),
                  Math.sin(d.angle) * d.speed * du * 2.6,
                );
              }
            }
          } else {
            splashRing.visible = false;
            for (const d of splashDroplets) d.mesh.visible = false;
          }

          // Dramatic cinematic camera: first frames crowd & bank throw, then pans closer onto pond bobbing!
          const panMix = THREE.MathUtils.clamp((ejectT - 2.2) / 1.8, 0, 1);
          _desiredCamPos.set(
            THREE.MathUtils.lerp(-31.2, -35.0, panMix),
            THREE.MathUtils.lerp(6.2, 4.7, panMix),
            THREE.MathUtils.lerp(9.8, 8.2, panMix),
          );
          _desiredLook.set(
            THREE.MathUtils.lerp(-41.8, -44.8, panMix),
            THREE.MathUtils.lerp(1.35, 0.75, panMix),
            0,
          );
          camera.position.lerp(_desiredCamPos, Math.min(1, dt * 6));
          camera.lookAt(_desiredLook);
        } else {
          splashRing.visible = false;
          for (const d of splashDroplets) d.mesh.visible = false;

          const horizDist = camDist * Math.cos(camPitch);
          const skyLift = camPitch < 0.08 ? (0.08 - camPitch) * 9.5 : 0;
          const playerCamY = localFloorY + localJumpY * 0.42;
          _desiredLook.set(localPosX, 1.32 + playerCamY + skyLift, localPosZ);
          _desiredCamPos.set(
            localPosX + Math.sin(camYaw) * horizDist,
            1.32 + playerCamY + camDist * Math.sin(camPitch),
            localPosZ + Math.cos(camYaw) * horizDist,
          );

          _rayOrigin.set(localPosX, 1.32 + playerCamY, localPosZ);
          _rayDir.subVectors(_desiredCamPos, _rayOrigin);
          const maxCamDist = _rayDir.length();
          _rayDir.normalize();
          _raycaster.set(_rayOrigin, _rayDir);
          _raycaster.far = maxCamDist;
          const hits = _raycaster.intersectObjects(wallMeshes, false);
          if (hits.length > 0 && hits[0].distance < maxCamDist) {
            const pullDist = Math.max(2.2, hits[0].distance - 0.45);
            _desiredCamPos.copy(_rayOrigin).addScaledVector(_rayDir, pullDist);
          }
          _desiredCamPos.y = Math.max(0.45, _desiredCamPos.y);

          const camSmooth = 1 - Math.exp(-14 * dt);
          camera.position.lerp(_desiredCamPos, camSmooth);
          camera.lookAt(_desiredLook);
        }

        if (trauma > 0) {
          const shake = trauma * trauma * 0.16;
          camera.rotation.z += (Math.random() * 2 - 1) * shake;
          camera.rotation.x += (Math.random() * 2 - 1) * shake * 0.6;
          trauma = Math.max(0, trauma - dt * 1.8);
        }
      }

      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      if (document.pointerLockElement === canvas) {
        try {
          document.exitPointerLock?.();
        } catch {
          // ignore
        }
      }
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', onPointerLockError);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
      document.removeEventListener('webkitfullscreenchange', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      delete (window as unknown as Record<string, unknown>).__KE_BATPAR_STATS__;
      footprintGeo.dispose();
      for (const slot of footprintPool) slot.mat.dispose();
      splashRingGeo.dispose();
      splashRingMat.dispose();
      splashDropletGeo.dispose();
      splashDropletMat.dispose();
      dashUnitGeo.dispose();
      borderCurbGeo.dispose();
      unitBoxGeo.dispose();
      poolGeo.dispose();
      fireflyGeo.dispose();
      fireflyMat.dispose();
      composer?.dispose();
      roadNormNS.dispose();
      roadRoughNS.dispose();
      roadNormEW.dispose();
      roadRoughEW.dispose();
      textures.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="world-canvas-container"
      className="fixed inset-0 w-full h-full overflow-hidden bg-[#0b1220]"
    />
  );
}
