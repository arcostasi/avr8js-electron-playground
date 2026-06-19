/**
 * AVRRunner
 * Part of AVR8js
 *
 * Copyright (C) 2019, Uri Shaked
 */
import {
  avrInstruction,
  avrInterrupt,
  AVRTimer,
  CPU,
  AVRIOPort,
  AVREEPROM,
  AVRUSART,
  AVRSPI,
  AVRTWI,
} from 'avr8js';

import { Speaker } from "./speaker";
import { loadHex } from './intelhex';
import { MicroTaskScheduler } from './task-scheduler';
import { EEPROMLocalStorageBackend } from './eeprom';
import { CPUPerformance } from '../shared/cpu-performance';
import { ADCRegistry } from './adc-registry';
import { atmega328PProfile, type McuProfile } from './avr/profiles';

export class AVRRunner {
  readonly program: Uint16Array;
  readonly cpu: CPU;
  readonly mcuProfile: McuProfile;
  readonly timer0: AVRTimer;
  readonly timer1: AVRTimer;
  readonly timer2: AVRTimer;
  readonly portB: AVRIOPort;
  readonly portC: AVRIOPort;
  readonly portD: AVRIOPort;
  readonly ports: Record<string, AVRIOPort>;
  readonly timers: Record<string, AVRTimer>;
  readonly eeprom: AVREEPROM;
  readonly usart: AVRUSART;
  readonly usarts: Record<string, AVRUSART>;
  readonly spi: AVRSPI;
  readonly twi: AVRTWI;
  readonly speaker: Speaker;
  readonly adcRegistry: ADCRegistry;
  readonly frequency: number;
  readonly taskScheduler = new MicroTaskScheduler();
  readonly performance: CPUPerformance;

  /** Simulation speed multiplier: 0.1 = 10 % speed, 2.0 = 200 % speed */
  speedMultiplier = 1;
  /** Wall-clock budget per animation frame (ms) to keep the UI responsive under heavy load */
  maxFrameTimeMs = 12;

  private readonly serialBuffers: Record<string, number[]>;
  private readonly usartEntries: Array<{ id: string; UCSRA: number; rxCompleteInterrupt: number }>;
  private pendingRxCount = 0;
  private stopped = false;
  private lastTime = -1;
  private animationFrameId: number | null = null;
  private executeCallback: ((cpu: CPU) => void) | null = null;
  private readonly runNextFrame = () => {
    if (this.executeCallback) {
      this.execute(this.executeCallback);
    }
  };
  private readonly primaryUsartId: string;

