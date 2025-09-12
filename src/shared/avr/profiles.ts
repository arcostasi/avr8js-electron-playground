import {
  portAConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  portEConfig,
  portFConfig,
  portGConfig,
  portHConfig,
  portJConfig,
  portKConfig,
  portLConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
  spiConfig,
  twiConfig,
  type AVRPortConfig,
  type AVRTimerConfig,
  type SPIConfig,
  type TWIConfig,
} from 'avr8js';

type USARTConfig = typeof usart0Config;

const usart1Config: USARTConfig = {
  rxCompleteInterrupt: 0x48,
  dataRegisterEmptyInterrupt: 0x4a,
  txCompleteInterrupt: 0x4c,
  UCSRA: 0xc8,
  UCSRB: 0xc9,
  UCSRC: 0xca,
  UBRRL: 0xcc,
  UBRRH: 0xcd,
  UDR: 0xce,
};

const usart2Config: USARTConfig = {
  rxCompleteInterrupt: 0x66,
  dataRegisterEmptyInterrupt: 0x68,
  txCompleteInterrupt: 0x6a,
  UCSRA: 0xd0,
  UCSRB: 0xd1,
  UCSRC: 0xd2,
  UBRRL: 0xd4,
  UBRRH: 0xd5,
  UDR: 0xd6,
};

const usart3Config: USARTConfig = {
  rxCompleteInterrupt: 0x6c,
  dataRegisterEmptyInterrupt: 0x6e,
  txCompleteInterrupt: 0x70,
  UCSRA: 0x130,
  UCSRB: 0x131,
  UCSRC: 0x132,
  UBRRL: 0x134,
  UBRRH: 0x135,
  UDR: 0x136,
};

const timer3Config: AVRTimerConfig = {
  ...timer1Config,
  captureInterrupt: 0x3e,
  compAInterrupt: 0x40,
  compBInterrupt: 0x42,
  compCInterrupt: 0x44,
  ovfInterrupt: 0x46,
  TIFR: 0x38,
  OCRA: 0x98,
  OCRB: 0x9a,
  OCRC: 0x9c,
  ICR: 0x96,
  TCNT: 0x94,
  TCCRA: 0x90,
  TCCRB: 0x91,
  TCCRC: 0x92,
  TIMSK: 0x71,
  compPortA: portEConfig.PORT,
  compPinA: 3,
  compPortB: portEConfig.PORT,
  compPinB: 4,
  compPortC: portEConfig.PORT,
  compPinC: 5,
  externalClockPort: portEConfig.PORT,
  externalClockPin: 6,
};

const timer4Config: AVRTimerConfig = {
  ...timer1Config,
  captureInterrupt: 0x52,
  compAInterrupt: 0x54,
  compBInterrupt: 0x56,
  compCInterrupt: 0x58,
  ovfInterrupt: 0x5a,
  TIFR: 0x39,
  OCRA: 0xa8,
  OCRB: 0xaa,
  OCRC: 0xac,
  ICR: 0xa6,
  TCNT: 0xa4,
  TCCRA: 0xa0,
  TCCRB: 0xa1,
  TCCRC: 0xa2,
  TIMSK: 0x72,
  compPortA: portHConfig.PORT,
  compPinA: 3,
  compPortB: portHConfig.PORT,
  compPinB: 4,
  compPortC: portHConfig.PORT,
  compPinC: 5,
  externalClockPort: portHConfig.PORT,
  externalClockPin: 7,
};

const timer5Config: AVRTimerConfig = {
  ...timer1Config,
  captureInterrupt: 0x5c,
  compAInterrupt: 0x5e,
  compBInterrupt: 0x60,
  compCInterrupt: 0x62,
  ovfInterrupt: 0x64,
  TIFR: 0x3a,
  OCRA: 0x128,
  OCRB: 0x12a,
  OCRC: 0x12c,
  ICR: 0x126,
  TCNT: 0x124,
  TCCRA: 0x120,
  TCCRB: 0x121,
  TCCRC: 0x122,
  TIMSK: 0x73,
  compPortA: portLConfig.PORT,
  compPinA: 3,
  compPortB: portLConfig.PORT,
  compPinB: 4,
  compPortC: portLConfig.PORT,
  compPinC: 5,
  externalClockPort: portLConfig.PORT,
  externalClockPin: 2,
};

export interface McuCpuProfile {
  flashWords: number;
  frequencyHz: number;
  sramBytes?: number;
  largeHexThreshold?: number;
  largeHexSramBytes?: number;
}

export interface McuAdcChannelSelectBitsProfile {
  register: number;
  mask: number;
  shift: number;
  bitOffset: number;
}

