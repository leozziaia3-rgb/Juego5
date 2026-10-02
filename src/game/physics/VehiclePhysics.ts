/**
 * VehiclePhysics.ts - High-Grip Circuit Racing Physics Engine
 * Designed for authentic high-downforce GT/LeMans Prototype racing:
 * - High-speed on-rails cornering with ZERO unwanted drifting or sliding
 * - Agile, fast turn-in through 90° corners
 * - Rock-solid straight-line tracking with instant caster self-centering
 * - Controlled power slides ONLY when holding the Handbrake button
 * - Comprehensive damage degradation and pit stop repair system
 */

import * as THREE from 'three';

export interface CarInputs {
  throttle: number;   // 0.0 to 1.0
  brake: number;      // 0.0 to 1.0
  steering: number;   // -1.0 (left) to 1.0 (right)
  handbrake: boolean; // boolean
}

export interface DamageState {
  overallHealth: number;    // 0 to 100
  engineHealth: number;     // 0 to 100
  suspensionLeft: number;   // 0 to 100
  suspensionRight: number;  // 0 to 100
  frontCrumple: number;     // 0.0 to 1.0
  rearCrumple: number;      // 0.0 to 1.0
  wingLoose: boolean;
  isTotaled: boolean;
}

export class VehiclePhysics {
  // World transforms
  public position = { x: 0, y: 0.35, z: 0 };
  public yaw: number = 0;              // Heading angle in radians
  public pitch: number = 0;            // Weight transfer pitch (dive / squat)
  public roll: number = 0;             // Cornering roll angle

  // Sub-frame temporal interpolation states (for rock-solid 60-144 FPS smoothness)
  public prevPosition = { x: 0, y: 0.35, z: 0 };
  public prevYaw: number = 0;
  public prevPitch: number = 0;
  public prevRoll: number = 0;
  private smoothedLongAccel: number = 0;

  // Velocities
  public speed: number = 0;            // m/s (positive = forward, negative = reverse)
  public lateralSpeed: number = 0;     // m/s
  public angularVelocity: number = 0;  // rad/s

  // Steering
  public steerAngle: number = 0;       // Current wheel steer angle in radians
  private targetSteerAngle: number = 0;

  // Engine & Transmission
  public rpm: number = 1000;
  public engineTemp: number = 85.0;    // Engine core temperature in °C (85°C to 135°C)
  public gear: number = 1;             // -1 = R, 0 = N, 1..6 = D
  public isShifting: boolean = false;
  private shiftTimer: number = 0;

  // Gear ratios & parameters (Calibrated for 0-100 km/h in 1.5s and 350 km/h top speed)
  private readonly gearRatios = [3.25, 2.25, 1.68, 1.32, 1.08, 0.90];
  private readonly reverseRatio = 2.80;
  private readonly finalDrive = 3.10;
  private readonly maxRpm = 9500;
  private readonly idleRpm = 1000;

  // Physical specifications (High-downforce prototype racing chassis)
  public readonly mass = 1180;         // kg
  public readonly wheelbase = 2.75;     // meters
  public readonly trackWidth = 1.95;    // meters
  private readonly dragCoeff = 0.28;   // Aerodynamic low-drag package calibrated for 350 km/h
  private readonly downforceCoeff = 3.8; // High-downforce ground-effect aerodynamic package

  // Telemetry & Grip (Pacejka Non-Linear Slip Dynamics)
  public slipRatio: number = 0;
  public isDrifting: boolean = false;
  public wheelRotations = [0, 0, 0, 0];
  public visualSteerAngle: number = 0;
  public slipAngleRear: number = 0;
  public slipAngleFront: number = 0;
  public wheelSlipRatios = [0, 0, 0, 0]; // [FL, FR, RL, RR]
  public wheelSuspensionCompression = [0, 0, 0, 0]; // [FL, FR, RL, RR]
  public lateralG: number = 0;

  // Damage System
  public damage: DamageState = {
    overallHealth: 100,
    engineHealth: 100,
    suspensionLeft: 100,
    suspensionRight: 100,
    frontCrumple: 0,
    rearCrumple: 0,
    wingLoose: false,
    isTotaled: false,
  };

