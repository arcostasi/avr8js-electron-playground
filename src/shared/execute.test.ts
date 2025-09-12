import { PinState } from 'avr8js';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { arduinoMegaBoardProfile, atmega2560Profile, resolveBoardPin } from './avr/profiles';
import { AVRRunner } from './execute';

const EMPTY_HEX = ':00000001FF\n';

type TimerId = 'timer3' | 'timer4' | 'timer5';
type CompareChannel = 'A' | 'B' | 'C';

function getTimerCompareConfig(timerId: TimerId, channel: CompareChannel) {
  const timerConfig = atmega2560Profile.timers[timerId].config;

  switch (channel) {
    case 'A':
      return {
        timerConfig,
        compareBitOffset: 6,
        compareRegister: timerConfig.OCRA,
        comparePort: timerConfig.compPortA,
        comparePin: timerConfig.compPinA,
      };
    case 'B':
      return {
        timerConfig,
        compareBitOffset: 4,
        compareRegister: timerConfig.OCRB,
        comparePort: timerConfig.compPortB,
        comparePin: timerConfig.compPinB,
      };
    case 'C':
      return {
        timerConfig,
        compareBitOffset: 2,
        compareRegister: timerConfig.OCRC,
        comparePort: timerConfig.compPortC,
        comparePin: timerConfig.compPinC,
      };
  }
}

function setupMegaForceCompareOutput(runner: AVRRunner, timerId: TimerId, channel: CompareChannel): void {
  const { timerConfig, compareBitOffset, comparePort, comparePin } = getTimerCompareConfig(timerId, channel);
  const compareGpioPort = runner.cpu.gpioByPort[comparePort];

  if (!compareGpioPort) {
    throw new Error(`Missing GPIO port for ${timerId}${channel}`);
  }

  runner.cpu.writeData(compareGpioPort.portConfig.DDR, runner.cpu.data[compareGpioPort.portConfig.DDR] | (1 << comparePin));
  runner.cpu.writeData(timerConfig.TCCRA, 1 << compareBitOffset);
}

function triggerMegaForceCompare(runner: AVRRunner, timerId: TimerId, channel: CompareChannel): void {
  const timerConfig = atmega2560Profile.timers[timerId].config;
  let forceCompareBit = 0x20;

  if (channel === 'A') {
    forceCompareBit = 0x80;
  } else if (channel === 'B') {
    forceCompareBit = 0x40;
  }

  runner.cpu.writeData(timerConfig.TCCRC, forceCompareBit);
}

function advanceCpuTick(runner: AVRRunner): void {
  runner.cpu.cycles += 1;
  runner.cpu.tick();
}

function getPortByRegisterAddress(runner: AVRRunner, portAddress: number) {
  const port = Object.values(runner.ports).find((candidate) => candidate.portConfig.PORT === portAddress);

  if (!port) {
    throw new Error(`Missing GPIO port for register address 0x${portAddress.toString(16)}`);
  }

  return port;
}

beforeAll(() => {
  const fakeWindow = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    postMessage: vi.fn(),
  };

  class FakeAudioContext {
    sampleRate = 48_000;
    destination = {};
  }

  class FakeAudioBuffer {
    readonly length: number;
    private readonly channelData: Float32Array;

    constructor(options: { length: number }) {
      this.length = options.length;
      this.channelData = new Float32Array(options.length);
    }

    getChannelData(): Float32Array {
      return this.channelData;
    }
  }

  class FakeAudioBufferSourceNode {
    readonly context: unknown;
    readonly options: unknown;

    constructor(context: unknown, options: unknown) {
      this.context = context;
      this.options = options;
    }

    connect(): void {
      return undefined;
    }

    start(): void {
      return undefined;
    }
  }

  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioBuffer', FakeAudioBuffer);
  vi.stubGlobal('AudioBufferSourceNode', FakeAudioBufferSourceNode);
});

