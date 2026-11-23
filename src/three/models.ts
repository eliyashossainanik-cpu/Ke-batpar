import * as THREE from 'three';
import type { DoorSpec, PlayerColorSpec } from '../shared/types';
import { RAILWAY_TRACK_Z } from '../shared/mapData';
import type { ProceduralTextureSet } from './proceduralTextures';
import { optimizeStaticGroup } from './geometryBatch';

export interface CharacterRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  visorMesh: THREE.Mesh;
  nameSprite: THREE.Sprite;
  shadowMesh: THREE.Mesh;
  scanAura: THREE.Mesh;
  shieldAura: THREE.Mesh;
  suitMaterials: THREE.MeshStandardMaterial[];
  setGhost: (isGhost: boolean) => void;
  setVisibleState: (visible: boolean) => void;
  setVisualScan: (active: boolean, elapsed: number) => void;
  setShielded: (active: boolean, elapsed: number) => void;
  setNameGlitch: (glitched: boolean, elapsed: number) => void;
  setAppearance: (colorSpec: PlayerColorSpec, displayName: string) => void;
  animateWalk: (
    distanceDelta: number,
    speed: number,
    dt: number,
    elapsed: number,
    turnBank?: number,
    jumpY?: number,
    jumpVelY?: number,
    landSquash?: number,
  ) => void;
}

function drawNameTagCanvas(
  canvas: HTMLCanvasElement,
  name: string,
  accentHex: string,
): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(10, 15, 25, 0.82)';
  ctx.beginPath();
  ctx.roundRect(16, 10, 224, 42, 10);
  ctx.fill();

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 14), 128, 32);
}

function createNameTagSprite(name: string, accentHex: string): {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  drawNameTagCanvas(canvas, name, accentHex);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.85, 0.46, 1);
  sprite.position.set(0, 2.34, 0);
  sprite.renderOrder = 20;
  return { sprite, canvas, tex };
}

const _charSharedGeo = {
  leg: new THREE.CapsuleGeometry(0.155, 0.22, 8, 14),
  foot: new THREE.CapsuleGeometry(0.11, 0.16, 8, 12),
  torso: new THREE.CapsuleGeometry(0.45, 0.54, 12, 24),
  arm: new THREE.CapsuleGeometry(0.11, 0.18, 8, 12),
  belt: new THREE.TorusGeometry(0.43, 0.055, 10, 24),
  visor: new THREE.CapsuleGeometry(0.23, 0.34, 10, 18),
  sparkle: new THREE.SphereGeometry(0.05, 8, 8),
  sparkleTiny: new THREE.SphereGeometry(0.026, 6, 6),
  cheek: new THREE.SphereGeometry(0.065, 8, 8),
  packBody: new THREE.CylinderGeometry(0.24, 0.24, 0.5, 14),
  packLid: new THREE.CylinderGeometry(0.26, 0.26, 0.08, 14),
  packStrap: new THREE.TorusGeometry(0.14, 0.025, 6, 12, Math.PI),
  scanAura: new THREE.CylinderGeometry(0.76, 0.76, 0.14, 24, 1, true),
  shieldAura: new THREE.TorusGeometry(0.84, 0.055, 8, 24),
  shadowDisc: new THREE.CircleGeometry(0.68, 18),
};

const _charTrimMat = new THREE.MeshStandardMaterial({
  color: '#fbbf24',
  roughness: 0.22,
  metalness: 0.68,
});
const _charShoeMat = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.36,
  metalness: 0.2,
});
const _charTiffinMat = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  roughness: 0.34,
  metalness: 0.72,
});
const _charSparkleMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const _charBlushMat = new THREE.MeshBasicMaterial({ color: '#fb7185', transparent: true, opacity: 0.75 });

export function createCharacterRig(
  colorSpec: PlayerColorSpec,
  displayName: string,
  contactShadowMap: THREE.CanvasTexture,
  isSoftwareGl: boolean,
): CharacterRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const suitMat = new THREE.MeshStandardMaterial({
    color: colorSpec.hex,
    roughness: 0.34,
    metalness: 0.08,
  });

  const trimMat = _charTrimMat;
  const shoeMat = _charShoeMat;
  const tiffinMat = _charTiffinMat;

  const visorMat = new THREE.MeshStandardMaterial({
    color: colorSpec.visorTint,
    roughness: 0.08,
    metalness: 0.24,
    emissive: colorSpec.visorTint,
    emissiveIntensity: 0.12,
  });

  const suitMaterials = [suitMat];

  // Articulated Chibi Legs & Rounded Shoes
  const legGeo = _charSharedGeo.leg;
  const footGeo = _charSharedGeo.foot;

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.21, 0.5, 0);
  const leftLegMesh = new THREE.Mesh(legGeo, suitMat);
  leftLegMesh.position.y = -0.17;
  leftLegMesh.castShadow = !isSoftwareGl;
  const leftFoot = new THREE.Mesh(footGeo, shoeMat);
  leftFoot.rotation.x = Math.PI / 2;
  leftFoot.position.set(0, -0.43, 0.08);
  leftLeg.add(leftLegMesh, leftFoot);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.21, 0.5, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, suitMat);
  rightLegMesh.position.y = -0.17;
  rightLegMesh.castShadow = !isSoftwareGl;
  const rightFoot = new THREE.Mesh(footGeo, shoeMat);
  rightFoot.rotation.x = Math.PI / 2;
  rightFoot.position.set(0, -0.43, 0.08);
  rightLeg.add(rightLegMesh, rightFoot);

  bodyGroup.add(leftLeg, rightLeg);

  // Hi-Poly Plump Chibi Bean Torso
  const torsoMesh = new THREE.Mesh(_charSharedGeo.torso, suitMat);
  torsoMesh.position.y = 1.05;
  torsoMesh.castShadow = !isSoftwareGl;
  torsoMesh.receiveShadow = true;
  bodyGroup.add(torsoMesh);

  // Cute Swinging Arms
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.48, 1.08, 0.04);
  const leftArmMesh = new THREE.Mesh(_charSharedGeo.arm, suitMat);
  leftArmMesh.position.y = -0.1;
  leftArmMesh.rotation.z = 0.28;
  leftArm.add(leftArmMesh);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.48, 1.08, 0.04);
  const rightArmMesh = new THREE.Mesh(_charSharedGeo.arm, suitMat);
  rightArmMesh.position.y = -0.1;
  rightArmMesh.rotation.z = -0.28;
  rightArm.add(rightArmMesh);
  bodyGroup.add(leftArm, rightArm);

  // Deshi Waist Ring
  const beltMesh = new THREE.Mesh(_charSharedGeo.belt, trimMat);
  beltMesh.rotation.x = Math.PI / 2;
  beltMesh.position.y = 0.72;
  bodyGroup.add(beltMesh);

  // Hi-Poly Glossy Visor + Specular Sparkle + Rosy Cheeks
  const visorMesh = new THREE.Mesh(_charSharedGeo.visor, visorMat);
  visorMesh.rotation.z = Math.PI / 2;
  visorMesh.scale.set(0.86, 1.0, 0.65);
  visorMesh.position.set(0, 1.32, 0.34);
  bodyGroup.add(visorMesh);

  const sparkle = new THREE.Mesh(_charSharedGeo.sparkle, _charSparkleMat);
  sparkle.scale.set(1.6, 0.85, 0.6);
  sparkle.position.set(0.16, 1.39, 0.51);
  const sparkleTiny = new THREE.Mesh(_charSharedGeo.sparkleTiny, _charSparkleMat);
  sparkleTiny.position.set(0.05, 1.41, 0.52);
  bodyGroup.add(sparkle, sparkleTiny);

  const cheekL = new THREE.Mesh(_charSharedGeo.cheek, _charBlushMat);
  cheekL.scale.set(1.3, 0.75, 0.5);
  cheekL.position.set(-0.27, 1.12, 0.38);
  const cheekR = cheekL.clone();
  cheekR.position.x = 0.27;
  bodyGroup.add(cheekL, cheekR);

  // Steel Tiffin-Carrier Backpack
  const packGroup = new THREE.Group();
  packGroup.position.set(0, 1.04, -0.4);
  const packBody = new THREE.Mesh(_charSharedGeo.packBody, tiffinMat);
  const packLid = new THREE.Mesh(_charSharedGeo.packLid, trimMat);
  packLid.position.y = 0.27;
  const packStrap = new THREE.Mesh(_charSharedGeo.packStrap, shoeMat);
  packStrap.position.y = 0.31;
  packGroup.add(packBody, packLid, packStrap);
  bodyGroup.add(packGroup);

  // Signature Cute Deshi Hats & Sprouts
  if (colorSpec.id === 'lal' || colorSpec.id === 'shobuj' || colorSpec.id === 'sada') {
    const tupiMat = new THREE.MeshStandardMaterial({ color: '#e5d8b8', roughness: 0.78 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.31, 0.17, 22), tupiMat);
    cap.position.y = 1.7;
    const capBand = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 8, 22), trimMat);
    capBand.rotation.x = Math.PI / 2;
    capBand.position.y = 1.63;
    bodyGroup.add(cap, capBand);
  } else if (colorSpec.id === 'holud' || colorSpec.id === 'komola') {
    const stemMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#4ade80', roughness: 0.4 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.24, 10), stemMat);
    stem.position.y = 1.73;
    const leafL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), leafMat);
    leafL.scale.set(1.45, 0.38, 0.75);
    leafL.position.set(-0.1, 1.84, 0);
    leafL.rotation.z = 0.28;
    const leafR = leafL.clone();
    leafR.position.x = 0.1;
    leafR.rotation.z = -0.28;
    bodyGroup.add(stem, leafL, leafR);
  } else if (colorSpec.id === 'beguni') {
    const flowerMat = new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.35 });
    const flowerCenter = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), trimMat);
    flowerCenter.position.set(0.26, 1.66, 0.12);
    bodyGroup.add(flowerCenter);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), flowerMat);
      petal.position.set(0.26 + Math.cos(a) * 0.08, 1.66 + Math.sin(a) * 0.08, 0.12);
      bodyGroup.add(petal);
    }
  } else {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 10, 24), trimMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.56;
    const gem = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 12),
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 0.6,
      }),
    );
    gem.position.set(0, 1.58, 0.36);
    bodyGroup.add(band, gem);
  }

  // Visual Task Med-Scan Aura
  const scanAura = new THREE.Mesh(
    _charSharedGeo.scanAura,
    new THREE.MeshBasicMaterial({
      color: '#34d399',
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  scanAura.visible = false;
  root.add(scanAura);

  // Translucent Spectral Ghost Tail (visible only when player becomes a Ghost)
  const ghostTailMat = new THREE.MeshBasicMaterial({
    color: '#bae6fd',
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ghostTail = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.72, 16, 1, true), ghostTailMat);
  ghostTail.rotation.x = Math.PI;
  ghostTail.position.y = 0.42;
  ghostTail.visible = false;
  bodyGroup.add(ghostTail);

  // Kobiraj Tabiz Shield Aura
  const shieldAura = new THREE.Mesh(
    _charSharedGeo.shieldAura,
    new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  shieldAura.rotation.x = Math.PI / 2;
  shieldAura.position.y = 0.88;
  shieldAura.visible = false;
  root.add(shieldAura);

  // Contact shadow disc
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(_charSharedGeo.shadowDisc, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.018;
  root.add(shadowMesh);

  const nameTag = createNameTagSprite(displayName, colorSpec.hex);
  const nameSprite = nameTag.sprite;
  root.add(nameSprite);

  let walkPhase = 0;
  let ghostMode = false;

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    visorMesh,
    nameSprite,
    shadowMesh,
    scanAura,
    shieldAura,
    suitMaterials,
    setGhost: (isGhost: boolean) => {
      ghostMode = isGhost;
      for (const m of suitMaterials) {
        m.transparent = isGhost;
        m.opacity = isGhost ? 0.34 : 1.0;
        m.emissive.set(isGhost ? '#7dd3fc' : '#000000');
        m.emissiveIntensity = isGhost ? 0.28 : 0;
        m.depthWrite = !isGhost;
      }
      visorMat.transparent = isGhost;
      visorMat.opacity = isGhost ? 0.46 : 1.0;
      (nameSprite.material as THREE.SpriteMaterial).opacity = isGhost ? 0.6 : 1.0;

      leftLeg.visible = !isGhost;
      rightLeg.visible = !isGhost;
      beltMesh.visible = !isGhost;
      packGroup.visible = !isGhost;
      ghostTail.visible = isGhost;
      shadowMesh.visible = !isGhost;

      torsoMesh.castShadow = !isGhost && !isSoftwareGl;
      leftLegMesh.castShadow = !isGhost && !isSoftwareGl;
      rightLegMesh.castShadow = !isGhost && !isSoftwareGl;
    },
    setVisibleState: (visible: boolean) => {
      root.visible = visible;
    },
    setVisualScan: (active: boolean, elapsed: number) => {
      scanAura.visible = active;
      if (active) {
        scanAura.position.y = 0.9 + Math.sin(elapsed * 5) * 0.7;
      }
    },
    setShielded: (active: boolean, elapsed: number) => {
      shieldAura.visible = active;
      if (active) {
        shieldAura.position.y = 0.85 + Math.sin(elapsed * 3.5) * 0.14;
        shieldAura.rotation.z = elapsed * 2.2;
      }
    },
    setNameGlitch: (glitched: boolean, elapsed: number) => {
      const mat = nameSprite.material as THREE.SpriteMaterial;
      if (!glitched) {
        nameSprite.position.x = 0;
        mat.color.setHex(0xffffff);
        return;
      }
      // Subtle <=4m Bohurupi shimmer: brief micro-jitter and tint flicker
      const burst = Math.sin(elapsed * 9.5) > 0.35;
      nameSprite.position.x = burst ? Math.sin(elapsed * 52) * 0.09 : 0;
      mat.color.setHex(burst ? (Math.floor(elapsed * 22) % 2 === 0 ? 0xf472b6 : 0x38bdf8) : 0xffffff);
    },
    setAppearance: (nextColor: PlayerColorSpec, nextName: string) => {
      suitMat.color.set(nextColor.hex);
      visorMat.color.set(nextColor.visorTint);
      visorMat.emissive.set(nextColor.visorTint);
      drawNameTagCanvas(nameTag.canvas, nextName, nextColor.hex);
      nameTag.tex.needsUpdate = true;
    },
    animateWalk: (
      distanceDelta: number,
      speed: number,
      dt: number,
      elapsed: number,
      turnBank = 0,
      jumpY = 0,
      jumpVelY = 0,
      landSquash = 0,
    ) => {
      const sq = Math.max(0, Math.min(1, landSquash));
      const squashY = 1 - sq * 0.18;
      const squashXZ = 1 + sq * 0.14;
      bodyGroup.scale.set(squashXZ, squashY, squashXZ);

      if (jumpY > 0.025) {
        const rising = jumpVelY > 0;
        const tuckTargetL = rising ? -0.58 : 0.24;
        const tuckTargetR = rising ? 0.36 : -0.28;
        const armTarget = rising ? -1.05 : -0.48;
        leftLeg.rotation.x = THREE.MathUtils.damp(leftLeg.rotation.x, tuckTargetL, 14, dt);
        rightLeg.rotation.x = THREE.MathUtils.damp(rightLeg.rotation.x, tuckTargetR, 14, dt);
        leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, armTarget, 14, dt);
        rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, armTarget, 14, dt);

        bodyGroup.position.y = jumpY;
        const airTilt = THREE.MathUtils.clamp(-jumpVelY * 0.035, -0.2, 0.2);
        bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, airTilt, 12, dt);
        bodyGroup.rotation.z = THREE.MathUtils.damp(
          bodyGroup.rotation.z,
          THREE.MathUtils.clamp(turnBank, -0.2, 0.2),
          12,
          dt,
        );
        nameSprite.position.y = 2.34 + jumpY;

        const shScale = Math.max(0.42, 1 - jumpY * 0.34);
        shadowMesh.scale.set(shScale, shScale, 1);
        shadowMat.opacity = Math.max(0.16, 0.48 - jumpY * 0.18);
        return;
      }

      if (ghostMode) {
        const hoverY = 0.42 + Math.sin(elapsed * 3.2) * 0.14;
        bodyGroup.position.y = THREE.MathUtils.damp(bodyGroup.position.y, hoverY, 10, dt);
        const speedLean = Math.min(0.24, speed * 0.024);
        bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, speedLean, 10, dt);
        bodyGroup.rotation.z = THREE.MathUtils.damp(
          bodyGroup.rotation.z,
          Math.sin(elapsed * 2.2) * 0.05 + THREE.MathUtils.clamp(turnBank, -0.15, 0.15),
          10,
          dt,
        );
        leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, -0.35 + Math.sin(elapsed * 3) * 0.15, 8, dt);
        rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, -0.35 - Math.sin(elapsed * 3) * 0.15, 8, dt);
        nameSprite.position.y = 2.34 + hoverY;
        ghostTail.rotation.y = elapsed * 2.5;
        ghostTailMat.opacity = 0.28 + Math.sin(elapsed * 4) * 0.08;
        return;
      }

      nameSprite.position.y = 2.34;
      shadowMat.opacity = 0.48;

      if (speed > 0.2) {
        walkPhase += distanceDelta * 5.4;
        const speedFactor = Math.min(1.45, speed / 6.2);
        const swing = Math.sin(walkPhase) * Math.min(0.84, 0.54 + speedFactor * 0.22);
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
        leftArm.rotation.x = -swing * 0.82;
        rightArm.rotation.x = swing * 0.82;

        const bounce = Math.abs(Math.cos(walkPhase)) * (0.078 + speedFactor * 0.036);
        bodyGroup.position.y = bounce;
        bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, 0.085 * speedFactor, 12, dt);
        const targetRoll = Math.sin(walkPhase) * 0.048 + THREE.MathUtils.clamp(turnBank, -0.18, 0.18);
        bodyGroup.rotation.z = THREE.MathUtils.damp(bodyGroup.rotation.z, targetRoll, 14, dt);

        const shScale = Math.max(0.76, 1 - bounce * 1.15);
        shadowMesh.scale.set(shScale, shScale, 1);
      } else {
        leftLeg.rotation.x = THREE.MathUtils.damp(leftLeg.rotation.x, 0, 12, dt);
        rightLeg.rotation.x = THREE.MathUtils.damp(rightLeg.rotation.x, 0, 12, dt);
        leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, Math.sin(elapsed * 2.2) * 0.08, 10, dt);
        rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, -Math.sin(elapsed * 2.2) * 0.08, 10, dt);
        const breath = Math.sin(elapsed * 2.4) * 0.022;
        bodyGroup.position.y = THREE.MathUtils.damp(bodyGroup.position.y, breath, 10, dt);
        bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, 0, 12, dt);
        bodyGroup.rotation.z = THREE.MathUtils.damp(bodyGroup.rotation.z, Math.sin(elapsed * 1.5) * 0.014, 12, dt);
        shadowMesh.scale.set(1, 1, 1);
      }
    },
  };
}

