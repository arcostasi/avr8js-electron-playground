/**
 * AVRRunner
 * Part of AVR8js
 *
 * Copyright (C) 2019, Uri Shaked
 */
import {
  avrInstruction,
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
  twiConfig
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
  readonly workUnitCycles = 500000;

  readonly taskScheduler = new MicroTaskScheduler();

  constructor(hex: string) {
    // Load program
    loadHex(hex, new Uint8Array(this.program.buffer));

    this.cpu = new CPU(this.program);
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

    this.taskScheduler.start();
  }

  serialOnLineTransmit() {
    // Serial port to browser console
    this.usart.onLineTransmit = line => {
      console.log("[Serial] %c%s", "color: red", line);
    };
  }

  // Function to send data to the serial port
  serialWrite(value: string) {
    // const { UCSRA, UDR } = usart0Config;
    // const UCSRA_UDRE = 0x20;
    const { UDR } = usart0Config;

    // Wait for transmit data buffer to go empty
    // while (!(this.cpu.readData(UCSRA) & (1 << UCSRA_UDRE)))

    // Writing to UDR transmits the byte
    [...value].forEach(c => this.cpu.writeData(UDR, c.charCodeAt(0)));
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

  // CPU main loop
  execute(callback: (cpu: CPU) => void) {
    const cyclesToRun = this.cpu.cycles + this.workUnitCycles;

    while (this.cpu.cycles < cyclesToRun) {
      // Instruction timing is currently based on ATmega328p
      avrInstruction(this.cpu);
      // Ticks update
      this.timer0.tick();
      this.timer1.tick();
      this.timer2.tick();
      this.eeprom.tick();
      this.usart.tick();
      this.spi.tick();
      this.twi.tick();
    }

    callback(this.cpu);

    this.taskScheduler.postTask(() => this.execute(callback));
  }

  stop() {
    this.taskScheduler.stop();
  }
}
