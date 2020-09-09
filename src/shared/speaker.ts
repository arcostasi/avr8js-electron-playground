/**
 * Speaker
 * Part of AVR8js
 *
 * Copyright (C) 2019, Uri Shaked
 */
import { ICPU } from 'avr8js';

const SAMPLE_RATE = 44100;
const CHUNKS_PER_SECOND = 8;

export class Speaker {
  private readonly context = new AudioContext();

  private chunkBuffer = new AudioBuffer({
    length: SAMPLE_RATE / CHUNKS_PER_SECOND,
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE
  });

  private chunk = this.chunkBuffer.getChannelData(0);
  private node: AudioBufferSourceNode | null = null;
  private prevValue = 0;
  private playedSamples = 0;
  private lastSample = 0;

  constructor(private cpu: ICPU, private mhz: number) {}

  feed(value: number) {
    const currentTime = this.cpu.cycles / this.mhz;
    let currentSample = Math.floor(currentTime * SAMPLE_RATE) - this.playedSamples;

    if (currentSample - this.lastSample > SAMPLE_RATE / 20) {
      this.lastSample = currentSample;
      currentSample = 0;
    } else {
      this.lastSample = currentSample;
    }

    if (currentSample > this.chunk.length) {
      this.playedSamples += this.chunk.length;

      this.node = new AudioBufferSourceNode(this.context, { buffer: this.chunkBuffer });
      this.node.connect(this.context.destination);
      this.node.start();

      currentSample %= this.chunk.length;

      this.chunkBuffer = new AudioBuffer({
        length: SAMPLE_RATE / CHUNKS_PER_SECOND,
        numberOfChannels: 1,
        sampleRate: SAMPLE_RATE
      });

      this.chunk = this.chunkBuffer.getChannelData(0);
      this.chunk.fill(this.prevValue, 0, currentSample);
    }

    this.chunk.fill(value, currentSample);
  }
}