export function createBodyMarkerMesh(
  colorSpec: PlayerColorSpec,
  contactShadowMap: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();

  const suitMat = new THREE.MeshStandardMaterial({
    color: colorSpec.hex,
    roughness: 0.52,
    metalness: 0.06,
  });
  const boneMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 });
  const slipperMat = new THREE.MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.8 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.46, 20), suitMat);
  base.position.y = 0.24;
  group.add(base);

  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.35, 12), boneMat);
  bone.position.y = 0.58;
  const knob1 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), boneMat);
  knob1.position.set(-0.07, 0.74, 0);
  const knob2 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), boneMat);
  knob2.position.set(0.07, 0.74, 0);
  group.add(bone, knob1, knob2);

  const chappal = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.22, 8, 12), slipperMat);
  chappal.rotation.x = Math.PI / 2;
  chappal.scale.set(1, 1, 0.38);
  chappal.position.set(0.62, 0.05, 0.25);
  chappal.rotation.y = 0.65;
  group.add(chappal);

  const ringMat = new THREE.MeshBasicMaterial({
    color: '#ef4444',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.86, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  group.add(ring);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.74, 22),
    new THREE.MeshBasicMaterial({ map: contactShadowMap, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  group.add(shadow);

  return group;
}

export function createShutterDoor(door: DoorSpec, textures: ProceduralTextureSet): THREE.Group {
  const group = new THREE.Group();
  const w = door.maxX - door.minX;
  const d = door.maxZ - door.minZ;
  const cx = (door.minX + door.maxX) / 2;
  const cz = (door.minZ + door.maxZ) / 2;

  const shutterMat = new THREE.MeshStandardMaterial({
    color: '#991b1b',
    roughness: 0.34,
    metalness: 0.78,
    normalMap: textures.tinNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.7 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.35 });

  const panel = new THREE.Mesh(new THREE.BoxGeometry(w, door.height, d * 0.65), shutterMat);
  panel.position.y = door.height / 2;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.26, d * 0.7), stripeMat);
  stripe.position.y = 1.25;
  const rollBox = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, w + 0.2, 16), frameMat);
  rollBox.rotation.z = Math.PI / 2;
  rollBox.position.y = door.height + 0.14;

  group.add(panel, stripe, rollBox);
  group.position.set(cx, door.height + 0.15, cz);
  return group;
}

export function createSecurityCamMesh(): { group: THREE.Group; ledMat: THREE.MeshStandardMaterial; head: THREE.Group } {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.38, metalness: 0.78 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.32, metalness: 0.42 });
  const ledMat = new THREE.MeshStandardMaterial({
    color: '#475569',
    emissive: '#ef4444',
    emissiveIntensity: 0.05,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.32, 16), poleMat);
  base.position.y = 0.16;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.4, 14), poleMat);
  mast.position.y = 1.75;
  group.add(base, mast);

  const head = new THREE.Group();
  head.position.y = 3.4;
  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.58), bodyMat);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.68), poleMat);
  hood.position.set(0, 0.14, 0.05);
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.18, 14),
    new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.12, metalness: 0.92 }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.34;
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), ledMat);
  led.position.set(0, 0.18, 0.24);

  head.add(camBox, hood, lens, led);
  group.add(head);
  return { group, ledMat, head };
}

export function createAdminTableModel(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.65 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.3, metalness: 0.8 });
  const mapMat = new THREE.MeshStandardMaterial({
    color: '#10b981',
    emissive: '#059669',
    emissiveIntensity: 0.85,
    roughness: 0.18,
  });

  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.72, 20), baseMat);
  ped.position.y = 0.36;
  const consoleTop = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.24, 1.3), trimMat);
  consoleTop.position.y = 0.82;
  consoleTop.castShadow = !isSoftwareGl;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.07, 1.05), mapMat);
  screen.position.y = 0.96;
  group.add(ped, consoleTop, screen);
  return group;
}

export function createVitalsKioskModel(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.42, metalness: 0.58 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.3, metalness: 0.75 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 0.95,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.2, 0.75), trimMat);
  base.position.y = 0.1;
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.45, 0.52), bodyMat);
  pillar.position.y = 0.9;
  pillar.castShadow = !isSoftwareGl;
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.52, 0.08), screenMat);
  monitor.position.set(0, 1.32, 0.28);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.42, 10), trimMat);
  antenna.position.set(0.32, 1.82, -0.1);
  group.add(base, pillar, monitor, antenna);
  return group;
}

export function createAddaMonument(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.78, metalness: 0.08 });
  const topMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.36, metalness: 0.18 });
  const brassMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.2, metalness: 0.88 });
  const redBtnMat = new THREE.MeshStandardMaterial({
    color: '#ef4444',
    emissive: '#dc2626',
    emissiveIntensity: 0.75,
    roughness: 0.25,
  });

  // Stepped octagonal beveled dais
  const plinth1 = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.28, 0.18, 8), stoneMat);
  plinth1.position.y = 0.09;
  plinth1.receiveShadow = true;
  const plinth2 = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.88, 0.18, 8), topMat);
  plinth2.position.y = 0.26;
  plinth2.receiveShadow = true;
  group.add(plinth1, plinth2);

  // Turned LatheGeometry Stone Pedestal
  const lathePts = [
    new THREE.Vector2(0.01, 0.34),
    new THREE.Vector2(0.68, 0.34),
    new THREE.Vector2(0.56, 0.48),
    new THREE.Vector2(0.4, 0.7),
    new THREE.Vector2(0.52, 0.98),
    new THREE.Vector2(0.75, 1.06),
    new THREE.Vector2(0.01, 1.06),
  ];
  const tableStem = new THREE.Mesh(new THREE.LatheGeometry(lathePts, 28), stoneMat);
  tableStem.castShadow = !isSoftwareGl;
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.66, 1.66, 0.14, 36), topMat);
  tableTop.position.y = 1.12;
  tableTop.castShadow = !isSoftwareGl;
  tableTop.receiveShadow = true;
  const tableRim = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.055, 14, 40), brassMat);
  tableRim.rotation.x = Math.PI / 2;
  tableRim.position.y = 1.13;
  group.add(tableStem, tableTop, tableRim);

  // Emergency Adda Bell
  const bellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.14, 24), brassMat);
  bellBase.position.y = 1.26;
  const bellDome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), redBtnMat);
  bellDome.position.y = 1.32;
  const bellRing = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.04, 12, 28), brassMat);
  bellRing.rotation.x = Math.PI / 2;
  bellRing.position.y = 1.23;
  group.add(bellBase, bellDome, bellRing);

  // Turned Clay Bhar Cups & Colorful Plastic Moras
  const bharPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.065, 0),
    new THREE.Vector2(0.095, 0.11),
    new THREE.Vector2(0.085, 0.17),
    new THREE.Vector2(0.072, 0.17),
    new THREE.Vector2(0.058, 0.04),
    new THREE.Vector2(0.01, 0.04),
  ];
  const cupGeo = new THREE.LatheGeometry(bharPts, 18);
  const cupMat = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.8 });
  const moraColors = ['#e11d48', '#2563eb', '#16a34a', '#eab308'];

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + 0.4;
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.set(Math.cos(angle) * 1.04, 1.19, Math.sin(angle) * 1.04);
    group.add(cup);

    const mora = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.32, 0.4, 24),
      new THREE.MeshStandardMaterial({ color: moraColors[i], roughness: 0.42 }),
    );
    mora.position.set(Math.cos(angle) * 2.35, 0.2, Math.sin(angle) * 2.35);
    mora.castShadow = !isSoftwareGl;
    const moraRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.032, 10, 24),
      new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.4 }),
    );
    moraRim.rotation.x = Math.PI / 2;
    moraRim.position.set(mora.position.x, 0.39, mora.position.z);
    group.add(mora, moraRim);
  }

  // Plate of Shingara Snacks
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.22, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.22 }),
  );
  plate.position.set(0.62, 1.21, 0.42);
  group.add(plate);
  const shingaraMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.7 });
  for (const [sx, sz] of [
    [0.55, 0.38],
    [0.68, 0.46],
    [0.62, 0.32],
  ]) {
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.13, 4), shingaraMat);
    sh.position.set(sx, 1.28, sz);
    sh.rotation.y = sx * 4;
    group.add(sh);
  }

  return group;
}

export function createRickshawModel(textures: ProceduralTextureSet, isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: '#047857', roughness: 0.3, metalness: 0.52 });
  const hoodMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.58, metalness: 0.06 });
  const goldTrim = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.2, metalness: 0.78 });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.88 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#7c2d12', roughness: 0.72 });
  const spokeMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.2, metalness: 0.9 });
  const artMat = new THREE.MeshStandardMaterial({ map: textures.rickshawArtMap, roughness: 0.35 });

  // Beveled ExtrudeGeometry Carriage Side Silhouette
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-1.1, 0);
  bodyShape.lineTo(1.05, 0);
  bodyShape.lineTo(0.92, 0.28);
  bodyShape.lineTo(-0.35, 0.28);
  bodyShape.lineTo(-0.48, 0.65);
  bodyShape.lineTo(-1.1, 0.65);
  bodyShape.closePath();

  const carriageGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.32,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  carriageGeo.center();
  const carriage = new THREE.Mesh(carriageGeo, frameMat);
  carriage.rotation.y = Math.PI / 2;
  carriage.position.set(0, 0.74, -0.05);
  carriage.castShadow = !isSoftwareGl;
  group.add(carriage);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.28, 0.76), seatMat);
  seat.position.set(0, 0.9, -0.52);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.56, 0.16), hoodMat);
  backrest.position.set(0, 1.24, -0.92);
  const artPanel = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.56, 0.05), artMat);
  artPanel.position.set(0, 0.85, -1.16);
  group.add(seat, backrest, artPanel);

  // Curved Hood Canopy + Brass Support Ribs
  const hood = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 1.32, 32, 1, false, 0, Math.PI),
    hoodMat,
  );
  hood.rotation.z = Math.PI / 2;
  hood.rotation.y = Math.PI / 2;
  hood.position.set(0, 1.38, -0.52);
  hood.castShadow = !isSoftwareGl;
  group.add(hood);

  for (const az of [-0.95, -0.42, 0.14]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.036, 12, 30, Math.PI), goldTrim);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(0, 1.38, az);
    group.add(arch);
  }

  // Mudguards & 12-Spoked Wheels
  const wheelGeo = new THREE.TorusGeometry(0.39, 0.078, 16, 36);
  const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.14, 16);
  const spokeGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.7, 6);
  const fenderGeo = new THREE.TorusGeometry(0.45, 0.04, 8, 20, Math.PI * 0.85);
  const wheelPositions: Array<[number, number, number]> = [
    [-0.78, 0.45, -0.72],
    [0.78, 0.45, -0.72],
    [0, 0.45, 1.2],
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(wx, wy, wz);
    const w = new THREE.Mesh(wheelGeo, tireMat);
    w.rotation.y = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, goldTrim);
    hub.rotation.z = Math.PI / 2;
    const fender = new THREE.Mesh(fenderGeo, frameMat);
    fender.rotation.y = Math.PI / 2;
    fender.rotation.z = 0.25;
    wheelGroup.add(w, hub, fender);
    for (let s = 0; s < 6; s++) {
      const spoke = new THREE.Mesh(spokeGeo, spokeMat);
      spoke.rotation.x = (s / 6) * Math.PI;
      wheelGroup.add(spoke);
    }
    group.add(wheelGroup);
  }

  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.98, 12), goldTrim);
  fork.position.set(0, 0.92, 1.12);
  fork.rotation.x = -0.22;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.8, 12), goldTrim);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.35, 1.02);
  const headlamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 14, 14),
    new THREE.MeshBasicMaterial({ color: '#fef08a' }),
  );
  headlamp.position.set(0, 1.14, 1.18);

  const beamMat = new THREE.MeshBasicMaterial({
    color: '#fef08a',
    transparent: true,
    opacity: 0.085,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.85, 2.8, 16, 1, true), beamMat);
  beam.rotation.x = Math.PI * 0.42;
  beam.position.set(0, 0.72, 2.45);

  group.add(fork, bar, headlamp, beam);

  return optimizeStaticGroup(group);
}

export function createCngModel(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const greenBody = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.32, metalness: 0.38 });
  const canvasHood = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.85 });
  const yellowTrim = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.38 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#bae6fd',
    roughness: 0.08,
    metalness: 0.22,
    transparent: true,
    opacity: 0.72,
  });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.25, metalness: 0.85 });

  // Curved Beveled Lower Hull
  const shape = new THREE.Shape();
  shape.moveTo(-1.25, 0);
  shape.lineTo(1.25, 0);
  shape.lineTo(1.38, 0.55);
  shape.lineTo(0.85, 0.72);
  shape.lineTo(-0.35, 0.72);
  shape.lineTo(-1.15, 0.88);
  shape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.38,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  hullGeo.center();
  const hull = new THREE.Mesh(hullGeo, greenBody);
  hull.rotation.y = Math.PI / 2;
  hull.position.set(0, 0.68, 0);
  hull.castShadow = !isSoftwareGl;
  group.add(hull);

  // Curved Black Canvas Canopy Roof + Windshield
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.58, 1.95), canvasHood);
  roof.position.set(0, 1.56, -0.2);
  roof.castShadow = !isSoftwareGl;
  const roofCap = new THREE.Mesh(new THREE.CylinderGeometry(0.71, 0.71, 1.96, 20, 1, false, 0, Math.PI), canvasHood);
  roofCap.rotation.z = Math.PI / 2;
  roofCap.rotation.y = Math.PI / 2;
  roofCap.scale.set(1, 0.28, 1);
  roofCap.position.set(0, 1.85, -0.2);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.66, 0.08), glassMat);
  windshield.position.set(0, 1.44, 0.82);
  windshield.rotation.x = -0.22;

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.14, 0.18), yellowTrim);
  bumper.position.set(0, 0.42, 1.42);
  group.add(roof, roofCap, windshield, bumper);

  // Twin Headlights + Volumetric Road Beams
  const cngBeamMat = new THREE.MeshBasicMaterial({
    color: '#fef9c3',
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const hx of [-0.46, 0.46]) {
    const hl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16),
      new THREE.MeshBasicMaterial({ color: '#fef08a' }),
    );
    hl.rotation.x = Math.PI / 2;
    hl.position.set(hx, 0.78, 1.38);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.78, 3.3, 14, 1, true), cngBeamMat);
    beam.rotation.x = Math.PI * 0.45;
    beam.position.set(hx, 0.48, 2.95);
    group.add(hl, beam);
  }
  // Rear Tail Lights
  for (const tx of [-0.52, 0.52]) {
    const tl = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.1, 0.06),
      new THREE.MeshBasicMaterial({ color: '#ef4444' }),
    );
    tl.position.set(tx, 0.74, -1.28);
    group.add(tl);
  }

  // 3 Rubber Tires
  for (const [wx, wy, wz] of [
    [-0.74, 0.34, -0.82],
    [0.74, 0.34, -0.82],
    [0, 0.34, 1.05],
  ] as Array<[number, number, number]>) {
    const wg = new THREE.Group();
    wg.position.set(wx, wy, wz);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 12, 24), tireMat);
    tire.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), rimMat);
    rim.rotation.z = Math.PI / 2;
    wg.add(tire, rim);
    group.add(wg);
  }

  return optimizeStaticGroup(group);
}

