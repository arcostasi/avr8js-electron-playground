import { describe, expect, it } from 'vitest';

import {
  arduinoMegaBoardProfile,
  arduinoNanoBoardProfile,
  arduinoUnoBoardProfile,
  atmega2560Profile,
  atmega328PProfile,
  getBoardSimulationWarning,
  getBoardProfileByBuildBoard,
  getBoardProfileByWokwiType,
  resolveBoardProfileFromParts,
  resolveBoardPin,
} from './profiles';

describe('avr profiles', () => {
  it('defines the default ATmega328P profile used by the runner', () => {
    expect(atmega328PProfile.id).toBe('atmega328p');
    expect(atmega328PProfile.cpu.flashWords).toBe(0x8000);
    expect(atmega328PProfile.defaults.usart).toBe('usart0');
    expect(Object.keys(atmega328PProfile.ports)).toEqual(['B', 'C', 'D']);
  });

  it('defines an ATmega2560 profile with extended GPIO ports and ADC channels', () => {
    expect(atmega2560Profile.id).toBe('atmega2560');
    expect(atmega2560Profile.cpu.sramBytes).toBe(0x2000);
    expect(Object.keys(atmega2560Profile.ports)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L']);
    expect(Object.keys(atmega2560Profile.timers)).toEqual(['timer0', 'timer1', 'timer2', 'timer3', 'timer4', 'timer5']);
    expect(Object.keys(atmega2560Profile.usarts)).toEqual(['usart0', 'usart1', 'usart2', 'usart3']);
    expect(atmega2560Profile.adc?.channelCount).toBe(16);
    expect(atmega2560Profile.simulationSupport?.status).toBe('partial');
  });

  it('resolves Arduino Uno pins through the board profile', () => {
    expect(resolveBoardPin(arduinoUnoBoardProfile, '13')).toMatchObject({ portId: 'B', bit: 5 });
    expect(resolveBoardPin(arduinoUnoBoardProfile, 'D3')).toMatchObject({ pwm: { timerId: 'timer2', channel: 'B' } });
    expect(resolveBoardPin(arduinoUnoBoardProfile, 'D10')).toMatchObject({ pwm: { timerId: 'timer1', channel: 'B' } });
    expect(resolveBoardPin(arduinoUnoBoardProfile, 'D1')).toMatchObject({ uart: { usartId: 'usart0', role: 'TX' } });
    expect(resolveBoardPin(arduinoUnoBoardProfile, 'D0')).toMatchObject({ portId: 'D', bit: 0 });
    expect(resolveBoardPin(arduinoUnoBoardProfile, 'A4')).toMatchObject({ i2c: 'SDA' });
    expect(resolveBoardPin(arduinoUnoBoardProfile, 'A5')).toMatchObject({ portId: 'C', bit: 5, adcChannel: 5, i2c: 'SCL' });
    expect(resolveBoardPin(arduinoUnoBoardProfile, 'D11')).toMatchObject({ spi: 'MOSI' });
    expect(resolveBoardPin(arduinoUnoBoardProfile, 'VIN')).toBeNull();
  });

  it('registers Arduino Nano with analog-only A6/A7 pins', () => {
    expect(getBoardProfileByWokwiType('wokwi-arduino-nano')?.id).toBe('arduino-nano');
    expect(getBoardProfileByBuildBoard('nano')?.wokwiType).toBe('wokwi-arduino-nano');
    expect(resolveBoardPin(arduinoNanoBoardProfile, 'A6')).toMatchObject({ adcChannel: 6 });
    expect(resolveBoardPin(arduinoNanoBoardProfile, 'A7')).toMatchObject({ adcChannel: 7 });
    expect(resolveBoardPin(arduinoNanoBoardProfile, 'A6')?.portId).toBeUndefined();
  });

  it('registers Arduino Mega with extended pin mappings', () => {
    expect(getBoardProfileByWokwiType('wokwi-arduino-mega')?.id).toBe('arduino-mega');
    expect(getBoardProfileByBuildBoard('mega')?.wokwiType).toBe('wokwi-arduino-mega');
    expect(resolveBoardPin(arduinoMegaBoardProfile, '53')).toMatchObject({ portId: 'B', bit: 0 });
    expect(resolveBoardPin(arduinoMegaBoardProfile, '2')).toMatchObject({ pwm: { timerId: 'timer3', channel: 'B' } });
    expect(resolveBoardPin(arduinoMegaBoardProfile, '8')).toMatchObject({ pwm: { timerId: 'timer4', channel: 'C' } });
    expect(resolveBoardPin(arduinoMegaBoardProfile, '20')).toMatchObject({ i2c: 'SDA' });
    expect(resolveBoardPin(arduinoMegaBoardProfile, '51')).toMatchObject({ spi: 'MOSI' });
    expect(resolveBoardPin(arduinoMegaBoardProfile, '14')).toMatchObject({ uart: { usartId: 'usart3', role: 'TX' } });
    expect(resolveBoardPin(arduinoMegaBoardProfile, '46')).toMatchObject({ pwm: { timerId: 'timer5', channel: 'A' } });
    expect(resolveBoardPin(arduinoMegaBoardProfile, 'A15')).toMatchObject({ portId: 'K', bit: 7, adcChannel: 15 });
    expect(resolveBoardPin(arduinoMegaBoardProfile, '69')).toMatchObject({ portId: 'K', bit: 7, adcChannel: 15 });
  });

  it('resolves the active board profile from diagram parts with a safe default', () => {
    expect(resolveBoardProfileFromParts([{ type: 'wokwi-arduino-nano' }]).id).toBe('arduino-nano');
    expect(resolveBoardProfileFromParts([{ type: 'wokwi-led' }]).id).toBe('arduino-uno');
  });

  it('describes partial simulation support for boards that still have runtime gaps', () => {
    expect(getBoardSimulationWarning(arduinoUnoBoardProfile)).toBeNull();

    expect(getBoardSimulationWarning(arduinoMegaBoardProfile)).toContain('timers 0-5 in the core');
    expect(getBoardSimulationWarning(arduinoMegaBoardProfile)).toContain('input-capture behavior is not modeled yet');
  });
});