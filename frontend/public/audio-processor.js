class AudioChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.sampleRate = 16000;
    this.chunkDuration = 3; // seconds
    this.samplesPerChunk = this.sampleRate * this.chunkDuration;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono

    // Downsample from 44100/48000 to 16000
    const inputSampleRate = sampleRate; // global in AudioWorklet scope
    const ratio = inputSampleRate / this.sampleRate;

    for (let i = 0; i < channelData.length; i += ratio) {
      const idx = Math.floor(i);
      if (idx < channelData.length) {
        this.buffer.push(channelData[idx]);
      }
    }

    // When we have enough samples for one chunk, send it
    if (this.buffer.length >= this.samplesPerChunk) {
      const chunk = new Float32Array(this.buffer.slice(0, this.samplesPerChunk));
      this.buffer = this.buffer.slice(this.samplesPerChunk);
      this.port.postMessage({ type: 'audio_chunk', data: chunk.buffer }, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor('audio-chunk-processor', AudioChunkProcessor);
