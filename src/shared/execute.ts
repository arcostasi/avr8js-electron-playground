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
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
  spiConfig,
  twiConfig,
} from 'avr8js';

import { Speaker } from "./speaker";
import { loadHex } from './intelhex';
import { MicroTaskScheduler } from './task-scheduler';
import { EEPROMLocalStorageBackend } from './eeprom';
import { CPUPerformance } from '../shared/cpu-performance';
import { ADCRegistry } from './adc-registry';

// ATmega328p params
const FLASH = 0x8000;

export class AVRRunner {
  readonly program = new Uint16Array(FLASH);
  readonly cpu: CPU;
  readonly timer0: AVRTimer;
  readonly timer1: AVRTimer;
  readonly timer2: AVRTimer;
  readonly portB: AVRIOPort;
  readonly portC: AVRIOPort;
  readonly portD: AVRIOPort;
  readonly eeprom: AVREEPROM;
  readonly usart: AVRUSART;
  readonly spi: AVRSPI;
  readonly twi: AVRTWI;
  readonly speaker: Speaker;
  readonly adcRegistry = new ADCRegistry();
  readonly frequency = 16e6; // 16 MHZ
  readonly taskScheduler = new MicroTaskScheduler();
  readonly performance: CPUPerformance;

  /** Simulation speed multiplier: 0.1 = 10 % speed, 2.0 = 200 % speed */
  speedMultiplier = 1.0;

  private serialBuffer: number[] = [];
  private stopped = false;
  private lastTime = 0;

  constructor(hex: string) {
    // Load program
    loadHex(hex, new Uint8Array(this.program.buffer));

    // Check hex size
    if (hex.length > 2048) {
      // Fake RAM Size
      this.cpu = new CPU(this.program, FLASH);
    } else {
      // Arduino UNO (ATmega328)
      this.cpu = new CPU(this.program);
    }

    this.performance = new CPUPerformance(this.cpu, this.frequency);

    this.timer0 = new AVRTimer(this.cpu, timer0Config);
    this.timer1 = new AVRTimer(this.cpu, timer1Config);
    this.timer2 = new AVRTimer(this.cpu, timer2Config);

    this.portB = new AVRIOPort(this.cpu, portBConfig);
    this.portC = new AVRIOPort(this.cpu, portCConfig);
    this.portD = new AVRIOPort(this.cpu, portDConfig);

    this.eeprom = new AVREEPROM(this.cpu, new EEPROMLocalStorageBackend());
    this.usart = new AVRUSART(this.cpu, usart0Config, this.frequency);
    this.spi = new AVRSPI(this.cpu, spiConfig, this.frequency);
    this.twi = new AVRTWI(this.cpu, twiConfig, this.frequency);
    this.speaker = new Speaker(this.cpu, this.frequency);

    // this.serialOnLineTransmit();
    this.cpu.readHooks[usart0Config.UDR] = () => this.serialBuffer.shift() || 0;

    // Enable ADC with live registry values
    this.analogPort();

    this.taskScheduler.start();
  }

  // Function to send data to the serial port
  serialWrite(value: string) {
    // Writing to UDR transmits the byte
    [...value].forEach(c => {
      // Write a character
      this.serialBuffer.push(c.charCodeAt(0));
    });
  }

  serialOnLineTransmit() {
    // Serial port to browser console
    this.usart.onLineTransmit = (line) => {
      console.log("[Serial] %c%s", "color: red", line);
    };
  }

  rxCompleteInterrupt() {
    const UCSRA = this.cpu.data[usart0Config.UCSRA];

    if ((UCSRA & 0x20) && (this.serialBuffer.length > 0)) {
      avrInterrupt(this.cpu, usart0Config.rxCompleteInterrupt);
    }
  }

  // CPU main loop
  execute(callback: (cpu: CPU) => void) {
    if (this.stopped) {
      return;
    }

    const { cpu } = this;
    const now = performance.now();

    if (this.lastTime === 0) {
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

      while (cpu.cycles <= deadline) {
        avrInstruction(cpu);
        cpu.tick();
      }

      // Notify the CPU if there's data waiting in the serial RX buffer
      this.rxCompleteInterrupt();
    }

    callback(this.cpu);
    requestAnimationFrame(() => this.execute(callback));
  }

  stop() {
    this.stopped = true;
  }

  analogPort() {
    // ADC conversion: reads live values from the ADC registry.
    // When ADSC (bit 6) is set in ADCSRA (0x7A), we read the selected
    // channel from ADMUX (0x7C) and return the registry value.
    this.cpu.writeHooks[0x7a] = value => {
      if (value & (1 << 6)) {
        // Read the selected ADC channel from ADMUX bits 3:0
        const admux = this.cpu.data[0x7c];
        const channel = admux & 0x0f;
        const analogValue = this.adcRegistry.getChannel(channel);

        this.cpu.data[0x7a] = value & ~(1 << 6); // Clear ADSC - conversion done
        this.cpu.data[0x78] = analogValue & 0xff;          // ADCL
        this.cpu.data[0x79] = (analogValue >> 8) & 0x3;    // ADCH

        return true; // Don't update register
      }
    };
  }
}
