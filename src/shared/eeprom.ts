/**
 * EEPROMLocalStorageBackend
 * Part of AVR8js
 *
 * Copyright (C) 2019, Uri Shaked
 */
import { EEPROMBackend } from 'avr8js';

function zeroPad(value: string, minLength: number) {
  while (value.length < minLength) {
    value = '0' + value;
  }
  return value;
}

function formatAddr(addr: number) {
  return zeroPad(addr.toString(16), 3);
}

export class EEPROMLocalStorageBackend implements EEPROMBackend {
  constructor (private readonly prefix = 'AVR8JS_EEPROM_') {
  }

  readMemory(addr: number) {
    const value = localStorage.getItem(this.prefix + formatAddr(addr));
    if (value != null) {
      return parseInt(value, 16);
    } else {
      return 0xff;
    }
  }

  writeMemory(addr: number, value: number) {
    const prevValue = this.readMemory(addr);
    const newValue = prevValue & value;
    localStorage.setItem(this.prefix + formatAddr(addr), zeroPad(newValue.toString(16), 2));
  }

  eraseMemory(addr: number) {
    localStorage.removeItem(this.prefix + formatAddr(addr))
  }

  clear() {
    const keys = Array.from(localStorage).map((_, index) => localStorage.key(index));
    for (const key of keys) {
      if (key.startsWith(this.prefix)) {
        localStorage.removeItem(this.prefix);
      }
    }
  }
}
