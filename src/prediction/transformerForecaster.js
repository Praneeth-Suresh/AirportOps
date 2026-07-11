/**
 * Transformer Queue Forecaster for Airport Terminal Operations.
 *
 * Uses facility self-attention to capture inter-zone correlations across
 * terminal zones. Based on the iTransformer architecture where each zone
 * becomes a token with temporal features.
 *
 * Reference: Lee, Yoon, Lee, Baik & Jung (2026). "Airport Terminal Passenger
 * Queue Forecasting for Departure Gates and Security Checkpoints."
 * arXiv:2606.07622.
 *
 * NOTE: Weights are initialized with random values. No pre-trained airport
 * queue dataset is publicly available for the exact zone topology modeled here.
 * The architecture is correct and ready for training when data becomes available.
 */

const DEFAULT_HYPERPARAMS = {
  inputWindow: 18, // steps (3 hours at 10-min resolution)
  predictionHorizon: 12, // steps (2 hours at 10-min resolution)
  latentDim: 128,
  numHeads: 4,
  numLayers: 3,
  ffnExpansion: 4,
  learningRate: 1e-4,
};

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

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

function randomVector(dim, rng, scale = 0.02) {
  return Array.from({ length: dim }, () => (rng() * 2 - 1) * scale);
}

/**
 * GELU activation approximation.
 */
function gelu(x) {
  return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
}

/**
 * Softmax over an array.
 */
function softmax(arr) {
  const maxVal = Math.max(...arr);
  const exps = arr.map((x) => Math.exp(x - maxVal));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sumExp);
}

/**
 * Matrix-vector multiply: result[i] = sum_j(matrix[i][j] * vec[j])
 */
function matVecMul(matrix, vec) {
  return matrix.map((row) =>
    row.reduce((sum, val, j) => sum + val * vec[j], 0),
  );
}

/**
 * Layer normalization over a vector.
 */
function layerNorm(vec) {
  const mean = vec.reduce((a, b) => a + b, 0) / vec.length;
  const variance =
    vec.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / vec.length;
  const std = Math.sqrt(variance + 1e-5);
  return vec.map((x) => (x - mean) / std);
}

export class TransformerQueueForecaster {
  constructor(params = {}) {
    this.params = { ...DEFAULT_HYPERPARAMS, ...params };
    this.weights = null;
    this.initialized = false;
    this.numTokens = 0;
  }

  /**
   * Initialize all transformer weights for the given number of zones.
   */
  initialize(numZones) {
    const rng = seededRandom(7);
    const { latentDim, numHeads, numLayers, ffnExpansion } = this.params;
    const headDim = Math.floor(latentDim / numHeads);

    // Number of tokens = zones + 1 global token
    this.numTokens = numZones + 1;

    // Input projection: 7 features per zone → latentDim
    const inputFeatures = 7;
    this.weights = {
      inputProjection: xavierInit(latentDim, inputFeatures, rng),
      inputBias: randomVector(latentDim, rng),
      globalToken: randomVector(latentDim, rng),
      dayEmbedding: xavierInit(7, latentDim, rng), // 7 days
      hourEmbedding: xavierInit(24, latentDim, rng), // 24 hours
      layers: [],
      outputProjection: xavierInit(2, latentDim, rng), // queue pressure + occupancy
      outputBias: randomVector(2, rng),
    };

    // Transformer encoder layers
    for (let l = 0; l < numLayers; l++) {
      this.weights.layers.push({
        Wq: xavierInit(latentDim, latentDim, rng),
        Wk: xavierInit(latentDim, latentDim, rng),
        Wv: xavierInit(latentDim, latentDim, rng),
        Wo: xavierInit(latentDim, latentDim, rng),
        ffnW1: xavierInit(latentDim * ffnExpansion, latentDim, rng),
        ffnB1: randomVector(latentDim * ffnExpansion, rng),
        ffnW2: xavierInit(latentDim, latentDim * ffnExpansion, rng),
        ffnB2: randomVector(latentDim, rng),
      });
    }

    this.initialized = true;
  }

  /**
   * Self-attention over token embeddings.
   */
  selfAttention(tokens, layerWeights) {
    const { latentDim, numHeads } = this.params;
    const headDim = Math.floor(latentDim / numHeads);
    const numTokens = tokens.length;

    // Compute Q, K, V for all tokens
    const queries = tokens.map((t) => matVecMul(layerWeights.Wq, t));
    const keys = tokens.map((t) => matVecMul(layerWeights.Wk, t));
    const values = tokens.map((t) => matVecMul(layerWeights.Wv, t));

    // Multi-head attention (simplified: single effective head for perf)
    const scale = Math.sqrt(latentDim);
    const outputs = [];

    for (let i = 0; i < numTokens; i++) {
      // Compute attention scores for token i
      const scores = [];
      for (let j = 0; j < numTokens; j++) {
        let dot = 0;
        for (let d = 0; d < latentDim; d++) {
          dot += queries[i][d] * keys[j][d];
        }
        scores.push(dot / scale);
      }

      const attnWeights = softmax(scores);

      // Weighted sum of values
      const attended = new Array(latentDim).fill(0);
      for (let j = 0; j < numTokens; j++) {
        for (let d = 0; d < latentDim; d++) {
          attended[d] += attnWeights[j] * values[j][d];
        }
      }

      // Output projection
      const projected = matVecMul(layerWeights.Wo, attended);
      outputs.push(projected);
    }

    return outputs;
  }

  /**
   * Feed-forward network (FFN) block.
   */
  feedForward(token, layerWeights) {
    const { latentDim, ffnExpansion } = this.params;
    const expanded = matVecMul(layerWeights.ffnW1, token).map(
      (v, i) => gelu(v + layerWeights.ffnB1[i]),
    );
    const projected = matVecMul(layerWeights.ffnW2, expanded).map(
      (v, i) => v + layerWeights.ffnB2[i],
    );
    return projected;
  }