export interface McuPortProfile {
  id: string;
  label: string;
  config: AVRPortConfig;
}

export interface McuTimerProfile {
  id: string;
  config: AVRTimerConfig;
}

export interface McuUsartProfile {
  id: string;
  config: USARTConfig;
}

export interface McuSpiProfile {
  id: string;
  config: SPIConfig;
}

export interface McuTwiProfile {
  id: string;
  config: TWIConfig;
}

export interface McuAdcProfile {
  channelCount: number;
  admuxRegister: number;
  adcsraRegister: number;
  adclRegister: number;
  adchRegister: number;
  conversionStartBit: number;
  channelMask: number;
  channelSelectBits?: McuAdcChannelSelectBitsProfile[];
}

export interface McuSimulationSupportProfile {
  status: 'stable' | 'partial';
  summary?: string;
  limitations?: string[];
}

export interface McuProfile {
  id: string;
  name: string;
  cpu: McuCpuProfile;
  ports: Record<string, McuPortProfile>;
  timers: Record<string, McuTimerProfile>;
  usarts: Record<string, McuUsartProfile>;
  spis: Record<string, McuSpiProfile>;
  twis: Record<string, McuTwiProfile>;
  adc?: McuAdcProfile;
  simulationSupport?: McuSimulationSupportProfile;
  defaults: {
    timer0?: string;
    timer1?: string;
    timer2?: string;
    usart: string;
    spi: string;
    twi: string;
  };
}

export interface BoardPinProfile {
  name: string;
  portId?: string;
  bit?: number;
  adcChannel?: number;
  aliases?: string[];
  i2c?: 'SDA' | 'SCL';
  spi?: 'MOSI' | 'MISO' | 'SCK' | 'SS';
  uart?: {
    usartId: string;
    role: 'RX' | 'TX';
  };
  pwm?: {
    timerId: string;
    channel: 'A' | 'B' | 'C';
  };
}

export interface BoardProfile {
  id: string;
  name: string;
  wokwiType: string;
  buildBoard: string;
  mcu: McuProfile;
  pins: BoardPinProfile[];
}

function createDigitalBoardPin(
  pin: number,
  portId: string,
  bit: number,
  options: Pick<BoardPinProfile, 'i2c' | 'spi' | 'uart' | 'pwm'> = {},
): BoardPinProfile {
  return {
    name: String(pin),
    portId,
    bit,
    aliases: [`D${pin}`],
    ...options,
  };
}

function createAnalogBoardPin(analogIndex: number, digitalPin: number, portId: string, bit: number, adcChannel: number): BoardPinProfile {
  return {
    name: `A${analogIndex}`,
    portId,
    bit,
    adcChannel,
    aliases: [String(digitalPin), `D${digitalPin}`],
  };
}

export const atmega328PProfile: McuProfile = {
  id: 'atmega328p',
  name: 'ATmega328P',
  cpu: {
    flashWords: 0x8000,
    frequencyHz: 16e6,
    largeHexThreshold: 2048,
    // Preserved from the legacy runner behavior until SRAM sizing is modeled explicitly.
    largeHexSramBytes: 0x8000,
  },
  ports: {
    B: { id: 'B', label: 'PORTB', config: portBConfig },
    C: { id: 'C', label: 'PORTC', config: portCConfig },
    D: { id: 'D', label: 'PORTD', config: portDConfig },
  },
  timers: {
    timer0: { id: 'timer0', config: timer0Config },
    timer1: { id: 'timer1', config: timer1Config },
    timer2: { id: 'timer2', config: timer2Config },
  },
  usarts: {
    usart0: { id: 'usart0', config: usart0Config },
  },
  spis: {
    spi0: { id: 'spi0', config: spiConfig },
  },
  twis: {
    twi0: { id: 'twi0', config: twiConfig },
  },
  adc: {
    channelCount: 8,
    adcsraRegister: 0x7a,
    admuxRegister: 0x7c,
    adclRegister: 0x78,
    adchRegister: 0x79,
    conversionStartBit: 6,
    channelMask: 0x0f,
  },
  simulationSupport: {
    status: 'stable',
  },
  defaults: {
    timer0: 'timer0',
    timer1: 'timer1',
    timer2: 'timer2',
    usart: 'usart0',
    spi: 'spi0',
    twi: 'twi0',
  },
};

