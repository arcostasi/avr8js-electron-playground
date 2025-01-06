/**
 * Stepper Motor Controller
 * Detects 4-phase full-step sequence and tracks angle.
 *
 * Phase patterns (A+, A-, B+, B-):
 *   Phase 0: 1 0 1 0
 *   Phase 1: 0 1 1 0
 *   Phase 2: 0 1 0 1
 *   Phase 3: 1 0 0 1
 */

export class StepperController {
    private lastPhase = -1;
    angle = 0;
    stepsPerRevolution = 200; // 1.8° per step (NEMA 17 default)

    /**
     * Feed current pin states: A+, A-, B+, B-.
     * Call this from a port listener whenever any of the 4 pins changes.
     */
    feedPhase(ap: boolean, an: boolean, bp: boolean, bn: boolean): void {
        const phase = StepperController.getPhase(ap, an, bp, bn);
        if (phase < 0 || phase === this.lastPhase) return;

        if (this.lastPhase >= 0) {
            const delta = phase - this.lastPhase;
            if (delta === 1 || delta === -3) {
                this.angle += 360 / this.stepsPerRevolution;
            } else if (delta === -1 || delta === 3) {
                this.angle -= 360 / this.stepsPerRevolution;
            }
            this.angle = ((this.angle % 360) + 360) % 360;
        }

        this.lastPhase = phase;
    }

    private static getPhase(ap: boolean, an: boolean, bp: boolean, bn: boolean): number {
        if (ap && !an && bp && !bn) return 0;
        if (!ap && an && bp && !bn) return 1;
        if (!ap && an && !bp && bn) return 2;
        if (ap && !an && !bp && bn) return 3;
        return -1;
    }
}
