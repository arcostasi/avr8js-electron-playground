/**
 * DHT22 Temperature/Humidity Sensor Controller
 *
 * Implements the single-wire protocol used by DHT22 (AM2302):
 * - Host pulls DATA low for ≥1ms then releases (start signal)
 * - Sensor responds with timing-encoded 40-bit payload:
 *   16-bit humidity (×10), 16-bit temperature (×10 + sign), 8-bit checksum
 *
 * Uses cpu.addClockEvent() for cycle-precise timing.
 */
import { CPU, AVRIOPort } from 'avr8js';

export class DHT22Controller {
    /** Simulated temperature in °C (configurable) */
    temperature = 22.5;
    /** Simulated humidity in % (configurable) */
    humidity = 60.0;

    private responding = false;
    private lastPinHigh = true;
    private lowStartCycle = 0;
    private readonly cyclesPerUs: number;

    constructor(
        private cpu: CPU,
        private port: AVRIOPort,
        private bit: number,
        frequency: number,
    ) {
        this.cyclesPerUs = frequency / 1e6;
        // Idle state: line HIGH (pull-up)
        port.setPin(bit, true);
        port.addListener(() => this.onPinChange());
    }

    private onPinChange(): void {
        const isHigh = this.port.pinState(this.bit) !== 0;

        if (!isHigh && this.lastPinHigh) {
            // Falling edge — potential start signal
            this.lowStartCycle = this.cpu.cycles;
        }

        if (isHigh && !this.lastPinHigh && !this.responding) {
            // Rising edge after low — check if it was a valid start signal (>500μs low)
            const lowDurationUs = (this.cpu.cycles - this.lowStartCycle) / this.cyclesPerUs;
            if (lowDurationUs > 500) {
                this.sendResponse();
            }
        }

        this.lastPinHigh = isHigh;
    }

    private sendResponse(): void {
        this.responding = true;
        const cUs = this.cyclesPerUs;

        // Build 5 data bytes
        const humRaw = Math.round(this.humidity * 10);
        const tempAbs = Math.round(Math.abs(this.temperature) * 10);
        const tempRaw = this.temperature < 0 ? (tempAbs | 0x8000) : tempAbs;
        const bytes = [
            (humRaw >> 8) & 0xFF,
            humRaw & 0xFF,
            (tempRaw >> 8) & 0xFF,
            tempRaw & 0xFF,
            0, // checksum
        ];
        bytes[4] = (bytes[0] + bytes[1] + bytes[2] + bytes[3]) & 0xFF;

        // Convert to 40 bits (MSB first)
        const bits: number[] = [];
        for (const b of bytes) {
            for (let i = 7; i >= 0; i--) {
                bits.push((b >> i) & 1);
            }
        }

        // Schedule timing sequence via clock events
        let offset = Math.round(20 * cUs); // small wait

        // Response header: LOW 80μs then HIGH 80μs
        this.schedulePin(offset, false);
        offset += Math.round(80 * cUs);
        this.schedulePin(offset, true);
        offset += Math.round(80 * cUs);

        // Transmit 40 data bits
        for (const bitVal of bits) {
            // Each bit: LOW 50μs, then HIGH for 26μs (0) or 70μs (1)
            this.schedulePin(offset, false);
            offset += Math.round(50 * cUs);
            this.schedulePin(offset, true);
            offset += Math.round(bitVal ? 70 * cUs : 27 * cUs);
        }

        // End pulse: LOW 50μs then release HIGH
        this.schedulePin(offset, false);
        offset += Math.round(50 * cUs);
        this.schedulePin(offset, true);

        // Mark end of response
        this.cpu.addClockEvent(() => { this.responding = false; }, offset + Math.round(10 * cUs));
    }

    private schedulePin(offsetCycles: number, high: boolean): void {
        const delay = Math.max(1, offsetCycles);
        this.cpu.addClockEvent(() => {
            this.port.setPin(this.bit, high);
        }, delay);
    }
}