export const atmega2560Profile: McuProfile = {
  id: 'atmega2560',
  name: 'ATmega2560',
  cpu: {
    flashWords: 0x20000,
    frequencyHz: 16e6,
    sramBytes: 0x2000,
  },
  ports: {
    A: { id: 'A', label: 'PORTA', config: portAConfig },
    B: { id: 'B', label: 'PORTB', config: portBConfig },
    C: { id: 'C', label: 'PORTC', config: portCConfig },
    D: { id: 'D', label: 'PORTD', config: portDConfig },
    E: { id: 'E', label: 'PORTE', config: portEConfig },
    F: { id: 'F', label: 'PORTF', config: portFConfig },
    G: { id: 'G', label: 'PORTG', config: portGConfig },
    H: { id: 'H', label: 'PORTH', config: portHConfig },
    J: { id: 'J', label: 'PORTJ', config: portJConfig },
    K: { id: 'K', label: 'PORTK', config: portKConfig },
    L: { id: 'L', label: 'PORTL', config: portLConfig },
  },
  timers: {
    timer0: { id: 'timer0', config: timer0Config },
    timer1: { id: 'timer1', config: timer1Config },
    timer2: { id: 'timer2', config: timer2Config },
    timer3: { id: 'timer3', config: timer3Config },
    timer4: { id: 'timer4', config: timer4Config },
    timer5: { id: 'timer5', config: timer5Config },
  },
  usarts: {
    usart0: { id: 'usart0', config: usart0Config },
    usart1: { id: 'usart1', config: usart1Config },
    usart2: { id: 'usart2', config: usart2Config },
    usart3: { id: 'usart3', config: usart3Config },
  },
  spis: {
    spi0: { id: 'spi0', config: spiConfig },
  },
  twis: {
    twi0: { id: 'twi0', config: twiConfig },
  },
  adc: {
    channelCount: 16,
    adcsraRegister: 0x7a,
    admuxRegister: 0x7c,
    adclRegister: 0x78,
    adchRegister: 0x79,
    conversionStartBit: 6,
    channelMask: 0x1f,
    channelSelectBits: [
      { register: 0x7b, mask: 0x08, shift: 3, bitOffset: 3 },
    ],
  },
  simulationSupport: {
    status: 'partial',
    summary: 'Mega 2560 support currently covers board pinout, GPIO, SRAM sizing, ADC channels, USART0-3, and timers 0-5 in the core.',
    limitations: [
      'Mega support is still partial while broader board-level validation beyond GPIO, ADC, serial, and timer core paths is still in progress.',
      'Timer3-5 external clock paths are wired in the core, but AVR input-capture behavior is not modeled yet.',
    ],
  },
  defaults: {
    timer0: 'timer0',
    timer1: 'timer1',
    timer2: 'timer2',
    usart: 'usart0',
    spi: 'spi0',
    twi: 'twi0',
  },
};

export const arduinoUnoBoardProfile: BoardProfile = {
  id: 'arduino-uno',
  name: 'Arduino Uno',
  wokwiType: 'wokwi-arduino-uno',
  buildBoard: 'uno',
  mcu: atmega328PProfile,
  pins: [
    { name: '0', portId: 'D', bit: 0, aliases: ['D0'], uart: { usartId: 'usart0', role: 'RX' } },
    { name: '1', portId: 'D', bit: 1, aliases: ['D1'], uart: { usartId: 'usart0', role: 'TX' } },
    { name: '2', portId: 'D', bit: 2, aliases: ['D2'] },
    { name: '3', portId: 'D', bit: 3, aliases: ['D3'], pwm: { timerId: 'timer2', channel: 'B' } },
    { name: '4', portId: 'D', bit: 4, aliases: ['D4'] },
    { name: '5', portId: 'D', bit: 5, aliases: ['D5'], pwm: { timerId: 'timer0', channel: 'B' } },
    { name: '6', portId: 'D', bit: 6, aliases: ['D6'], pwm: { timerId: 'timer0', channel: 'A' } },
    { name: '7', portId: 'D', bit: 7, aliases: ['D7'] },
    { name: '8', portId: 'B', bit: 0, aliases: ['D8'] },
    { name: '9', portId: 'B', bit: 1, aliases: ['D9'], pwm: { timerId: 'timer1', channel: 'A' } },
    { name: '10', portId: 'B', bit: 2, aliases: ['D10'], spi: 'SS', pwm: { timerId: 'timer1', channel: 'B' } },
    { name: '11', portId: 'B', bit: 3, aliases: ['D11'], spi: 'MOSI', pwm: { timerId: 'timer2', channel: 'A' } },
    { name: '12', portId: 'B', bit: 4, aliases: ['D12'], spi: 'MISO' },
    { name: '13', portId: 'B', bit: 5, aliases: ['D13'], spi: 'SCK' },
    { name: 'A0', portId: 'C', bit: 0, adcChannel: 0 },
    { name: 'A1', portId: 'C', bit: 1, adcChannel: 1 },
    { name: 'A2', portId: 'C', bit: 2, adcChannel: 2 },
    { name: 'A3', portId: 'C', bit: 3, adcChannel: 3 },
    { name: 'A4', portId: 'C', bit: 4, adcChannel: 4, i2c: 'SDA' },
    { name: 'A5', portId: 'C', bit: 5, adcChannel: 5, i2c: 'SCL' },
  ],
};