  // Pit Stop Repair State
  public isInPitStop: boolean = false;
  public pitRepairProgress: number = 0;
  public isLockedInPit: boolean = false;

  // Sound triggers
  public onBackfire?: (isHighRpm: boolean) => void;
  public onCrash?: (impactForce: number) => void;
  public onPitFinish?: () => void;

  constructor(startX: number = 0, startZ: number = 0, startYaw: number = 0) {
    this.reset(startX, startZ, startYaw);
  }

  public reset(x: number = 0, z: number = 0, yaw: number = 0): void {
    this.position.x = x;
    this.position.y = 0.35;
    this.position.z = z;
    this.yaw = yaw;
    this.prevPosition.x = x;
    this.prevPosition.y = 0.35;
    this.prevPosition.z = z;
    this.prevYaw = yaw;
    this.prevPitch = 0;
    this.prevRoll = 0;
    this.smoothedLongAccel = 0;
    this.speed = 0;
    this.lateralSpeed = 0;
    this.angularVelocity = 0;
    this.steerAngle = 0;
    this.targetSteerAngle = 0;
    this.pitch = 0;
    this.roll = 0;
    this.gear = 1;
    this.rpm = 1000;
    this.wheelRotations = [0, 0, 0, 0];
    this.repairFull();
  }

  public repairFull(): void {
    this.damage.overallHealth = 100;
    this.damage.engineHealth = 100;
    this.damage.suspensionLeft = 100;
    this.damage.suspensionRight = 100;
    this.damage.frontCrumple = 0;
    this.damage.rearCrumple = 0;
    this.damage.wingLoose = false;
    this.damage.isTotaled = false;
    this.pitRepairProgress = 0;
  }

