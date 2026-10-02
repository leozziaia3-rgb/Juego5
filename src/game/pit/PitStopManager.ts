/**
 * PitStopManager.ts - Professional High-Fidelity 3D Pit Stop System
 * Features:
 * - Option 1: Two-Bone Analytical Inverse Kinematics (IK) for all 4 wheel mechanics.
 *   Upper arm and forearm joints dynamically solve the Law of Cosines every frame,
 *   physically tracking the wheel hub as wheels slide out on axles and new slicks are mounted!
 * - Option 5: F1 TV Broadcast Multi-Camera Choreography & Spatial Pit Radio Communications.
 * - Dynamic path clearance: Front & Rear Jack operators standby and step aside cleanly.
 * - Real 4-wheel mechanical tire change with clean compressed air puffs and golden torque sparks.
 * - Specialists: Front Wing aero technician and Radiator cooling technician.
 * - Holographic AR diagnostic CAD chassis scanner.
 */

import * as THREE from 'three';
import { EngineSound } from '../audio/EngineSound';
import { CarModel } from '../models/CarModel';
import { ParticleSystem } from '../particles/ParticleSystem';
import { VehiclePhysics } from '../physics/VehiclePhysics';
import { CrewModelImporter } from '../loaders/CrewModelImporter';

export type PitStopPhase = 'none' | 'entry_autopilot' | 'docking' | 'jacks_up' | 'servicing' | 'jacks_down' | 'released';

export interface ArmIKJoints {
  shoulder: THREE.Group;
  upperArm: THREE.Mesh;
  elbow: THREE.Group;
  forearm: THREE.Mesh;
  hand: THREE.Group;
  l1: number;
  l2: number;
  isRight: boolean;
}

export interface PitCrewMember {
  group: THREE.Group;
  proceduralBody: THREE.Group;
  customBody?: THREE.Group;
  basePos: THREE.Vector3;
  baseRotY: number;
  standbyPos: THREE.Vector3;
  servicePos: THREE.Vector3;
  exitPos: THREE.Vector3;
  type: 'front_jack' | 'rear_jack' | 'wheel_fl' | 'wheel_fr' | 'wheel_rl' | 'wheel_rr' | 'wing_tech' | 'radiator_tech' | 'lollipop';
  toolMesh?: THREE.Object3D;
  leftArmIK?: ArmIKJoints;
  rightArmIK?: ArmIKJoints;
  wheelIndex?: number;
}

export class PitStopManager {
  public group: THREE.Group;
  private crewMembers: PitCrewMember[] = [];

  // Custom User-Uploaded 3D Pit Crew Mechanics State
  public isCustomCrew: boolean = false;
  public currentCrewName: string = 'Pit Crew Apex Scuderia';
  private customCrewProto: THREE.Group | null = null;

  // Spare Racing Slick Wheels resting beside each wheel mechanic
  private spareWheels: THREE.Group[] = [];

  // Holographic diagnostic CAD laser scanner
  private scannerGroup!: THREE.Group;
  private laserBeamMesh!: THREE.Mesh;
  private laserCurtainMesh!: THREE.Mesh;
  private holographicGridMesh!: THREE.Mesh;

  // Overhead air tool boom & hanging coiled hoses
  private airBoomsGroup!: THREE.Group;
  private airHoses: THREE.Mesh[] = [];

  // Digital Pit Wall Timing Screen
  private pitWallDisplayCanvas!: HTMLCanvasElement;
  private pitWallDisplayTex!: THREE.CanvasTexture;
  private pitWallDisplayMesh!: THREE.Mesh;

  // Active Lollipop sign
  private lollipopSignGroup!: THREE.Group;
  private lollipopDiscMat!: THREE.MeshStandardMaterial;

  // Pit Box Geometry (Centered at x = 0, z = -116)
  public readonly pitCenter = new THREE.Vector3(0, 0.35, -116);
  public readonly pitBounds = {
    minX: -16,
    maxX: 16,
    minZ: -120.5,
    maxZ: -111.5,
  };

  // State Machine
  public phase: PitStopPhase = 'none';
  public totalDuration = 0;
  public elapsedTime = 0;
  public repairProgress = 0;
  public initialDamageFraction = 0;
  public carElevatedY = 0;

  // Option 5: Live Broadcast Metadata & F1 Team Radio
  public radioMessage: string | null = null;
  public broadcastCamName: string | null = null;

  // Auto-docking interpolation state
  private dockStartPos = { x: 0, z: 0, yaw: 0 };
  private dockDuration = 0.8;

  // Cooldown to prevent repeating pit stops while exiting
  public cooldownTimer = 0;

  // Audio & effects single-shot triggers
  private lastGunSoundTime = 0;
  private lastSparkTime = 0;
  private lastAirBurstTime = 0;
  private hasTriggeredJackUpSound = false;

  // Display board & rest pose performance caching
  private displayBoardTimer = 0;
  private lastPhaseDrawn: PitStopPhase | null = null;
  private armsResetDone = false;
  private hasTriggeredJackDownSound = false;
  private hasTriggeredChime = false;
  private hasTriggeredRadioEntry = false;
  private hasTriggeredRadioTyres = false;
  private hasTriggeredRadioExit = false;

  constructor() {
    this.group = new THREE.Group();
    this.buildPitStallEnvironment();
    this.buildPitCrew();
    this.buildSpareWheels();
    this.buildDiagnosticLaser();
    this.buildAirBooms();
  }

  /**
   * Build the physical pit stall markings and digital timing board
   */
  private buildPitStallEnvironment(): void {
    const stallGroup = new THREE.Group();

    // High-grip Pit Stall Concrete Pad with team boundary lines
    const padGeo = new THREE.PlaneGeometry(36, 8.5);
    padGeo.rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.1,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.set(0, 0.008, -116);
    padMesh.receiveShadow = true;
    stallGroup.add(padMesh);

    // Pit Box Target Apron (Red and Yellow high-contrast hazard stripes)
    const boxGeo = new THREE.PlaneGeometry(9.0, 4.4);
    boxGeo.rotateX(-Math.PI / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#facc15';
    for (let x = -128; x < 384; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 24, 0);
      ctx.lineTo(x - 24 + 128, 128);
      ctx.lineTo(x - 48 + 128, 128);
      ctx.closePath();
      ctx.fill();
    }
    // Team Logo Text on Pit Stall
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('APEX RACING · BOX 01', 128, 70);

    const boxTex = new THREE.CanvasTexture(canvas);
    const boxMat = new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.5 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.set(0, 0.012, -116);
    stallGroup.add(boxMesh);

    // Digital Pit Wall Display Board
    this.pitWallDisplayCanvas = document.createElement('canvas');
    this.pitWallDisplayCanvas.width = 256;
    this.pitWallDisplayCanvas.height = 128;
    this.pitWallDisplayTex = new THREE.CanvasTexture(this.pitWallDisplayCanvas);

    const displayGeo = new THREE.BoxGeometry(3.6, 1.8, 0.2);
    const displayMat = new THREE.MeshBasicMaterial({ map: this.pitWallDisplayTex });
    this.pitWallDisplayMesh = new THREE.Mesh(displayGeo, displayMat);
    this.pitWallDisplayMesh.position.set(0, 2.6, -111.4);
    stallGroup.add(this.pitWallDisplayMesh);

    this.group.add(stallGroup);
  }