export const arduinoNanoBoardProfile: BoardProfile = {
  id: 'arduino-nano',
  name: 'Arduino Nano',
  wokwiType: 'wokwi-arduino-nano',
  buildBoard: 'nano',
  mcu: atmega328PProfile,
  pins: [
    ...arduinoUnoBoardProfile.pins,
    { name: 'A6', adcChannel: 6 },
    { name: 'A7', adcChannel: 7 },
  ],
};

export const arduinoMegaBoardProfile: BoardProfile = {
  id: 'arduino-mega',
  name: 'Arduino Mega 2560',
  wokwiType: 'wokwi-arduino-mega',
  buildBoard: 'mega',
  mcu: atmega2560Profile,
  pins: [
    createDigitalBoardPin(0, 'E', 0, { uart: { usartId: 'usart0', role: 'RX' } }),
    createDigitalBoardPin(1, 'E', 1, { uart: { usartId: 'usart0', role: 'TX' } }),
    createDigitalBoardPin(2, 'E', 4, { pwm: { timerId: 'timer3', channel: 'B' } }),
    createDigitalBoardPin(3, 'E', 5, { pwm: { timerId: 'timer3', channel: 'C' } }),
    createDigitalBoardPin(4, 'G', 5, { pwm: { timerId: 'timer0', channel: 'B' } }),
    createDigitalBoardPin(5, 'E', 3, { pwm: { timerId: 'timer3', channel: 'A' } }),
    createDigitalBoardPin(6, 'H', 3, { pwm: { timerId: 'timer4', channel: 'A' } }),
    createDigitalBoardPin(7, 'H', 4, { pwm: { timerId: 'timer4', channel: 'B' } }),
    createDigitalBoardPin(8, 'H', 5, { pwm: { timerId: 'timer4', channel: 'C' } }),
    createDigitalBoardPin(9, 'H', 6, { pwm: { timerId: 'timer2', channel: 'B' } }),
    createDigitalBoardPin(10, 'B', 4, { pwm: { timerId: 'timer2', channel: 'A' } }),
    createDigitalBoardPin(11, 'B', 5, { pwm: { timerId: 'timer1', channel: 'A' } }),
    createDigitalBoardPin(12, 'B', 6, { pwm: { timerId: 'timer1', channel: 'B' } }),
    createDigitalBoardPin(13, 'B', 7, { pwm: { timerId: 'timer0', channel: 'A' } }),
    createDigitalBoardPin(14, 'J', 1, { uart: { usartId: 'usart3', role: 'TX' } }),
    createDigitalBoardPin(15, 'J', 0, { uart: { usartId: 'usart3', role: 'RX' } }),
    createDigitalBoardPin(16, 'H', 1, { uart: { usartId: 'usart2', role: 'TX' } }),
    createDigitalBoardPin(17, 'H', 0, { uart: { usartId: 'usart2', role: 'RX' } }),
    createDigitalBoardPin(18, 'D', 3, { uart: { usartId: 'usart1', role: 'TX' } }),
    createDigitalBoardPin(19, 'D', 2, { uart: { usartId: 'usart1', role: 'RX' } }),
    createDigitalBoardPin(20, 'D', 1, { i2c: 'SDA' }),
    createDigitalBoardPin(21, 'D', 0, { i2c: 'SCL' }),
    createDigitalBoardPin(22, 'A', 0),
    createDigitalBoardPin(23, 'A', 1),
    createDigitalBoardPin(24, 'A', 2),
    createDigitalBoardPin(25, 'A', 3),
    createDigitalBoardPin(26, 'A', 4),
    createDigitalBoardPin(27, 'A', 5),
    createDigitalBoardPin(28, 'A', 6),
    createDigitalBoardPin(29, 'A', 7),
    createDigitalBoardPin(30, 'C', 7),
    createDigitalBoardPin(31, 'C', 6),
    createDigitalBoardPin(32, 'C', 5),
    createDigitalBoardPin(33, 'C', 4),
    createDigitalBoardPin(34, 'C', 3),
    createDigitalBoardPin(35, 'C', 2),
    createDigitalBoardPin(36, 'C', 1),
    createDigitalBoardPin(37, 'C', 0),
    createDigitalBoardPin(38, 'D', 7),
    createDigitalBoardPin(39, 'G', 2),
    createDigitalBoardPin(40, 'G', 1),
    createDigitalBoardPin(41, 'G', 0),
    createDigitalBoardPin(42, 'L', 7),
    createDigitalBoardPin(43, 'L', 6),
    createDigitalBoardPin(44, 'L', 5, { pwm: { timerId: 'timer5', channel: 'C' } }),
    createDigitalBoardPin(45, 'L', 4, { pwm: { timerId: 'timer5', channel: 'B' } }),
    createDigitalBoardPin(46, 'L', 3, { pwm: { timerId: 'timer5', channel: 'A' } }),
    createDigitalBoardPin(47, 'L', 2),
    createDigitalBoardPin(48, 'L', 1),
    createDigitalBoardPin(49, 'L', 0),
    createDigitalBoardPin(50, 'B', 3, { spi: 'MISO' }),
    createDigitalBoardPin(51, 'B', 2, { spi: 'MOSI' }),
    createDigitalBoardPin(52, 'B', 1, { spi: 'SCK' }),
    createDigitalBoardPin(53, 'B', 0, { spi: 'SS' }),
    createAnalogBoardPin(0, 54, 'F', 0, 0),
    createAnalogBoardPin(1, 55, 'F', 1, 1),
    createAnalogBoardPin(2, 56, 'F', 2, 2),
    createAnalogBoardPin(3, 57, 'F', 3, 3),
    createAnalogBoardPin(4, 58, 'F', 4, 4),
    createAnalogBoardPin(5, 59, 'F', 5, 5),
    createAnalogBoardPin(6, 60, 'F', 6, 6),
    createAnalogBoardPin(7, 61, 'F', 7, 7),
    createAnalogBoardPin(8, 62, 'K', 0, 8),
    createAnalogBoardPin(9, 63, 'K', 1, 9),
    createAnalogBoardPin(10, 64, 'K', 2, 10),
    createAnalogBoardPin(11, 65, 'K', 3, 11),
    createAnalogBoardPin(12, 66, 'K', 4, 12),
    createAnalogBoardPin(13, 67, 'K', 5, 13),
    createAnalogBoardPin(14, 68, 'K', 6, 14),
    createAnalogBoardPin(15, 69, 'K', 7, 15),
  ],
};