  constructor(hex: string, mcuProfile: McuProfile = atmega328PProfile) {
    this.mcuProfile = mcuProfile;
    this.program = new Uint16Array(this.mcuProfile.cpu.flashWords);
    this.frequency = this.mcuProfile.cpu.frequencyHz;
    this.adcRegistry = new ADCRegistry(this.mcuProfile.adc?.channelCount ?? 8);

    // Load program
    loadHex(hex, new Uint8Array(this.program.buffer));

    const extraIoBytes = Math.max(0, (this.mcuProfile.cpu.ioSpaceBytes ?? 0x100) - 0x100);
    const largeHexSramBytes = this.mcuProfile.cpu.largeHexSramBytes;
    const needsLargeHexSram = typeof this.mcuProfile.cpu.largeHexThreshold === 'number'
      && typeof largeHexSramBytes === 'number'
      && hex.length > this.mcuProfile.cpu.largeHexThreshold;

    if (typeof this.mcuProfile.cpu.sramBytes === 'number') {
      this.cpu = new CPU(this.program, this.mcuProfile.cpu.sramBytes + extraIoBytes);
    } else if (needsLargeHexSram && typeof largeHexSramBytes === 'number') {
      this.cpu = new CPU(this.program, largeHexSramBytes + extraIoBytes);
    } else {
      this.cpu = new CPU(this.program);
    }

    this.performance = new CPUPerformance(this.cpu, this.frequency);

    this.timers = Object.fromEntries(
      Object.entries(this.mcuProfile.timers).map(([timerId, timerProfile]) => [
        timerId,
        new AVRTimer(this.cpu, timerProfile.config),
      ]),
    );
    this.timer0 = this.requireTimer(this.mcuProfile.defaults.timer0, 'timer0');
    this.timer1 = this.requireTimer(this.mcuProfile.defaults.timer1, 'timer1');
    this.timer2 = this.requireTimer(this.mcuProfile.defaults.timer2, 'timer2');

    this.ports = Object.fromEntries(
      Object.entries(this.mcuProfile.ports).map(([portId, portProfile]) => [
        portId,
        new AVRIOPort(this.cpu, portProfile.config),
      ]),
    );
    this.portB = this.requirePort('B');
    this.portC = this.requirePort('C');
    this.portD = this.requirePort('D');

    this.primaryUsartId = this.mcuProfile.defaults.usart;
    this.serialBuffers = Object.fromEntries(
      Object.keys(this.mcuProfile.usarts).map((usartId) => [usartId, [] as number[]]),
    );

    this.eeprom = new AVREEPROM(this.cpu, new EEPROMLocalStorageBackend());
    this.usarts = Object.fromEntries(
      Object.entries(this.mcuProfile.usarts).map(([usartId, usartProfile]) => [
        usartId,
        new AVRUSART(this.cpu, usartProfile.config, this.frequency),
      ]),
    );
    this.usartEntries = Object.entries(this.mcuProfile.usarts).map(([id, usartProfile]) => ({
      id,
      UCSRA: usartProfile.config.UCSRA,
      rxCompleteInterrupt: usartProfile.config.rxCompleteInterrupt,
    }));
    this.usart = this.requireUsart(this.primaryUsartId);
    this.spi = new AVRSPI(this.cpu, this.requireSpiConfig(this.mcuProfile.defaults.spi), this.frequency);
    this.twi = new AVRTWI(this.cpu, this.requireTwiConfig(this.mcuProfile.defaults.twi), this.frequency);
    this.speaker = new Speaker(this.cpu, this.frequency);

    for (const [usartId, usartProfile] of Object.entries(this.mcuProfile.usarts)) {
      this.cpu.readHooks[usartProfile.config.UDR] = () => this.shiftSerialBuffer(usartId);
    }

    // Enable ADC with live registry values
    this.analogPort();

    this.taskScheduler.start();
  }

  // Function to send data to the serial port
  serialWrite(value: string) {
    this.serialWriteToUsart(this.primaryUsartId, value);
  }

  serialWriteToUsart(usartId: string, value: string) {
    const serialBuffer = this.serialBuffers[usartId];
    if (!serialBuffer) {
      throw new Error(`MCU profile ${this.mcuProfile.id} is missing serial buffer for USART ${usartId}`);
    }

    // Writing to UDR transmits the byte
    [...value].forEach(c => {
      const codePoint = c.codePointAt(0);
      if (typeof codePoint === 'number') {
        serialBuffer.push(codePoint);
        this.pendingRxCount += 1;
      }
    });
  }

  serialOnLineTransmit() {
    // Serial port to browser console
    this.usart.onLineTransmit = (line) => {
      console.log("[Serial] %c%s", "color: red", line);
    };
  }

  rxCompleteInterrupt() {
    if (this.pendingRxCount === 0) {
      return;
    }

    for (const entry of this.usartEntries) {
      const serialBuffer = this.serialBuffers[entry.id];
      if (!serialBuffer?.length) {
        continue;
      }

      const UCSRA = this.cpu.data[entry.UCSRA];
      if (UCSRA & 0x20) {
        avrInterrupt(this.cpu, entry.rxCompleteInterrupt);
      }
    }
  }

  // CPU main loop
  execute(callback: (cpu: CPU) => void) {
    if (this.stopped) {
      return;
    }

    this.executeCallback = callback;
    const { cpu } = this;
    const now = performance.now();

    if (this.lastTime < 0) {
      this.lastTime = now;
    }

    const deltaMs = now - this.lastTime;
    // Cap at 100ms in case the browser tab was suspended
    const runMs = Math.min(deltaMs, 100);
    const cyclesToRun = Math.floor(runMs * (this.frequency / 1000) * this.speedMultiplier);

    // Only update last time if we actually run cycles
    if (cyclesToRun > 0) {
      this.lastTime = now;
      const deadline = cpu.cycles + cyclesToRun;
      const frameStart = now;
      let batch = 0;

      while (cpu.cycles <= deadline) {
        avrInstruction(cpu);
        cpu.tick();
        if (++batch >= 4096) {
          batch = 0;
          if (performance.now() - frameStart >= this.maxFrameTimeMs) {
            break;
          }
        }
      }

      // Notify the CPU if there's data waiting in the serial RX buffer
      this.rxCompleteInterrupt();
      this.speaker.flush();
    }

    callback(this.cpu);
    if (!this.stopped) {
      this.animationFrameId = requestAnimationFrame(this.runNextFrame);
    }
  }