export function createChaStallProps(textures: ProceduralTextureSet, isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.82 });
  const tinMat = new THREE.MeshStandardMaterial({
    color: '#64748b',
    roughness: 0.34,
    metalness: 0.78,
    normalMap: textures.tinNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });
  const kettleMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.16, metalness: 0.92 });
  const signMat = new THREE.MeshStandardMaterial({ map: textures.chaSignMap, roughness: 0.42 });

  const counter = new THREE.Mesh(new THREE.BoxGeometry(8.0, 1.12, 1.9), woodMat);
  counter.position.set(-35.5, 0.56, -36.2);
  counter.castShadow = !isSoftwareGl;
  counter.receiveShadow = true;
  group.add(counter);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.16, 4.0), tinMat);
  roof.position.set(-35.5, 3.05, -35.6);
  roof.rotation.x = 0.14;
  group.add(roof);

  for (const px of [-39.6, -31.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 3.05, 14), woodMat);
    post.position.set(px, 1.52, -34.2);
    group.add(post);
  }

  // Turned LatheGeometry Tea Kettle + Biscuit Jars
  const kettlePts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.32, 0),
    new THREE.Vector2(0.36, 0.16),
    new THREE.Vector2(0.24, 0.38),
    new THREE.Vector2(0.28, 0.44),
    new THREE.Vector2(0.12, 0.52),
    new THREE.Vector2(0.01, 0.52),
  ];
  const kettle = new THREE.Mesh(new THREE.LatheGeometry(kettlePts, 24), kettleMat);
  kettle.position.set(-34.2, 1.12, -36.1);

  const jar1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.2, transparent: true, opacity: 0.84 }),
  );
  jar1.position.set(-35.8, 1.37, -36.1);
  const jar2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.44, 20),
    new THREE.MeshStandardMaterial({ color: '#fb7185', roughness: 0.2, transparent: true, opacity: 0.84 }),
  );
  jar2.position.set(-36.5, 1.34, -36.1);
  group.add(kettle, jar1, jar2);

  // Hanging Golden Banana Bunch (Kola) & Warm Tungsten Stall Bulb
  const bananaMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.42 });
  for (let b = 0; b < 5; b++) {
    const ban = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 8, 12), bananaMat);
    ban.position.set(-31.9 + b * 0.09, 2.55 - (b % 2) * 0.05, -34.2);
    ban.rotation.z = 0.25 - b * 0.1;
    group.add(ban);
  }
  const stallBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 16),
    new THREE.MeshBasicMaterial({ color: '#fde047' }),
  );
  stallBulb.position.set(-35.5, 2.75, -34.6);
  group.add(stallBulb);

  // Wooden Tea Bench in front
  const benchTop = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.68), woodMat);
  benchTop.position.set(-35.5, 0.48, -28.6);
  benchTop.castShadow = !isSoftwareGl;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.46, 0.56), woodMat);
  legL.position.set(-36.9, 0.23, -28.6);
  const legR = legL.clone();
  legR.position.x = -34.1;
  group.add(benchTop, legL, legR);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.3, 0.16), signMat);
  sign.position.set(-35.5, 3.65, -33.7);
  group.add(sign);

  return group;
}

export function createDescoTransformer(textures: ProceduralTextureSet, isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const cabinetMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.4, metalness: 0.74 });
  const finMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.35, metalness: 0.82 });
  const dangerMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.45 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: '#ef4444',
    emissive: '#ef4444',
    emissiveIntensity: 1.5,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.15, 3.8), cabinetMat);
  body.position.y = 1.075;
  body.castShadow = !isSoftwareGl;
  group.add(body);

  // Cooling Radiator Fins along front/back
  for (let f = -1.6; f <= 1.6; f += 0.4) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.65, 4.06), finMat);
    fin.position.set(f, 1.05, 0);
    group.add(fin);
  }

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.28, 0.24, 3.88), dangerMat);
  stripe.position.y = 1.72;
  group.add(stripe);

  // Ceramic Ribbed Lathe Insulators
  const insPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.2, 0),
    new THREE.Vector2(0.12, 0.16),
    new THREE.Vector2(0.22, 0.32),
    new THREE.Vector2(0.12, 0.48),
    new THREE.Vector2(0.16, 0.66),
    new THREE.Vector2(0.01, 0.66),
  ];
  const insGeo = new THREE.LatheGeometry(insPts, 18);
  for (const ix of [-1.1, 0, 1.1]) {
    const ins = new THREE.Mesh(insGeo, dangerMat);
    ins.position.set(ix, 2.15, 0);
    group.add(ins);
  }

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), glowMat);
  beacon.position.set(0, 2.95, 0);
  group.add(beacon);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.0, 1.2, 0.16),
    new THREE.MeshStandardMaterial({ map: textures.descoSignMap, roughness: 0.4 }),
  );
  sign.position.set(0, 3.45, -2.0);
  group.add(sign);

  return group;
}

export function createDishHub(textures: ProceduralTextureSet, isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.42, metalness: 0.5 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 0.95,
    roughness: 0.18,
  });
  const metalMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.2, metalness: 0.88 });

  const desk = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.12, 2.2), deskMat);
  desk.position.set(35.0, 0.56, 34.5);
  desk.castShadow = !isSoftwareGl;
  group.add(desk);

  for (const mx of [33.7, 36.2]) {
    const mon = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.72, 0.12), screenMat);
    mon.position.set(mx, 1.5, 34.4);
    group.add(mon);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 3.2, 18), metalMat);
  mast.position.set(40.2, 1.6, 37.5);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.42),
    new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.3, side: THREE.DoubleSide }),
  );
  dish.position.set(40.2, 3.4, 37.5);
  dish.rotation.x = Math.PI * 0.72;
  dish.rotation.z = -0.35;
  const feedArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35, 10), metalMat);
  feedArm.position.set(40.5, 3.9, 36.8);
  feedArm.rotation.x = 0.9;
  group.add(mast, dish, feedArm);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.25, 0.16),
    new THREE.MeshStandardMaterial({ map: textures.dishSignMap, roughness: 0.4 }),
  );
  sign.position.set(35.0, 3.45, 39.2);
  group.add(sign);

  return group;
}

export function createPalmTree(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.65, side: THREE.DoubleSide });
  const coconutMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.72 });

  // Segmented Curved Ringed Trunk
  let y = 0;
  let offsetX = 0;
  for (let i = 0; i < 9; i++) {
    const topR = 0.25 - i * 0.014;
    const botR = 0.3 - i * 0.014;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, 0.76, 16), trunkMat);
    offsetX = Math.sin(i * 0.18) * 0.28;
    seg.position.set(offsetX, y + 0.36, 0);
    seg.rotation.z = -0.04 * i;
    seg.castShadow = !isSoftwareGl;
    group.add(seg);
    y += 0.68;
  }

  // Cluster of Coconuts
  for (let c = 0; c < 4; c++) {
    const ca = (c / 4) * Math.PI * 2;
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 14), coconutMat);
    nut.position.set(offsetX + Math.cos(ca) * 0.25, y - 0.18, Math.sin(ca) * 0.25);
    group.add(nut);
  }

  // Arched TubeGeometry Frond Spines + Multi-Blade Leaflets
  const frondBladeGeo = new THREE.PlaneGeometry(0.92, 0.26);
  for (let f = 0; f < 10; f++) {
    const angle = (f / 10) * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const spineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(offsetX, y, 0),
      new THREE.Vector3(offsetX + dirX * 1.15, y + 0.55, dirZ * 1.15),
      new THREE.Vector3(offsetX + dirX * 2.3, y + 0.18, dirZ * 2.3),
      new THREE.Vector3(offsetX + dirX * 3.1, y - 0.55, dirZ * 3.1),
    ]);
    const spine = new THREE.Mesh(new THREE.TubeGeometry(spineCurve, 12, 0.045, 6, false), leafMat);
    group.add(spine);

    for (let k = 2; k <= 8; k++) {
      const t = k / 10;
      const pt = spineCurve.getPoint(t);
      const blade = new THREE.Mesh(frondBladeGeo, leafMat);
      blade.position.copy(pt);
      blade.rotation.y = -angle + Math.PI / 2;
      blade.rotation.x = 0.55 + t * 0.45;
      blade.scale.set(1.25 - t * 0.6, 1, 1);
      group.add(blade);
    }
  }

  return optimizeStaticGroup(group);
}

export function createKrishnachuraTree(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const barkMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.92 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.72 });
  const leafLightMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.68 });
  const flowerMat = new THREE.MeshStandardMaterial({
    color: '#f97316',
    emissive: '#dc2626',
    emissiveIntensity: 0.28,
    roughness: 0.48,
  });

  // Main Flared Trunk + Aerial Roots
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 3.3, 18), barkMat);
  trunk.position.y = 1.65;
  trunk.castShadow = !isSoftwareGl;
  group.add(trunk);

  const branches: Array<[number, number, number, number]> = [
    [1.15, 3.5, 0.75, 0.55],
    [-1.2, 3.65, 0.55, -0.58],
    [0.25, 3.55, -1.15, 0.42],
    [-0.5, 3.7, -0.85, -0.35],
  ];
  for (let idx = 0; idx < branches.length; idx++) {
    const [bx, by, bz, rz] = branches[idx];
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 2.3, 12), barkMat);
    br.position.set(bx * 0.48, by - 0.55, bz * 0.48);
    br.rotation.z = rz;
    br.rotation.x = bz * 0.35;
    group.add(br);

    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      idx % 2 === 0 ? leafMat : leafLightMat,
    );
    canopy.scale.set(1.2, 0.78, 1.2);
    canopy.position.set(bx, by + 0.45, bz);
    canopy.castShadow = !isSoftwareGl;
    group.add(canopy);

    // Protruding Crimson-Vermilion Krishnachura Blossom Clusters
    for (let f = 0; f < 3; f++) {
      const fa = idx * 1.4 + f * 2.1;
      const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), flowerMat);
      bloom.scale.set(1.25, 0.68, 1.25);
      bloom.position.set(
        bx + Math.cos(fa) * 0.78,
        by + 0.92 + (f % 2) * 0.16,
        bz + Math.sin(fa) * 0.78,
      );
      group.add(bloom);
    }
  }

  const centerCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, 1), leafMat);
  centerCrown.scale.set(1.25, 0.75, 1.25);
  centerCrown.position.set(0, 4.45, 0);
  centerCrown.castShadow = !isSoftwareGl;
  const centerBloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.68, 1), flowerMat);
  centerBloom.scale.set(1.25, 0.65, 1.25);
  centerBloom.position.set(0.25, 5.1, -0.15);
  group.add(centerCrown, centerBloom);

  return optimizeStaticGroup(group);
}

export function createStreetLamp(): { group: THREE.Group; coneMesh: THREE.Mesh } {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.35, metalness: 0.78 });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: '#fef08a',
    emissive: '#fbbf24',
    emissiveIntensity: 2.1,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.55, 14), poleMat);
  base.position.y = 0.275;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.3, 12), poleMat);
  pole.position.y = 2.35;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.032, 8, 14), poleMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 4.32;
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 4.25, 0),
    new THREE.Vector3(0.4, 4.6, 0),
    new THREE.Vector3(0.75, 4.35, 0),
  ]);
  const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 8, 0.04, 6, false), poleMat);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.16, 14), poleMat);
  shade.position.set(0.75, 4.32, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), bulbMat);
  bulb.position.set(0.75, 4.2, 0);

  // Subtle Volumetric Light Cone beneath streetlamp
  const coneMat = new THREE.MeshBasicMaterial({
    color: '#fde68a',
    transparent: true,
    opacity: 0.032,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const coneMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 2.85, 4.15, 16, 1, true), coneMat);
  coneMesh.position.set(0.75, 2.1, 0);

  group.add(base, pole, collar, arm, shade, bulb, coneMesh);
  optimizeStaticGroup(group, [coneMesh]);
  return { group, coneMesh };
}

export function createUtilityPole(): THREE.Group {
  const group = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.85 });
  const steelMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.7 });
  const insMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.25 });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 6.2, 10), concreteMat);
  post.position.y = 3.1;
  const cross = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), steelMat);
  cross.position.y = 5.6;
  group.add(post, cross);

  for (const ix of [-0.62, 0, 0.62]) {
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 8), insMat);
    ins.position.set(ix, 5.72, 0);
    group.add(ins);
  }
  return optimizeStaticGroup(group);
}

export function createOverheadWires(spans: Array<[number, number, number, number]>): THREE.Group {
  const group = new THREE.Group();
  const wireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.8 });
  for (const [x1, z1, x2, z2] of spans) {
    for (const off of [-0.45, 0.45]) {
      const midX = (x1 + x2) / 2;
      const midZ = (z1 + z2) / 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x1 + off * 0.4, 5.72, z1 + off * 0.4),
        new THREE.Vector3(midX + off * 0.4, 4.55, midZ + off * 0.4),
        new THREE.Vector3(x2 + off * 0.4, 5.72, z2 + off * 0.4),
      ]);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.024, 5, false), wireMat);
      group.add(cable);
    }
  }
  return optimizeStaticGroup(group);
}

export function createDrainVent(): THREE.Group {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.58, metalness: 0.72 });
  const slatMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.42, metalness: 0.86 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 1.4), frameMat);
  frame.position.y = 0.045;
  group.add(frame);

  for (let i = -2; i <= 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.055, 0.11), slatMat);
    slat.position.set(0, 0.095, i * 0.24);
    group.add(slat);
  }
  return optimizeStaticGroup(group);
}

export function createPukurDetails(): { group: THREE.Group; boat: THREE.Group; flowers: THREE.Group[] } {
  const group = new THREE.Group();
  const padMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.65 });
  const petalMat = new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.36 });
  const centerMat = new THREE.MeshStandardMaterial({ color: '#fde047', roughness: 0.3 });
  const clayMat = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.72 });
  const postMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.88 });
  const flowers: THREE.Group[] = [];

  const lotusSpots: Array<[number, number, number]> = [
    [-44.2, -4.8, 1.1],
    [-48.0, -2.1, 0.95],
    [-44.6, 4.4, 1.2],
    [-48.4, 5.2, 1.0],
    [-46.2, -6.4, 0.9],
  ];

  for (const [lx, lz, sc] of lotusSpots) {
    const fl = new THREE.Group();
    fl.position.set(lx, 0.07, lz);
    fl.scale.setScalar(sc);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.03, 24), padMat);
    fl.add(pad);

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14), centerMat);
    core.position.y = 0.09;
    fl.add(core);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pet = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.26, 10), petalMat);
      pet.position.set(Math.cos(a) * 0.19, 0.11, Math.sin(a) * 0.19);
      pet.rotation.z = -Math.cos(a) * 0.62;
      pet.rotation.x = Math.sin(a) * 0.62;
      fl.add(pet);
    }
    group.add(fl);
    flowers.push(fl);
  }

  // Turned Clay Kolshi (Water Pitchers) on Ghat Steps
  const kolshiPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.16, 0),
    new THREE.Vector2(0.28, 0.18),
    new THREE.Vector2(0.26, 0.34),
    new THREE.Vector2(0.12, 0.44),
    new THREE.Vector2(0.18, 0.52),
    new THREE.Vector2(0.01, 0.52),
  ];
  const kolshiGeo = new THREE.LatheGeometry(kolshiPts, 24);
  for (const [kx, ky, kz] of [
    [-40.4, 0.22, -4.8],
    [-40.6, 0.22, -4.1],
  ]) {
    const k = new THREE.Mesh(kolshiGeo, clayMat);
    k.position.set(kx, ky, kz);
    group.add(k);
  }

  // Wooden Mooring Posts at the Ghat Edge
  for (const pz of [-5.8, 5.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 1.35, 14), postMat);
    post.position.set(-41.8, 0.55, pz);
    group.add(post);
  }

  // Curved Wooden Nouka Boat with Woven Chhai Canopy
  const boat = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.76 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.45 });
  const chhaiMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.85 });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 2.2, 14, 24), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1.18, 1.0, 0.45);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.3), trimMat);
  bench.position.y = 0.18;
  const chhai = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.56, 1.25, 20, 1, false, 0, Math.PI),
    chhaiMat,
  );
  chhai.rotation.z = Math.PI / 2;
  chhai.rotation.y = Math.PI / 2;
  chhai.position.set(0, 0.18, -0.15);
  boat.add(hull, bench, chhai);
  boat.position.set(-44.0, 0.09, 0.6);
  boat.rotation.y = 0.25;
  group.add(boat);

  return { group, boat, flowers };
}

