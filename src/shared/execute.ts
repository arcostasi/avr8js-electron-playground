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
  AVRClock,
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

// ATmega328p params
const FLASH = 0x8000;

export class AVRRunner {
  readonly program = new Uint16Array(FLASH);
  readonly cpu: CPU;
  readonly clock: AVRClock;
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
  readonly frequency = 16e6; // 16 MHZ
  readonly workUnitCycles = 100000;
  readonly timerSyncFix = 10; // ms
  readonly taskScheduler = new MicroTaskScheduler();

  // Serial buffer
  private serialBuffer: any = [];

  // Timers
  private timerSync: number = 0;
  private timerClock: number = 0;
  private lastTimerClock: number = 0;
  private lastTimerSync: number = 0;
  private cyclesToRun: number = 0;
  private workSyncCycles: number = 0.1;

  private samples = new Float32Array(64);
  private sampleIndex = 0;
  private avg = 0

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

    this.clock = new AVRClock(this.cpu, this.frequency);

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

    if ((performance.now() - this.timerSync) > this.timerSyncFix) {
      this.timerSync = performance.now();
      this.timerClock = this.clock.timeMillis - this.lastTimerClock;

      if (this.timerClock > this.timerSyncFix) {
        // High speed correction
        this.workSyncCycles *= this.timerSyncFix / this.timerClock;
      } else {
        this.workSyncCycles += 0.0001;
      }

      if (!this.sampleIndex) {
        this.samples.fill(this.workSyncCycles);
      }

      this.samples[this.sampleIndex++ % this.samples.length] = this.workSyncCycles;
      this.avg = this.samples.reduce((x, y) => x + y) / this.samples.length;

      if (this.sampleIndex >= this.samples.length) {
        this.sampleIndex = 0;
        this.workSyncCycles = this.avg;
      }

      this.lastTimerClock = this.clock.timeMillis;
    }

    this.cyclesToRun = this.cpu.cycles + this.workUnitCycles * this.workSyncCycles;

    while (this.cpu.cycles < this.cyclesToRun) {
      // Instruction timing is currently based on ATmega328p
      avrInstruction(this.cpu);

      this.cpu.tick();

      // Serial complete interrupt
      if (this.cpu.interruptsEnabled) {
        this.rxCompleteInterrupt();
      }
    }

    callback(this.cpu);

    this.taskScheduler.postTask(() => this.execute(callback));
  }

  stop() {
    this.taskScheduler.stop();
  }

  analogPort() {
    // Simulate analog port (so that analogRead() eventually return)
    this.cpu.writeHooks[0x7a] = value => {
      if (value & (1 << 6)) {
        // random value
        const analogValue = Math.floor(Math.random() * 1024);

        this.cpu.data[0x7a] = value & ~(1 << 6); // Clear bit - conversion done
        this.cpu.data[0x78] = analogValue & 0xff;
        this.cpu.data[0x79] = (analogValue >> 8) & 0x3;

        return true; // Don't update
      }
    };
  }
}