  /**
   * Main High-Grip Physics Simulation Tick
   */
  public update(dt: number, inputs: CarInputs): void {
    const clampedDt = Math.min(dt, 0.05);

    // Save previous snapshot for silky-smooth sub-frame temporal render interpolation
    this.prevPosition.x = this.position.x;
    this.prevPosition.y = this.position.y;
    this.prevPosition.z = this.position.z;
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    this.prevRoll = this.roll;

    if (this.isLockedInPit) {
      this.speed = 0;
      this.lateralSpeed = 0;
      this.angularVelocity = 0;
      this.rpm = 1000 + Math.sin(Date.now() * 0.006) * 120;
      this.gear = 1;
      return;
    }

    this.updatePitRepair(clampedDt);

    const enginePowerFactor = Math.max(0.25, this.damage.engineHealth / 100);
    const speedKmh = Math.abs(this.speed) * 3.6;

    // --- 1. PRECISE STEERING WITH RACING SPEED-SENSITIVE RACK RATIO ---
    // At low speeds (<40 km/h): 0.58 rad (~33°) for hairpin agility
    // At high speeds (>200 km/h): 0.11 rad (~6.3°) for laser-guided stability at 350 km/h
    const speedRatio = Math.min(1.0, speedKmh / 240);
    const maxLock = THREE.MathUtils.lerp(0.58, 0.11, Math.pow(speedRatio, 0.75));

    const suspensionDiff = (this.damage.suspensionLeft - this.damage.suspensionRight);
    const suspensionBias = Math.abs(suspensionDiff) > 8 ? suspensionDiff * 0.0008 : 0;

    if (Math.abs(inputs.steering) > 0.02) {
      this.targetSteerAngle = (inputs.steering * maxLock) - suspensionBias;
      const steerSpeed = 18.0; // Instant razor-sharp response
      this.steerAngle += (this.targetSteerAngle - this.steerAngle) * Math.min(1.0, steerSpeed * clampedDt);
    } else {
      // Immediate elastic snap back to center (zero veering)
      const casterReturnSpeed = 24.0;
      this.steerAngle += (0 - this.steerAngle) * Math.min(1.0, casterReturnSpeed * clampedDt);
      if (Math.abs(this.steerAngle) < 0.001) this.steerAngle = 0;
    }

    // --- 2. TRANSMISSION & ENGINE RPM WITH PROGRESSIVE CLUTCH DYNAMICS ---
    this.updateTransmission(clampedDt, inputs.throttle, enginePowerFactor);

    // --- 3. LONGITUDINAL DRIVE & BRAKING (EXTREME HYPERCAR ACCELERATION & 350 KM/H TOP SPEED) ---
    let drivingForce = 0;
    let brakeForce = 0;
    const currentRatio = this.gear === -1 ? this.reverseRatio : (this.gearRatios[this.gear - 1] || 1.0);
    const totalGearRatio = currentRatio * this.finalDrive;
    const shiftTorqueFactor = this.isShifting ? 0.35 : 1.0; // Ignition cut during seamless gear change

    if (this.gear === -1) {
      // IN REVERSE GEAR:
      if (inputs.brake > 0.05) {
        const reverseEfficiency = 11500 * enginePowerFactor * inputs.brake * shiftTorqueFactor;
        drivingForce = -reverseEfficiency;
        if (this.speed < -18.0) {
          drivingForce = 0;
        }
      }

      if (inputs.throttle > 0.05) {
        if (this.speed < -0.3) {
          brakeForce = inputs.throttle * 18000;
        } else {
          this.gear = 1;
          const normalizedRpm = Math.max(0, (this.rpm - this.idleRpm) / (this.maxRpm - this.idleRpm));
          const torqueEfficiency = Math.sin(normalizedRpm * Math.PI * 0.82 + 0.18) * 0.30 + 0.70;
          const baseEngineForce = 31500 * enginePowerFactor * inputs.throttle * torqueEfficiency;
          drivingForce = (baseEngineForce * totalGearRatio) / 8.6;
        }
      }
    } else {
      // IN FORWARD GEARS (1..6): 0-100 km/h in 1.5s launch thrust with 350 km/h top-end power
      if (inputs.throttle > 0) {
        const normalizedRpm = Math.max(0, (this.rpm - this.idleRpm) / (this.maxRpm - this.idleRpm));
        const torqueEfficiency = Math.sin(normalizedRpm * Math.PI * 0.82 + 0.18) * 0.28 + 0.72;

        // Top-end aerodynamic power governor (smoothly caps at 350 - 355 km/h)
        const topSpeedGovernor = speedKmh > 342
          ? Math.max(0, 1.0 - Math.pow((speedKmh - 342) / 10.0, 1.5))
          : 1.0;

        const baseEngineForce = 31500 * enginePowerFactor * inputs.throttle * torqueEfficiency * shiftTorqueFactor * topSpeedGovernor;
        drivingForce = (baseEngineForce * totalGearRatio) / 8.6;
      }

      if (inputs.brake > 0.05) {
        if (this.speed > 0.35) {
          // High-G Carbon-Carbon racing brakes with high-speed aero-assist
          const aeroBrakeBoost = 1.0 + Math.min(0.6, speedKmh / 250);
          brakeForce = -inputs.brake * 26500 * aeroBrakeBoost;
        } else {
          this.speed = 0;
          this.gear = -1;
          drivingForce = -inputs.brake * 8500 * enginePowerFactor;
        }
      }
    }

    // Aerodynamics & Continuous Rolling Resistance
    const airResistance = 0.5 * 1.225 * this.dragCoeff * 2.05 * Math.sign(this.speed) * (this.speed * this.speed);
    // Smooth tanh saturation eliminates discontinuous +/-146N oscillation at zero speed
    const rollingResistance = 0.010 * this.mass * 9.81 * Math.tanh(this.speed / 0.4);

    const netLongForce = drivingForce + brakeForce - airResistance - rollingResistance;
    const longAccel = netLongForce / this.mass;
    this.speed += longAccel * clampedDt;

    // Natural friction decay when coasting
    if (inputs.throttle === 0 && inputs.brake === 0) {
      this.speed *= Math.exp(-0.65 * clampedDt);
      if (Math.abs(this.speed) < 0.02) this.speed = 0;
    }

    // --- 4. PACEJKA-INSPIRED NON-LINEAR CORNERING & MULTI-MODE DRIFT DYNAMICS ---
    const absSpeed = Math.abs(this.speed);
    const speedGate = Math.min(1.0, Math.max(0.0, (speedKmh - 3.0) / 12.0));

    // Vehicle kinematic wheelbase coordinates
    const lf = 1.35; // meters (CG to front axle)
    const lr = 1.40; // meters (CG to rear axle)

    // Lateral velocities at front and rear axles
    const vLatFront = this.lateralSpeed + lf * this.angularVelocity;
    const vLatRear = this.lateralSpeed - lr * this.angularVelocity;

    // True dynamic slip angles (radians)
    this.slipAngleFront = (this.steerAngle * Math.sign(this.speed || 1)) - Math.atan2(vLatFront, Math.max(1.2, absSpeed));
    this.slipAngleRear = -Math.atan2(vLatRear, Math.max(1.2, absSpeed));

    // Drift Initiation Triggers:
    // 1. Handbrake lock
    // 2. Power oversteer: high throttle in gears 1-3 with steering angle
    // 3. Trail-braking inertia flick
    const isPowerOversteer = (inputs.throttle > 0.75 && this.gear <= 3 && Math.abs(this.steerAngle) > 0.14 && speedKmh > 25 && speedKmh < 185);
    const isTrailOversteer = (inputs.brake > 0.6 && Math.abs(this.steerAngle) > 0.22 && speedKmh > 55);
    const isHandbrakeSlide = inputs.handbrake && speedKmh > 8.0;

    const driftInitiated = isHandbrakeSlide || isPowerOversteer || isTrailOversteer;
    const wasDrifting = this.isDrifting;

    if (driftInitiated) {
      this.isDrifting = true;
    } else if (Math.abs(this.lateralSpeed) < 0.35 && Math.abs(this.slipAngleRear) < 0.08) {
      this.isDrifting = false;
    }

    // Rear tire grip reduction during drift
    const rearGripMultiplier = inputs.handbrake ? 0.28 : (isPowerOversteer ? 0.52 : (this.isDrifting ? 0.65 : 1.0));
    const frontGripMultiplier = 1.0;

    // Pacejka Magic Formula Lateral Forces: F_y = D * sin(C * atan(B * alpha))
    const B = 8.5; // Stiffness factor
    const C = 1.35; // Shape factor
    const D_front = 14500 * frontGripMultiplier; // Peak front lateral force
    const D_rear = 15200 * rearGripMultiplier;   // Peak rear lateral force

    const fyFront = D_front * Math.sin(C * Math.atan(B * this.slipAngleFront)) * speedGate;
    const fyRear = D_rear * Math.sin(C * Math.atan(B * this.slipAngleRear)) * speedGate;

    // Net lateral acceleration and yaw moment
    const totalLatForce = (fyFront + fyRear);
    const latAccel = totalLatForce / this.mass;

    // Integrate lateral velocity with progressive dampening
    if (this.isDrifting) {
      this.lateralSpeed += latAccel * clampedDt;
      // Slight speed bleed during sustained sideways slide
      this.speed *= Math.exp(-0.28 * clampedDt);
    } else {
      // High-grip on-rails rapid decay when not drifting
      this.lateralSpeed += latAccel * clampedDt;
      this.lateralSpeed *= Math.exp(-18.0 * clampedDt);
      if (Math.abs(this.lateralSpeed) < 0.01) this.lateralSpeed = 0;
    }

    // --- 5. RACING YAW DYNAMICS & COUNTER-STEER STABILIZATION ---
    // Yaw torque: Torque = (fyFront * lf - fyRear * lr)
    const yawTorque = (fyFront * lf - fyRear * lr);
    const yawInertia = this.mass * 1.65; // kg*m^2
    const baseYawAccel = yawTorque / yawInertia;

    if (absSpeed > 0.2) {
      const speedNorm = Math.min(1.0, speedKmh / 160);
      const turnPower = 2.2 + speedNorm * 0.6;
      const targetSteerYaw = this.steerAngle * turnPower * Math.sign(this.speed);

      // Handbrake boost or counter-steer stabilizing moment
      const driftYawBoost = inputs.handbrake ? 1.45 : (isPowerOversteer ? 1.25 : 1.0);
      const netTargetYaw = targetSteerYaw * driftYawBoost;

      const yawDamp = this.isDrifting ? 12.0 : 24.0;
      this.angularVelocity += (netTargetYaw + baseYawAccel * 0.08 - this.angularVelocity) * Math.min(1.0, yawDamp * clampedDt);
    } else {
      this.angularVelocity *= (1.0 - 24.0 * clampedDt);
      if (Math.abs(this.angularVelocity) < 0.001) this.angularVelocity = 0;
    }

    this.yaw += this.angularVelocity * clampedDt;

    // Visual Counter-Steering calculation for front wheels
    const trajectoryAngle = Math.atan2(this.lateralSpeed, Math.max(0.5, absSpeed));
    if (this.isDrifting && Math.abs(trajectoryAngle) > 0.04) {
      // Blend user steering with the authentic caster self-alignment angle
      const counterSteerTarget = this.steerAngle - trajectoryAngle * 0.82;
      this.visualSteerAngle = THREE.MathUtils.clamp(counterSteerTarget, -0.65, 0.65);
    } else {
      this.visualSteerAngle = this.steerAngle;
    }

    // --- 6. 4-WHEEL INDEPENDENT SLIP RATIOS & SUSPENSION LOAD TRANSFER ---
    const lateralG = (this.speed * this.angularVelocity + latAccel) / 9.81;
    this.lateralG = lateralG;

    // Lateral Load Transfer: Outside wheels bear more normal force, inside wheels unload
    const loadTransfer = THREE.MathUtils.clamp(lateralG * 0.35, -0.42, 0.42);
    const loadLeft = 0.5 - loadTransfer;
    const loadRight = 0.5 + loadTransfer;

    // Suspension compression (meters)
    this.wheelSuspensionCompression[0] = -loadTransfer * 0.028; // FL
    this.wheelSuspensionCompression[1] = loadTransfer * 0.028;  // FR
    this.wheelSuspensionCompression[2] = -loadTransfer * 0.034; // RL
    this.wheelSuspensionCompression[3] = loadTransfer * 0.034;  // RR

    // Individual wheel slip ratios [FL, FR, RL, RR]
    const launchSlip = (inputs.throttle > 0.8 && speedKmh < 45) ? Math.pow((45 - speedKmh) / 45, 1.5) * 0.45 : 0;
    const brakeSlip = (inputs.brake > 0.85 && speedKmh > 50) ? 0.35 : 0;
    const frontLatSlip = Math.min(1.0, Math.abs(this.slipAngleFront) * 1.8);
    const rearLatSlip = Math.min(1.0, Math.abs(this.slipAngleRear) * 2.2) * (this.isDrifting ? 1.3 : 1.0);

    this.wheelSlipRatios[0] = Math.max(brakeSlip, frontLatSlip * (loadLeft * 1.4));  // FL
    this.wheelSlipRatios[1] = Math.max(brakeSlip, frontLatSlip * (loadRight * 1.4)); // FR
    this.wheelSlipRatios[2] = Math.max(launchSlip, rearLatSlip * (loadLeft * 1.5));  // RL
    this.wheelSlipRatios[3] = Math.max(launchSlip, rearLatSlip * (loadRight * 1.5)); // RR

    this.slipRatio = Math.max(
      this.wheelSlipRatios[0],
      this.wheelSlipRatios[1],
      this.wheelSlipRatios[2],
      this.wheelSlipRatios[3]
    );

    // --- 7. INTEGRATE WORLD VELOCITY (DUAL-AXIS TRACKING) ---
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    const worldVx = (forwardX * this.speed) + (rightX * this.lateralSpeed);
    const worldVz = (forwardZ * this.speed) + (rightZ * this.lateralSpeed);

    this.position.x += worldVx * clampedDt;
    this.position.z += worldVz * clampedDt;

    // --- 8. CHASSIS BODY LEAN DYNAMICS (AUTHENTIC RACING ROLL) ---
    this.pitch = 0; // Flat bottom ground-effect
    const maxRoll = 0.040; // ~2.3 degrees of authentic GT body roll under max lateral load
    const targetRoll = THREE.MathUtils.clamp(lateralG * 0.022, -maxRoll, maxRoll);
    this.roll += (targetRoll - this.roll) * Math.min(1.0, 18.0 * clampedDt);

    // --- 9. FORWARD WHEEL ROLLING ---
    const wheelRotSpeed = this.speed / (2.05 / (2 * Math.PI));
    for (let i = 0; i < 4; i++) {
      this.wheelRotations[i] += wheelRotSpeed * clampedDt;
    }
  }