describe('AVRRunner', () => {
  it('supports extended ADC channel selection for the ATmega2560 profile', () => {
    const runner = new AVRRunner(EMPTY_HEX, atmega2560Profile);

    runner.adcRegistry.setValue(15, 0x2ab);
    runner.cpu.writeData(0x7b, 0x08);
    runner.cpu.writeData(0x7c, 0x07);
    runner.cpu.writeData(0x7a, 1 << 6);

    expect(runner.cpu.data[0x78]).toBe(0xab);
    expect(runner.cpu.data[0x79] & 0x03).toBe(0x02);
  });

  it('instantiates and routes RX buffers for all Mega USARTs', () => {
    const runner = new AVRRunner(EMPTY_HEX, atmega2560Profile);

    expect(Object.keys(runner.usarts)).toEqual(['usart0', 'usart1', 'usart2', 'usart3']);

    runner.serialWriteToUsart('usart1', 'A');
    runner.serialWriteToUsart('usart2', 'B');
    runner.serialWriteToUsart('usart3', 'C');

    expect(runner.cpu.readData(0xce)).toBe('A'.codePointAt(0));
    expect(runner.cpu.readData(0xd6)).toBe('B'.codePointAt(0));
    expect(runner.cpu.readData(0x136)).toBe('C'.codePointAt(0));
  });

  it('instantiates Mega timers 3-5 in the generic timer registry', () => {
    const runner = new AVRRunner(EMPTY_HEX, atmega2560Profile);

    expect(Object.keys(runner.timers)).toEqual(['timer0', 'timer1', 'timer2', 'timer3', 'timer4', 'timer5']);
    expect(runner.timers.timer3).toBeDefined();
    expect(runner.timers.timer4).toBeDefined();
    expect(runner.timers.timer5).toBeDefined();
  });

  it('routes timer3-5 compare outputs to the expected Mega board pins', () => {
    const pwmCases: Array<{ timerId: TimerId; channel: CompareChannel; pinName: string }> = [
      { timerId: 'timer3', channel: 'A', pinName: '5' },
      { timerId: 'timer3', channel: 'B', pinName: '2' },
      { timerId: 'timer3', channel: 'C', pinName: '3' },
      { timerId: 'timer4', channel: 'A', pinName: '6' },
      { timerId: 'timer4', channel: 'B', pinName: '7' },
      { timerId: 'timer4', channel: 'C', pinName: '8' },
      { timerId: 'timer5', channel: 'A', pinName: '46' },
      { timerId: 'timer5', channel: 'B', pinName: '45' },
      { timerId: 'timer5', channel: 'C', pinName: '44' },
    ];

    for (const { timerId, channel, pinName } of pwmCases) {
      const runner = new AVRRunner(EMPTY_HEX, atmega2560Profile);
      const boardPin = resolveBoardPin(arduinoMegaBoardProfile, pinName);

      expect(boardPin, `Missing Mega board pin ${pinName}`).not.toBeNull();
      if (!boardPin?.portId || typeof boardPin.bit !== 'number') {
        throw new Error(`Mega board pin ${pinName} is missing GPIO metadata`);
      }

      const boardPort = runner.ports[boardPin.portId];
  expect(boardPort.pinState(boardPin.bit)).toBe(PinState.Input);

      setupMegaForceCompareOutput(runner, timerId, channel);
      expect(boardPort.pinState(boardPin.bit)).toBe(PinState.Low);

      triggerMegaForceCompare(runner, timerId, channel);
      expect(boardPort.pinState(boardPin.bit), `${timerId}${channel} should toggle Mega pin ${pinName} high on forced compare`).toBe(PinState.High);

      triggerMegaForceCompare(runner, timerId, channel);
      expect(boardPort.pinState(boardPin.bit), `${timerId}${channel} should toggle Mega pin ${pinName} low on the second forced compare`).toBe(PinState.Low);
    }
  });

  it('counts external clock edges on Mega timer3-5', () => {
    const timerCases: TimerId[] = ['timer3', 'timer4', 'timer5'];

    for (const timerId of timerCases) {
      const runner = new AVRRunner(EMPTY_HEX, atmega2560Profile);
      const timerConfig = atmega2560Profile.timers[timerId].config;
      const externalClockPort = getPortByRegisterAddress(runner, timerConfig.externalClockPort);

      expect(runner.timers[timerId].debugTCNT, `${timerId} should start at zero`).toBe(0);

      runner.cpu.writeData(timerConfig.TCCRB, 0x06);
      advanceCpuTick(runner);
      externalClockPort.setPin(timerConfig.externalClockPin, false);
      externalClockPort.setPin(timerConfig.externalClockPin, true);
      expect(runner.timers[timerId].debugTCNT, `${timerId} should ignore the rising edge in falling-edge external clock mode`).toBe(0);

      externalClockPort.setPin(timerConfig.externalClockPin, false);
      expect(runner.timers[timerId].debugTCNT, `${timerId} should count a falling external clock edge`).toBe(1);

      runner.cpu.writeData(timerConfig.TCCRB, 0x07);
      advanceCpuTick(runner);
      externalClockPort.setPin(timerConfig.externalClockPin, false);
      externalClockPort.setPin(timerConfig.externalClockPin, true);
      expect(runner.timers[timerId].debugTCNT, `${timerId} should count a rising external clock edge`).toBe(2);
    }
  });
});