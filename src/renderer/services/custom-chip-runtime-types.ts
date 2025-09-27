import type { AVRIOPort } from 'avr8js';

export interface ChipPinBridge {
    chipPinName: string;
    arduinoPin: string;
    port: AVRIOPort;
    bit: number;
    adcChannel?: number | null;
}

export interface CustomChipI2CBridge {
    i2cConnect: (addr: number, write: boolean) => boolean;
    i2cReadByte: (acked: boolean) => number;
    i2cWriteByte: (value: number) => boolean;
    i2cDisconnect: () => void;
}

export interface CustomChipControlBridge {
    getControl: (index: number) => number;
    setControl: (index: number, value: number) => void;
}

export interface CustomChipRuntime {
    tick: () => void;
    dispose: () => void;
    i2c: CustomChipI2CBridge | null;
    controls: CustomChipControlBridge | null;
}