/**
 * DS1307 Real-Time Clock Controller (I2C)
 *
 * I2C Address: 0x68
 * Registers 0x00-0x06: seconds, minutes, hours, day, date, month, year (BCD)
 * Register 0x07: control register
 * Registers 0x08-0x3F: 56 bytes of general-purpose RAM
 *
 * Returns the current system (browser) time for time-keeping registers.
 * RAM reads/writes are stored in memory.
 */
import { I2CDevice } from './i2c-bus';

export const DS1307_ADDR = 0x68;

function toBCD(value: number): number {
    const tens = Math.floor(value / 10);
    const units = value % 10;
    return (tens << 4) | units;
}

export class DS1307Controller implements I2CDevice {
    private registerPointer = 0;
    private ram = new Uint8Array(56); // 0x08-0x3F
    private control = 0x00;
    private pendingAddress = true;

    i2cConnect(): boolean {
        this.pendingAddress = true;
        return true;
    }

    i2cDisconnect(): void {
        // no-op
    }

    i2cWriteByte(value: number): boolean {
        if (this.pendingAddress) {
            this.registerPointer = value & 0x3F;
            this.pendingAddress = false;
            return true;
        }

        // Write to addressed register
        this.writeRegister(this.registerPointer, value);
        this.registerPointer = (this.registerPointer + 1) & 0x3F;
        return true;
    }

    i2cReadByte(): number {
        const value = this.readRegister(this.registerPointer);
        this.registerPointer = (this.registerPointer + 1) & 0x3F;
        return value;
    }

    private readRegister(reg: number): number {
        const now = new Date();

        switch (reg) {
            case 0x00: return toBCD(now.getSeconds());         // seconds (bit 7 = CH, 0 = running)
            case 0x01: return toBCD(now.getMinutes());         // minutes
            case 0x02: return toBCD(now.getHours());           // hours (24h mode)
            case 0x03: return toBCD(now.getDay() + 1);         // day of week (1-7)
            case 0x04: return toBCD(now.getDate());            // date
            case 0x05: return toBCD(now.getMonth() + 1);       // month (1-12)
            case 0x06: return toBCD(now.getFullYear() % 100);  // year (0-99)
            case 0x07: return this.control;
            default: {
                if (reg >= 0x08 && reg <= 0x3F) {
                    return this.ram[reg - 0x08];
                }
                return 0xFF;
            }
        }
    }

    private writeRegister(reg: number, value: number): void {
        if (reg === 0x07) {
            this.control = value;
        } else if (reg >= 0x08 && reg <= 0x3F) {
            this.ram[reg - 0x08] = value;
        }
        // Writes to time registers (0x00-0x06) are ignored — we always use system time
    }
}
