
export class PID {

    private kP: number;
    private kI: number;
    private kD: number;
    private P: number;
    private I: number;
    private D: number;
    private pid: number;
    private error: number;
    private sample: number;
    private setPoint: number;
    private lastSample: number;
    private lastProcess: number;

    constructor(kP: number, kI: number, kD: number) {
        this.kP = kP;
        this.kI = kI;
        this.kD = kD;
    }

    addNewSample(sample: number) {
        this.sample = sample;
    }

    addSetPoint(setPoint: number) {
        this.setPoint = setPoint;
    }

    getSetPoint(agPoint: number = 0): number {
        return this.setPoint + agPoint; // Adds an aggregating margin
    }

    process(midPoint: number = 0): number {
        const deltaTime = (performance.now() - this.lastProcess) / 1000.0;

        this.lastProcess = performance.now();
        this.error = this.setPoint - this.sample;

        this.P = this.error * this.kP;
        this.I = this.kI + (this.error * this.kI) * deltaTime;
        this.D = (this.lastSample - this.sample) * this.kD / deltaTime;

        this.lastSample = this.sample;

        this.pid = this.P + this.I + this.D;

        return !isNaN(this.pid) ? midPoint + this.pid : midPoint;
    }
}
