/**
 * LSTM Seq2Seq Temporal Model for Airport Queue Forecasting.
 *
 * Encoder-decoder LSTM that maps a historical input sequence to a future
 * prediction sequence. Pure JavaScript implementation using matrix operations
 * for dependency-free execution.
 *
 * Reference: Hopfe, Lee & Yu (2024). "Short-term forecasting airport passenger
 * flow during periods of volatility." Journal of Air Transport Management 115:102525.
 *
 * NOTE: Weights are initialized with random values. No pre-trained airport
 * passenger flow dataset is publicly available for the exact zone topology
 * modeled here. The model structure is correct and ready for training when
 * data becomes available.
 */

const DEFAULT_HYPERPARAMS = {
  inputWindow: 12, // steps (2 hours at 10-min resolution)
  predictionHorizon: 12, // steps (2 hours at 10-min resolution)
  hiddenDim: 128,
  lstmLayers: 2,
  dropout: 0.1,
  learningRate: 5e-4,
  teacherForcingRatio: 0.5,
};

/**
 * Simple seeded pseudo-random number generator for reproducible initialization.
 */
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * Xavier/Glorot uniform initialization for a weight matrix.
 */
function xavierInit(rows, cols, rng) {
  const limit = Math.sqrt(6 / (rows + cols));
  const matrix = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      row.push((rng() * 2 - 1) * limit);
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Sigmoid activation.
 */
function sigmoid(x) {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

/**
 * Tanh activation.
 */
function tanh(x) {
  const clipped = Math.max(-500, Math.min(500, x));
  const e2x = Math.exp(2 * clipped);
  return (e2x - 1) / (e2x + 1);
}

/**
 * Single LSTM cell forward pass.
 */
function lstmCellForward(input, hPrev, cPrev, weights) {
  const { Wf, Wi, Wc, Wo, bf, bi, bc, bo } = weights;
  const hiddenDim = hPrev.length;
  const combined = [...input, ...hPrev];

  const ft = [];
  const it = [];
  const ct_candidate = [];
  const ot = [];

  for (let j = 0; j < hiddenDim; j++) {
    let fSum = bf[j];
    let iSum = bi[j];
    let cSum = bc[j];
    let oSum = bo[j];

    for (let k = 0; k < combined.length; k++) {
      fSum += Wf[j][k] * combined[k];
      iSum += Wi[j][k] * combined[k];
      cSum += Wc[j][k] * combined[k];
      oSum += Wo[j][k] * combined[k];
    }

    ft.push(sigmoid(fSum));
    it.push(sigmoid(iSum));
    ct_candidate.push(tanh(cSum));
    ot.push(sigmoid(oSum));
  }

  const cNext = [];
  const hNext = [];
  for (let j = 0; j < hiddenDim; j++) {
    cNext.push(ft[j] * cPrev[j] + it[j] * ct_candidate[j]);
    hNext.push(ot[j] * tanh(cNext[j]));
  }

  return { h: hNext, c: cNext };
}

export class LSTMSeq2SeqForecaster {
  constructor(params = {}) {
    this.params = { ...DEFAULT_HYPERPARAMS, ...params };
    this.weights = null;
    this.initialized = false;
    this.inputFeatures = 0;
    this.outputFeatures = 0;
  }

  /**
   * Initialize weights for the given input/output dimensions.
   * Uses random weights with Xavier initialization.
   */
  initialize(numZones) {
    const rng = seededRandom(42);
    const { hiddenDim } = this.params;

    // Input features: occupancy + incoming + outbound + serviceRate per zone + 2 temporal
    this.inputFeatures = numZones * 4 + 2;
    // Output features: occupancy + wait time per zone
    this.outputFeatures = numZones * 2;

    const combinedDim = this.inputFeatures + hiddenDim;

    // Encoder weights (single layer for efficiency)
    this.weights = {
      encoder: {
        Wf: xavierInit(hiddenDim, combinedDim, rng),
        Wi: xavierInit(hiddenDim, combinedDim, rng),
        Wc: xavierInit(hiddenDim, combinedDim, rng),
        Wo: xavierInit(hiddenDim, combinedDim, rng),
        bf: new Array(hiddenDim).fill(1.0), // forget gate bias = 1 (best practice)
        bi: new Array(hiddenDim).fill(0),
        bc: new Array(hiddenDim).fill(0),
        bo: new Array(hiddenDim).fill(0),
      },
      decoder: {
        Wf: xavierInit(hiddenDim, this.outputFeatures + hiddenDim, rng),
        Wi: xavierInit(hiddenDim, this.outputFeatures + hiddenDim, rng),
        Wc: xavierInit(hiddenDim, this.outputFeatures + hiddenDim, rng),
        Wo: xavierInit(hiddenDim, this.outputFeatures + hiddenDim, rng),
        bf: new Array(hiddenDim).fill(1.0),
        bi: new Array(hiddenDim).fill(0),
        bc: new Array(hiddenDim).fill(0),
        bo: new Array(hiddenDim).fill(0),
      },
      outputProjection: xavierInit(this.outputFeatures, hiddenDim, rng),
      outputBias: new Array(this.outputFeatures).fill(0),
    };

    this.initialized = true;
  }

  /**
   * Encode a sequence of input features into a hidden state.
   */
  encode(inputSequence) {
    const { hiddenDim } = this.params;
    let h = new Array(hiddenDim).fill(0);
    let c = new Array(hiddenDim).fill(0);

    for (const input of inputSequence) {
      const result = lstmCellForward(input, h, c, this.weights.encoder);
      h = result.h;
      c = result.c;
    }

    return { h, c };
  }

  /**
   * Decode from encoder state to produce prediction sequence.
   */
  decode(encoderState, steps, lastOutput) {
    const { hiddenDim } = this.params;
    let { h, c } = encoderState;
    let input = lastOutput;
    const outputs = [];

    for (let step = 0; step < steps; step++) {
      const result = lstmCellForward(input, h, c, this.weights.decoder);
      h = result.h;
      c = result.c;

      // Project hidden state to output
      const output = [];
      for (let i = 0; i < this.outputFeatures; i++) {
        let sum = this.weights.outputBias[i];
        for (let j = 0; j < hiddenDim; j++) {
          sum += this.weights.outputProjection[i][j] * h[j];
        }
        output.push(sum);
      }

      outputs.push(output);
      input = output;
    }

    return outputs;
  }

  /**
   * Build input features from a snapshot for a single timestep.
   */
  buildInputFeatures(snapshot) {
    const features = [];

    for (const zone of snapshot.zones) {
      features.push(zone.occupancy / (zone.capacity || 1));

      const incoming = snapshot.passengerFlows
        .filter((f) => f.toZoneId === zone.zoneId)
        .reduce((sum, f) => sum + f.estimatedCount, 0);
      features.push(incoming / 100);

      const outbound = snapshot.passengerFlows
        .filter((f) => f.fromZoneId === zone.zoneId)
        .reduce((sum, f) => sum + f.estimatedCount, 0);
      features.push(outbound / 100);

      features.push(zone.serviceRatePerMinute / 10);
    }

    // Temporal features (normalized)
    const now = new Date(snapshot.asOf);
    features.push(now.getHours() / 24);
    features.push(now.getDay() / 7);

    return features;
  }

  /**
   * Generate a full forecast from an operational snapshot.
   */
  forecast(snapshot, request = {}) {
    const horizon = request.horizonMinutes ?? 120;
    const resolution = request.resolutionMinutes ?? 15;
    const refreshCadenceSeconds = request.refreshCadenceSeconds ?? 60;
    const numZones = snapshot.zones.length;

    if (!this.initialized || numZones * 4 + 2 !== this.inputFeatures) {
      this.initialize(numZones);
    }

    // Build input (single timestep since we only have current snapshot)
    const inputFeatures = this.buildInputFeatures(snapshot);
    const inputSequence = [inputFeatures];

    // Encode
    const encoderState = this.encode(inputSequence);

    // Initial decoder input (current state as output features)
    const lastOutput = [];
    for (const zone of snapshot.zones) {
      lastOutput.push(zone.occupancy / (zone.capacity || 1));
      lastOutput.push(0); // wait time normalized
    }

    // Decode
    const stepsAhead = Math.floor(horizon / resolution) + 1;
    const decoderOutputs = this.decode(encoderState, stepsAhead, lastOutput);

    // Convert decoder outputs to forecast points
    const points = [];
    for (let step = 0; step < stepsAhead; step++) {
      const minute = step * resolution;
      const output = step === 0 ? lastOutput : decoderOutputs[step - 1];

      const zones = snapshot.zones.map((zone, i) => {
        const rawOccupancy = output[i * 2] * (zone.capacity || 1);
        const predicted = Math.max(0, Math.round(rawOccupancy));
        const ratio = predicted / zone.capacity;

        return {
          zoneId: zone.zoneId,
          expectedOccupancy: predicted,
          queuePressure: Number(Math.min(2, Math.max(0, ratio)).toFixed(2)),
          staffingDemand: Math.max(
            1,
            Math.ceil(predicted / Math.max(zone.serviceRatePerMinute * 20, 1)),
          ),
          status: ratio >= 0.9 ? "critical" : ratio >= 0.72 ? "watch" : "normal",
        };
      });

      points.push({ minute, zones });
    }

    const minConfidence = Math.min(
      ...snapshot.zones.map((z) => z.confidence.score),
    );

    return {
      generatedAt: snapshot.asOf,
      refreshCadenceSeconds,
      horizon: { start: snapshot.asOf, minutes: horizon, resolutionMinutes: resolution },
      points,
      confidence: {
        score: Number((minConfidence * 0.88).toFixed(2)),
        basis: "LSTM Seq2Seq temporal model (random weights)",
      },
      assumptions: [
        { label: "Temporal patterns encoded via LSTM hidden state" },
        { label: "Model uses random weights — predictions are structural, not trained" },
      ],
      modelType: "lstm-seq2seq",
    };
  }
}

export const lstmSeq2SeqForecaster = new LSTMSeq2SeqForecaster();
