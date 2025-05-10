import { I2CDevice } from './i2c-bus';

export const MPU6050_ADDR = 0x68;

const REG_SMPLRT_DIV = 0x19;
const REG_CONFIG = 0x1a;
const REG_GYRO_CONFIG = 0x1b;
const REG_ACCEL_CONFIG = 0x1c;
const REG_ACCEL_CONFIG2 = 0x1d;
const REG_INT_PIN_CFG = 0x37;
const REG_INT_STATUS = 0x3a;
const REG_ACCEL_XOUT_H = 0x3b;
const REG_USER_CTRL = 0x6a;
const REG_PWR_MGMT_1 = 0x6b;
const REG_PWR_MGMT_2 = 0x6c;
const REG_WHO_AM_I = 0x75;

const ACCEL_LSB_PER_G = [16384, 8192, 4096, 2048] as const;
const GYRO_LSB_PER_DPS = [131, 65.5, 32.8, 16.4] as const;

type AxisKey = 'x' | 'y' | 'z';

export interface MPU6050TuningState {
    accel: Record<AxisKey, number>;
    gyro: Record<AxisKey, number>;
    temperatureC: number;
}

function clampInt16(value: number): number {
    const rounded = Math.round(value);
    if (rounded > 32767) return 32767;
    if (rounded < -32768) return -32768;
    return rounded;
}

function splitInt16(value: number): [number, number] {
    const normalized = value & 0xffff;
    return [(normalized >> 8) & 0xff, normalized & 0xff];
}

export class MPU6050Controller implements I2CDevice {
    private registerPointer = 0;
    private pendingRegisterPointer = false;
    private sampleRateDivider = 0x00;
    private config = 0x00;
    private gyroConfig = 0x00;
    private accelConfig = 0x00;
    private accelConfig2 = 0x00;
    private intPinCfg = 0x00;
    private userCtrl = 0x00;
    private pwrMgmt1 = 0x40;
    private pwrMgmt2 = 0x00;
    private readonly tuning: MPU6050TuningState = {
        accel: { x: 0, y: 0, z: 1 },
        gyro: { x: 0, y: 0, z: 0 },
        temperatureC: 24,
    };

    constructor(private readonly cpuMillis: () => number) {}

    i2cConnect(addr: number, write: boolean): boolean {
        if (addr !== MPU6050_ADDR && addr !== 0x69) {
            return false;
        }
        this.pendingRegisterPointer = write;
        return true;
    }

    i2cDisconnect(): void {
        // no-op
    }

    i2cWriteByte(value: number): boolean {
        if (this.pendingRegisterPointer) {
            this.registerPointer = value & 0x7f;
            this.pendingRegisterPointer = false;
            return true;
        }

        const acknowledged = this.writeRegister(this.registerPointer, value & 0xff);
        this.registerPointer = (this.registerPointer + 1) & 0x7f;
        return acknowledged;
    }

    i2cReadByte(): number {
        const value = this.readRegister(this.registerPointer);
        this.registerPointer = (this.registerPointer + 1) & 0x7f;
        return value;
    }

    getAccel(axis: AxisKey): number {
        return this.tuning.accel[axis];
    }

    setAccel(axis: AxisKey, value: number): void {
        this.tuning.accel[axis] = Math.max(-16, Math.min(16, value));
    }

    getGyro(axis: AxisKey): number {
        return this.tuning.gyro[axis];
    }

    setGyro(axis: AxisKey, value: number): void {
        this.tuning.gyro[axis] = Math.max(-2000, Math.min(2000, value));
    }

    getTemperatureC(): number {
        return this.tuning.temperatureC;
    }

    setTemperatureC(value: number): void {
        this.tuning.temperatureC = Math.max(-40, Math.min(85, value));
    }