  /**
   * Build realistic 3D Pit Crew Mechanics with articulated Two-Bone IK skeletal arms
   */
  private buildPitCrew(): void {
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626, // Team Rosso Corsa racing fire suit
      roughness: 0.6,
      metalness: 0.1,
    });
    const suitBlackMat = new THREE.MeshStandardMaterial({
      color: 0x18181b, // Carbon black contrast panels
      roughness: 0.5,
    });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.4,
      roughness: 0.2,
    });
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x050505,
      metalness: 0.95,
      roughness: 0.05,
      clearcoat: 1.0,
    });
    const toolMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.2,
    });

    const createHumanCrewMember = (
      type: PitCrewMember['type'],
      standbyPos: THREE.Vector3,
      servicePos: THREE.Vector3,
      exitPos: THREE.Vector3,
      rotationY: number,
      wheelIndex?: number
    ): PitCrewMember => {
      const memberGroup = new THREE.Group();
      memberGroup.position.copy(standbyPos);
      memberGroup.rotation.y = rotationY;

      const proceduralBody = new THREE.Group();
      proceduralBody.name = 'ProceduralMechanicBody';
      memberGroup.add(proceduralBody);

      // 1. Legs & Racing Boots
      [-0.14, 0.14].forEach((legX) => {
        const legGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.72, 8);
        const leg = new THREE.Mesh(legGeo, suitBlackMat);
        leg.position.set(legX, 0.36, 0);
        leg.castShadow = true;
        proceduralBody.add(leg);

        const bootGeo = new THREE.BoxGeometry(0.16, 0.12, 0.26);
        const boot = new THREE.Mesh(bootGeo, suitBlackMat);
        boot.position.set(legX, 0.06, 0.05);
        proceduralBody.add(boot);
      });

      // 2. Torso with fireproof racing overalls
      const torsoGeo = new THREE.BoxGeometry(0.44, 0.58, 0.26);
      const torso = new THREE.Mesh(torsoGeo, suitMat);
      torso.position.set(0, 0.95, 0);
      torso.castShadow = true;
      proceduralBody.add(torso);

      // Sponsor Team Stripe across chest
      const stripeGeo = new THREE.BoxGeometry(0.45, 0.12, 0.27);
      const stripe = new THREE.Mesh(stripeGeo, suitBlackMat);
      stripe.position.set(0, 1.02, 0);
      proceduralBody.add(stripe);

      // 3. Head & Racing Helmet
      const neckGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8);
      const neck = new THREE.Mesh(neckGeo, suitBlackMat);
      neck.position.set(0, 1.28, 0);
      proceduralBody.add(neck);

      const helmetGeo = new THREE.SphereGeometry(0.16, 14, 12);
      helmetGeo.scale(0.9, 1.05, 1.0);
      const helmet = new THREE.Mesh(helmetGeo, helmetMat);
      helmet.position.set(0, 1.42, 0);
      helmet.castShadow = true;
      proceduralBody.add(helmet);

      // Dark Tinted Full-Face Visor
      const visorGeo = new THREE.BoxGeometry(0.18, 0.08, 0.12);
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 1.42, 0.11);
      proceduralBody.add(visor);

      // 4. ARMS: Articulated Two-Bone IK for Wheel Mechanics vs Standard Arms for others
      let leftArmIK: ArmIKJoints | undefined;
      let rightArmIK: ArmIKJoints | undefined;
      let toolMesh: THREE.Object3D | undefined;

      const isWheelMechanic = type.startsWith('wheel_');

      if (isWheelMechanic) {
        // TWO-BONE ANALYTICAL IK SKELETON:
        // Shoulder -> Upper Arm (L1 = 0.28m) -> Elbow -> Forearm (L2 = 0.26m) -> Hand Tool

        const createArmIK = (isRight: boolean): ArmIKJoints => {
          const l1 = 0.28;
          const l2 = 0.26;
          const sx = isRight ? 0.24 : -0.24;

          const shoulderGroup = new THREE.Group();
          shoulderGroup.position.set(sx, 1.12, 0.04);

          // Upper arm mesh extends down
          const upperGeo = new THREE.CylinderGeometry(0.055, 0.05, l1, 8);
          upperGeo.translate(0, -l1 / 2, 0);
          const upperArm = new THREE.Mesh(upperGeo, suitMat);
          shoulderGroup.add(upperArm);

          // Elbow joint
          const elbowGroup = new THREE.Group();
          elbowGroup.position.set(0, -l1, 0);

          const elbowCapGeo = new THREE.SphereGeometry(0.052, 8, 8);
          const elbowCap = new THREE.Mesh(elbowCapGeo, suitBlackMat);
          elbowGroup.add(elbowCap);

          // Forearm mesh extends down
          const foreGeo = new THREE.CylinderGeometry(0.048, 0.044, l2, 8);
          foreGeo.translate(0, -l2 / 2, 0);
          const forearm = new THREE.Mesh(foreGeo, suitMat);
          elbowGroup.add(forearm);

          // Hand / Tool joint
          const handGroup = new THREE.Group();
          handGroup.position.set(0, -l2, 0);
          const gloveGeo = new THREE.SphereGeometry(0.05, 8, 8);
          const glove = new THREE.Mesh(gloveGeo, suitBlackMat);
          handGroup.add(glove);

          elbowGroup.add(handGroup);
          shoulderGroup.add(elbowGroup);
          proceduralBody.add(shoulderGroup);

          return {
            shoulder: shoulderGroup,
            upperArm,
            elbow: elbowGroup,
            forearm,
            hand: handGroup,
            l1,
            l2,
            isRight,
          };
        };

        rightArmIK = createArmIK(true);
        leftArmIK = createArmIK(false);

        // Mount pneumatic torque gun on the right hand
        const gunGroup = new THREE.Group();
        const bodyGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.24, 10);
        bodyGeo.rotateX(Math.PI / 2);
        const gunBody = new THREE.Mesh(bodyGeo, toolMat);
        gunGroup.add(gunBody);

        const gripGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8);
        const grip = new THREE.Mesh(gripGeo, suitBlackMat);
        grip.position.set(0, -0.09, 0.02);
        gunGroup.add(grip);

        const socketGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.14, 10);
        socketGeo.rotateX(Math.PI / 2);
        const socket = new THREE.Mesh(socketGeo, toolMat);
        socket.position.set(0, 0, 0.18);
        gunGroup.add(socket);

        const hoseGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.65, 6);
        const hoseMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
        const hose = new THREE.Mesh(hoseGeo, hoseMat);
        hose.position.set(0, -0.36, 0.02);
        gunGroup.add(hose);

        // Position torque gun relative to right hand
        gunGroup.position.set(0, -0.04, 0.12);
        rightArmIK.hand.add(gunGroup);
        toolMesh = gunGroup;

      } else {
        // Standard arms for Jack operators, wing tech, and marshals
        [-0.27, 0.27].forEach((armX) => {
          const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.48, 8);
          armGeo.rotateX(0.5);
          const arm = new THREE.Mesh(armGeo, suitMat);
          arm.position.set(armX, 0.95, 0.12);
          proceduralBody.add(arm);
        });

        // Specialized tools
        if (type === 'front_jack') {
          const jackGroup = new THREE.Group();
          const frameGeo = new THREE.BoxGeometry(0.45, 0.1, 1.4);
          const frame = new THREE.Mesh(frameGeo, toolMat);
          frame.position.set(0, 0.1, 0.7);
          jackGroup.add(frame);

          const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8);
          handleGeo.rotateX(-0.6);
          const handle = new THREE.Mesh(handleGeo, suitMat);
          handle.position.set(0, 0.6, 0.2);
          jackGroup.add(handle);

          const wheelGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8);
          wheelGeo.rotateZ(Math.PI / 2);
          [-0.22, 0.22].forEach((wx) => {
            const w = new THREE.Mesh(wheelGeo, suitBlackMat);
            w.position.set(wx, 0.06, 1.3);
            jackGroup.add(w);
          });

          proceduralBody.add(jackGroup);
          toolMesh = jackGroup;
        } else if (type === 'rear_jack') {
          const jackGroup = new THREE.Group();
          const armGeo = new THREE.BoxGeometry(0.5, 0.08, 1.2);
          const arm = new THREE.Mesh(armGeo, toolMat);
          arm.position.set(0, 0.12, -0.6);
          jackGroup.add(arm);

          const leverGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8);
          leverGeo.rotateX(0.5);
          const lever = new THREE.Mesh(leverGeo, suitMat);
          lever.position.set(0, 0.55, -0.2);
          jackGroup.add(lever);

          proceduralBody.add(jackGroup);
          toolMesh = jackGroup;
        } else if (type === 'wing_tech') {
          const wrenchGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8);
          wrenchGeo.rotateZ(Math.PI / 2);
          const wrench = new THREE.Mesh(wrenchGeo, toolMat);
          wrench.position.set(0, 0.75, 0.3);
          proceduralBody.add(wrench);
          toolMesh = wrench;
        } else if (type === 'radiator_tech') {
          const lanceGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.65, 8);
          lanceGeo.rotateX(Math.PI / 2);
          const lance = new THREE.Mesh(lanceGeo, toolMat);
          lance.position.set(0, 0.8, 0.38);
          proceduralBody.add(lance);
          toolMesh = lance;
        } else if (type === 'lollipop') {
          this.lollipopSignGroup = new THREE.Group();
          const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 3.2, 8);
          const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.set(0, 1.6, 0.8);
          pole.rotateX(0.2);
          this.lollipopSignGroup.add(pole);

          const discGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24);
          discGeo.rotateX(Math.PI / 2);
          this.lollipopDiscMat = new THREE.MeshStandardMaterial({
            color: 0xdc2626,
            emissive: 0xef4444,
            emissiveIntensity: 1.8,
            roughness: 0.3,
          });
          const disc = new THREE.Mesh(discGeo, this.lollipopDiscMat);
          disc.position.set(0, 2.5, 1.25);
          this.lollipopSignGroup.add(disc);

          proceduralBody.add(this.lollipopSignGroup);
          toolMesh = this.lollipopSignGroup;
        }
      }

      this.group.add(memberGroup);

      return {
        group: memberGroup,
        proceduralBody,
        basePos: standbyPos.clone(),
        baseRotY: rotationY,
        standbyPos,
        servicePos,
        exitPos,
        type,
        toolMesh,
        leftArmIK,
        rightArmIK,
        wheelIndex,
      };
    };

    // 1. FRONT JACK OPERATOR:
    this.crewMembers.push(createHumanCrewMember(
      'front_jack',
      new THREE.Vector3(3.6, 0, -113.6),
      new THREE.Vector3(2.85, 0, -116.0),
      new THREE.Vector3(3.85, 0, -113.6),
      -Math.PI / 2
    ));

    // 2. REAR JACK OPERATOR:
    this.crewMembers.push(createHumanCrewMember(
      'rear_jack',
      new THREE.Vector3(-3.5, 0, -113.6),
      new THREE.Vector3(-2.85, 0, -116.0),
      new THREE.Vector3(-3.7, 0, -113.6),
      Math.PI / 2
    ));

    // 3. 4 WHEEL MECHANICS WITH ANALYTICAL TWO-BONE IK:
    // FL: wheel index 0
    this.crewMembers.push(createHumanCrewMember(
      'wheel_fl',
      new THREE.Vector3(1.25, 0, -114.65),
      new THREE.Vector3(1.25, 0, -114.65),
      new THREE.Vector3(1.25, 0, -114.2),
      Math.PI,
      0
    ));
    // FR: wheel index 1
    this.crewMembers.push(createHumanCrewMember(
      'wheel_fr',
      new THREE.Vector3(1.25, 0, -117.35),
      new THREE.Vector3(1.25, 0, -117.35),
      new THREE.Vector3(1.25, 0, -117.8),
      0,
      1
    ));
    // RL: wheel index 2
    this.crewMembers.push(createHumanCrewMember(
      'wheel_rl',
      new THREE.Vector3(-1.25, 0, -114.65),
      new THREE.Vector3(-1.25, 0, -114.65),
      new THREE.Vector3(-1.25, 0, -114.2),
      Math.PI,
      2
    ));
    // RR: wheel index 3
    this.crewMembers.push(createHumanCrewMember(
      'wheel_rr',
      new THREE.Vector3(-1.25, 0, -117.35),
      new THREE.Vector3(-1.25, 0, -117.35),
      new THREE.Vector3(-1.25, 0, -117.8),
      0,
      3
    ));

    // 4. FRONT WING AERO TECHNICIAN
    this.crewMembers.push(createHumanCrewMember(
      'wing_tech',
      new THREE.Vector3(2.1, 0, -114.65),
      new THREE.Vector3(2.1, 0, -114.65),
      new THREE.Vector3(2.1, 0, -114.2),
      Math.PI * 0.85
    ));

    // 5. RADIATOR COOLING TECHNICIAN
    this.crewMembers.push(createHumanCrewMember(
      'radiator_tech',
      new THREE.Vector3(0.35, 0, -114.65),
      new THREE.Vector3(0.35, 0, -114.65),
      new THREE.Vector3(0.35, 0, -114.2),
      Math.PI * 0.95
    ));

    // 6. PIT CONTROLLER (Lollipop marshal)
    this.crewMembers.push(createHumanCrewMember(
      'lollipop',
      new THREE.Vector3(0, 0, -113.8),
      new THREE.Vector3(0, 0, -113.8),
      new THREE.Vector3(0, 0, -113.8),
      Math.PI
    ));
  }

  /**
   * Analytical Two-Bone Inverse Kinematics (Law of Cosines) Solver
   * Solves joint angles for shoulder and elbow so the hand attaches to target in world space!
   */
  private solveTwoBoneIK(
    arm: ArmIKJoints,
    targetWorld: THREE.Vector3,
    poleVectorWorld: THREE.Vector3
  ): void {
    // 1. Get shoulder world position
    const shoulderWorld = new THREE.Vector3();
    arm.shoulder.getWorldPosition(shoulderWorld);

    // 2. Vector from shoulder to target
    const toTarget = new THREE.Vector3().subVectors(targetWorld, shoulderWorld);
    let dist = toTarget.length();
    const maxReach = (arm.l1 + arm.l2) * 0.998;
    const minReach = Math.abs(arm.l1 - arm.l2) * 1.002;
    dist = Math.max(minReach, Math.min(maxReach, dist));

    // 3. Law of Cosines for interior angles
    const cosAlpha = Math.max(-1, Math.min(1, (arm.l1 * arm.l1 + dist * dist - arm.l2 * arm.l2) / (2 * arm.l1 * dist)));
    const alpha = Math.acos(cosAlpha); // Angle between shoulder->target and upper arm

    const cosBeta = Math.max(-1, Math.min(1, (arm.l1 * arm.l1 + arm.l2 * arm.l2 - dist * dist) / (2 * arm.l1 * arm.l2)));
    const beta = Math.acos(cosBeta); // Interior elbow angle
    const elbowBend = Math.PI - beta; // Relative bend

    // 4. Determine limb plane via pole vector
    const targetDir = toTarget.clone().normalize();
    const pole = poleVectorWorld.clone().normalize();

    let limbNormal = new THREE.Vector3().crossVectors(targetDir, pole).normalize();
    if (limbNormal.lengthSq() < 0.001) {
      limbNormal = new THREE.Vector3(0, 1, 0);
    }

    const bendAxis = new THREE.Vector3().crossVectors(limbNormal, targetDir).normalize();
    const upperArmDirWorld = targetDir.clone().multiplyScalar(Math.cos(alpha)).add(bendAxis.clone().multiplyScalar(Math.sin(alpha))).normalize();

    // 5. Convert upperArmDirWorld into shoulder parent's local space
    const parentWorldQuat = new THREE.Quaternion();
    arm.shoulder.parent?.getWorldQuaternion(parentWorldQuat);
    const invParentQuat = parentWorldQuat.clone().invert();

    const localUpperArmDir = upperArmDirWorld.clone().applyQuaternion(invParentQuat);

    // Default direction of upper arm in local space is (0, -1, 0)
    const defaultDir = new THREE.Vector3(0, -1, 0);
    const qAim = new THREE.Quaternion().setFromUnitVectors(defaultDir, localUpperArmDir);
    arm.shoulder.quaternion.copy(qAim);

    // 6. Elbow relative bend
    arm.elbow.rotation.set(arm.isRight ? elbowBend : -elbowBend, 0, 0);
  }

  /**
   * Build 4 spare racing slick tires sitting on the floor beside each wheel station
   */
  private buildSpareWheels(): void {
    const tireRadius = 0.35;
    const tireWidth = 0.32;

    const tirePositions = [
      { x: 1.25, z: -113.9 },   // FL spare
      { x: 1.25, z: -118.1 },   // FR spare
      { x: -1.25, z: -113.9 },  // RL spare
      { x: -1.25, z: -118.1 },  // RR spare
    ];

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.88,
      metalness: 0.05,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.92,
      roughness: 0.18,
    });
    const brandMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 }); // Yellow Pirelli slick stripe

    tirePositions.forEach((tp) => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(tp.x, 0.16, tp.z);
      wheelGroup.rotation.x = Math.PI / 2;

      const tireGeo = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 20);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      wheelGroup.add(tire);

      const rimGeo = new THREE.CylinderGeometry(tireRadius * 0.65, tireRadius * 0.65, tireWidth + 0.01, 16);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      wheelGroup.add(rim);

      const stripeGeo = new THREE.TorusGeometry(tireRadius * 0.82, 0.012, 6, 20);
      const stripe = new THREE.Mesh(stripeGeo, brandMat);
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = tireWidth / 2 + 0.005;
      wheelGroup.add(stripe);

      this.spareWheels.push(wheelGroup);
      this.group.add(wheelGroup);
    });
  }

  /**
   * Build overhead high-pressure pneumatic tool booms extending from the pit wall
   */
  private buildAirBooms(): void {
    this.airBoomsGroup = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 });
    const hoseMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.6 });

    [-1.8, 1.8].forEach((bx) => {
      const mastGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.5, 8);
      const mast = new THREE.Mesh(mastGeo, steelMat);
      mast.position.set(bx, 2.25, -112.5);
      this.airBoomsGroup.add(mast);

      const armGeo = new THREE.BoxGeometry(0.1, 0.1, 3.2);
      const arm = new THREE.Mesh(armGeo, steelMat);
      arm.position.set(bx, 4.4, -114.1);
      this.airBoomsGroup.add(arm);

      const hoseGeo = new THREE.CylinderGeometry(0.018, 0.018, 2.8, 6);
      const hose = new THREE.Mesh(hoseGeo, hoseMat);
      hose.position.set(bx, 3.0, -115.5);
      this.airHoses.push(hose);
      this.airBoomsGroup.add(hose);
    });

    this.group.add(this.airBoomsGroup);
  }

  /**
   * Build futuristic holographic CAD diagnostic laser scanning frame
   */
  private buildDiagnosticLaser(): void {
    this.scannerGroup = new THREE.Group();

    const barGeo = new THREE.BoxGeometry(0.08, 0.08, 3.6);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 });
    const barMesh = new THREE.Mesh(barGeo, barMat);
    barMesh.position.set(0, 1.85, -116);
    this.scannerGroup.add(barMesh);

    [-0.8, 0.8].forEach((zOff) => {
      const emitterGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8);
      const emitter = new THREE.Mesh(emitterGeo, barMat);
      emitter.position.set(0, 1.8, -116 + zOff);
      this.scannerGroup.add(emitter);
    });

    const beamGeo = new THREE.CylinderGeometry(0.018, 0.018, 3.5, 8);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.laserBeamMesh = new THREE.Mesh(beamGeo, beamMat);
    this.laserBeamMesh.position.set(0, 1.82, -116);
    this.scannerGroup.add(this.laserBeamMesh);

    const curtainGeo = new THREE.PlaneGeometry(3.5, 1.8);
    curtainGeo.rotateY(Math.PI / 2);
    const curtainMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.laserCurtainMesh = new THREE.Mesh(curtainGeo, curtainMat);
    this.laserCurtainMesh.position.set(0, 0.9, -116);
    this.scannerGroup.add(this.laserCurtainMesh);

    const gridGeo = new THREE.PlaneGeometry(3.4, 1.6, 8, 4);
    gridGeo.rotateX(-Math.PI / 2);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    this.holographicGridMesh = new THREE.Mesh(gridGeo, gridMat);
    this.holographicGridMesh.position.set(0, 0.55, -116);
    this.scannerGroup.add(this.holographicGridMesh);

    this.scannerGroup.visible = false;
    this.group.add(this.scannerGroup);
  }

  /**
   * Detects if car is entering the pit lane corridor or crossing the pit entry line
   */
  public isCarAtPitEntry(carPos: { x: number; z: number }, speed: number): boolean {
    if (this.cooldownTimer > 0 || this.phase !== 'none') return false;

    // Pit entry approach corridor and gantry line (x: -74 to -45, z: -126 to -112)
    const inEntryCorridor = carPos.x >= -74 && carPos.x <= -45 && carPos.z >= -126.0 && carPos.z <= -112.0;
    return inEntryCorridor && speed > 0.3;
  }

  /**
   * Check if car is positioned inside the pit stop box area and ready to service
   */
  public isCarInPitBox(carPos: { x: number; z: number }, carSpeed: number): boolean {
    if (this.cooldownTimer > 0 || this.phase !== 'none') return false;

    const b = this.pitBounds;
    const inBounds = carPos.x >= b.minX && carPos.x <= b.maxX && carPos.z >= b.minZ && carPos.z <= b.maxZ;
    return inBounds && Math.abs(carSpeed) < 7.0;
  }

  /**
   * Automatically engages pit entry autopilot, activates 60 km/h speed limiter,
   * locks player control, and smoothly guides the car into the pit stop box!
   */
  public startPitEntryAutopilot(physics: VehiclePhysics, audio?: EngineSound): void {
    if (this.phase !== 'none' || this.cooldownTimer > 0) return;

    this.dockStartPos = {
      x: physics.position.x,
      z: physics.position.z,
      yaw: physics.yaw,
    };

    const healthDamage = (100 - physics.damage.overallHealth) / 100;
    const engineDamage = (100 - physics.damage.engineHealth) / 100;
    const crumpleDamage = Math.max(physics.damage.frontCrumple, physics.damage.rearCrumple);
    const suspDamage = (200 - (physics.damage.suspensionLeft + physics.damage.suspensionRight)) / 200;

    const avgDamage = Math.max(0, Math.min(1.0, (healthDamage * 0.4 + engineDamage * 0.3 + crumpleDamage * 0.2 + suspDamage * 0.1)));
    this.initialDamageFraction = avgDamage;

    this.totalDuration = 3.2 + avgDamage * 8.8;
    this.elapsedTime = 0;
    this.repairProgress = 0;
    this.phase = 'entry_autopilot';
    this.hasTriggeredJackUpSound = false;
    this.hasTriggeredJackDownSound = false;
    this.hasTriggeredChime = false;
    this.hasTriggeredRadioEntry = true;
    this.hasTriggeredRadioTyres = false;
    this.hasTriggeredRadioExit = false;
    this.carElevatedY = 0;

    this.radioMessage = 'ENTRADA A BOXES · LIMITADOR 60 KM/H ACTIVADO';
    if (audio) {
      audio.triggerPitRadio('box');
    }

    if (this.lollipopDiscMat) {
      this.lollipopDiscMat.color.setHex(0xdc2626);
      this.lollipopDiscMat.emissive.setHex(0xef4444);
    }
    if (this.lollipopSignGroup) {
      this.lollipopSignGroup.rotation.y = 0;
      this.lollipopSignGroup.rotation.x = 0;
    }
  }

  /**
   * Start a pit stop sequence with dynamic duration proportional to damage
   */
  public startPitStop(physics: VehiclePhysics, audio?: EngineSound): void {
    if (this.phase !== 'none' || this.cooldownTimer > 0) return;

    this.dockStartPos = {
      x: physics.position.x,
      z: physics.position.z,
      yaw: physics.yaw,
    };

    const healthDamage = (100 - physics.damage.overallHealth) / 100;
    const engineDamage = (100 - physics.damage.engineHealth) / 100;
    const crumpleDamage = Math.max(physics.damage.frontCrumple, physics.damage.rearCrumple);
    const suspDamage = (200 - (physics.damage.suspensionLeft + physics.damage.suspensionRight)) / 200;

    const avgDamage = Math.max(0, Math.min(1.0, (healthDamage * 0.4 + engineDamage * 0.3 + crumpleDamage * 0.2 + suspDamage * 0.1)));
    this.initialDamageFraction = avgDamage;

    // Formula: 3.2s base + up to 8.8s for heavy repairs = up to 12.0s!
    this.totalDuration = 3.2 + avgDamage * 8.8;
    this.elapsedTime = 0;
    this.repairProgress = 0;
    this.phase = 'docking';
    this.hasTriggeredJackUpSound = false;
    this.hasTriggeredJackDownSound = false;
    this.hasTriggeredChime = false;
    this.hasTriggeredRadioEntry = false;
    this.hasTriggeredRadioTyres = false;
    this.hasTriggeredRadioExit = false;
    this.carElevatedY = 0;

    // F1 Team Radio Entry Call
    this.radioMessage = 'BOX, BOX, BOX! STOP CONFIRMADO';
    if (audio) {
      audio.triggerPitRadio('box');
    }

    if (this.lollipopDiscMat) {
      this.lollipopDiscMat.color.setHex(0xdc2626);
      this.lollipopDiscMat.emissive.setHex(0xef4444);
    }
    if (this.lollipopSignGroup) {
      this.lollipopSignGroup.rotation.y = 0;
      this.lollipopSignGroup.rotation.x = 0;
    }
  }

  /**
   * Update the 3D Pit Stop Animation loop every frame
   */
  public update(
    dt: number,
    physics: VehiclePhysics,
    carModel: CarModel,
    particles: ParticleSystem,
    audio: EngineSound
  ): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= dt;
    }

    // High performance throttling: update LED telemetry texture only when active or upon phase changes
    this.displayBoardTimer += dt;
    if (this.phase !== 'none') {
      if (this.displayBoardTimer >= 0.08 || this.phase !== this.lastPhaseDrawn) {
        this.displayBoardTimer = 0;
        this.lastPhaseDrawn = this.phase;
        this.updateDisplayBoard();
      }
    } else if (this.lastPhaseDrawn !== 'none') {
      this.lastPhaseDrawn = 'none';
      this.updateDisplayBoard();
    }

    const carPos = physics.position;
    const speed = physics.speed;

    // Auto-detect entry into pit lane or pit box
    if (this.phase === 'none') {
      if (!this.armsResetDone) {
        this.armsResetDone = true;
        const fj = this.crewMembers.find(m => m.type === 'front_jack');
        if (fj) fj.group.position.copy(fj.standbyPos);
        const rj = this.crewMembers.find(m => m.type === 'rear_jack');
        if (rj) rj.group.position.copy(rj.standbyPos);

        // Reset IK arms to rest pose once upon exiting
        this.crewMembers.forEach(m => {
          if (m.rightArmIK) {
            m.rightArmIK.shoulder.rotation.set(0.35, 0, 0);
            m.rightArmIK.elbow.rotation.set(0.4, 0, 0);
          }
          if (m.leftArmIK) {
            m.leftArmIK.shoulder.rotation.set(0.35, 0, 0);
            m.leftArmIK.elbow.rotation.set(0.4, 0, 0);
          }
        });
      }

      if (this.isCarAtPitEntry(carPos, speed)) {
        this.armsResetDone = false;
        this.startPitEntryAutopilot(physics, audio);
      } else if (this.isCarInPitBox(carPos, speed)) {
        this.armsResetDone = false;
        this.startPitStop(physics, audio);
      }
      return;
    }

    // =========================================================================
    // STAGE 0: PIT ENTRY AUTOPILOT & SPEED LIMITER (60 KM/H)
    // Automatically navigates along pit lane and stops perfectly at x = 0, z = -116
    // =========================================================================
    if (this.phase === 'entry_autopilot') {
      this.elapsedTime += dt;

      // Pit Lane Speed Limit: exactly 60 km/h = 16.67 m/s
      const pitLimitSpeed = 16.67;

      // 1. Smoothly guide lateral position to the exact center of the pit lane (z = -116.0)
      physics.position.z = THREE.MathUtils.damp(physics.position.z, -116.0, 5.0, dt);

      // 2. Smoothly align vehicle heading parallel to the pit lane (yaw = PI/2 = 1.5708 rad, pointing East)
      let angleDiff = (Math.PI / 2) - physics.yaw;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      physics.yaw += angleDiff * Math.min(1.0, dt * 6.0);

      // 3. Damp pitch and roll to 0 (flat pit lane surface)
      physics.pitch = THREE.MathUtils.damp(physics.pitch, 0, 8.0, dt);
      physics.roll = THREE.MathUtils.damp(physics.roll, 0, 8.0, dt);
      physics.lateralSpeed = 0;
      physics.angularVelocity = 0;

      // 4. Longitudinal Autopilot & Deceleration Curve to Pit Box (x = 0, z = -116)
      if (physics.position.x < -16.0) {
        // Enforce 60 km/h pit speed limiter along the entry lane
        physics.speed = THREE.MathUtils.damp(physics.speed, pitLimitSpeed, 5.0, dt);
        physics.position.x += physics.speed * dt;
        physics.gear = 2;
        physics.rpm = 1200 + (physics.speed / pitLimitSpeed) * 3200;
      } else {
        // Smooth progressive deceleration curve as car approaches the stopping box (x = 0)
        const distToStop = Math.max(0.01, -physics.position.x);
        const targetDecelSpeed = Math.min(pitLimitSpeed, Math.sqrt(distToStop * 14.0));
        physics.speed = THREE.MathUtils.damp(physics.speed, targetDecelSpeed, 6.0, dt);
        physics.position.x += physics.speed * dt;
        physics.gear = 1;
        physics.rpm = 1000 + (physics.speed / pitLimitSpeed) * 2200;

        // Front and rear jack operators step forward into service positions when car is 5m away
        const fj = this.crewMembers.find(m => m.type === 'front_jack');
        if (fj && physics.position.x > -5.0) {
          const stepT = Math.min(1.0, (physics.position.x + 5.0) / 4.0);
          fj.group.position.lerpVectors(fj.standbyPos, fj.servicePos, stepT);
        }
        const rj = this.crewMembers.find(m => m.type === 'rear_jack');
        if (rj && physics.position.x > -5.0) {
          const stepT = Math.min(1.0, (physics.position.x + 5.0) / 4.0);
          rj.group.position.lerpVectors(rj.standbyPos, rj.servicePos, stepT);
        }
      }

      // Check arrival at exact pit stop marks (x = 0, z = -116)
      if (physics.position.x >= -0.15 || (physics.position.x >= -2.0 && physics.speed < 0.65)) {
        physics.position.x = 0;
        physics.position.z = -116;
        physics.yaw = Math.PI / 2;
        physics.speed = 0;
        physics.rpm = 1000;
        physics.gear = 1;
        physics.isLockedInPit = true;

        this.phase = 'jacks_up';
        // Set elapsedTime to 0.8s so it transitions directly to hydraulic jacks elevation (Stage 2)
        // without re-running redundant docking animation!
        this.elapsedTime = 0.8;
      }
      return;
    }

    this.elapsedTime += dt;
    const t = this.elapsedTime;
    const total = Math.max(1, this.totalDuration);
    this.repairProgress = Math.min(1.0, t / total);

    // Subtle sway of hanging pneumatic hoses
    this.airHoses.forEach((hose, idx) => {
      hose.rotation.z = Math.sin(t * 3.5 + idx) * 0.05;
      hose.rotation.x = Math.cos(t * 3.0 + idx) * 0.03;
    });

    // ==========================================
    // STAGE 1: DOCKING & CAR REALIGNMENT (0.0s - 0.8s)
    // ==========================================
    if (t < this.dockDuration) {
      this.phase = 'docking';
      const dockT = Math.min(1.0, t / this.dockDuration);
      const easeDock = Math.sin(dockT * Math.PI * 0.5);

      const targetX = 0;
      const targetZ = -116;
      const targetYaw = Math.PI / 2;

      physics.position.x = THREE.MathUtils.lerp(this.dockStartPos.x, targetX, easeDock);
      physics.position.z = THREE.MathUtils.lerp(this.dockStartPos.z, targetZ, easeDock);

      let angleDiff = targetYaw - this.dockStartPos.yaw;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      physics.yaw = this.dockStartPos.yaw + angleDiff * easeDock;

      physics.speed *= 0.80;
      physics.lateralSpeed = 0;
      physics.angularVelocity = 0;
      physics.pitch = THREE.MathUtils.lerp(physics.pitch, 0, 0.25);
      physics.roll = THREE.MathUtils.lerp(physics.roll, 0, 0.25);
      physics.isLockedInPit = true;

      if (!this.hasTriggeredRadioEntry) {
        this.radioMessage = 'BOX, BOX, BOX! STOP CONFIRMADO';
        audio.triggerPitRadio('box');
        this.hasTriggeredRadioEntry = true;
      }

      // Front and rear jacks step in when car stops
      const fj = this.crewMembers.find(m => m.type === 'front_jack');
      if (fj) {
        if (dockT < 0.4) {
          fj.group.position.copy(fj.standbyPos);
        } else {
          const stepT = (dockT - 0.4) / 0.6;
          fj.group.position.lerpVectors(fj.standbyPos, fj.servicePos, stepT);
        }
      }

      const rj = this.crewMembers.find(m => m.type === 'rear_jack');
      if (rj) {
        if (dockT < 0.4) {
          rj.group.position.copy(rj.standbyPos);
        } else {
          const stepT = (dockT - 0.4) / 0.6;
          rj.group.position.lerpVectors(rj.standbyPos, rj.servicePos, stepT);
        }
      }
    }
    // ==========================================
    // STAGE 2: HYDRAULIC AIR JACKS ELEVATION (0.8s - 1.5s)
    // ==========================================
    else if (t < 1.5) {
      this.phase = 'jacks_up';
      physics.position.x = 0;
      physics.position.z = -116;
      physics.yaw = Math.PI / 2;
      physics.speed = 0;
      physics.isLockedInPit = true;

      if (!this.hasTriggeredJackUpSound) {
        audio.triggerPneumaticJack(true);
        this.hasTriggeredJackUpSound = true;
        particles.emitPneumaticBlast(new THREE.Vector3(2.4, 0.12, -116), new THREE.Vector3(0, 0.8, 0), 6);
        particles.emitPneumaticBlast(new THREE.Vector3(-2.4, 0.12, -116), new THREE.Vector3(0, 0.8, 0), 6);
      }

      const liftT = (t - 0.8) / 0.7;
      this.carElevatedY = Math.sin(liftT * Math.PI * 0.5) * 0.20;

      this.crewMembers.forEach((m) => {
        if (m.type === 'front_jack' && m.toolMesh) {
          m.group.position.copy(m.servicePos);
          m.toolMesh.rotation.z = -liftT * 0.55;
          m.group.position.y = -liftT * 0.08;
        } else if (m.type === 'rear_jack' && m.toolMesh) {
          m.group.position.copy(m.servicePos);
          m.toolMesh.rotation.z = liftT * 0.55;
          m.group.position.y = -liftT * 0.08;
        }
      });
    }
    // ==========================================
    // STAGE 3: FULL COMPONENT SERVICE & TWO-BONE IK WHEEL CHANGE (1.5s - total - 0.8s)
    // ==========================================
    else if (t < total - 0.8) {
      this.phase = 'servicing';
      this.carElevatedY = 0.20;
      physics.position.x = 0;
      physics.position.z = -116;
      physics.yaw = Math.PI / 2;
      physics.speed = 0;
      physics.isLockedInPit = true;

      if (!this.hasTriggeredRadioTyres) {
        this.radioMessage = 'PISTOLAS ACTIVADAS · CAMBIANDO A SLICKS NUEVOS';
        audio.triggerPitRadio('tyres');
        this.hasTriggeredRadioTyres = true;
      }

      const serviceDuration = (total - 0.8) - 1.5;
      const serviceT = Math.max(0, Math.min(1.0, (t - 1.5) / serviceDuration));

      // 1. DYNAMIC 4-WHEEL TIRE SWAP:
      // If the player loaded a custom 3D model, DO NOT animate wheel dismounting/sliding
      // The default procedural F1 car continues with the full wheel change animation
      if (!carModel.isCustomModel) {
        let wheelOffset = 0;
        if (serviceT < 0.35) {
          const outT = serviceT / 0.35;
          wheelOffset = Math.sin(outT * Math.PI * 0.5) * 0.42;
        } else if (serviceT < 0.70) {
          const inT = (serviceT - 0.35) / 0.35;
          wheelOffset = (1.0 - Math.sin(inT * Math.PI * 0.5)) * 0.42;
        } else {
          wheelOffset = 0;
        }

        for (let i = 0; i < 4; i++) {
          carModel.setWheelOffset(i, wheelOffset);
        }
      } else {
        // Keep custom model wheels strictly in place
        for (let i = 0; i < 4; i++) {
          carModel.setWheelOffset(i, 0);
        }
      }

      // 2. OPTION 1: TWO-BONE ANALYTICAL IK SOLVER FOR ALL 4 WHEEL MECHANICS
      const hubPos = new THREE.Vector3();
      const poleVec = new THREE.Vector3(0, -1, 0);

      this.crewMembers.forEach((m) => {
        if (m.type.startsWith('wheel_') && m.wheelIndex !== undefined && m.rightArmIK && m.leftArmIK) {
          m.group.position.y = -0.16; // Kneeling posture

          // Obtain dynamic world position of this wheel's hub from CarModel!
          carModel.getWheelHubWorldPos(m.wheelIndex, hubPos);

          // Add torque wrench recoil micro-vibrations
          const recoil = serviceT > 0.65 ? Math.sin(t * 40) * 0.015 : 0;
          const rightHandTarget = hubPos.clone();
          rightHandTarget.y += 0.02 + recoil;

          // Left hand holds the side handle of the pneumatic gun
          const leftHandTarget = rightHandTarget.clone();
          leftHandTarget.x += m.wheelIndex % 2 === 0 ? 0.08 : -0.08;
          leftHandTarget.y += 0.04;

          // Solve Analytical IK for both arms!
          this.solveTwoBoneIK(m.rightArmIK, rightHandTarget, poleVec);
          this.solveTwoBoneIK(m.leftArmIK, leftHandTarget, poleVec);
        } else if (m.type === 'wing_tech') {
          m.group.position.y = -0.14;
          if (m.toolMesh) {
            m.toolMesh.rotation.y = Math.sin(t * 12) * 0.4;
          }
        } else if (m.type === 'radiator_tech') {
          if (m.toolMesh) {
            m.toolMesh.rotation.y = Math.sin(t * 6) * 0.15;
          }
        }
      });

      // 3. PNEUMATIC IMPACT WRENCH SOUND & AIR BLASTS
      if (t - this.lastGunSoundTime > 0.32) {
        audio.triggerWheelGunRattle();
        this.lastGunSoundTime = t;
      }

      if (t - this.lastAirBurstTime > 0.24) {
        const hubs = [
          new THREE.Vector3(1.25, 0.38, -114.65),
          new THREE.Vector3(1.25, 0.38, -117.35),
          new THREE.Vector3(-1.25, 0.38, -114.65),
          new THREE.Vector3(-1.25, 0.38, -117.35),
        ];
        const randomHub = hubs[Math.floor(Math.random() * hubs.length)];
        const dir = randomHub.z < -116 ? new THREE.Vector3(0, 0.3, -1) : new THREE.Vector3(0, 0.3, 1);
        particles.emitPneumaticBlast(randomHub, dir, 5);
        this.lastAirBurstTime = t;
      }

      if (serviceT > 0.65 && t - this.lastSparkTime > 0.10) {
        const hubs = [
          new THREE.Vector3(1.25, 0.38, -114.65),
          new THREE.Vector3(1.25, 0.38, -117.35),
          new THREE.Vector3(-1.25, 0.38, -114.65),
          new THREE.Vector3(-1.25, 0.38, -117.35),
        ];
        const randomHub = hubs[Math.floor(Math.random() * hubs.length)];
        particles.emitNutTorqueSparks(randomHub, 7);
        this.lastSparkTime = t;
      }

      // 4. HOLOGRAPHIC CAD CHASSIS DIAGNOSTIC SCANNER
      this.scannerGroup.visible = true;
      const scanPeriod = 1.8;
      const scanX = Math.sin(((t - 1.5) / scanPeriod) * Math.PI * 2) * 2.3;
      this.scannerGroup.position.set(scanX, 0, -116);
      (this.laserCurtainMesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 14) * 0.15;

      // 5. PROGRESSIVE REAL-TIME DAMAGE REPAIR
      const lerpSpeed = Math.min(1.0, serviceT * 0.35 + 0.06);
      physics.damage.overallHealth = Math.min(100, physics.damage.overallHealth + (100 - physics.damage.overallHealth) * lerpSpeed);
      physics.damage.engineHealth = Math.min(100, physics.damage.engineHealth + (100 - physics.damage.engineHealth) * lerpSpeed);
      physics.damage.suspensionLeft = Math.min(100, physics.damage.suspensionLeft + (100 - physics.damage.suspensionLeft) * lerpSpeed);
      physics.damage.suspensionRight = Math.min(100, physics.damage.suspensionRight + (100 - physics.damage.suspensionRight) * lerpSpeed);
      physics.damage.frontCrumple = Math.max(0, physics.damage.frontCrumple - dt * 0.95);
      physics.damage.rearCrumple = Math.max(0, physics.damage.rearCrumple - dt * 0.95);
      physics.damage.wingLoose = false;
      physics.damage.isTotaled = false;
    }
    // ==========================================
    // STAGE 4: JACKS DROP & MECHANICS CLEAR PATH! (total - 0.8s - total)
    // ==========================================
    else if (t < total) {
      this.phase = 'jacks_down';
      this.scannerGroup.visible = false;
      carModel.resetWheelOffsets();
      physics.position.x = 0;
      physics.position.z = -116;
      physics.yaw = Math.PI / 2;

      if (!this.hasTriggeredJackDownSound) {
        audio.triggerPneumaticJack(false);
        this.hasTriggeredJackDownSound = true;
        particles.emitPneumaticBlast(new THREE.Vector3(0, 0.1, -116), new THREE.Vector3(0, 0.5, 0), 8);
      }

      if (!this.hasTriggeredRadioExit) {
        this.radioMessage = '¡LUZ VERDE! 3, 2, 1... ¡GO GO GO!';
        audio.triggerPitRadio('go');
        this.hasTriggeredRadioExit = true;
      }

      const dropT = (t - (total - 0.8)) / 0.8;
      this.carElevatedY = (1.0 - dropT) * 0.20 + Math.sin(dropT * Math.PI * 3) * 0.04 * (1 - dropT);

      // FRONT JACK OPERATOR: YANKS JACK AND STEPS CLEAR TO THE SIDE!
      const fj = this.crewMembers.find(m => m.type === 'front_jack');
      if (fj) {
        fj.group.position.lerpVectors(fj.servicePos, fj.exitPos, dropT);
        if (fj.toolMesh) {
          fj.toolMesh.rotation.z = THREE.MathUtils.lerp(fj.toolMesh.rotation.z, 0, 0.25);
        }
      }

      // REAR JACK OPERATOR: STEPS ASIDE!
      const rj = this.crewMembers.find(m => m.type === 'rear_jack');
      if (rj) {
        rj.group.position.lerpVectors(rj.servicePos, rj.exitPos, dropT);
        if (rj.toolMesh) {
          rj.toolMesh.rotation.z = THREE.MathUtils.lerp(rj.toolMesh.rotation.z, 0, 0.25);
        }
      }

      // Wheel mechanics stand upright and step back toward pit wall
      this.crewMembers.forEach((m) => {
        if (m.type.startsWith('wheel_') || m.type === 'wing_tech' || m.type === 'radiator_tech') {
          m.group.position.lerpVectors(m.group.position, m.exitPos, 0.18);
          m.group.position.y = THREE.MathUtils.lerp(m.group.position.y, 0, 0.2);
          if (m.rightArmIK) {
            m.rightArmIK.shoulder.rotation.set(0.3, 0, 0);
            m.rightArmIK.elbow.rotation.set(0.5, 0, 0);
          }
          if (m.leftArmIK) {
            m.leftArmIK.shoulder.rotation.set(0.3, 0, 0);
            m.leftArmIK.elbow.rotation.set(0.5, 0, 0);
          }
        }
      });

      // LOLLIPOP: Rotates to bright green "GO!" and swings UP into the air!
      if (this.lollipopDiscMat) {
        this.lollipopDiscMat.color.setHex(0x10b981);
        this.lollipopDiscMat.emissive.setHex(0x34d399);
      }
      if (this.lollipopSignGroup) {
        this.lollipopSignGroup.rotation.y = THREE.MathUtils.lerp(this.lollipopSignGroup.rotation.y, Math.PI / 2, 0.25);
        this.lollipopSignGroup.rotation.x = THREE.MathUtils.lerp(this.lollipopSignGroup.rotation.x, -0.65, 0.25);
      }
    }
    // ==========================================
    // STAGE 5: RELEASE & LAUNCH (t >= total)
    // ==========================================
    else {
      if (this.phase !== 'released') {
        this.phase = 'released';
        this.carElevatedY = 0;
        this.scannerGroup.visible = false;
        carModel.resetWheelOffsets();

        physics.repairFull();

        if (!this.hasTriggeredChime) {
          audio.triggerPitChime();
          this.hasTriggeredChime = true;
        }

        physics.isLockedInPit = false;
        physics.speed = 5.6; // High acceleration exit
        physics.gear = 1;
        physics.rpm = 4800;

        const fj = this.crewMembers.find(m => m.type === 'front_jack');
        if (fj) fj.group.position.copy(fj.exitPos);

        this.cooldownTimer = 7.5;
      }

      const fj = this.crewMembers.find(m => m.type === 'front_jack');
      if (fj) fj.group.position.copy(fj.exitPos);
      const rj = this.crewMembers.find(m => m.type === 'rear_jack');
      if (rj) rj.group.position.copy(rj.exitPos);

      if (t >= total + 1.8) {
        this.phase = 'none';
        this.radioMessage = null;
        if (this.lollipopSignGroup) {
          this.lollipopSignGroup.rotation.y = 0;
          this.lollipopSignGroup.rotation.x = 0;
        }
        if (fj) fj.group.position.copy(fj.standbyPos);
        if (rj) rj.group.position.copy(rj.standbyPos);
      }
    }
  }

  /**
   * Update the Pit Wall LED telemetry texture
   */
  private updateDisplayBoard(): void {
    const ctx = this.pitWallDisplayCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, 256, 128);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 120);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('APEX PIT SYSTEM', 16, 26);

    if (this.phase === 'none') {
      ctx.fillStyle = this.cooldownTimer > 0 ? '#38bdf8' : '#10b981';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(this.cooldownTimer > 0 ? 'CAR RELEASED' : 'BOX OPEN', 16, 68);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px monospace';
      ctx.fillText(this.cooldownTimer > 0 ? 'EXITING PIT LANE' : 'READY FOR SERVICE', 16, 96);
    } else if (this.phase === 'released') {
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('GO GO GO!', 16, 68);
      ctx.fillStyle = '#34d399';
      ctx.font = '14px monospace';
      ctx.fillText('TIRES: 4/4 FRESH SLICKS', 16, 96);
    } else {
      const remaining = Math.max(0, this.totalDuration - this.elapsedTime);
      ctx.fillStyle = remaining < 0.8 ? '#10b981' : '#f59e0b';
      ctx.font = 'bold 26px monospace';
      ctx.fillText(`TIME: ${this.elapsedTime.toFixed(2)}s`, 16, 64);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 14px monospace';
      if (this.phase === 'docking') {
        ctx.fillText('DOCKING IN BOX...', 16, 92);
      } else if (this.phase === 'jacks_up') {
        ctx.fillText('AIR JACKS ELEVATION', 16, 92);
      } else if (this.phase === 'servicing') {
        ctx.fillText(`SWAPPING SLICKS: ${Math.round(this.repairProgress * 100)}%`, 16, 92);
      } else if (this.phase === 'jacks_down') {
        ctx.fillText('JACKS DROPPING · GREEN', 16, 92);
      }

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(16, 104, 224, 8);
      ctx.fillStyle = remaining < 0.8 ? '#10b981' : '#38bdf8';
      ctx.fillRect(16, 104, 224 * this.repairProgress, 8);
    }

    this.pitWallDisplayTex.needsUpdate = true;
  }

  /**
   * Load custom 3D model for pit crew mechanics (.glb, .gltf, .zip, .obj)
   */
  public async loadCustomCrewModel(file: File): Promise<{ success: boolean; name: string; error?: string }> {
    try {
      const importedData = await CrewModelImporter.loadFromFile(file);
      this.isCustomCrew = true;
      this.currentCrewName = importedData.name;
      this.customCrewProto = importedData.rootGroup;

      this.crewMembers.forEach((m) => {
        m.proceduralBody.visible = false;
        if (m.customBody) {
          m.group.remove(m.customBody);
        }
        const clone = importedData.rootGroup.clone(true);
        m.customBody = clone;
        m.group.add(clone);
        clone.visible = true;
      });

      return { success: true, name: importedData.name };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, name: '', error: msg };
    }
  }

  /**
   * Restore default high-detail procedural pit crew mechanics
   */
  public restoreDefaultCrew(): void {
    this.isCustomCrew = false;
    this.currentCrewName = 'Pit Crew Apex Scuderia';
    this.customCrewProto = null;

    this.crewMembers.forEach((m) => {
      if (m.customBody) {
        m.customBody.visible = false;
        m.group.remove(m.customBody);
        m.customBody = undefined;
      }
      m.proceduralBody.visible = true;
    });
  }
}
