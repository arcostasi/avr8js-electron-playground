/**
 * HC-SR04 Ultrasonic Distance Sensor Controller
 *
 * Protocol:
 * - Arduino sends 10μs+ pulse on TRIG
 * - Sensor responds with ECHO pulse proportional to distance:
 *   ECHO duration (μs) = distance (cm) × 2 / 0.0343
 *
 * Uses cpu.addClockEvent() for cycle-precise ECHO timing.
 */
import { CPU, AVRIOPort } from 'avr8js';

export class HCSR04Controller {
    /** Simulated distance in centimeters (configurable via UI) */
    distance = 100;

    private trigWasHigh = false;
    private trigRiseTime = 0;
    private readonly cyclesPerUs: number;

    constructor(
        private cpu: CPU,
        private trigPort: AVRIOPort,
        private trigBit: number,
        private echoPort: AVRIOPort,
        private echoBit: number,
        frequency: number,
    ) {
        this.cyclesPerUs = frequency / 1e6;
        // ECHO idle LOW
        echoPort.setPin(echoBit, false);
        trigPort.addListener(() => this.onTrigChange());
    }

    private onTrigChange(): void {
        const isHigh = this.trigPort.pinState(this.trigBit) === 1;

        if (isHigh && !this.trigWasHigh) {
            // Rising edge of TRIG
            this.trigRiseTime = this.cpu.cycles;
        }

        if (!isHigh && this.trigWasHigh) {
            // Falling edge of TRIG — check pulse width ≥ 10μs
            const pulseUs = (this.cpu.cycles - this.trigRiseTime) / this.cyclesPerUs;
            if (pulseUs >= 8) {
                this.emitEcho();
            }
        }

        this.trigWasHigh = isHigh;
    }

    private emitEcho(): void {
        const cUs = this.cyclesPerUs;

        // Delay before ECHO starts (~460μs typical on real sensor)
        const preDelay = Math.round(460 * cUs);

        // ECHO pulse duration: distance (cm) * 2 / speed_of_sound (cm/μs)
        // Speed of sound ≈ 0.0343 cm/μs → duration = distance * 2 / 0.0343 = distance * 58.3 μs
        const echoDurationUs = Math.max(10, Math.min(this.distance * 58.3, 23200));
        const echoDuration = Math.round(echoDurationUs * cUs);

        // Set ECHO HIGH after pre-delay
        this.cpu.addClockEvent(() => {
            this.echoPort.setPin(this.echoBit, true);
        }, preDelay);

        // Set ECHO LOW after echo duration
        this.cpu.addClockEvent(() => {
            this.echoPort.setPin(this.echoBit, false);
        }, preDelay + echoDuration);
    }
}
