/**
 * Speaker
 * Part of AVR8js
 * From https://stackblitz.com/edit/avr8js-simon-game?file=speaker.ts
 * Copyright (C) 2019, Uri Shaked
 */
import { CPU } from 'avr8js';

const CHUNKS_PER_SECOND = 20;
const MAX_CATCHUP_CHUNKS = 3;

export class Speaker {
  private context: AudioContext | null = null;
  private chunkBuffer: AudioBuffer | null = null;
  private chunk: Float32Array | null = null;
  private node: AudioBufferSourceNode | null = null;

  private prevValue = 0;
  private playedSamples = 0;
  private lastSample = 0;
  private chunkHasAudio = false;
  private nextStartTime = 0;

  constructor(private cpu: CPU, private mhz: number) {}

  private allocateChunk(context: AudioContext): { chunkBuffer: AudioBuffer; chunk: Float32Array } {
    const chunkBuffer = new AudioBuffer({
      length: Math.max(1, Math.floor(context.sampleRate / CHUNKS_PER_SECOND)),
      numberOfChannels: 1,
      sampleRate: context.sampleRate,
    });
    const chunk = chunkBuffer.getChannelData(0);
    this.chunkBuffer = chunkBuffer;
    this.chunk = chunk;
    return { chunkBuffer, chunk };
  }

  private ensureAudioInitialized() {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended' && typeof this.context.resume === 'function') {
      void this.context.resume().catch((): void => {});
    }
    if (!this.chunkBuffer || !this.chunk) {
      const allocated = this.allocateChunk(this.context);
      return { context: this.context, chunkBuffer: allocated.chunkBuffer, chunk: allocated.chunk };
    }
    return { context: this.context, chunkBuffer: this.chunkBuffer, chunk: this.chunk };
  }

  private emitCurrentChunk(context: AudioContext, chunkBuffer: AudioBuffer): void {
    const node = new AudioBufferSourceNode(context, { buffer: chunkBuffer });
    node.connect(context.destination);
    if (typeof context.currentTime === 'number' && Number.isFinite(context.currentTime)) {
      const now = context.currentTime;
      const startAt = Math.min(now + 0.3, Math.max(this.nextStartTime, now + 0.005));
      node.start(startAt);
      this.nextStartTime = startAt + chunkBuffer.duration;
    } else {
      node.start();
    }
    this.node = node;
  }

  private advanceChunk(context: AudioContext): { chunkBuffer: AudioBuffer; chunk: Float32Array } {
    if (!this.chunkBuffer || !this.chunk) {
      return this.allocateChunk(context);
    }

    const chunkLen = this.chunk.length;
    if (this.lastSample < chunkLen) {
      this.chunk.fill(this.prevValue, this.lastSample, chunkLen);
    }

    if (this.chunkHasAudio || this.prevValue !== 0) {
      this.emitCurrentChunk(context, this.chunkBuffer);
    }

    this.playedSamples += chunkLen;
    this.lastSample = 0;
    this.chunkHasAudio = false;
    return this.allocateChunk(context);
  }

  feed(value: number) {
    const initialized = this.ensureAudioInitialized();
    const { context } = initialized;
    let { chunk } = initialized;

    const { sampleRate } = context;
    const totalSamples = Math.floor((this.cpu.cycles / this.mhz) * sampleRate);

    if (totalSamples < this.playedSamples) {
      this.playedSamples = totalSamples;
      this.lastSample = 0;
      this.chunkHasAudio = false;
    }

    let emittedCatchupChunks = 0;
    while (totalSamples - this.playedSamples >= chunk.length) {
      const stillFarBehind = totalSamples - this.playedSamples >= chunk.length * 2;
      if (stillFarBehind && !this.chunkHasAudio && this.prevValue === 0) {
        this.playedSamples = totalSamples;
        this.lastSample = 0;
        break;
      }

      if (emittedCatchupChunks >= MAX_CATCHUP_CHUNKS && totalSamples - this.playedSamples >= chunk.length) {
        this.playedSamples = totalSamples;
        this.lastSample = 0;
        this.chunkHasAudio = false;
        chunk = this.allocateChunk(context).chunk;
        break;
      }

      chunk = this.advanceChunk(context).chunk;
      emittedCatchupChunks += 1;
    }

    const currentSample = Math.max(this.lastSample, Math.min(chunk.length - 1, totalSamples - this.playedSamples));
    if (currentSample > this.lastSample) {
      chunk.fill(this.prevValue, this.lastSample, currentSample);
    }
    chunk.fill(value, currentSample);

    if (value !== 0 || this.prevValue !== 0) {
      this.chunkHasAudio = true;
    }
    this.lastSample = currentSample;
    this.prevValue = value;
  }

  flush() {
    if (!this.context || !this.chunkBuffer || !this.chunk || !this.chunkHasAudio) {
      return;
    }

    const totalSamples = Math.floor((this.cpu.cycles / this.mhz) * this.context.sampleRate);
    if (totalSamples - this.playedSamples < this.chunk.length) {
      return;
    }

    const { chunk } = this.advanceChunk(this.context);
    if (totalSamples - this.playedSamples >= chunk.length) {
      this.playedSamples = totalSamples;
      this.lastSample = 0;
      this.chunkHasAudio = false;
    } else if (this.prevValue !== 0) {
      const currentSample = Math.max(0, totalSamples - this.playedSamples);
      chunk.fill(this.prevValue, 0, currentSample);
      this.lastSample = currentSample;
      this.chunkHasAudio = true;
    }
  }

  close() {
    if (this.node) {
      try {
        if (typeof this.node.stop === 'function') {
          this.node.stop();
        }
        if (typeof this.node.disconnect === 'function') {
          this.node.disconnect();
        }
      } catch {
        // ignore if source already stopped
      }
      this.node = null;
    }

    if (this.context) {
      if (typeof this.context.close === 'function') {
        void this.context.close().catch((): void => {});
      }
      this.context = null;
    }

    this.chunkBuffer = null;
    this.chunk = null;
    this.playedSamples = 0;
    this.lastSample = 0;
    this.prevValue = 0;
    this.chunkHasAudio = false;
    this.nextStartTime = 0;
  }
}
