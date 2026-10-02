/**
 * TouchControls.tsx - Ergonomic Touch Controls for Mobile Landscape Mode
 * Features responsive steering controls for the left thumb, and throttle/brake/handbrake pedals for the right thumb.
 * Employs pointer capture to ensure buttons never stick even if fingers slide across the screen.
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Zap, ShieldAlert } from 'lucide-react';
import { CarInputs } from '../game/physics/VehiclePhysics';

interface TouchControlsProps {
  onInputChange: (inputs: Partial<CarInputs>) => void;
}

export const TouchControls = React.memo<TouchControlsProps>(({ onInputChange }) => {
  const [isLeftActive, setIsLeftActive] = useState(false);
  const [isRightActive, setIsRightActive] = useState(false);
  const [isGasActive, setIsGasActive] = useState(false);
  const [isBrakeActive, setIsBrakeActive] = useState(false);
  const [isHandbrakeActive, setIsHandbrakeActive] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Update steering whenever left or right button state changes
  useEffect(() => {
    let steer = 0;
    if (isLeftActive && !isRightActive) steer = 1;
    if (isRightActive && !isLeftActive) steer = -1;
    onInputChange({ steering: steer });
  }, [isLeftActive, isRightActive, onInputChange]);

  // Update throttle
  useEffect(() => {
    onInputChange({ throttle: isGasActive ? 1.0 : 0.0 });
  }, [isGasActive, onInputChange]);

  // Update brake
  useEffect(() => {
    onInputChange({ brake: isBrakeActive ? 1.0 : 0.0 });
  }, [isBrakeActive, onInputChange]);

  // Update handbrake
  useEffect(() => {
    onInputChange({ handbrake: isHandbrakeActive });
  }, [isHandbrakeActive, onInputChange]);

  const bindPointer = (setter: (active: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setter(true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setter(false);
    },
    onPointerCancel: () => setter(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="absolute inset-x-0 bottom-1 sm:bottom-2.5 px-2 sm:px-6 flex items-end justify-between pointer-events-none select-none z-30">
      {/* Left Thumb: Steering Controls */}
      <div className="flex items-center gap-1.5 sm:gap-3 pointer-events-auto">
        {/* Left Turn */}
        <button
          type="button"
          {...bindPointer(setIsLeftActive)}
          className={`w-12 h-12 sm:w-16 sm:h-16 landscape:w-12 landscape:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-75 border ${
            isLeftActive
              ? 'bg-neutral-800 text-white scale-90 border-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.4)]'
              : 'bg-neutral-950/70 text-neutral-300 border-white/10 backdrop-blur-md active:scale-95'
          }`}
          aria-label="Girar a la izquierda"
        >
          <ArrowLeft className="w-6 h-6 sm:w-8 sm:h-8 landscape:w-6 landscape:h-6" />
        </button>

        {/* Right Turn */}
        <button
          type="button"
          {...bindPointer(setIsRightActive)}
          className={`w-12 h-12 sm:w-16 sm:h-16 landscape:w-12 landscape:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-75 border ${
            isRightActive
              ? 'bg-neutral-800 text-white scale-90 border-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.4)]'
              : 'bg-neutral-950/70 text-neutral-300 border-white/10 backdrop-blur-md active:scale-95'
          }`}
          aria-label="Girar a la derecha"
        >
          <ArrowRight className="w-6 h-6 sm:w-8 sm:h-8 landscape:w-6 landscape:h-6" />
        </button>
      </div>

      {/* Desktop Helper Notice */}
      {!isTouchDevice && (
        <div className="hidden lg:flex items-center gap-3 text-[10px] text-neutral-400 bg-neutral-950/75 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 mb-1">
          <span>Teclado: <b>W/↑</b> Gas · <b>S/↓</b> Freno · <b>A/D</b> Dirección · <b>ESPACIO</b> Drift · <b>C</b> Cámara · <b>R</b> Reparar</span>
        </div>
      )}

      {/* Right Thumb: Handbrake (Drift), Brake / Reverse, and Throttle Gas Pedals */}
      <div className="flex items-end gap-1.5 sm:gap-2.5 pointer-events-auto">
        {/* Handbrake / Drift Button */}
        <button
          type="button"
          {...bindPointer(setIsHandbrakeActive)}
          className={`w-10 h-10 sm:w-14 sm:h-14 landscape:w-10 landscape:h-10 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-75 border ${
            isHandbrakeActive
              ? 'bg-amber-600 text-white scale-90 border-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.5)]'
              : 'bg-neutral-950/70 text-amber-400 border-white/10 backdrop-blur-md active:scale-95'
          }`}
          aria-label="Freno de Mano Drift"
        >
          <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 landscape:w-3.5 landscape:h-3.5" />
          <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider">Drift</span>
        </button>

        {/* Brake / Reverse Pedal */}
        <button
          type="button"
          {...bindPointer(setIsBrakeActive)}
          className={`w-11 h-14 sm:w-16 sm:h-20 landscape:w-11 landscape:h-13 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-75 border ${
            isBrakeActive
              ? 'bg-red-700 text-white scale-90 border-red-400 shadow-[0_0_22px_rgba(239,68,68,0.6)]'
              : 'bg-neutral-950/70 text-red-400 border-white/10 backdrop-blur-md active:scale-95'
          }`}
          aria-label="Freno y Marcha Atrás"
        >
          <ShieldAlert className="w-4 h-4 sm:w-6 sm:h-6 landscape:w-4 landscape:h-4" />
          <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">Freno</span>
        </button>

        {/* Accelerator Pedal (Gas) */}
        <button
          type="button"
          {...bindPointer(setIsGasActive)}
          className={`w-12 h-18 sm:w-18 sm:h-24 landscape:w-12 landscape:h-16 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-75 border ${
            isGasActive
              ? 'bg-emerald-600 text-white scale-90 border-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.6)]'
              : 'bg-neutral-950/70 text-emerald-400 border-white/10 backdrop-blur-md active:scale-95'
          }`}
          aria-label="Acelerador"
        >
          <div className="w-4 h-1 bg-emerald-400/80 rounded-full mb-0.5" />
          <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider">Gas</span>
          <div className="w-5 h-0.5 bg-emerald-400/40 rounded-full mt-0.5" />
        </button>
      </div>
    </div>
  );
});
