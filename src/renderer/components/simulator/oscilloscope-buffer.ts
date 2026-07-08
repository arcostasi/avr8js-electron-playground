/**
 * Fixed-capacity typed-array ring buffer for 1-bit digital oscilloscope waveforms.
 * Eliminates per-sample heap array allocations while keeping chronological sample indexing.
 */
export class BitRingBuffer {
    private readonly data: Uint8Array;
    private head = 0;
    private length = 0;

    constructor(public readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new RangeError(`BitRingBuffer capacity must be a positive integer (got ${capacity})`);
        }
        this.data = new Uint8Array(capacity);
    }

    get size(): number {
        return this.length;
    }

    push(bit: 0 | 1): void {
        if (this.length < this.capacity) {
            const writeIdx = (this.head + this.length) % this.capacity;
            this.data[writeIdx] = bit;
            this.length += 1;
            return;
        }
        this.data[this.head] = bit;
        this.head = (this.head + 1) % this.capacity;
    }

    get(index: number): 0 | 1 {
        const physIdx = (this.head + index) % this.capacity;
        return this.data[physIdx] ? 1 : 0;
    }

    clear(): void {
        this.head = 0;
        this.length = 0;
        this.data.fill(0);
    }
}
