/**
 * IR Controller
 * Handles the link between wokwi-ir-remote (button events) and
 * wokwi-ir-receiver (demodulated output on DAT pin).
 *
 * Generates NEC protocol timing on the receiver's DAT pin:
 *  - 9ms AGC burst (DAT LOW)
 *  - 4.5ms space  (DAT HIGH)
 *  - 32 data bits: address (8) + ~address (8) + command (8) + ~command (8)
 *  - Each bit: 562.5μs LOW, then 562.5μs HIGH (0) or 1687.5μs HIGH (1)
 *  - Final 562.5μs LOW
 *
 * IR receiver output is active-LOW (LOW during carrier burst,
 * HIGH during space) which is inverted from the transmitter's perspective.
 *
 * Uses cpu.addClockEvent() for cycle-precise timing.
 */
import { CPU, AVRIOPort } from 'avr8js';

/** NEC protocol address (0x00 is common for many remotes) */
const NEC_ADDRESS = 0x00;

export class IRController {
    private transmitting = false;
    private readonly cyclesPerUs: number;

    constructor(
        private cpu: CPU,
        private datPort: AVRIOPort,
        private datBit: number,
        frequency: number,
    ) {
        this.cyclesPerUs = frequency / 1e6;
        // Idle: DAT line HIGH (no signal)
        datPort.setPin(datBit, true);
    }

    /**
     * Called when an IR remote button is pressed.
     * @param irCode The NEC command byte (from event detail)
     */
    sendNEC(irCode: number): void {
        if (this.transmitting) return;
        this.transmitting = true;

        const cUs = this.cyclesPerUs;
        const address = NEC_ADDRESS;

        // Build 32-bit NEC frame: address, ~address, command, ~command
        const frame = [
            address,
            (~address) & 0xFF,
            irCode & 0xFF,
            (~irCode) & 0xFF,
        ];

        // Convert to bits (LSB first per NEC standard)
        const bits: number[] = [];
        for (const byte of frame) {
            for (let i = 0; i < 8; i++) {
                bits.push((byte >> i) & 1);
            }
        }

        let offset = Math.round(10 * cUs); // small initial delay

        // AGC burst: DAT LOW for 9ms (IR receiver output = LOW during carrier)
        this.schedulePin(offset, false);
        offset += Math.round(9000 * cUs);

        // Space: DAT HIGH for 4.5ms
        this.schedulePin(offset, true);
        offset += Math.round(4500 * cUs);

        // Data bits
        for (const bit of bits) {
            // Burst: LOW 562.5μs
            this.schedulePin(offset, false);
            offset += Math.round(562.5 * cUs);
            // Space: HIGH 562.5μs (0) or 1687.5μs (1)
            this.schedulePin(offset, true);
            offset += Math.round(bit ? 1687.5 * cUs : 562.5 * cUs);
        }

        // Final burst: LOW 562.5μs
        this.schedulePin(offset, false);
        offset += Math.round(562.5 * cUs);

        // Return to idle HIGH
        this.schedulePin(offset, true);

        // Mark end of transmission
        this.cpu.addClockEvent(() => { this.transmitting = false; }, offset + Math.round(100 * cUs));
    }

    private schedulePin(offsetCycles: number, high: boolean): void {
        const delay = Math.max(1, offsetCycles);
        this.cpu.addClockEvent(() => {
            this.datPort.setPin(this.datBit, high);
        }, delay);
    }
}