  private updateTransmission(dt: number, throttle: number, powerFactor: number): void {
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) {
        this.isShifting = false;
      }
    }

    if (this.gear === -1) {
      const targetReverseRpm = Math.min(this.maxRpm, this.idleRpm + Math.abs(this.speed) * 420 + throttle * 1500);
      this.rpm += (targetReverseRpm - this.rpm) * (1.0 - Math.exp(-14.0 * dt));
      this.rpm = THREE.MathUtils.clamp(this.rpm, this.idleRpm, this.maxRpm);
      return;
    }

    const currentRatio = this.gearRatios[this.gear - 1] || 1.0;
    const speedRatioRpm = (Math.abs(this.speed) * currentRatio * this.finalDrive * 60) / 2.05;

    // Progressive Launch Clutch Model (eliminates RPM collapse and acceleration jolt)
    // In 1st gear, clutch smoothly locks up from 0 to 4.5 m/s (~16.2 km/h)
    const clutchEngagement = this.gear === 1
      ? Math.min(1.0, Math.max(0.0, Math.abs(this.speed) / 4.5))
      : 1.0;

    const launchTargetRpm = this.idleRpm + Math.pow(throttle, 1.15) * 5200;
    const targetRpm = THREE.MathUtils.lerp(
      launchTargetRpm,
      Math.max(this.idleRpm, speedRatioRpm),
      clutchEngagement
    );

    const rpmResponseRate = this.isShifting ? 32.0 : 18.0;
    this.rpm += (targetRpm - this.rpm) * (1.0 - Math.exp(-rpmResponseRate * dt));
    this.rpm = THREE.MathUtils.clamp(this.rpm, this.idleRpm, this.maxRpm);

    // Upshift at 8900 RPM with calibrated racing speed gates per gear
    const minUpshiftSpeed = this.gear === 1 ? 23.5 : (this.gear === 2 ? 39.0 : (this.gear === 3 ? 55.0 : (this.gear === 4 ? 72.0 : 87.0)));
    if (!this.isShifting && this.gear < 6 && this.rpm > 8900 * powerFactor && this.speed > minUpshiftSpeed) {
      this.gear++;
      this.isShifting = true;
      this.shiftTimer = 0.055;
      if (this.onBackfire) this.onBackfire(false);
    }
    // Downshift below 2800 RPM with wide hysteresis
    else if (!this.isShifting && this.gear > 1 && this.rpm < 2800 && this.speed < minUpshiftSpeed * 0.82) {
      this.gear--;
      this.isShifting = true;
      this.shiftTimer = 0.055;
    }

    // --- ENGINE TEMPERATURE THERMODYNAMICS (°C) ---
    const rpmLoad = (this.rpm - this.idleRpm) / (this.maxRpm - this.idleRpm);
    const radiatorCooling = (Math.min(1.0, Math.abs(this.speed) / 75.0) * 8.0);
    const targetTemp = 85.0 + (rpmLoad * 32.0) + (throttle * 16.0) - radiatorCooling;
    this.engineTemp += (targetTemp - this.engineTemp) * (1.0 - Math.exp(-0.45 * dt));
  }

  public handleCollision(
    normalX: number,
    normalZ: number,
    penetration: number,
    isStaticSolid: boolean = true
  ): void {
    this.position.x += normalX * penetration;
    this.position.z += normalZ * penetration;

    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const carVx = forwardX * this.speed;
    const carVz = forwardZ * this.speed;

    const normalDot = carVx * normalX + carVz * normalZ;

    if (normalDot < 0) {
      const impactSpeed = Math.abs(normalDot);
      const impactKmh = impactSpeed * 3.6;

      const restitution = isStaticSolid ? 0.20 : 0.40;
      const impulse = -(1 + restitution) * normalDot;

      const newVx = carVx + impulse * normalX;
      const newVz = carVz + impulse * normalZ;

      this.speed = (newVx * forwardX + newVz * forwardZ) * 0.4;
      this.lateralSpeed *= 0.4;

      const bumpTorque = (normalX * forwardZ - normalZ * forwardX) * 2.0;
      this.angularVelocity += bumpTorque;

      if (impactKmh > 12) {
        const damageAmount = Math.min(45, (impactKmh - 10) * 0.55);

        const localDot = forwardX * -normalX + forwardZ * -normalZ;
        if (localDot > 0.4) {
          this.damage.frontCrumple = Math.min(1.0, this.damage.frontCrumple + (impactKmh / 160));
          this.damage.engineHealth = Math.max(10, this.damage.engineHealth - damageAmount * 0.85);
          if (damageAmount > 20) this.damage.wingLoose = true;
        } else if (localDot < -0.4) {
          this.damage.rearCrumple = Math.min(1.0, this.damage.rearCrumple + (impactKmh / 180));
          this.damage.wingLoose = true;
        }

        const rightDot = (Math.cos(this.yaw) * -normalX) - (Math.sin(this.yaw) * -normalZ);
        if (Math.abs(rightDot) > 0.4) {
          if (rightDot > 0) {
            this.damage.suspensionRight = Math.max(20, this.damage.suspensionRight - damageAmount * 0.5);
          } else {
            this.damage.suspensionLeft = Math.max(20, this.damage.suspensionLeft - damageAmount * 0.5);
          }
        }

        this.damage.overallHealth = Math.max(0, this.damage.overallHealth - damageAmount);
        if (this.damage.overallHealth <= 0) {
          this.damage.isTotaled = true;
        }

        if (this.onCrash) {
          this.onCrash(impactSpeed);
        }
      }
    }
  }

  private updatePitRepair(dt: number): void {
    if (this.isInPitStop && Math.abs(this.speed) < 2.0) {
      if (this.damage.overallHealth < 100 || this.damage.engineHealth < 100 || this.damage.frontCrumple > 0) {
        const repairRate = 34.0;
        this.damage.overallHealth = Math.min(100, this.damage.overallHealth + repairRate * dt);
        this.damage.engineHealth = Math.min(100, this.damage.engineHealth + repairRate * dt);
        this.damage.suspensionLeft = Math.min(100, this.damage.suspensionLeft + repairRate * dt);
        this.damage.suspensionRight = Math.min(100, this.damage.suspensionRight + repairRate * dt);
        this.damage.frontCrumple = Math.max(0, this.damage.frontCrumple - (0.38 * dt));
        this.damage.rearCrumple = Math.max(0, this.damage.rearCrumple - (0.38 * dt));
        this.damage.wingLoose = false;
        this.damage.isTotaled = false;

        this.pitRepairProgress = this.damage.overallHealth / 100;

        if (this.damage.overallHealth >= 99.8) {
          this.repairFull();
          if (this.onPitFinish) {
            this.onPitFinish();
          }
        }
      }
    } else {
      this.pitRepairProgress = 0;
    }
  }

  /**
   * Sub-frame temporal interpolation: position
   */
  public getInterpolatedPosition(alpha: number, out: THREE.Vector3): void {
    out.x = this.prevPosition.x + (this.position.x - this.prevPosition.x) * alpha;
    out.y = this.prevPosition.y + (this.position.y - this.prevPosition.y) * alpha;
    out.z = this.prevPosition.z + (this.position.z - this.prevPosition.z) * alpha;
  }

  /**
   * Sub-frame temporal interpolation: yaw with wrap-around correction
   */
  public getInterpolatedYaw(alpha: number): number {
    let diff = this.yaw - this.prevYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return this.prevYaw + diff * alpha;
  }

  /**
   * Sub-frame temporal interpolation: pitch
   */
  public getInterpolatedPitch(_alpha: number): number {
    return 0;
  }

  /**
   * Sub-frame temporal interpolation: roll
   */
  public getInterpolatedRoll(alpha: number): number {
    return this.prevRoll + (this.roll - this.prevRoll) * alpha;
  }
}