export function createBazarProps(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const crateMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.85 });
  const basketMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.88 });
  const produceColors = ['#ef4444', '#22c55e', '#facc15', '#a855f7'];

  // Woven Bamboo Jhuri Baskets via LatheGeometry
  const basketPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.32, 0),
    new THREE.Vector2(0.52, 0.36),
    new THREE.Vector2(0.46, 0.38),
    new THREE.Vector2(0.28, 0.04),
    new THREE.Vector2(0.01, 0.04),
  ];
  const basketGeo = new THREE.LatheGeometry(basketPts, 20);

  for (let i = 0; i < 4; i++) {
    const cz = -3.3 + i * 2.2;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.52, 1.45), crateMat);
    crate.position.set(41.5, 0.26, cz);
    crate.castShadow = !isSoftwareGl;
    group.add(crate);

    const basket = new THREE.Mesh(basketGeo, basketMat);
    basket.position.set(41.5, 0.52, cz);
    group.add(basket);

    const vegMat = new THREE.MeshStandardMaterial({ color: produceColors[i], roughness: 0.4 });
    for (let v = 0; v < 7; v++) {
      const va = (v / 7) * Math.PI * 2;
      const vr = v === 0 ? 0 : 0.22;
      const item = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), vegMat);
      item.position.set(41.5 + Math.cos(va) * vr, 0.78, cz + Math.sin(va) * vr);
      group.add(item);
    }
  }
  return group;
}

export function createEidgahGate(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.42 });
  const greenMat = new THREE.MeshStandardMaterial({ color: '#059669', roughness: 0.36 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.2, metalness: 0.85 });

  // Onion Dome LatheGeometry
  const domePts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.45, 0),
    new THREE.Vector2(0.64, 0.26),
    new THREE.Vector2(0.56, 0.58),
    new THREE.Vector2(0.24, 0.88),
    new THREE.Vector2(0.02, 1.08),
  ];
  const onionGeo = new THREE.LatheGeometry(domePts, 24);

  for (const px of [-4.4, 4.4]) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 1.4), whiteMat);
    plinth.position.set(px, 0.225, 0);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 4.6, 22), whiteMat);
    pillar.position.set(px, 2.5, 0);
    pillar.castShadow = !isSoftwareGl;
    const dome = new THREE.Mesh(onionGeo, greenMat);
    dome.position.set(px, 4.8, 0);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 12), goldMat);
    finial.position.set(px, 6.05, 0);
    group.add(plinth, pillar, dome, finial);
  }

  const arch = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.38, 16, 36, Math.PI), greenMat);
  arch.position.set(0, 3.6, 0);
  const trimArch = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.1, 10, 36, Math.PI), goldMat);
  trimArch.position.set(0, 3.6, 0);
  const centerDome = new THREE.Mesh(onionGeo, goldMat);
  centerDome.scale.setScalar(1.35);
  centerDome.position.set(0, 7.9, 0);
  group.add(arch, trimArch, centerDome);

  group.position.set(0, 0, -44.2);
  return group;
}

export function createWaterTowerModel(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.42, metalness: 0.76 });
  const tankMat = new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.32, metalness: 0.32 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.38 });

  const legs: Array<[number, number]> = [
    [-1.65, -1.65],
    [1.65, -1.65],
    [-1.65, 1.65],
    [1.65, 1.65],
  ];
  for (const [lx, lz] of legs) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.35, 0.65), trimMat);
    pad.position.set(lx, 0.175, lz);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 5.4, 14), steelMat);
    leg.position.set(lx, 2.7, lz);
    leg.castShadow = !isSoftwareGl;
    group.add(pad, leg);
  }

  // Horizontal Tie Beams + Diagonal Steel X-Bracing
  for (const hy of [1.9, 3.8]) {
    for (const bz of [-1.65, 1.65]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.14, 0.14), steelMat);
      beam.position.set(0, hy, bz);
      group.add(beam);
    }
    for (const bx of [-1.65, 1.65]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.3), steelMat);
      beam.position.set(bx, hy, 0);
      group.add(beam);
    }
  }

  // Circular Catwalk Ring + Guardrail
  const catwalk = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.14, 10, 32), steelMat);
  catwalk.rotation.x = Math.PI / 2;
  catwalk.position.y = 5.4;
  const rail = new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.045, 8, 32), trimMat);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 6.2;

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, 3.0, 36), tankMat);
  tank.position.y = 6.95;
  tank.castShadow = !isSoftwareGl;
  const band = new THREE.Mesh(new THREE.TorusGeometry(2.48, 0.07, 10, 36), trimMat);
  band.rotation.x = Math.PI / 2;
  band.position.y = 6.95;
  const lid = new THREE.Mesh(new THREE.ConeGeometry(2.58, 1.05, 36), trimMat);
  lid.position.y = 8.95;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5.4, 16), steelMat);
  pipe.position.y = 2.7;
  group.add(catwalk, rail, tank, band, lid, pipe);

  group.position.set(0, 0, 39.0);
  return group;
}

export function createAlleyProps(textures: ProceduralTextureSet, isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const binMat = new THREE.MeshStandardMaterial({ color: '#065f46', roughness: 0.45, metalness: 0.45 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.82 });
  const brickPilasterMat = new THREE.MeshStandardMaterial({ color: '#9a3412', roughness: 0.78 });
  const ironBracketMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.72 });
  const lanternGlowMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });

  // Framed Bangla Wall Posters mounted onto the alley sightline walls
  const posterGeo = new THREE.BoxGeometry(0.08, 1.35, 1.05);
  const posterConfigs: Array<[number, number, number, number, number]> = [
    [-15.42, 1.5, -14.5, 0, 0],
    [15.42, 1.5, -14.5, 0, 1],
    [-15.42, 1.5, 14.5, 0, 1],
    [15.42, 1.5, 14.5, 0, 0],
    [-17.2, 1.5, -33.72, Math.PI / 2, 0],
    [17.2, 1.5, -33.72, Math.PI / 2, 1],
    [-17.2, 1.5, 33.72, Math.PI / 2, 1],
    [17.2, 1.5, 33.72, Math.PI / 2, 0],
  ];
  for (const [px, py, pz, ry, pIdx] of posterConfigs) {
    const pMat = new THREE.MeshStandardMaterial({ map: textures.posterMaps[pIdx], roughness: 0.65 });
    const poster = new THREE.Mesh(posterGeo, pMat);
    poster.position.set(px, py, pz);
    poster.rotation.y = ry;
    group.add(poster);
  }

  // Warm Terracotta Brick Corner Pilasters & Wall-Mounted Brass Lantern Sconces on Alley Walls
  const pilasterGeo = new THREE.BoxGeometry(0.32, 2.74, 0.32);
  const pilasterCorners: Array<[number, number]> = [
    [-17.5, -20.5], [-15.5, -20.5], [-17.5, -9.5], [-15.5, -9.5],
    [15.5, -20.5], [17.5, -20.5], [15.5, -9.5], [17.5, -9.5],
    [-17.5, 9.5], [-15.5, 9.5], [-17.5, 20.5], [-15.5, 20.5],
    [15.5, 9.5], [17.5, 9.5], [15.5, 20.5], [17.5, 20.5],
  ];
  for (const [cx, cz] of pilasterCorners) {
    const pil = new THREE.Mesh(pilasterGeo, brickPilasterMat);
    pil.position.set(cx, 1.37, cz);
    group.add(pil);
  }

  const lanternConfigs: Array<[number, number, number]> = [
    [-15.32, 2.25, -18.2],
    [15.32, 2.25, -18.2],
    [-15.32, 2.25, 18.2],
    [15.32, 2.25, 18.2],
    [-19.5, 2.25, -33.65],
    [19.5, 2.25, -33.65],
    [-19.5, 2.25, 33.65],
    [19.5, 2.25, 33.65],
  ];
  const armGeo = new THREE.BoxGeometry(0.18, 0.08, 0.18);
  const lanternCapGeo = new THREE.CylinderGeometry(0.06, 0.16, 0.1, 8);
  const lanternBulbGeo = new THREE.SphereGeometry(0.1, 8, 8);
  for (const [lx, ly, lz] of lanternConfigs) {
    const arm = new THREE.Mesh(armGeo, ironBracketMat);
    arm.position.set(lx, ly + 0.12, lz);
    const hood = new THREE.Mesh(lanternCapGeo, ironBracketMat);
    hood.position.set(lx, ly + 0.04, lz);
    const bulb = new THREE.Mesh(lanternBulbGeo, lanternGlowMat);
    bulb.position.set(lx, ly - 0.05, lz);
    group.add(arm, hood, bulb);
  }

  // Roadside Dustbins tucked along alley corners
  for (const [bx, bz] of [
    [-14.6, -9.8],
    [14.6, -9.8],
    [-14.6, 9.8],
    [14.6, 9.8],
  ]) {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.72, 16), binMat);
    bin.position.set(bx, 0.36, bz);
    bin.castShadow = !isSoftwareGl;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 16), woodMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(bx, 0.72, bz);
    group.add(bin, rim);
  }

  return optimizeStaticGroup(group);
}

export function createPlanterPot(): THREE.Group {
  const group = new THREE.Group();
  const potMat = new THREE.MeshStandardMaterial({ color: '#c2410c', roughness: 0.78 });
  const bushMat = new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.65 });
  const blossomMat = new THREE.MeshStandardMaterial({ color: '#f43f5e', roughness: 0.38 });

  const potPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.28, 0),
    new THREE.Vector2(0.4, 0.44),
    new THREE.Vector2(0.45, 0.52),
    new THREE.Vector2(0.36, 0.52),
    new THREE.Vector2(0.01, 0.44),
  ];
  const pot = new THREE.Mesh(new THREE.LatheGeometry(potPts, 14), potMat);
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), bushMat);
  bush.position.y = 0.68;
  group.add(pot, bush);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 8), blossomMat);
    fl.position.set(Math.cos(a) * 0.36, 0.8 + (i % 2) * 0.1, Math.sin(a) * 0.36);
    group.add(fl);
  }
  return optimizeStaticGroup(group);
}

export function createMoricbattiGarlands(): { group: THREE.Group; bulbMats: THREE.MeshBasicMaterial[] } {
  const group = new THREE.Group();
  const palette = ['#fbbf24', '#fb7185', '#34d399', '#38bdf8', '#c084fc'];
  const bulbMats = palette.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const wireMat = new THREE.MeshBasicMaterial({ color: '#1e293b' });

  const spans: Array<[number, number, number, number]> = [
    [-9.2, -9.2, 9.2, -9.2],
    [9.2, -9.2, 9.2, 9.2],
    [9.2, 9.2, -9.2, 9.2],
    [-9.2, 9.2, -9.2, -9.2],
  ];
  const bulbGeo = new THREE.SphereGeometry(0.13, 8, 8);

  spans.forEach(([x1, z1, x2, z2], sIdx) => {
    const count = 11;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const sag = Math.sin(t * Math.PI) * 1.05;
      const px = THREE.MathUtils.lerp(x1, x2, t);
      const pz = THREE.MathUtils.lerp(z1, z2, t);
      const py = 4.25 - sag;
      pts.push(new THREE.Vector3(px, py, pz));
      if (i > 0 && i < count) {
        const bulb = new THREE.Mesh(bulbGeo, bulbMats[(i + sIdx) % bulbMats.length]);
        bulb.position.set(px, py - 0.11, pz);
        group.add(bulb);
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.022, 5, false), wireMat);
    group.add(wire);
  });

  return { group: optimizeStaticGroup(group), bulbMats };
}

export function createSupplyCluster(textures: ProceduralTextureSet, isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const crateMat = new THREE.MeshStandardMaterial({
    map: textures.crateWoodMap,
    normalMap: textures.crateWoodNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 0.78,
    metalness: 0.05,
  });
  const cornerMat = new THREE.MeshStandardMaterial({ color: '#3f4a3c', roughness: 0.45, metalness: 0.65 });
  const redDrumMat = new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.42, metalness: 0.62 });
  const blueDrumMat = new THREE.MeshStandardMaterial({ color: '#0369a1', roughness: 0.45, metalness: 0.25 });

  // Heavy Slatted Wooden Supply Crate
  const bigCrate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.15, 1.4), crateMat);
  bigCrate.position.set(0, 0.575, 0);
  bigCrate.castShadow = !isSoftwareGl;
  bigCrate.receiveShadow = true;
  group.add(bigCrate);

  // Stacked angled small ammo/supply crate
  const smallCrate = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.7, 0.88), crateMat);
  smallCrate.position.set(-0.08, 1.5, 0.04);
  smallCrate.rotation.y = 0.28;
  smallCrate.castShadow = !isSoftwareGl;
  group.add(smallCrate);

  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.92), cornerMat);
  strap.position.set(-0.08, 1.5, 0.04);
  strap.rotation.y = 0.28;
  group.add(strap);

  // Ribbed LatheGeometry Steel Oil & Water Drums
  const drumPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.38, 0),
    new THREE.Vector2(0.38, 0.3),
    new THREE.Vector2(0.41, 0.34),
    new THREE.Vector2(0.38, 0.38),
    new THREE.Vector2(0.38, 0.68),
    new THREE.Vector2(0.41, 0.72),
    new THREE.Vector2(0.38, 0.76),
    new THREE.Vector2(0.38, 1.06),
    new THREE.Vector2(0.4, 1.1),
    new THREE.Vector2(0.34, 1.1),
    new THREE.Vector2(0.34, 1.04),
    new THREE.Vector2(0.01, 1.04),
  ];
  const drumGeo = new THREE.LatheGeometry(drumPts, 20);

  const redDrum = new THREE.Mesh(drumGeo, redDrumMat);
  redDrum.position.set(1.22, 0, -0.25);
  redDrum.castShadow = !isSoftwareGl;
  redDrum.receiveShadow = true;

  const blueDrum = new THREE.Mesh(drumGeo, blueDrumMat);
  blueDrum.position.set(1.05, 0, 0.68);
  blueDrum.castShadow = !isSoftwareGl;
  blueDrum.receiveShadow = true;

  group.add(redDrum, blueDrum);
  return optimizeStaticGroup(group);
}

export function createSandbagBarricade(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const bagMat = new THREE.MeshStandardMaterial({ color: '#9c8359', roughness: 0.92, metalness: 0.0 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.85, metalness: 0.04 });
  const hazardMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.55 });

  // Tapered Jersey Concrete Barrier Profile
  const jShape = new THREE.Shape();
  jShape.moveTo(-0.34, 0);
  jShape.lineTo(0.34, 0);
  jShape.lineTo(0.32, 0.16);
  jShape.lineTo(0.14, 0.42);
  jShape.lineTo(0.1, 0.92);
  jShape.lineTo(-0.1, 0.92);
  jShape.lineTo(-0.14, 0.42);
  jShape.lineTo(-0.32, 0.16);
  jShape.closePath();

  const barrierGeo = new THREE.ExtrudeGeometry(jShape, {
    depth: 2.3,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  barrierGeo.center();
  const barrier = new THREE.Mesh(barrierGeo, concreteMat);
  barrier.rotation.y = Math.PI / 2;
  barrier.position.set(0.8, 0.47, 0);
  barrier.castShadow = !isSoftwareGl;
  barrier.receiveShadow = true;
  group.add(barrier);

  for (const sx of [-0.72, 0, 0.72]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.24), hazardMat);
    stripe.position.set(sx + 0.8, 0.74, 0);
    group.add(stripe);
  }

  // Stacked Burlap Sandbags flanking the barrier
  const bagGeo = new THREE.CapsuleGeometry(0.18, 0.38, 6, 10);
  for (let row = 0; row < 3; row++) {
    const count = 4 - row;
    for (let i = 0; i < count; i++) {
      const bag = new THREE.Mesh(bagGeo, bagMat);
      bag.rotation.z = Math.PI / 2;
      bag.scale.set(0.72, 1, 1.15);
      const bx = -1.1 + (i - (count - 1) / 2) * 0.62;
      const by = 0.15 + row * 0.23;
      const bz = (row % 2 === 0 ? 0.03 : -0.03);
      bag.position.set(bx, by, bz);
      bag.rotation.y = (i % 2 === 0 ? 0.08 : -0.06);
      group.add(bag);
    }
  }

  return optimizeStaticGroup(group);
}

export function createTerrainSkirt(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1080, 1080, 96, 96);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const cFlat = new THREE.Color('#0d1624');
  const cMid = new THREE.Color('#133026');
  const cHill = new THREE.Color('#1a4734');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const maxEdge = Math.max(Math.abs(x), Math.abs(z));
    const blend = THREE.MathUtils.smoothstep(maxEdge, 165, 228);

    const hills =
      Math.sin(x * 0.042) * Math.cos(z * 0.038) * 6.5 +
      Math.sin((x + z) * 0.025) * 4.2 +
      Math.cos(x * 0.09 - z * 0.07) * 1.8 +
      2.6;

    const h = blend * Math.max(0.2, hills);
    pos.setY(i, h);

    if (blend < 0.05) {
      tmpColor.copy(cFlat);
    } else {
      const hillFactor = THREE.MathUtils.clamp((h - 0.5) / 9.0, 0, 1);
      tmpColor.copy(cMid).lerp(cHill, hillFactor);
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.05;
  mesh.receiveShadow = true;
  return mesh;
}