    private reset(): void {
        this.sampleRateDivider = 0x00;
        this.config = 0x00;
        this.gyroConfig = 0x00;
        this.accelConfig = 0x00;
        this.accelConfig2 = 0x00;
        this.intPinCfg = 0x00;
        this.userCtrl = 0x00;
        this.pwrMgmt1 = 0x40;
        this.pwrMgmt2 = 0x00;
    }

    private measurementRegisters(): Uint8Array {
        const registers = new Uint8Array(14);
        const sleeping = (this.pwrMgmt1 & 0x40) !== 0;

        const accelRangeIndex = (this.accelConfig >> 3) & 0x03;
        const gyroRangeIndex = (this.gyroConfig >> 3) & 0x03;
        const accelScale = ACCEL_LSB_PER_G[accelRangeIndex] ?? ACCEL_LSB_PER_G[0];
        const gyroScale = GYRO_LSB_PER_DPS[gyroRangeIndex] ?? GYRO_LSB_PER_DPS[0];

        const accelX = sleeping ? 0 : clampInt16(this.tuning.accel.x * accelScale);
        const accelY = sleeping ? 0 : clampInt16(this.tuning.accel.y * accelScale);
        const accelZ = sleeping ? 0 : clampInt16(this.tuning.accel.z * accelScale);
        const tempRaw = clampInt16((this.tuning.temperatureC - 36.53) * 340);
        const gyroX = sleeping ? 0 : clampInt16(this.tuning.gyro.x * gyroScale);
        const gyroY = sleeping ? 0 : clampInt16(this.tuning.gyro.y * gyroScale);
        const gyroZ = sleeping ? 0 : clampInt16(this.tuning.gyro.z * gyroScale);

        const values = [accelX, accelY, accelZ, tempRaw, gyroX, gyroY, gyroZ];
        values.forEach((entry, index) => {
            const [high, low] = splitInt16(entry);
            const offset = index * 2;
            registers[offset] = high;
            registers[offset + 1] = low;
        });

        return registers;
    }

    private readRegister(register: number): number {
        if (register >= REG_ACCEL_XOUT_H && register < REG_ACCEL_XOUT_H + 14) {
            return this.measurementRegisters()[register - REG_ACCEL_XOUT_H] ?? 0xff;
        }

        switch (register) {
            case REG_SMPLRT_DIV:
                return this.sampleRateDivider;
            case REG_CONFIG:
                return this.config;
            case REG_GYRO_CONFIG:
                return this.gyroConfig;
            case REG_ACCEL_CONFIG:
                return this.accelConfig;
            case REG_ACCEL_CONFIG2:
                return this.accelConfig2;
            case REG_INT_PIN_CFG:
                return this.intPinCfg;
            case REG_INT_STATUS:
                return 0x01;
            case REG_USER_CTRL:
                return this.userCtrl;
            case REG_PWR_MGMT_1:
                return this.pwrMgmt1;
            case REG_PWR_MGMT_2:
                return this.pwrMgmt2;
            case REG_WHO_AM_I:
                return MPU6050_ADDR;
            default:
                return 0x00;
        }
    }

    private writeRegister(register: number, value: number): boolean {
        switch (register) {
            case REG_SMPLRT_DIV:
                this.sampleRateDivider = value;
                return true;
            case REG_CONFIG:
                this.config = value;
                return true;
            case REG_GYRO_CONFIG:
                this.gyroConfig = value;
                return true;
            case REG_ACCEL_CONFIG:
                this.accelConfig = value;
                return true;
            case REG_ACCEL_CONFIG2:
                this.accelConfig2 = value;
                return true;
            case REG_INT_PIN_CFG:
                this.intPinCfg = value;
                return true;
            case REG_USER_CTRL:
                this.userCtrl = value;
                return true;
            case REG_PWR_MGMT_1:
                if (value & 0x80) {
                    this.reset();
                } else {
                    this.pwrMgmt1 = value;
                }
                return true;
            case REG_PWR_MGMT_2:
                this.pwrMgmt2 = value;
                return true;
            default:
                return false;
        }
    }
}