/**
 * Speaker
 * Part of AVR8js
 * From https://stackblitz.com/edit/avr8js-simon-game?file=speaker.ts
 * Copyright (C) 2019, Uri Shaked
 */
import { CPU } from 'avr8js';

const CHUNKS_PER_SECOND = 20;

// TODO: Fix sound stuttering
export class Speaker {
  private readonly context = new AudioContext();

  private chunkBuffer = new AudioBuffer({
    length: this.context.sampleRate / CHUNKS_PER_SECOND,
    numberOfChannels: 1,
    sampleRate: this.context.sampleRate
  });

  private chunk = this.chunkBuffer.getChannelData(0);
  private node: AudioBufferSourceNode | null = null;

  private prevValue = 0;
  private playedSamples = 0;
  private lastSample = 0;

  constructor(private cpu: CPU, private mhz: number) {}

  feed(value: number) {
    const currentTime = this.cpu.cycles / this.mhz;
    const { sampleRate } = this.context;

    let currentSample = Math.floor(currentTime * sampleRate) - this.playedSamples;

    this.lastSample = currentSample;

    if ((currentSample - this.lastSample) > (sampleRate / CHUNKS_PER_SECOND)) {
      currentSample = 0;
    }

    if (currentSample > this.chunk.length) {
      this.playedSamples += this.chunk.length;

      this.node = new AudioBufferSourceNode(this.context, { buffer: this.chunkBuffer });
      this.node.connect(this.context.destination);
      this.node.start();

      currentSample %= this.chunk.length;

      this.chunkBuffer = new AudioBuffer({
        length: sampleRate / CHUNKS_PER_SECOND,
        numberOfChannels: 1,
        sampleRate: sampleRate
      });

      this.chunk = this.chunkBuffer.getChannelData(0);
      this.chunk.fill(this.prevValue, 0, currentSample);
    }

    this.chunk.fill(value, currentSample);
  }
}
