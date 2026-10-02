/**
 * HUD.tsx - Clean racing telemetry heads-up display
 * Speedometer, dynamic RPM tachometer, lap timers, circuit mini-map,
 * engine health indicators, camera switcher, and pause menu trigger.
 */

import React from 'react';
import { Camera, Flame, Pause, Trophy, Users, Flag } from 'lucide-react';
import { GameTelemetry } from '../game/RacingGameEngine';

interface HUDProps {
  telemetry: GameTelemetry;
  carPosition?: { x: number; z: number; yaw: number };
  onSwitchCamera: () => void;
  onOpenPause: () => void;
  isMultiplayer?: boolean;
  totalLaps?: number;
  myPlayerName?: string;
  myPlayerId?: 'p1' | 'p2';
  rivalPlayerName?: string;
  rivalLap?: number;
  raceWinner?: { id: string; name: string } | null;
}

export const HUD = React.memo<HUDProps>(({
  telemetry,
  carPosition,
  onSwitchCamera,
  onOpenPause,
  isMultiplayer,
  totalLaps = 3,
  myPlayerName,
  myPlayerId = 'p1',
  rivalPlayerName,
  rivalLap = 1,
  raceWinner,
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds * 1000) % 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  // RPM percentage (0% at 1000, 100% at 9500)
  const rpmPercent = Math.min(100, Math.max(0, ((telemetry.rpm - 1000) / 8500) * 100));
  const isRedline = telemetry.rpm > 8700;

  // Mini-map coordinates translation (derived directly from telemetry to eliminate inline object allocation)
  const posX = carPosition ? carPosition.x : telemetry.carX;
  const posZ = carPosition ? carPosition.z : telemetry.carZ;
  const yaw = carPosition ? carPosition.yaw : telemetry.carYaw;
  const mapX = 50 + (posX * 0.35);
  const mapY = 50 + (posZ * 0.35);
  const carHeadingDeg = (yaw * 180) / Math.PI;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2 sm:p-4 select-none">
      {/* Top Perimeter Telemetry Bar */}
      <div className="pointer-events-auto w-full max-w-full z-20">
        <div className="flex items-center justify-between gap-2 w-full bg-neutral-950/80 backdrop-blur-md border border-white/10 rounded-2xl px-2.5 sm:px-4 py-1.5 shadow-xl">
          
          {/* Left: Compact Circuit Radar & Lap Timer */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Radar Mini-map */}
            <div className="relative w-9 h-9 sm:w-11 sm:h-11 bg-neutral-900/90 rounded-xl border border-white/10 overflow-hidden shrink-0 flex items-center justify-center shadow-inner">
              <svg viewBox="0 0 100 100" className="w-full h-full p-0.5 opacity-80">
                <rect x="8" y="8" width="84" height="84" rx="14" ry="14" fill="none" stroke="#52525b" strokeWidth="6" />
                <rect x="8" y="8" width="84" height="84" rx="14" ry="14" fill="none" stroke="#18181b" strokeWidth="4" />
                <line x1="42" y1="92" x2="58" y2="92" stroke="#ef4444" strokeWidth="3" />
                <line x1="40" y1="83" x2="65" y2="83" stroke="#10b981" strokeWidth="2" strokeDasharray="2,2" />
              </svg>
              <div
                className="absolute w-2 h-2 bg-red-500 rounded-full border border-white shadow-sm"
                style={{
                  left: `${Math.min(92, Math.max(8, mapX))}%`,
                  top: `${Math.min(92, Math.max(8, mapY))}%`,
                  transform: `translate(-50%, -50%) rotate(${carHeadingDeg}deg)`,
                }}
              >
                <div className="w-0.5 h-1 bg-white mx-auto -mt-0.5 rounded-full" />
              </div>
            </div>

            {/* Lap Counter & Chronometer */}
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                <span>VUELTA {telemetry.lapCount}{isMultiplayer ? `/${totalLaps}` : ''}</span>
                {telemetry.isDrifting && (
                  <span className="flex items-center gap-0.5 text-amber-400 font-black text-[9px] animate-pulse">
                    <Flame className="w-2.5 h-2.5" /> DRIFT
                  </span>
                )}
              </div>
              <div className="text-sm sm:text-base font-black font-mono tracking-tight text-white tabular-nums leading-tight">
                {formatTime(telemetry.lapTime)}
              </div>
              <div className="text-[9px] text-neutral-400 font-mono tabular-nums leading-none">
                Mejor: {telemetry.bestLap ? formatTime(telemetry.bestLap) : '--:--.---'}
              </div>
            </div>
          </div>

          {/* Center: High-Performance Speedometer & Tachometer */}
          <div className="flex items-center gap-2 sm:gap-3 bg-neutral-900/80 border border-white/10 rounded-xl px-2.5 sm:px-4 py-1 shadow-inner">
            {/* Gear Indicator */}
            <div className="flex items-center gap-1">
              <span className="text-[8px] sm:text-[9px] uppercase font-bold text-neutral-400">M</span>
              <span className={`text-base sm:text-lg font-black font-mono leading-none ${telemetry.gear === -1 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                {telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : telemetry.gear}
              </span>
            </div>

            <div className="w-px h-4 bg-white/15" />

            {/* Speed Display */}
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-xl font-black font-mono tracking-tight text-white tabular-nums leading-none">
                {telemetry.speedKmh}
              </span>
              <span className="text-[8px] sm:text-[9px] font-bold text-neutral-400">KM/H</span>
            </div>

            <div className="hidden xs:block w-px h-4 bg-white/15" />

            {/* RPM Tachometer */}
            <div className="hidden xs:flex items-center gap-1.5">
              <div className="w-12 sm:w-20 h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-white/10">
                <div
                  className={`h-full rounded-full ${
                    isRedline
                      ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-600 animate-pulse'
                      : 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500'
                  }`}
                  style={{ width: `${rpmPercent}%` }}
                />
              </div>
              <span className={`text-[9px] font-mono font-bold tabular-nums ${isRedline ? 'text-red-400 animate-pulse' : 'text-neutral-400'}`}>
                {(telemetry.rpm / 1000).toFixed(1)}k
              </span>
            </div>
          </div>

          {/* Right: Engine Status, Camera Switcher & Pause Trigger */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Motor & Chassis Mini Status */}
            <div className="hidden sm:flex items-center gap-2 bg-neutral-900/80 border border-white/10 rounded-xl px-2.5 py-1">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-1 text-[8px] uppercase font-semibold text-neutral-400">
                  <span>MOT</span>
                  <span className={`font-mono tabular-nums ${telemetry.engineTemp > 108 ? 'text-amber-400 font-bold' : 'text-neutral-200'}`}>
                    {telemetry.engineTemp || 85}°C
                  </span>
                </div>
                <div className="w-10 h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      telemetry.engineHealth > 70 ? 'bg-emerald-400' : telemetry.engineHealth > 35 ? 'bg-amber-400' : 'bg-red-500'
                    }`}
                    style={{ width: `${telemetry.engineHealth}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-1 text-[8px] uppercase font-semibold text-neutral-400">
                  <span>CHAS</span>
                  <span className={`font-mono tabular-nums ${telemetry.health < 50 ? 'text-red-400 font-bold' : 'text-neutral-200'}`}>
                    {telemetry.health}%
                  </span>
                </div>
                <div className="w-10 h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      telemetry.health > 70 ? 'bg-blue-400' : telemetry.health > 35 ? 'bg-amber-400' : 'bg-red-500'
                    }`}
                    style={{ width: `${telemetry.health}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Quick Camera Switcher Button with Active Mode Indicator */}
            <button
              onClick={onSwitchCamera}
              title="Cambiar perspectiva de cámara (C)"
              className="px-2 py-1.5 sm:py-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/5 transition-colors active:scale-95 flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                {telemetry.cameraMode === 'hood' && 'Morro / Capó'}
                {telemetry.cameraMode === 'bumper' && 'Alerón'}
                {telemetry.cameraMode === 'orbit' && 'Helicóptero'}
                {telemetry.cameraMode === 'chase' && (telemetry.cameraDistance === 'near' ? 'Cerca' : telemetry.cameraDistance === 'far' ? 'Lejos' : 'Persecución')}
              </span>
            </button>

            {/* Pause Menu Trigger Button */}
            <button
              onClick={onOpenPause}
              title="Menú de Pausa (P / ESC)"
              className="p-1.5 sm:p-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-white border border-amber-500/40 transition-all active:scale-95 flex items-center justify-center font-bold"
            >
              <Pause className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>

        {/* Center: Pit Stop Telemetry Banner (when in pit) */}
        {telemetry.isInPit && (
          <div className="bg-neutral-950/95 border-2 border-emerald-500/70 rounded-2xl px-4 py-2 text-center backdrop-blur-xl shadow-2xl shadow-emerald-950/60 max-w-sm mx-auto flex flex-col gap-1 mt-2 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto">
            {telemetry.broadcastCamName && (
              <div className="flex items-center justify-center gap-1.5 bg-red-950/60 border border-red-500/40 rounded py-0.5 px-2 text-[8px] font-bold text-red-200 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block" />
                <span>EN DIRECTO · {telemetry.broadcastCamName}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1 text-xs">
              <span className="font-bold text-emerald-400 uppercase tracking-wide">
                {(telemetry.pitPhase === 'entry_autopilot' || telemetry.pitPhase === 'entry') && 'AUTOPILOT · LIMITADOR 60 KM/H'}
                {telemetry.pitPhase === 'docking' && 'COLOCANDO EN CAJÓN DE BOXES'}
                {(telemetry.pitPhase === 'jacks_up' || telemetry.pitPhase === 'jacking') && 'LEVANTANDO VEHÍCULO'}
                {(telemetry.pitPhase === 'servicing' || telemetry.pitPhase === 'service') && 'CAMBIO DE NEUMÁTICOS Y REPARACIÓN'}
                {telemetry.pitPhase === 'jacks_down' && 'GATOS ABAJO · ¡LISTO!'}
                {(telemetry.pitPhase === 'released' || telemetry.pitPhase === 'exit') && '¡SALIDA DE BOXES! CONTROL RETOMADO'}
              </span>
              <span className="font-mono font-bold text-white tabular-nums">
                {telemetry.pitPhase === 'entry_autopilot' ? '60 KM/H' : `${telemetry.pitTimeRemaining.toFixed(1)}s`}
              </span>
            </div>
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                style={{ width: `${Math.min(100, telemetry.pitProgress * 100)}%` }}
              />
            </div>
          </div>
        )}
        {/* Victory Banner (Multiplayer Finish) */}
        {raceWinner && (
          <div className="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 border-2 border-yellow-300 rounded-3xl px-6 py-3 text-center shadow-2xl shadow-amber-950/80 max-w-md mx-auto flex items-center justify-center gap-3 mt-3 pointer-events-auto animate-bounce">
            <Trophy className="w-8 h-8 text-neutral-950 fill-current" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-950">
                ¡GANADOR DE LA CARRERA 1 VS 1!
              </span>
              <span className="text-xl font-black text-neutral-950 font-mono tracking-tight leading-none">
                {raceWinner.name} ({raceWinner.id === myPlayerId ? '¡ERES TÚ!' : 'RIVAL'})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