  /**
   * Full transformer encoder forward pass.
   */
  encoderForward(tokens) {
    let current = tokens;

    for (const layerWeights of this.weights.layers) {
      // Layer norm + self-attention + residual
      const normed = current.map((t) => layerNorm(t));
      const attended = this.selfAttention(normed, layerWeights);
      current = current.map((t, i) =>
        t.map((v, d) => v + attended[i][d]),
      );

      // Layer norm + FFN + residual
      const normed2 = current.map((t) => layerNorm(t));
      const ffnOut = normed2.map((t) => this.feedForward(t, layerWeights));
      current = current.map((t, i) =>
        t.map((v, d) => v + ffnOut[i][d]),
      );
    }

    return current;
  }

  /**
   * Build zone feature vector (7 features per zone).
   */
  buildZoneFeatures(zone, snapshot) {
    const incoming = snapshot.passengerFlows
      .filter((f) => f.toZoneId === zone.zoneId)
      .reduce((sum, f) => sum + f.estimatedCount, 0);
    const outbound = snapshot.passengerFlows
      .filter((f) => f.fromZoneId === zone.zoneId)
      .reduce((sum, f) => sum + f.estimatedCount, 0);

    return [
      zone.occupancy / (zone.capacity || 1), // occupancy ratio
      incoming / 100, // normalized incoming
      outbound / 100, // normalized outbound
      zone.serviceRatePerMinute / 10, // normalized service rate
      zone.confidence.score, // confidence
      zone.capacity / 500, // normalized capacity
      (zone.occupancy - outbound + incoming) / (zone.capacity || 1), // net flow pressure
    ];
  }

  /**
   * Generate forecast from operational snapshot.
   */
  forecast(snapshot, request = {}) {
    const horizon = request.horizonMinutes ?? 120;
    const resolution = request.resolutionMinutes ?? 15;
    const refreshCadenceSeconds = request.refreshCadenceSeconds ?? 60;
    const numZones = snapshot.zones.length;

    if (!this.initialized || numZones + 1 !== this.numTokens) {
      this.initialize(numZones);
    }

    const { latentDim } = this.params;

    // Build zone tokens: project features to latent dim
    const zoneTokens = snapshot.zones.map((zone) => {
      const features = this.buildZoneFeatures(zone, snapshot);
      const projected = matVecMul(this.weights.inputProjection, features);
      return projected.map((v, i) => v + this.weights.inputBias[i]);
    });

    // Prepend global token
    const globalToken = [...this.weights.globalToken];
    const tokens = [globalToken, ...zoneTokens];

    // Add temporal embeddings
    const now = new Date(snapshot.asOf);
    const dayIdx = now.getDay();
    const hourIdx = now.getHours();
    const dayEmb = this.weights.dayEmbedding[dayIdx] || randomVector(latentDim, seededRandom(dayIdx));
    const hourEmb = this.weights.hourEmbedding[hourIdx] || randomVector(latentDim, seededRandom(hourIdx));

    const tokensWithTime = tokens.map((t) =>
      t.map((v, d) => v + (dayEmb[d] || 0) + (hourEmb[d] || 0)),
    );

    // Transformer encoder forward
    const encoderOutput = this.encoderForward(tokensWithTime);

    // Extract global token output + pool facility tokens
    const globalOut = encoderOutput[0];
    const facilityTokens = encoderOutput.slice(1);

    // Average pool
    const avgPool = new Array(latentDim).fill(0);
    for (const ft of facilityTokens) {
      for (let d = 0; d < latentDim; d++) {
        avgPool[d] += ft[d] / facilityTokens.length;
      }
    }

    // Max pool
    const maxPool = new Array(latentDim).fill(-Infinity);
    for (const ft of facilityTokens) {
      for (let d = 0; d < latentDim; d++) {
        if (ft[d] > maxPool[d]) maxPool[d] = ft[d];
      }
    }

    // Generate forecast points using per-zone predictions from encoder output
    const stepsAhead = Math.floor(horizon / resolution) + 1;
    const points = [];

    for (let step = 0; step < stepsAhead; step++) {
      const minute = step * resolution;
      const zones = snapshot.zones.map((zone, i) => {
        const zoneEncoding = facilityTokens[i];
        // Project to output (queue pressure, occupancy ratio)
        const output = matVecMul(this.weights.outputProjection, zoneEncoding);

        // Scale prediction by time step (further = more uncertain)
        const timeFactor = step === 0 ? 0 : step / stepsAhead;
        const predictedRatio = Math.max(
          0,
          Math.min(2, (zone.occupancy / zone.capacity) + output[0] * timeFactor),
        );
        const predicted = Math.round(predictedRatio * zone.capacity);

        return {
          zoneId: zone.zoneId,
          expectedOccupancy: predicted,
          queuePressure: Number(predictedRatio.toFixed(2)),
          staffingDemand: Math.max(
            1,
            Math.ceil(predicted / Math.max(zone.serviceRatePerMinute * 20, 1)),
          ),
          status:
            predictedRatio >= 0.9
              ? "critical"
              : predictedRatio >= 0.72
                ? "watch"
                : "normal",
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
        score: Number((minConfidence * 0.90).toFixed(2)),
        basis: "Transformer facility self-attention model (random weights)",
      },
      assumptions: [
        { label: "Inter-zone correlations captured via self-attention" },
        { label: "Model uses random weights — predictions are structural, not trained" },
      ],
      modelType: "transformer-queue",
    };
  }
}

export const transformerForecaster = new TransformerQueueForecaster();