  stop() {
    this.stopped = true;
    this.executeCallback = null;
    this.pendingRxCount = 0;
    if (this.animationFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.taskScheduler.stop();
    this.speaker.close();
    this.adcRegistry.reset();
  }

  getPortOutputValue(portId: string): number {
    const portProfile = this.mcuProfile.ports[portId];
    if (!portProfile) {
      return 0;
    }
    return this.cpu.data[portProfile.config.PORT];
  }

  analogPort() {
    const adcProfile = this.mcuProfile.adc;
    if (!adcProfile) {
      return;
    }

    // ADC conversion: reads live values from the ADC registry.
    this.cpu.writeHooks[adcProfile.adcsraRegister] = value => {
      if (value & (1 << adcProfile.conversionStartBit)) {
        const admux = this.cpu.data[adcProfile.admuxRegister];
        let channel = admux & adcProfile.channelMask;
        for (const selectBits of (adcProfile.channelSelectBits ?? [])) {
          const highBits = (this.cpu.data[selectBits.register] & selectBits.mask) >> selectBits.shift;
          channel |= highBits << selectBits.bitOffset;
        }
        const analogValue = this.adcRegistry.getChannel(channel);

        this.cpu.data[adcProfile.adcsraRegister] = value & ~(1 << adcProfile.conversionStartBit);
        this.cpu.data[adcProfile.adclRegister] = analogValue & 0xff;
        this.cpu.data[adcProfile.adchRegister] = (analogValue >> 8) & 0x3;

        return true;
      }
    };
  }

  private requirePort(portId: string): AVRIOPort {
    const port = this.ports[portId];
    if (!port) {
      throw new Error(`MCU profile ${this.mcuProfile.id} is missing port ${portId}`);
    }
    return port;
  }

  private requireTimer(timerId: string | undefined, label: string): AVRTimer {
    if (!timerId) {
      throw new Error(`MCU profile ${this.mcuProfile.id} is missing default ${label}`);
    }
    const timer = this.timers[timerId];
    if (!timer) {
      throw new Error(`MCU profile ${this.mcuProfile.id} is missing timer ${timerId}`);
    }
    return timer;
  }

  private requireUsartConfig(usartId: string) {
    const usartProfile = this.mcuProfile.usarts[usartId];
    if (!usartProfile) {
      throw new Error(`MCU profile ${this.mcuProfile.id} is missing USART ${usartId}`);
    }
    return usartProfile.config;
  }

  private requireUsart(usartId: string): AVRUSART {
    const usart = this.usarts[usartId];
    if (!usart) {
      throw new Error(`MCU profile ${this.mcuProfile.id} is missing USART instance ${usartId}`);
    }
    return usart;
  }

  private shiftSerialBuffer(usartId: string): number {
    const buffer = this.serialBuffers[usartId];
    if (!buffer || buffer.length === 0) {
      return 0;
    }
    this.pendingRxCount = Math.max(0, this.pendingRxCount - 1);
    return buffer.shift() || 0;
  }

  private requireSpiConfig(spiId: string) {
    const spiProfile = this.mcuProfile.spis[spiId];
    if (!spiProfile) {
      throw new Error(`MCU profile ${this.mcuProfile.id} is missing SPI ${spiId}`);
    }
    return spiProfile.config;
  }

  private requireTwiConfig(twiId: string) {
    const twiProfile = this.mcuProfile.twis[twiId];
    if (!twiProfile) {
      throw new Error(`MCU profile ${this.mcuProfile.id} is missing TWI ${twiId}`);
    }
    return twiProfile.config;
  }
}