export function createInstancedGrassTufts(): {
  mesh: THREE.InstancedMesh;
  grassUniforms: { uTime: { value: number } };
} {
  // Build a single 3-blade crossed grass tuft geometry with uv.y = 0..1 for wind sway
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let b = 0; b < 3; b++) {
    const angle = (b / 3) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = 0.085;
    const h = 0.46 + (b % 2) * 0.08;
    const baseIdx = b * 4;

    positions.push(
      -hw * cos, 0, -hw * sin,
      hw * cos, 0, hw * sin,
      hw * 0.22 * cos, h, hw * 0.22 * sin,
      -hw * 0.22 * cos, h, -hw * 0.22 * sin,
    );
    for (let k = 0; k < 4; k++) {
      normals.push(0, 1, 0);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  }

  const tuftGeo = new THREE.BufferGeometry();
  tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  tuftGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  tuftGeo.setIndex(indices);

  const grassUniforms = { uTime: { value: 0 } };
  const grassMat = new THREE.MeshStandardMaterial({
    color: '#22c55e',
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassUniforms.uTime;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float sway = sin(uTime * 2.1 + instanceMatrix[3][0] * 0.45 + instanceMatrix[3][2] * 0.35) * 0.14;
       transformed.x += sway * uv.y * uv.y;
       transformed.z += sway * 0.55 * uv.y * uv.y;`,
    );
  };

  // Deterministic pseudo-random placement along Eidgah borders, Pukur bank & outer green verges
  const coords: Array<[number, number, number, number]> = [];
  let s = 4242;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // 1. Eidgah Maidan edge grass borders (avoiding center task area at 0,-37)
  for (let i = 0; i < 180; i++) {
    const gx = (rand() - 0.5) * 18.8;
    const gz = -37 + (rand() - 0.5) * 13.6;
    if (Math.hypot(gx, gz + 37) < 3.6) continue;
    coords.push([gx, gz, 0.75 + rand() * 0.5, rand() * Math.PI]);
  }
  // 2. Pukur Ghat grassy embankment around pond (outside water AABB -51..-42, -8..8)
  for (let i = 0; i < 200; i++) {
    const gx = -53.2 + rand() * 14.0;
    const gz = (rand() - 0.5) * 34;
    if (gx >= -51.6 && gx <= -41.4 && gz >= -8.8 && gz <= 8.8) continue;
    if (gx >= -42.0 && Math.abs(gz) < 7.5) continue;
    coords.push([gx, gz, 0.8 + rand() * 0.55, rand() * Math.PI]);
  }
  // 3. Compound inner lawn corners & perimeter tree bases (320m x 320m compound, avoiding rail ballast z = 83..90 & outer houses)
  for (let i = 0; i < 620; i++) {
    const side = i % 4;
    let gx = 0;
    let gz = 0;
    if (side === 0) {
      gx = (rand() - 0.5) * 308;
      gz = -156.8 + rand() * 3.2;
    } else if (side === 1) {
      gx = (rand() - 0.5) * 308;
      gz = 153.6 + rand() * 3.2;
    } else if (side === 2) {
      gx = -156.8 + rand() * 3.2;
      gz = (rand() - 0.5) * 308;
    } else {
      gx = 153.6 + rand() * 3.2;
      gz = (rand() - 0.5) * 308;
    }
    if (Math.abs(gz - RAILWAY_TRACK_Z) < 4.5) continue;
    if (
      gz < -125.0 &&
      ((gx > -148 && gx < -128) ||
        (gx > -79 && gx < -59) ||
        (gx > -39 && gx < -17) ||
        (gx > 17 && gx < 39) ||
        (gx > 59 && gx < 79))
    ) {
      continue;
    }
    if (gz > 118.0 && gz < 138.0 && ((gx > -39 && gx < -17) || (gx > 59 && gx < 79))) {
      continue;
    }
    coords.push([gx, gz, 0.8 + rand() * 0.6, rand() * Math.PI]);
  }
  // 3b. Cricket Math & Fuchka border grass tufts
  for (let i = 0; i < 160; i++) {
    const gx = 57.5 + rand() * 16.5;
    const gz = -36.5 + rand() * 21.0;
    if (Math.hypot(gx - 66, gz + 26) < 4.5) continue;
    coords.push([gx, gz, 0.72 + rand() * 0.45, rand() * Math.PI]);
  }
  // 3c. Jheel Par lakeside embankment & Shishu Park lawn grass tufts
  for (let i = 0; i < 200; i++) {
    const gx = -151.5 + rand() * 26.5;
    const gz = -95.0 + rand() * 26.0;
    if (gx >= -147.2 && gx <= -129.8 && gz >= -92.2 && gz <= -71.8) continue;
    if (gx >= -130.8 && gx <= -126.0 && gz >= -85.8 && gz <= -78.2) continue;
    coords.push([gx, gz, 0.78 + rand() * 0.55, rand() * Math.PI]);
  }
  for (let i = 0; i < 160; i++) {
    const gx = 126.0 + rand() * 25.0;
    const gz = -95.0 + rand() * 26.0;
    if (gx >= 134.8 && gx <= 142.6 && gz >= -86.2 && gz <= -77.8) continue;
    coords.push([gx, gz, 0.75 + rand() * 0.5, rand() * Math.PI]);
  }
  // 4. Outer rolling green verges beyond 320m perimeter walls (166..205m)
  for (let i = 0; i < 480; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 166 + rand() * 39;
    const gx = Math.cos(angle) * dist;
    const gz = Math.sin(angle) * dist;
    if (Math.abs(gz - RAILWAY_TRACK_Z) < 4.5) continue;
    coords.push([gx, gz, 0.95 + rand() * 0.7, rand() * Math.PI]);
  }

  const mesh = new THREE.InstancedMesh(tuftGeo, grassMat, coords.length);
  const dummy = new THREE.Object3D();
  const c1 = new THREE.Color('#16a34a');
  const c2 = new THREE.Color('#22c55e');
  const c3 = new THREE.Color('#15803d');

  coords.forEach(([gx, gz, sc, rotY], idx) => {
    dummy.position.set(gx, 0.02, gz);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);

    const pick = idx % 3 === 0 ? c1 : idx % 3 === 1 ? c2 : c3;
    mesh.setColorAt(idx, pick);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.computeBoundingSphere();

  return { mesh, grassUniforms };
}

export function createTwilightSkyline(): {
  group: THREE.Group;
  skyUniforms: { uTime: { value: number } };
} {
  const group = new THREE.Group();
  const bldgMat = new THREE.MeshStandardMaterial({ color: '#0c152b', roughness: 0.88, metalness: 0.14 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.82 });
  const tankMat = new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.4 });
  const winMatWarm = new THREE.MeshBasicMaterial({ color: '#fde047' });
  const winMatCool = new THREE.MeshBasicMaterial({ color: '#bae6fd' });
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });

  // Atmospheric PUBG-Style Sunset-to-Midnight Shader Sky Dome with Drifting Volumetric-Feel Clouds
  const skyUniforms = { uTime: { value: 0 } };
  const skyShaderMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.05;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);

        vec3 zenithCol = vec3(0.02, 0.04, 0.11);
        vec3 midCol = vec3(0.09, 0.14, 0.30);
        vec3 horizonCol = vec3(0.24, 0.17, 0.31);

        vec3 col = mix(horizonCol, midCol, smoothstep(0.0, 0.28, h));
        col = mix(col, zenithCol, smoothstep(0.22, 0.78, h));

        // Warm Golden Sunset Rim Glow in the West-Northwest
        vec3 sunDir = normalize(vec3(-0.76, 0.14, -0.63));
        float sunDot = max(dot(dir, sunDir), 0.0);
        float horizonBand = exp(-h * 5.8);
        col += vec3(0.98, 0.48, 0.16) * pow(sunDot, 2.8) * horizonBand * 1.05;
        col += vec3(1.0, 0.76, 0.40) * pow(sunDot, 14.0) * 0.7;

        // Animated Dusk Clouds
        if (dir.y > 0.03) {
          vec2 cloudUv = dir.xz / (dir.y + 0.15) * 1.45;
          cloudUv.x += uTime * 0.014;
          cloudUv.y += uTime * 0.007;
          float n = fbm(cloudUv);
          float cloudMask = smoothstep(0.44, 0.74, n) * smoothstep(0.03, 0.24, dir.y);
          vec3 cloudDark = vec3(0.11, 0.14, 0.28);
          vec3 cloudLit = vec3(0.94, 0.52, 0.28);
          vec3 cloudCol = mix(cloudDark, cloudLit, pow(sunDot, 1.8) * 0.9 + 0.14);
          col = mix(col, cloudCol, cloudMask * 0.68);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(500, 36, 24), skyShaderMat);
  group.add(skyDome);

  // Twinkling Starfield
  const starPos = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++) {
    const theta = ((i * 137.5) % 360) * (Math.PI / 180);
    const phi = (0.2 + ((i * 29) % 58) / 100) * Math.PI * 0.5;
    const r = 455;
    starPos[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
    starPos[i * 3 + 1] = Math.sin(phi) * r + 14;
    starPos[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: '#fef9c3', size: 1.15, transparent: true, opacity: 0.86, fog: false }),
  );
  group.add(stars);

  // Multi-Tiered Dhaka Apartment Buildings outside the 320m perimeter with rooftop tanks, aviation beacons & window grids
  const blocks: Array<[number, number, number, number, number]> = [
    [-205, -198, 22, 34, 18],
    [-92, -210, 24, 40, 18],
    [68, -206, 24, 36, 18],
    [205, -196, 20, 32, 18],
    [-202, 198, 22, 35, 18],
    [-64, 212, 24, 38, 18],
    [82, 208, 22, 32, 18],
    [206, 196, 20, 32, 18],
    [-212, 0, 18, 30, 26],
    [212, -10, 18, 34, 24],
    [-248, -58, 20, 44, 20],
    [248, 58, 20, 42, 20],
    [0, -246, 30, 46, 20],
    [0, 246, 28, 42, 20],
  ];

  blocks.forEach(([bx, bz, bw, bh, bd], idx) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(bx, 0, bz);

    const mainTower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bldgMat);
    mainTower.position.y = bh / 2 - 0.1;
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.5, 0.7, bd + 0.5), roofMat);
    parapet.position.y = bh + 0.25;
    const stairHead = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.32, 2.8, bd * 0.35), roofMat);
    stairHead.position.set(bw * 0.2, bh + 1.4, 0);
    const roofTank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.0, 14), tankMat);
    roofTank.position.set(-bw * 0.22, bh + 1.1, 0);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), beaconMat);
    beacon.position.set(bw * 0.2, bh + 3.05, 0);
    bGroup.add(mainTower, parapet, stairHead, roofTank, beacon);

    // Multi-Floor Lit Apartment Window Grid facing center
    const faceZ = bz > 0 ? -bd / 2 - 0.08 : bd / 2 + 0.08;
    const floors = Math.floor(bh / 4.5);
    for (let f = 1; f < floors; f++) {
      for (let c = -1; c <= 1; c++) {
        if ((f + c + idx) % 3 === 0) continue;
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 1.2, 0.15),
          (f + idx) % 2 === 0 ? winMatWarm : winMatCool,
        );
        win.position.set(c * (bw * 0.26), f * 4.2, faceZ);
        bGroup.add(win);
      }
    }
    group.add(bGroup);
  });

  // Glowing Twilight Moon + Halo
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(9.2, 26, 20),
    new THREE.MeshBasicMaterial({ color: '#fef3c7', fog: false }),
  );
  moon.position.set(-195, 84, -255);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(14.5, 22, 18),
    new THREE.MeshBasicMaterial({ color: '#fde68a', transparent: true, opacity: 0.18, fog: false }),
  );
  halo.position.copy(moon.position);
  group.add(moon, halo);

  return { group: optimizeStaticGroup(group, [skyDome, moon, halo]), skyUniforms };
}

// =========================================================================
// 5 NEW OUTER MOHOLLA HI-POLY COMPOSITE LANDMARKS + RAIL CROSSING GATE
// =========================================================================

export function createFuchkaCartModel(textures: ProceduralTextureSet, isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const cartWood = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.72 });
  const redFrame = new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.36, metalness: 0.45 });
  const brassMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.2, metalness: 0.85 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#e0f2fe',
    roughness: 0.08,
    metalness: 0.1,
    clearcoat: 1,
    transparent: true,
    opacity: 0.52,
  });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.88 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.25, metalness: 0.82 });
  const purisMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.65 });
  const tokMat = new THREE.MeshStandardMaterial({ color: '#4d7c0f', roughness: 0.25 });

  // Lower Cart Chassis + Spoked Wheels
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.96, 2.2), redFrame);
  chassis.position.set(0, 0.68, 0);
  chassis.castShadow = !isSoftwareGl;
  chassis.receiveShadow = true;
  group.add(chassis);

  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(5.05, 0.12, 2.45), cartWood);
  counterTop.position.set(0, 1.2, 0);
  counterTop.receiveShadow = true;
  group.add(counterTop);

  for (const wx of [-2.45, 2.45]) {
    for (const wz of [-0.7, 0.7]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 12, 24), tireMat);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), rimMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(wx, 0.36, wz);
      group.add(wheel, hub);
    }
  }

  // Glass Showcase Box filled with Stacked Golden Fuchka Puri Shells
  const showcase = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.9, 1.4), glassMat);
  showcase.position.set(-1.1, 1.72, 0);
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.08, 1.48), brassMat);
  frameTop.position.set(-1.1, 2.18, 0);
  group.add(showcase, frameTop);

  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 6; i++) {
      const puri = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), purisMat);
      puri.scale.set(1.15, 0.88, 1.15);
      puri.position.set(-1.8 + i * 0.28 + (row % 2) * 0.08, 1.38 + row * 0.17, (i % 2 === 0 ? 0.24 : -0.24));
      group.add(puri);
    }
  }

  // LatheGeometry Brass Tamarind Tok Hari Pot + Serving Ladle
  const hariPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.28, 0),
    new THREE.Vector2(0.46, 0.26),
    new THREE.Vector2(0.38, 0.52),
    new THREE.Vector2(0.26, 0.62),
    new THREE.Vector2(0.32, 0.68),
    new THREE.Vector2(0.01, 0.68),
  ];
  const hari = new THREE.Mesh(new THREE.LatheGeometry(hariPts, 24), brassMat);
  hari.position.set(1.15, 1.26, 0);
  const tokLiquid = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 18), tokMat);
  tokLiquid.position.set(1.15, 1.9, 0);
  group.add(hari, tokLiquid);

  // Corner Poles + Striped Festive Canopy + Illuminated Fuchka Signboard
  for (const px of [-2.3, 2.3]) {
    for (const pz of [-1.0, 1.0]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.2, 12), brassMat);
      pole.position.set(px, 2.3, pz);
      group.add(pole);
    }
  }
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 0.16, 2.9),
    new THREE.MeshStandardMaterial({ map: textures.bazarAwningMap, roughness: 0.48 }),
  );
  awning.position.set(0, 3.45, 0);
  awning.rotation.x = 0.08;
  awning.castShadow = !isSoftwareGl;
  group.add(awning);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.2, 0.16),
    new THREE.MeshStandardMaterial({ map: textures.fuchkaSignMap, roughness: 0.4 }),
  );
  sign.position.set(0, 4.15, 1.22);
  group.add(sign);

  // Warm tungsten bulb under canopy + nearby colorful moras for customers
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 14),
    new THREE.MeshBasicMaterial({ color: '#fde047' }),
  );
  bulb.position.set(0, 3.25, 0.2);
  group.add(bulb);

  const moraColors = ['#e11d48', '#2563eb', '#f59e0b'];
  moraColors.forEach((hex, idx) => {
    const mora = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.38, 18),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.44 }),
    );
    mora.position.set(-1.6 + idx * 1.6, 0.19, 2.4);
    mora.castShadow = !isSoftwareGl;
    group.add(mora);
  });

  group.position.set(0, 0, -68.0);
  return group;
}

export function createSaloonProps(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): { group: THREE.Group; barberPole: THREE.Group } {
  const group = new THREE.Group();
  const counterMat = new THREE.MeshStandardMaterial({ color: '#831843', roughness: 0.38, metalness: 0.25 });
  const marbleMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.22 });
  const mirrorMat = new THREE.MeshPhysicalMaterial({
    color: '#bae6fd',
    roughness: 0.06,
    metalness: 0.9,
    clearcoat: 1,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.16, metalness: 0.92 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: '#be123c', roughness: 0.48 });

  // Barber Counter + Illuminated Mirror Wall inside Saloon (-73.8..-71.8, z -32..-20)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.05, 11.4), counterMat);
  counter.position.set(-72.8, 0.525, -26.0);
  counter.castShadow = !isSoftwareGl;
  const topSlab = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 11.6), marbleMat);
  topSlab.position.set(-72.8, 1.1, -26.0);
  group.add(counter, topSlab);

  for (const mz of [-29.5, -26.0, -22.5]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.55, 2.2), mirrorMat);
    mirror.position.set(-73.95, 2.1, mz);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.66, 2.34), chromeMat);
    frame.position.set(-74.0, 2.1, mz);
    group.add(mirror, frame);

    // Turned LatheGeometry Hydraulic Barber Chair facing mirror
    const basePts = [
      new THREE.Vector2(0.01, 0),
      new THREE.Vector2(0.42, 0),
      new THREE.Vector2(0.36, 0.08),
      new THREE.Vector2(0.12, 0.14),
      new THREE.Vector2(0.12, 0.46),
      new THREE.Vector2(0.01, 0.46),
    ];
    const chair = new THREE.Group();
    chair.position.set(-70.2, 0, mz);
    const ped = new THREE.Mesh(new THREE.LatheGeometry(basePts, 20), chromeMat);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.18, 0.72), leatherMat);
    seat.position.y = 0.54;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.68), leatherMat);
    back.position.set(0.32, 0.92, 0);
    const headRest = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.34), leatherMat);
    headRest.position.set(0.34, 1.38, 0);
    chair.add(ped, seat, back, headRest);
    group.add(chair);
  }

  // Spinning Candy-Striped Barber Pole outside the East Entrance
  const barberPole = new THREE.Group();
  barberPole.position.set(-56.6, 2.0, -21.2);
  const poleBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 1.35, 20),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.2 }),
  );
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), chromeMat);
  capTop.position.y = 0.74;
  const capBot = capTop.clone();
  capBot.position.y = -0.74;
  barberPole.add(poleBody, capTop, capBot);
  const redStripeMat = new THREE.MeshStandardMaterial({ color: '#e11d48', emissive: '#9f1239', emissiveIntensity: 0.35 });
  const blueStripeMat = new THREE.MeshStandardMaterial({ color: '#2563eb', emissive: '#1e40af', emissiveIntensity: 0.35 });
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.045, 8, 20),
      i % 2 === 0 ? redStripeMat : blueStripeMat,
    );
    ring.rotation.x = Math.PI / 2 - 0.35;
    ring.position.y = -0.5 + i * 0.2;
    barberPole.add(ring);
  }
  group.add(barberPole);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 1.3, 4.4),
    new THREE.MeshStandardMaterial({ map: textures.saloonSignMap, roughness: 0.4 }),
  );
  sign.position.set(-56.8, 3.7, -26.0);
  group.add(sign);

  return { group, barberPole };
}

export function createCricketMathProps(textures: ProceduralTextureSet, isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const pitchMat = new THREE.MeshStandardMaterial({ color: '#d6bfa3', roughness: 0.9 });
  const lineMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.5 });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.8 });
  const neonMat = new THREE.MeshBasicMaterial({ color: '#fef9c3' });
  const towerMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.42, metalness: 0.72 });
  const benchGreen = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.48 });

  // Clay Cricket Pitch Strip + White Crease Markings
  const pitch = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 15.0), pitchMat);
  pitch.position.set(64.5, 0.04, -26.0);
  pitch.receiveShadow = true;
  group.add(pitch);

  for (const cz of [-31.8, -20.2]) {
    const crease = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.072, 0.14), lineMat);
    crease.position.set(64.5, 0.045, cz);
    group.add(crease);

    // 3 Turned Wooden Stumps + 2 Bails at each end
    for (const sx of [-0.22, 0, 0.22]) {
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.82, 10), woodMat);
      stump.position.set(64.5 + sx, 0.44, cz);
      stump.castShadow = !isSoftwareGl;
      group.add(stump);
    }
    for (const bx of [-0.11, 0.11]) {
      const bail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8), darkWood);
      bail.rotation.z = Math.PI / 2;
      bail.position.set(64.5 + bx, 0.87, cz);
      group.add(bail);
    }
  }

  // Dugout Bench & Overhead Canopy (matches cricket_dugout AABB 72.2..74.2, z -30.5..-21.5)
  const dugoutSeat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.48, 8.6), benchGreen);
  dugoutSeat.position.set(73.1, 0.24, -26.0);
  dugoutSeat.castShadow = !isSoftwareGl;
  const dugoutBack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.35, 8.8), towerMat);
  dugoutBack.position.set(73.9, 0.72, -26.0);
  const dugoutRoof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 9.2), benchGreen);
  dugoutRoof.position.set(73.1, 2.35, -26.0);
  dugoutRoof.rotation.z = -0.18;
  for (const pz of [-30.0, -22.0]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.35, 10), towerMat);
    post.position.set(72.3, 1.18, pz);
    group.add(post);
  }
  group.add(dugoutSeat, dugoutBack, dugoutRoof);

  // Leaning Wooden Cricket Bat + Tape-Wrapped Red Tennis Ball near Crease
  const batBlade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.06), woodMat);
  batBlade.position.set(66.8, 0.42, -21.2);
  batBlade.rotation.z = -0.25;
  const batHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.035, 0.38, 10), darkWood);
  batHandle.position.set(66.92, 0.92, -21.2);
  batHandle.rotation.z = -0.25;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 12),
    new THREE.MeshStandardMaterial({ color: '#fde047', roughness: 0.4 }),
  );
  ball.position.set(66.4, 0.14, -21.0);
  group.add(batBlade, batHandle, ball);

  // Stadium Floodlight Mast + Signboard
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 7.6, 14), towerMat);
  mast.position.set(73.2, 3.8, -34.2);
  const lampHead = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.35), towerMat);
  lampHead.position.set(72.9, 7.6, -34.0);
  lampHead.rotation.y = -0.6;
  const lampGlow = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.7, 0.1), neonMat);
  lampGlow.position.set(72.75, 7.6, -33.85);
  lampGlow.rotation.y = -0.6;
  group.add(mast, lampHead, lampGlow);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 1.25, 4.4),
    new THREE.MeshStandardMaterial({ map: textures.cricketSignMap, roughness: 0.4 }),
  );
  sign.position.set(73.1, 3.25, -26.0);
  group.add(sign);

  return group;
}

export function createPharmacyProps(textures: ProceduralTextureSet, isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();
  const cabinetMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.28 });
  const tealTrim = new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.35 });
  const crossGreen = new THREE.MeshStandardMaterial({
    color: '#22c55e',
    emissive: '#16a34a',
    emissiveIntensity: 1.2,
  });
  const bottleMats = [
    new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.18 }),
    new THREE.MeshStandardMaterial({ color: '#fb7185', roughness: 0.18 }),
    new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.18 }),
  ];

  // Glass Pharmacy Counter (pharm_counter -73.8..-71.6, z 20..32)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.15, 11.4), cabinetMat);
  counter.position.set(-72.7, 0.575, 26.0);
  counter.castShadow = !isSoftwareGl;
  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 11.5), tealTrim);
  topTrim.position.set(-72.7, 1.18, 26.0);
  group.add(counter, topTrim);

  // Medicine Bottles via LatheGeometry along Counter
  const bottlePts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.12, 0),
    new THREE.Vector2(0.12, 0.28),
    new THREE.Vector2(0.06, 0.34),
    new THREE.Vector2(0.06, 0.42),
    new THREE.Vector2(0.01, 0.42),
  ];
  const bottleGeo = new THREE.LatheGeometry(bottlePts, 14);
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(bottleGeo, bottleMats[i % bottleMats.length]);
    b.position.set(-72.7 + ((i % 2) - 0.5) * 0.45, 1.25, 21.4 + i * 1.15);
    group.add(b);
  }

  // Glowing Pharmacy Red/Green Cross Beacon & Signboard at East Facade
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.34), crossGreen);
  crossV.position.set(-56.7, 3.6, 20.6);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 1.2), crossGreen);
  crossH.position.set(-56.7, 3.6, 20.6);
  group.add(crossV, crossH);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 1.3, 4.4),
    new THREE.MeshStandardMaterial({ map: textures.pharmacySignMap, roughness: 0.4 }),
  );
  sign.position.set(-56.8, 3.7, 26.0);
  group.add(sign);

  return group;
}

export function createBiyerPandalProps(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): { group: THREE.Group; wooferCones: THREE.Mesh[] } {
  const group = new THREE.Group();
  const stageMat = new THREE.MeshStandardMaterial({ color: '#9f1239', roughness: 0.42 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.22, metalness: 0.82 });
  const carpetMat = new THREE.MeshStandardMaterial({ color: '#be123c', roughness: 0.88 });
  const speakerMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.45, metalness: 0.5 });
  const coneMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 0.55,
  });
  const wooferCones: THREE.Mesh[] = [];

  // Raised Wedding DJ Stage (pandal_stage 70.5..74.2, z 22.5..29.5)
  const stage = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.25, 6.8), stageMat);
  stage.position.set(72.35, 0.625, 26.0);
  stage.castShadow = !isSoftwareGl;
  stage.receiveShadow = true;
  const stageTrim = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.14, 6.92), goldMat);
  stageTrim.position.set(72.35, 1.25, 26.0);
  group.add(stage, stageTrim);

  // Plush Crimson Wedding Sofa & DJ Console on Stage
  const djBooth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 2.4), speakerMat);
  djBooth.position.set(71.8, 1.75, 26.0);
  group.add(djBooth);

  // Twin Towering DJ Speaker Stacks flanking Stage
  for (const sz of [21.6, 30.4]) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 1.15), speakerMat);
    cab.position.set(72.0, 1.1, sz);
    cab.castShadow = !isSoftwareGl;
    group.add(cab);
    for (const cy of [0.68, 1.56]) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.24, 0.12, 20), coneMat);
      cone.rotation.z = Math.PI / 2;
      cone.position.set(71.38, cy, sz);
      group.add(cone);
      wooferCones.push(cone);
    }
  }

  // Festive Shamiana Canopy Posts + Hanging Genda Marigold Garlands + Red Carpet Runner
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 4.2), carpetMat);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(64.0, 0.068, 26.0);
  group.add(carpet);

  for (const px of [59.5, 73.8]) {
    for (const pz of [17.8, 34.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 4.2, 12), goldMat);
      pole.position.set(px, 2.1, pz);
      group.add(pole);
    }
  }

  const marigoldOrange = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.45 });
  const marigoldYellow = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.42 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fb7185' });
  const garGeo = new THREE.SphereGeometry(0.16, 10, 10);

  for (const gz of [17.8, 26.0, 34.2]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const gx = THREE.MathUtils.lerp(59.5, 73.8, t);
      const gy = 4.15 - Math.sin(t * Math.PI) * 0.95;
      pts.push(new THREE.Vector3(gx, gy, gz));
      if (i > 0 && i < 10) {
        const flower = new THREE.Mesh(garGeo, i % 2 === 0 ? marigoldOrange : marigoldYellow);
        flower.position.set(gx, gy - 0.14, gz);
        group.add(flower);
      }
    }
    const wire = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.025, 6, false),
      bulbMat,
    );
    group.add(wire);
  }

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 1.35, 4.6),
    new THREE.MeshStandardMaterial({ map: textures.pandalSignMap, roughness: 0.4 }),
  );
  sign.position.set(59.6, 3.85, 26.0);
  group.add(sign);

  return { group, wooferCones };
}

export function createRailCrossingGate(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): {
  group: THREE.Group;
  beaconMats: THREE.MeshStandardMaterial[];
  boomArms: Array<{ arm: THREE.Group; side: 1 | -1 }>;
} {
  const group = new THREE.Group();
  const trackZ = RAILWAY_TRACK_Z;
  const ballastMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.95, metalness: 0.04 });
  const railMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: 0.88 });
  const tieMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.9 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: '#ca8a04', roughness: 0.55 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.48, metalness: 0.5 });
  const brickArchMat = new THREE.MeshStandardMaterial({
    map: textures.wallBrickMap,
    normalMap: textures.wallBrickNormal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.85,
  });
  const darkTunnelMat = new THREE.MeshBasicMaterial({ color: '#020617' });
  const platformMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.82 });
  const tactileMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.6 });
  const stationWallMat = new THREE.MeshStandardMaterial({ color: '#ccfbf1', roughness: 0.65 });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: '#0369a1',
    roughness: 0.38,
    metalness: 0.52,
    normalMap: textures.tinNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
  const woodBenchMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.72 });
  const barRed = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.35 });
  const barWhite = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 });
  const beaconMats = [
    new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 1.5 }),
    new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.1 }),
  ];

  // Full 318m Gravel Ballast Bed & Twin Steel Rails across East-West Moholla Corridor
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(318.0, 0.08, 4.6), ballastMat);
  ballast.position.set(0, 0.04, trackZ);
  ballast.receiveShadow = true;
  group.add(ballast);

  for (const rz of [trackZ - 0.85, trackZ + 0.85]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(318.0, 0.1, 0.16), railMat);
    track.position.set(0, 0.11, rz);
    group.add(track);
  }

  // Twin Brick Railway Tunnel Portals at West & East Perimeter Boundaries (x = ±158.2)
  for (const px of [-158.2, 158.2]) {
    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 5.2, 1.4), brickArchMat);
    leftPillar.position.set(px, 2.6, trackZ - 2.45);
    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 5.2, 1.4), brickArchMat);
    rightPillar.position.set(px, 2.6, trackZ + 2.45);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.25, 6.4), brickArchMat);
    lintel.position.set(px, 5.45, trackZ);
    const portalDark = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 3.6), darkTunnelMat);
    portalDark.position.set(px + (px < 0 ? -0.8 : 0.8), 2.2, trackZ);
    group.add(leftPillar, rightPillar, lintel, portalDark);
  }

  // 6 Gateman Cabins matching WALLS AABBs + 5 Animated Level Crossings (x = -118, -52, 0, +52, +118)
  const boomArms: Array<{ arm: THREE.Group; side: 1 | -1 }> = [];
  const cabinConfigs: Array<{ cx: number; cz: number; gateX: number; side: 1 | -1; idx: number }> = [
    { cx: -123.75, cz: 82.15, gateX: -121.2, side: 1, idx: 0 },
    { cx: -57.75, cz: 82.15, gateX: -55.4, side: 1, idx: 0 },
    { cx: -9.65, cz: 82.15, gateX: -6.8, side: 1, idx: 1 },
    { cx: 9.65, cz: 82.15, gateX: 6.8, side: -1, idx: 0 },
    { cx: 57.75, cz: 82.15, gateX: 55.4, side: -1, idx: 1 },
    { cx: 123.75, cz: 82.15, gateX: 121.2, side: -1, idx: 1 },
  ];

  for (const cfg of cabinConfigs) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.65, 3.3), cabinMat);
    cabin.position.set(cfg.cx, 1.325, cfg.cz);
    cabin.castShadow = !isSoftwareGl;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.24, 3.8), roofMat);
    roof.position.set(cfg.cx, 2.74, cfg.cz);
    group.add(cabin, roof);

    // Crossing Signal Post & Dual-Bulb Beacon
    const sigPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 10), roofMat);
    sigPost.position.set(cfg.gateX, 1.6, trackZ - 3.2);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 12), beaconMats[cfg.idx]);
    bulb.position.set(cfg.gateX, 3.26, trackZ - 3.2);
    group.add(sigPost, bulb);

    // Pivotable Striped Boom Arm (animated dynamically in tick())
    const boomGroup = new THREE.Group();
    boomGroup.position.set(cfg.gateX, 1.25, trackZ - 3.05);
    boomGroup.rotation.z = cfg.side === 1 ? 0.72 : -0.72;
    for (let s = 0; s < 6; s++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.92, 10),
        s % 2 === 0 ? barRed : barWhite,
      );
      seg.rotation.z = Math.PI / 2;
      seg.position.x = cfg.side * (0.48 + s * 0.92);
      boomGroup.add(seg);
    }
    group.add(boomGroup);
    boomArms.push({ arm: boomGroup, side: cfg.side });
  }

  // Opposite-side signal posts at x = -114.6, -48.6, 48.6 & 114.6
  for (const sx of [-114.6, -48.6, 48.6, 114.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.0, 10), roofMat);
    post.position.set(sx, 1.5, trackZ + 3.2);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), beaconMats[sx < 0 ? 1 : 0]);
    bulb.position.set(sx, 3.05, trackZ + 3.2);
    group.add(post, bulb);
  }

  // Moholla Rail Station Platform (z = 71.5..78.5) + Ticket Booth + Tin Canopy + Benches
  const platform = new THREE.Mesh(new THREE.BoxGeometry(32.0, 0.24, 6.8), platformMat);
  platform.position.set(-4.0, 0.12, 74.8);
  platform.receiveShadow = true;
  const tactileStrip = new THREE.Mesh(new THREE.BoxGeometry(32.0, 0.03, 0.42), tactileMat);
  tactileStrip.position.set(-4.0, 0.25, 77.95);
  group.add(platform, tactileStrip);

  const booth = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.0, 3.5), stationWallMat);
  booth.position.set(-13.25, 1.5, 72.25);
  booth.castShadow = !isSoftwareGl;
  const boothRoof = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.22, 4.3), canopyMat);
  boothRoof.position.set(-13.25, 3.1, 72.25);
  const ticketGrille = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.12), roofMat);
  ticketGrille.position.set(-13.25, 1.65, 74.02);
  group.add(booth, boothRoof, ticketGrille);

  // Open Station Canopy & Waiting Benches
  const canopyRoof = new THREE.Mesh(new THREE.BoxGeometry(19.0, 0.16, 4.4), canopyMat);
  canopyRoof.position.set(-1.5, 3.25, 75.2);
  canopyRoof.rotation.x = 0.08;
  canopyRoof.castShadow = !isSoftwareGl;
  group.add(canopyRoof);
  for (const px of [-9.0, -1.5, 6.0]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.2, 10), roofMat);
    col.position.set(px, 1.6, 75.2);
    group.add(col);
  }
  for (const bx of [-6.0, 0.0, 5.5]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.78), woodBenchMat);
    bench.position.set(bx, 0.62, 75.4);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.68), roofMat);
    legL.position.set(bx - 1.0, 0.38, 75.4);
    const legR = legL.clone();
    legR.position.x = bx + 1.0;
    group.add(bench, legL, legR);
  }

  // Station Nameboard above Canopy
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.55, 0.16), roofMat);
  signFrame.position.set(-2.0, 4.25, 75.2);
  const signFaceMat = new THREE.MeshStandardMaterial({
    map: textures.railStationSignMap,
    emissive: '#ffffff',
    emissiveMap: textures.railStationSignMap,
    emissiveIntensity: 0.25,
    roughness: 0.35,
  });
  const signFront = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.4), signFaceMat);
  signFront.position.set(-2.0, 4.25, 75.29);
  const signBack = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.4), signFaceMat);
  signBack.rotation.y = Math.PI;
  signBack.position.set(-2.0, 4.25, 75.11);
  group.add(signFrame, signFront, signBack);

  // Merge all static track, platform, and cabin parts BEFORE adding InstancedMesh sleepers
  optimizeStaticGroup(group, boomArms.map((b) => b.arm));

  const sleeperCount = 263;
  const sleeperGeo = new THREE.BoxGeometry(0.32, 0.07, 2.4);
  const sleeperInst = new THREE.InstancedMesh(sleeperGeo, tieMat, sleeperCount);
  const sDummy = new THREE.Object3D();
  for (let i = 0; i < sleeperCount; i++) {
    sDummy.position.set(-157.2 + i * 1.2, 0.065, trackZ);
    sDummy.rotation.set(0, 0, 0);
    sDummy.scale.set(1, 1, 1);
    sDummy.updateMatrix();
    sleeperInst.setMatrixAt(i, sDummy.matrix);
  }
  sleeperInst.instanceMatrix.needsUpdate = true;
  sleeperInst.computeBoundingSphere();
  group.add(sleeperInst);

  return { group, beaconMats, boomArms };
}

export function createBanglaTrainModel(isSoftwareGl: boolean): {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  headlightBeam: THREE.Mesh;
} {
  const group = new THREE.Group();
  const wheels: THREE.Mesh[] = [];

  const locoGreenMat = new THREE.MeshStandardMaterial({ color: '#065f46', roughness: 0.38, metalness: 0.25 });
  const redStripeMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.35, metalness: 0.2 });
  const yellowTrimMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.32, metalness: 0.3 });
  const coachCreamMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45, metalness: 0.12 });
  const roofDarkMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6, metalness: 0.45 });
  const chassisMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.72, metalness: 0.5 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.35, metalness: 0.82 });
  const windowLitMat = new THREE.MeshStandardMaterial({
    color: '#fef08a',
    emissive: '#fbbf24',
    emissiveIntensity: 1.45,
    roughness: 0.2,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#fef08a',
    emissiveIntensity: 2.2,
  });

  const addBogieWheels = (bx: number) => {
    for (const wx of [bx - 0.8, bx + 0.8]) {
      for (const wz of [-0.95, 0.95]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 14), wheelMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.36, wz);
        group.add(wheel);
        wheels.push(wheel);
      }
    }
  };

  // --- Bangladesh Railway Diesel Locomotive (front at x = +20.8) ---
  const locoFrame = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.42, 2.55), chassisMat);
  locoFrame.position.set(15.2, 0.78, 0);
  const locoBody = new THREE.Mesh(new THREE.BoxGeometry(9.2, 2.25, 2.5), locoGreenMat);
  locoBody.position.set(14.7, 2.1, 0);
  locoBody.castShadow = !isSoftwareGl;
  const locoBand = new THREE.Mesh(new THREE.BoxGeometry(9.26, 0.46, 2.54), redStripeMat);
  locoBand.position.set(14.7, 1.5, 0);
  const locoNose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.6, 2.38), yellowTrimMat);
  locoNose.position.set(19.9, 1.75, 0);
  locoNose.castShadow = !isSoftwareGl;
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.28, 2.62), roofDarkMat);
  cabRoof.position.set(14.7, 3.35, 0);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 1.85), windowLitMat);
  windshield.position.set(19.32, 2.68, 0);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.55, 10), roofDarkMat);
  exhaust.position.set(13.8, 3.65, 0);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12), headlightMat);
  lamp.rotation.z = Math.PI / 2;
  lamp.position.set(20.78, 2.1, 0);
  group.add(locoFrame, locoBody, locoBand, locoNose, cabRoof, windshield, exhaust, lamp);
  addBogieWheels(12.2);
  addBogieWheels(18.2);

  // Additive Volumetric Locomotive Headlight Cone
  const beamGeo = new THREE.ConeGeometry(2.6, 11.5, 18, 1, true);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#fef08a',
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const headlightBeam = new THREE.Mesh(beamGeo, beamMat);
  headlightBeam.position.set(26.5, 1.85, 0);
  group.add(headlightBeam);

  // --- 3 Intercity Passenger Coaches (x = +4.6, -5.6, -15.8) ---
  for (const cx of [4.6, -5.6, -15.8]) {
    const under = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.36, 2.45), chassisMat);
    under.position.set(cx, 0.76, 0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(9.1, 2.15, 2.48), locoGreenMat);
    body.position.set(cx, 2.0, 0);
    body.castShadow = !isSoftwareGl;
    const creamBand = new THREE.Mesh(new THREE.BoxGeometry(9.14, 0.78, 2.51), coachCreamMat);
    creamBand.position.set(cx, 2.22, 0);
    const redTrim = new THREE.Mesh(new THREE.BoxGeometry(9.16, 0.28, 2.52), redStripeMat);
    redTrim.position.set(cx, 1.56, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(9.25, 0.28, 2.58), roofDarkMat);
    roof.position.set(cx, 3.2, 0);
    const gangway = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.9, 1.7), roofDarkMat);
    gangway.position.set(cx + 5.1, 1.95, 0);
    group.add(under, body, creamBand, redTrim, roof, gangway);

    // 4 Warm Glowing Windows per side
    for (let w = -3.0; w <= 3.0; w += 2.0) {
      const winMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.62, 2.56), windowLitMat);
      winMesh.position.set(cx + w, 2.25, 0);
      group.add(winMesh);
    }
    addBogieWheels(cx - 2.9);
    addBogieWheels(cx + 2.9);
  }

  return { group, wheels, headlightBeam };
}

export function createClotheslineProp(): THREE.Group {
  const grp = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.84 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.8 });
  const clothColors = ['#ef4444', '#38bdf8', '#facc15', '#22c55e', '#f472b6'];

  for (const px of [-2.1, 2.1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 2.0, 8), poleMat);
    pole.position.set(px, 1.0, 0);
    grp.add(pole);
  }
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 4.2, 6), ropeMat);
  line.rotation.z = Math.PI / 2;
  line.position.set(0, 1.86, 0);
  grp.add(line);

  clothColors.forEach((hex, idx) => {
    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.72 + (idx % 2) * 0.16, 0.06),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.78 }),
    );
    cloth.position.set(-1.45 + idx * 0.72, 1.44, 0);
    cloth.rotation.x = idx % 2 === 0 ? 0.08 : -0.07;
    grp.add(cloth);
  });

  return optimizeStaticGroup(grp);
}

export function createRooftopMachanProp(isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const bambooMat = new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.78 });
  const chataiMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.88 });
  const moraColors = ['#e11d48', '#0284c7'];

  // Woven Chatai Mat
  const matMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 2.2), chataiMat);
  matMesh.position.set(0, 0.025, 0);
  matMesh.receiveShadow = true;
  grp.add(matMesh);

  // Twin Colorful Woven Moras
  moraColors.forEach((hex, i) => {
    const mora = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.38, 12),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5 }),
    );
    mora.position.set(-0.65 + i * 1.3, 0.21, 0.15);
    mora.castShadow = !isSoftwareGl;
    grp.add(mora);
  });

  // Bamboo Pergola Frame
  for (const px of [-1.25, 1.25]) {
    for (const pz of [-1.05, 1.05]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 2.25, 8), bambooMat);
      post.position.set(px, 1.125, pz);
      grp.add(post);
    }
    const sideBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.25, 8), bambooMat);
    sideBeam.rotation.x = Math.PI / 2;
    sideBeam.position.set(px, 2.22, 0);
    grp.add(sideBeam);
  }
  for (let bz = -1.0; bz <= 1.0; bz += 0.5) {
    const crossBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.65, 8), bambooMat);
    crossBeam.rotation.z = Math.PI / 2;
    crossBeam.position.set(0, 2.28, bz);
    grp.add(crossBeam);
  }

  return optimizeStaticGroup(grp);
}

export function createParkedCarModel(
  bodyHex: string,
  isSoftwareGl: boolean,
  isTaxi = false,
): THREE.Group {
  const grp = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.28, metalness: 0.48 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.65, metalness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.14,
    metalness: 0.65,
  });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.3, metalness: 0.82 });
  const headMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });

  // Lower Chassis & Bumpers (4.4m long along X, 2.0m wide along Z)
  const lower = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.66, 1.92), bodyMat);
  lower.position.set(0, 0.56, 0);
  lower.castShadow = !isSoftwareGl;
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 1.94), trimMat);
  frontBumper.position.set(2.16, 0.34, 0);
  const rearBumper = frontBumper.clone();
  rearBumper.position.x = -2.16;

  // Cabin & Tinted Windshields
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.64, 1.66), bodyMat);
  cabin.position.set(-0.18, 1.18, 0);
  cabin.castShadow = !isSoftwareGl;
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.5, 1.7), glassMat);
  windshield.position.set(-0.14, 1.16, 0);
  const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.48, 1.5), glassMat);
  sideGlass.position.set(-0.18, 1.16, 0);

  // Headlights & Taillights
  for (const lz of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.32), headMat);
    hl.position.set(2.14, 0.62, lz);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.34), tailMat);
    tl.position.set(-2.14, 0.64, lz);
    grp.add(hl, tl);
  }

  // 4 Wheels
  for (const wx of [-1.32, 1.32]) {
    for (const wz of [-0.94, 0.94]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.24, 16), tireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wx, 0.35, wz);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 10), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(wx, 0.35, wz);
      grp.add(tire, rim);
    }
  }

  if (isTaxi) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.22, 0.72),
      new THREE.MeshBasicMaterial({ color: '#fde047' }),
    );
    sign.position.set(0.05, 1.6, 0);
    grp.add(sign);
  }

  grp.add(lower, frontBumper, rearBumper, cabin, windshield, sideGlass);
  return optimizeStaticGroup(grp);
}

export function createPickupTruckModel(
  bodyHex: string,
  isSoftwareGl: boolean,
): THREE.Group {
  const grp = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.34, metalness: 0.42 });
  const bedMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.75, metalness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.18, metalness: 0.6 });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.3, metalness: 0.8 });
  const tarpMat = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.78 });

  // Chassis + Cab + Cargo Bed (4.6m long along X, 2.2m wide along Z)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.56, 2.08), bedMat);
  chassis.position.set(0, 0.56, 0);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 2.06), bodyMat);
  hood.position.set(1.58, 0.92, 0);
  hood.castShadow = !isSoftwareGl;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.24, 1.98), bodyMat);
  cab.position.set(0.45, 1.24, 0);
  cab.castShadow = !isSoftwareGl;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.56, 1.76), glassMat);
  glass.position.set(0.46, 1.44, 0);

  // Open Rear Bed + Cargo Crate Stack
  const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.48, 2.06), bodyMat);
  bedFloor.position.set(-1.25, 0.84, 0);
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.7, 1.65), tarpMat);
  cargo.position.set(-1.25, 1.38, 0);
  cargo.castShadow = !isSoftwareGl;

  // Rollbar
  const roll = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.65, 1.88), rimMat);
  roll.position.set(-0.32, 1.56, 0);

  // Wheels
  for (const wx of [-1.42, 1.42]) {
    for (const wz of [-1.04, 1.04]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 16), tireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wx, 0.4, wz);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(wx, 0.4, wz);
      grp.add(tire, rim);
    }
  }

  grp.add(chassis, hood, cab, glass, bedFloor, cargo, roll);
  return optimizeStaticGroup(grp);
}

export function createShippingContainerModel(
  colorHex: string,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): THREE.Group {
  const grp = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.48,
    metalness: 0.42,
    normalMap: textures.tinNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.72 });
  const barMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.3, metalness: 0.88 });

  // 6.4m long × 2.85m high × 2.5m deep freight container
  const body = new THREE.Mesh(new THREE.BoxGeometry(6.35, 2.75, 2.46), shellMat);
  body.position.set(0, 1.44, 0);
  body.castShadow = !isSoftwareGl;
  body.receiveShadow = true;
  grp.add(body);

  // Corner steel posts & top/bottom beams
  for (const cx of [-3.15, 3.15]) {
    for (const cz of [-1.22, 1.22]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.88, 0.18), frameMat);
      post.position.set(cx, 1.44, cz);
      grp.add(post);
    }
  }
  const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.62, 0.08), frameMat);
  doorSeam.position.set(3.2, 1.42, 0);
  grp.add(doorSeam);
  for (const bz of [-0.45, 0.45]) {
    const lockBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.55, 8), barMat);
    lockBar.position.set(3.22, 1.42, bz);
    grp.add(lockBar);
  }

  return optimizeStaticGroup(grp);
}

export function createAirdropCrateModel(isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const blueMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.42, metalness: 0.45 });
  const redCapMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.55, metalness: 0.12 });
  const strapMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.7 });
  const chuteMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.72 });
  const beaconMat = new THREE.MeshBasicMaterial({
    color: '#ef4444',
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.22, 1.65), blueMat);
  base.position.set(0, 0.61, 0);
  base.castShadow = !isSoftwareGl;
  base.receiveShadow = true;

  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.36, 1.74), redCapMat);
  lid.position.set(0, 1.38, 0);
  lid.castShadow = !isSoftwareGl;

  // Crossed cargo straps
  const strapX = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.56, 0.14), strapMat);
  strapX.position.set(0, 0.8, 0);
  const strapZ = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.56, 1.78), strapMat);
  strapZ.position.set(0, 0.8, 0);

  // Folded parachute pack strapped on top
  const chute = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.26, 0.64), chuteMat);
  chute.position.set(-0.2, 1.66, 0.15);
  chute.rotation.y = 0.25;

  // Tall PUBG/Free Fire red flare smoke column
  const flareCol = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.12, 11.5, 12, 1, true), beaconMat);
  flareCol.position.set(0.35, 7.2, -0.2);
  const ember = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 10),
    new THREE.MeshBasicMaterial({ color: '#fca5a5' }),
  );
  ember.position.set(0.35, 1.62, -0.2);

  grp.add(base, lid, strapX, strapZ, chute, flareCol, ember);
  return grp;
}

export function createBusStopShelterModel(isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: '#0369a1', roughness: 0.42, metalness: 0.65 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#bae6fd',
    roughness: 0.12,
    transparent: true,
    opacity: 0.42,
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.5, metalness: 0.45 });
  const benchMat = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.72 });
  const bannerMat = new THREE.MeshBasicMaterial({ color: '#fbbf24' });

  // Back Frame + Twin Pillars
  for (const px of [-2.4, 2.4]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.75, 10), steelMat);
    col.position.set(px, 1.375, -0.78);
    grp.add(col);
  }
  const backGlass = new THREE.Mesh(new THREE.BoxGeometry(4.65, 2.2, 0.06), glassMat);
  backGlass.position.set(0, 1.3, -0.78);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.14, 2.25), roofMat);
  canopy.position.set(0, 2.82, -0.05);
  canopy.rotation.x = 0.08;
  canopy.castShadow = !isSoftwareGl;
  const frontFascia = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.24, 0.1), bannerMat);
  frontFascia.position.set(0, 2.75, 1.05);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 0.65), benchMat);
  bench.position.set(0, 0.52, -0.32);

  grp.add(backGlass, canopy, frontFascia, bench);
  return optimizeStaticGroup(grp);
}

export function createBillboardHoarding(
  tex: THREE.CanvasTexture,
  w = 7.4,
  h = 3.7,
  postHeight = 4.0,
  isSoftwareGl = false,
): THREE.Group {
  const grp = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.42, metalness: 0.75 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.85 });
  const accentTrimMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    emissive: '#f59e0b',
    emissiveIntensity: 0.35,
    roughness: 0.35,
  });
  const lightMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });

  const boardY = postHeight + h * 0.45;
  for (const px of [-w * 0.34, w * 0.34]) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.72), concreteMat);
    plinth.position.set(px, 0.23, 0);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, boardY, 10), steelMat);
    post.position.set(px, boardY / 2, 0);
    post.castShadow = !isSoftwareGl;
    grp.add(plinth, post);
  }

  // Rear structural steel cross-truss
  const crossBrace = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.14, 0.14), steelMat);
  crossBrace.position.set(0, postHeight * 0.58, -0.14);
  grp.add(crossBrace);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.36, h + 0.36, 0.26), steelMat);
  frame.position.set(0, boardY, 0);
  frame.castShadow = !isSoftwareGl;

  // Warm amber perimeter cornice strip
  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.08, 0.3), accentTrimMat);
  topTrim.position.set(0, boardY + h * 0.5 + 0.18, 0);
  const botTrim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.08, 0.3), accentTrimMat);
  botTrim.position.set(0, boardY - h * 0.5 - 0.18, 0);

  const faceMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.32,
    emissive: '#ffffff',
    emissiveMap: tex,
    emissiveIntensity: 0.26,
  });
  // Keep +/-0.15 clear of frame +/-0.13 to guarantee zero z-fighting
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
  front.position.set(0, boardY, 0.15);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
  back.rotation.y = Math.PI;
  back.position.set(0, boardY, -0.15);

  // Twin floodlight arms & reflector hoods on both faces
  for (const side of [-1, 1]) {
    for (const lx of [-w * 0.25, w * 0.25]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.65), steelMat);
      arm.position.set(lx, boardY + h * 0.5 + 0.2, side * 0.36);
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.16, 10), steelMat);
      hood.position.set(lx, boardY + h * 0.5 + 0.12, side * 0.65);
      hood.rotation.x = side * 0.35;
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.05, 10), lightMat);
      bulb.position.set(lx, boardY + h * 0.5 + 0.05, side * 0.65);
      bulb.rotation.x = side * 0.35;
      grp.add(arm, hood, bulb);
    }
  }

  grp.add(frame, topTrim, botTrim, front, back);
  return grp;
}

export function createBoulevardWelcomeArch(
  tex: THREE.CanvasTexture,
  spanWidth = 12.6,
  isSoftwareGl = false,
): THREE.Group {
  const grp = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.42, metalness: 0.75 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.35, metalness: 0.5 });
  const ledStripMat = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
  const soffitLightMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });

  // Twin side piers with concrete plinths + diagonal gusset braces straddling wide boulevard
  for (const px of [-spanWidth / 2, spanWidth / 2]) {
    const sign = px < 0 ? 1 : -1;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.42, 1.18), concreteMat);
    plinth.position.set(px, 0.21, 0);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.68, 6.2, 0.68), steelMat);
    pier.position.set(px, 3.1, 0);
    pier.castShadow = !isSoftwareGl;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.52, 0.96), trimMat);
    base.position.set(px, 0.68, 0);
    const gusset = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.18, 0.22), steelMat);
    gusset.position.set(px + sign * 0.55, 4.45, 0);
    gusset.rotation.z = sign * 0.72;
    grp.add(plinth, pier, base, gusset);
  }

  // Overhead Truss Banner + Glowing Cornice & Downward Soffit Wash Lights
  const beam = new THREE.Mesh(new THREE.BoxGeometry(spanWidth + 0.95, 1.96, 0.32), steelMat);
  beam.position.set(0, 5.75, 0);
  const topStrip = new THREE.Mesh(new THREE.BoxGeometry(spanWidth + 1.0, 0.09, 0.36), ledStripMat);
  topStrip.position.set(0, 6.76, 0);
  const botStrip = new THREE.Mesh(new THREE.BoxGeometry(spanWidth + 1.0, 0.09, 0.36), ledStripMat);
  botStrip.position.set(0, 4.74, 0);

  for (const lx of [-spanWidth * 0.28, 0, spanWidth * 0.28]) {
    const wash = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.2), soffitLightMat);
    wash.position.set(lx, 4.71, 0);
    grp.add(wash);
  }

  const bannerMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.34,
    emissive: '#ffffff',
    emissiveMap: tex,
    emissiveIntensity: 0.28,
  });
  // Place +/-0.20 clear of beam +/-0.16 so banners never flicker
  const front = new THREE.Mesh(new THREE.PlaneGeometry(spanWidth - 0.6, 1.65), bannerMat);
  front.position.set(0, 5.75, 0.2);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(spanWidth - 0.6, 1.65), bannerMat);
  back.rotation.y = Math.PI;
  back.position.set(0, 5.75, -0.2);

  grp.add(beam, topStrip, botStrip, front, back);
  return grp;
}

export function createRoadDividerCluster(): THREE.Group {
  const grp = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.82 });
  const yellowMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.5 });
  const coneMat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.45 });
  const stripeMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' });

  // Highway Jersey Barrier
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 0.64), concreteMat);
  base.position.set(0, 0.175, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.42, 0.34), yellowMat);
  top.position.set(0, 0.56, 0);
  grp.add(base, top);

  // Twin Reflective Traffic Cones flanking barrier
  for (const cx of [-2.05, 2.05]) {
    const cBase = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.38), coneMat);
    cBase.position.set(cx, 0.03, 0);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 0.54, 12), coneMat);
    cone.position.set(cx, 0.3, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.12, 12), stripeMat);
    band.position.set(cx, 0.34, 0);
    grp.add(cBase, cone, band);
  }

  return optimizeStaticGroup(grp);
}

export function createStreetBenchModel(isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.72 });
  const ironMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.75 });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.1, 0.58), woodMat);
  seat.position.set(0, 0.46, 0);
  seat.castShadow = !isSoftwareGl;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.42, 0.09), woodMat);
  back.position.set(0, 0.78, -0.25);
  back.rotation.x = -0.14;
  for (const lx of [-0.86, 0.86]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.54), ironMat);
    leg.position.set(lx, 0.23, 0);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.09), ironMat);
    post.position.set(lx, 0.72, -0.24);
    grp.add(leg, post);
  }
  grp.add(seat, back);
  return optimizeStaticGroup(grp);
}

export function createJhalmuriCartModel(isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.78 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.65 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#fef08a',
    emissive: '#fbbf24',
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.58,
  });
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.78 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.68, 0.92), woodMat);
  box.position.set(0, 0.7, 0);
  box.castShadow = !isSoftwareGl;
  const snackCase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.65), glassMat);
  snackCase.position.set(-0.2, 1.32, 0);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: '#fde047' }),
  );
  bulb.position.set(0.45, 1.72, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8), frameMat);
  pole.position.set(0.45, 1.36, 0);
  for (const wz of [-0.52, 0.52]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14), wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 0.32, wz);
    grp.add(wheel);
  }

  grp.add(box, snackCase, pole, bulb);
  return optimizeStaticGroup(grp);
}

export function createBanyanTree(isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const barkMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.92 });
  const leafDark = new THREE.MeshStandardMaterial({ color: '#14532d', roughness: 0.72 });
  const leafMid = new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.7 });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 4.2, 10), barkMat);
  trunk.position.set(0, 2.1, 0);
  trunk.castShadow = !isSoftwareGl;
  grp.add(trunk);

  // Hanging aerial prop roots
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.3, 6), barkMat);
    root.position.set(Math.cos(a) * 1.45, 1.65, Math.sin(a) * 1.45);
    grp.add(root);
  }

  // Broad multi-lobed banyan shade canopy
  const lobes: Array<[number, number, number, number, THREE.MeshStandardMaterial]> = [
    [0, 5.1, 0, 3.2, leafDark],
    [-2.0, 4.4, 1.1, 2.35, leafMid],
    [2.1, 4.5, -0.9, 2.4, leafMid],
    [0.5, 4.3, 2.1, 2.2, leafDark],
    [-0.9, 4.2, -2.0, 2.25, leafMid],
  ];
  for (const [lx, ly, lz, rad, mat] of lobes) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 10), mat);
    dome.scale.set(1.15, 0.68, 1.15);
    dome.position.set(lx, ly, lz);
    dome.castShadow = !isSoftwareGl;
    grp.add(dome);
  }

  return optimizeStaticGroup(grp);
}

export function createRooftopChhilekotha(accentHex: string, isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.78 });
  const roofMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.5 });
  const doorMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.55 });

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.35, 3.0), wallMat);
  cabin.position.set(0, 1.175, 0);
  cabin.castShadow = !isSoftwareGl;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 3.5), roofMat);
  slab.position.set(0, 2.45, 0);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.12), doorMat);
  door.position.set(0, 0.95, 1.52);

  grp.add(cabin, slab, door);
  return optimizeStaticGroup(grp);
}

export function createBushCluster(isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const leafDark = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.78 });
  const leafBright = new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.72 });
  const blossomMat = new THREE.MeshStandardMaterial({ color: '#f43f5e', roughness: 0.5 });

  const lobes: Array<[number, number, number, number, THREE.MeshStandardMaterial]> = [
    [0, 0.48, 0, 0.62, leafDark],
    [-0.45, 0.36, 0.24, 0.44, leafBright],
    [0.44, 0.38, -0.22, 0.46, leafDark],
    [0.14, 0.34, 0.42, 0.38, leafBright],
  ];
  for (const [x, y, z, r, mat] of lobes) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), mat);
    s.scale.set(1.08, 0.84, 1.08);
    s.position.set(x, y, z);
    s.castShadow = !isSoftwareGl;
    grp.add(s);
  }
  for (const [bx, by, bz] of [
    [-0.35, 0.62, 0.28],
    [0.32, 0.68, -0.1],
    [0.05, 0.85, 0.12],
  ]) {
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), blossomMat);
    fl.position.set(bx, by, bz);
    grp.add(fl);
  }
  return optimizeStaticGroup(grp);
}

export function createHedgeRow(length: number, isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const curbMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.84 });
  const hedgeMat = new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.76 });
  const topMat = new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.72 });

  const curb = new THREE.Mesh(new THREE.BoxGeometry(length + 0.2, 0.18, 0.92), curbMat);
  curb.position.set(0, 0.09, 0);
  curb.receiveShadow = true;

  const body = new THREE.Mesh(new THREE.BoxGeometry(length, 0.72, 0.72), hedgeMat);
  body.position.set(0, 0.54, 0);
  body.castShadow = !isSoftwareGl;
  body.receiveShadow = true;

  const crest = new THREE.Mesh(new THREE.BoxGeometry(length - 0.12, 0.2, 0.56), topMat);
  crest.position.set(0, 0.94, 0);
  grp.add(curb, body, crest);
  return optimizeStaticGroup(grp);
}

export function createMotorbikeModel(bodyHex: string, isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.28, metalness: 0.52 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.72 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.78 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.25, metalness: 0.88 });
  const headMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });

  for (const wx of [-0.62, 0.62]) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 14), seatMat);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(wx, 0.28, 0);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 10), chromeMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(wx, 0.28, 0);
    grp.add(tire, rim);
  }
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.36, 0.28), frameMat);
  engine.position.set(0, 0.42, 0);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.28, 0.34), bodyMat);
  tank.position.set(0.16, 0.76, 0);
  tank.castShadow = !isSoftwareGl;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.3), seatMat);
  seat.position.set(-0.32, 0.74, 0);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.76, 8), chromeMat);
  fork.position.set(0.5, 0.62, 0);
  fork.rotation.z = 0.34;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.66, 8), frameMat);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.38, 0.98, 0);
  const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), headMat);
  headlight.position.set(0.54, 0.88, 0);
  const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.16), tailMat);
  taillight.position.set(-0.7, 0.74, 0);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.78, 8), chromeMat);
  exhaust.rotation.z = Math.PI / 2;
  exhaust.position.set(-0.26, 0.34, 0.18);

  grp.add(engine, tank, seat, fork, handle, headlight, taillight, exhaust);
  return optimizeStaticGroup(grp);
}

export function createDhakaMiniBusModel(
  bodyHex: string,
  isSoftwareGl: boolean,
): THREE.Group {
  const grp = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.36, metalness: 0.34 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.35, metalness: 0.2 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.16, metalness: 0.65 });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.86 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.3, metalness: 0.8 });
  const rackMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.7 });
  const headMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });

  // 5.5m long × 2.35m wide × 2.55m tall Dhaka Mini-Bus / Leguna
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.45, 2.2), rackMat);
  chassis.position.set(0, 0.56, 0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.35, 1.75, 2.24), bodyMat);
  body.position.set(0, 1.56, 0);
  body.castShadow = !isSoftwareGl;
  body.receiveShadow = true;

  const band = new THREE.Mesh(new THREE.BoxGeometry(5.39, 0.3, 2.28), stripeMat);
  band.position.set(0, 1.18, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5.45, 0.22, 2.3), roofMat);
  roof.position.set(0, 2.52, 0);

  // Side windows & Front Windshield
  const sideWin = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.62, 2.3), glassMat);
  sideWin.position.set(-0.2, 1.9, 0);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 1.95), glassMat);
  windshield.position.set(2.68, 1.85, 0);

  // Rooftop steel luggage carrier & bundled parcel
  const rack = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 1.85), rackMat);
  rack.position.set(-0.4, 2.72, 0);
  const parcel = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.36, 1.25),
    new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.8 }),
  );
  parcel.position.set(-0.6, 2.9, 0);

  for (const lz of [-0.72, 0.72]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.36), headMat);
    hl.position.set(2.69, 0.92, lz);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.36), tailMat);
    tl.position.set(-2.69, 0.95, lz);
    grp.add(hl, tl);
  }

  for (const wx of [-1.65, 1.65]) {
    for (const wz of [-1.08, 1.08]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 16), tireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wx, 0.42, wz);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(wx, 0.42, wz);
      grp.add(tire, rim);
    }
  }

  grp.add(chassis, body, band, roof, sideWin, windshield, rack, parcel);
  return optimizeStaticGroup(grp);
}

export function createRoadsideTapriStall(
  roofHex: string,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): THREE.Group {
  const grp = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.78 });
  const counterMat = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.7 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.55, metalness: 0.5 });
  const tinMat = new THREE.MeshStandardMaterial({
    color: roofHex,
    roughness: 0.38,
    metalness: 0.55,
    normalMap: textures.tinNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });
  const jarMat = new THREE.MeshStandardMaterial({
    color: '#fef08a',
    emissive: '#f59e0b',
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.78,
  });
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fde047' });

  // 4.1m × 2.5m roadside tea/pan tapri kiosk
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(3.95, 2.25, 0.16), woodMat);
  backPanel.position.set(0, 1.125, -1.08);
  backPanel.castShadow = !isSoftwareGl;

  for (const px of [-1.92, 1.92]) {
    for (const pz of [-1.06, 1.06]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.45, 0.14), frameMat);
      post.position.set(px, 1.225, pz);
      grp.add(post);
    }
  }

  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.96, 1.05), counterMat);
  counter.position.set(0, 0.48, 0.35);
  counter.castShadow = !isSoftwareGl;
  counter.receiveShadow = true;

  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 2.95), tinMat);
  roof.position.set(0, 2.52, 0.05);
  roof.rotation.x = 0.1;
  roof.castShadow = !isSoftwareGl;

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), bulbMat);
  bulb.position.set(0, 2.28, 0.85);

  // Biscuits & Chanachur Glass Jars + Kettle on Counter
  for (let i = 0; i < 4; i++) {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 10), jarMat);
    jar.position.set(-1.1 + i * 0.48, 1.12, 0.42);
    grp.add(jar);
  }
  const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 12), frameMat);
  kettle.position.set(1.15, 1.11, 0.32);

  grp.add(backPanel, counter, roof, bulb, kettle);
  return optimizeStaticGroup(grp);
}

export function createBrickDepotCluster(isSoftwareGl: boolean): THREE.Group {
  const grp = new THREE.Group();
  const palletMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.88 });
  const brickMat = new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.88 });
  const brickLight = new THREE.MeshStandardMaterial({ color: '#c2410c', roughness: 0.85 });
  const bambooMat = new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.76 });
  const tarpMat = new THREE.MeshStandardMaterial({ color: '#0369a1', roughness: 0.72 });

  // Two stacked kiln-brick pallets + bamboo pole bundle (4.7m × 2.7m footprint)
  for (const [px, pz, h, mat] of [
    [-1.15, 0, 1.35, brickMat],
    [1.1, 0.15, 1.05, brickLight],
  ] as const) {
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 2.25), palletMat);
    pallet.position.set(px, 0.07, pz);
    const stack = new THREE.Mesh(new THREE.BoxGeometry(1.92, h, 2.05), mat);
    stack.position.set(px, 0.14 + h / 2, pz);
    stack.castShadow = !isSoftwareGl;
    stack.receiveShadow = true;
    grp.add(pallet, stack);
  }

  // Blue tarpaulin cover over cement bags + leaning bamboo poles
  const tarp = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.18, 2.1), tarpMat);
  tarp.position.set(1.1, 1.24, 0.15);
  grp.add(tarp);

  for (let b = 0; b < 4; b++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 2.85, 8), bambooMat);
    pole.position.set(-1.95 + b * 0.24, 1.1, -1.05);
    pole.rotation.x = -0.35;
    pole.rotation.z = 0.12;
    grp.add(pole);
  }

  return optimizeStaticGroup(grp);
}



