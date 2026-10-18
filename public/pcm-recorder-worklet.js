/**
 * Procesador de audio que se ejecuta fuera del hilo principal. Convierte las muestras entrantes del
 * micrófono a PCM de 16 bits y entrega bloques ordenados al agente de voz.
 */


const CHUNK_SIZE_SAMPLES = 2048;

/**
 * Acumula muestras de audio en bloques y responde a mensajes de control recibidos por MessagePort.
 */
class PCMRecorderProcessor extends AudioWorkletProcessor {

  constructor() {
    super();
    this._buffer = new Int16Array(CHUNK_SIZE_SAMPLES);
    this._writeIndex = 0;
    this._stopping = false;
    this.port.onmessage = ({ data }) => {
      if (data?.type !== 'flush') return;
      this._stopping = true;
      if (this._writeIndex > 0) {
        const tail = this._buffer.slice(0, this._writeIndex);
        this.port.postMessage(tail.buffer, [tail.buffer]);
        this._writeIndex = 0;
      }
      this.port.postMessage({ type: 'flushed', id: data.id });
    };
  }

  /**
   * Lee el canal mono de entrada, ajusta amplitudes y emite cada bloque PCM disponible sin detener el
   * procesador.
   */
  process(inputs) {
    if (this._stopping) return true;

    const input = inputs[0];

    if (!input || !input[0]) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {

      const sample = Math.max(-1, Math.min(1, channelData[i]));

      this._buffer[this._writeIndex] = sample < 0
        ? sample * 0x8000
        : sample * 0x7fff;

      this._writeIndex++;

      if (this._writeIndex >= CHUNK_SIZE_SAMPLES) {
        const chunk = this._buffer.slice(0);
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this._writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-recorder', PCMRecorderProcessor);