export const mcuProfiles = [atmega328PProfile, atmega2560Profile] as const;
export const boardProfiles = [arduinoUnoBoardProfile, arduinoNanoBoardProfile, arduinoMegaBoardProfile] as const;
export const defaultBoardProfile: BoardProfile = arduinoUnoBoardProfile;

export function getBoardProfileById(id: string): BoardProfile | null {
  return boardProfiles.find((profile) => profile.id === id) ?? null;
}

export function getBoardProfileByWokwiType(wokwiType: string): BoardProfile | null {
  return boardProfiles.find((profile) => profile.wokwiType === wokwiType) ?? null;
}

export function getBoardProfileByBuildBoard(buildBoard: string): BoardProfile | null {
  return boardProfiles.find((profile) => profile.buildBoard === buildBoard) ?? null;
}

export function resolveBoardProfileFromParts(parts: ReadonlyArray<{ type: string }>): BoardProfile {
  const boardPart = parts.find((part) => part.type.startsWith('wokwi-arduino-'));
  if (!boardPart) {
    return defaultBoardProfile;
  }
  return getBoardProfileByWokwiType(boardPart.type) ?? defaultBoardProfile;
}

function normalizePinName(pinName: string): string {
  return pinName.trim().toUpperCase();
}

export function resolveBoardPin(boardProfile: BoardProfile, pinName: string): BoardPinProfile | null {
  const normalized = normalizePinName(pinName);
  return boardProfile.pins.find((pin) => {
    if (normalizePinName(pin.name) === normalized) {
      return true;
    }
    return (pin.aliases ?? []).some((alias) => normalizePinName(alias) === normalized);
  }) ?? null;
}

export function getBoardSimulationWarning(boardProfile: BoardProfile): string | null {
  const support = boardProfile.mcu.simulationSupport;
  if (support?.status !== 'partial') {
    return null;
  }

  const details = support.limitations?.length
    ? ` Limitations: ${support.limitations.join(' ')}`
    : '';
  const summary = support.summary ?? `${boardProfile.name} support is partial.`;

  return `${summary}${details}`;
}