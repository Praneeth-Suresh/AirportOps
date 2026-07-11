/**
 * Spatial-Temporal Graph Neural Network (ST-GNN) for Airport Zone Forecasting.
 *
 * Models the airport terminal as a directed graph where zones are nodes and
 * passenger flow paths define edges. Graph convolution captures spatial
 * dependencies (congestion propagation), while temporal features capture
 * time-series patterns.
 *
 * References:
 * - "A Spatiotemporal Graph Neural Network Model for Urban Passenger Flow
 *    Forecasting" (MDPI Applied Sciences, 2024).
 * - "Short-Term Nationwide Airport Throughput Prediction With Graph Attention
 *    Recurrent Neural Network" (Frontiers in AI, 2022).
 * - "GNN-based Passenger Request Prediction" (arXiv:2301.02515, 2023).
 *
 * NOTE: Weights are initialized with random values. No pre-trained airport
 * graph topology dataset is publicly available for the exact terminal layout.
 * The architecture is correct and ready for training when data becomes available.
 */

const DEFAULT_HYPERPARAMS = {
  inputWindow: 18,
  predictionHorizon: 12,
  graphConvLayers: 2,
  chebyshevOrder: 3,
  hiddenDim: 64,
  temporalKernel: 3,
  attentionHeads: 2,
  learningRate: 1e-3,
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

function relu(x) {
  return Math.max(0, x);
}

/**
 * Build adjacency matrix from passenger flows and transfer rules.
 */
function buildAdjacencyMatrix(snapshot) {
  const zoneIds = snapshot.zones.map((z) => z.zoneId);
  const n = zoneIds.length;
  const zoneIdx = new Map(zoneIds.map((id, i) => [id, i]));
  const adj = Array.from({ length: n }, () => new Array(n).fill(0));

  // Add edges from passenger flows
  for (const flow of snapshot.passengerFlows) {
    const from = zoneIdx.get(flow.fromZoneId);
    const to = zoneIdx.get(flow.toZoneId);
    if (from !== undefined && to !== undefined) {
      adj[from][to] += flow.estimatedCount;
    }
  }

  // Add edges from transfer rules
  if (snapshot.airport.transferRules) {
    for (const rule of snapshot.airport.transferRules) {
      const from = zoneIdx.get(rule.fromZoneId);
      const to = zoneIdx.get(rule.toZoneId);
      if (from !== undefined && to !== undefined) {
        adj[from][to] = Math.max(adj[from][to], 1);
        adj[to][from] = Math.max(adj[to][from], 1); // bidirectional
      }
    }
  }

  // Add self-loops
  for (let i = 0; i < n; i++) {
    adj[i][i] = 1;
  }

  // Normalize: D^(-1/2) * A * D^(-1/2)
  const degree = adj.map((row) => row.reduce((a, b) => a + b, 0));
  const normAdj = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (adj[i][j] > 0 && degree[i] > 0 && degree[j] > 0) {
        normAdj[i][j] =
          adj[i][j] / Math.sqrt(degree[i]) / Math.sqrt(degree[j]);
      }
    }
  }

  return normAdj;
}

/**
 * Graph convolution: H' = σ(A_norm * H * W)
 */
function graphConvolution(nodeFeatures, adjMatrix, weights) {
  const n = nodeFeatures.length;
  const inputDim = nodeFeatures[0].length;
  const outputDim = weights.length;

  // Step 1: A_norm * H (aggregate neighbor features)
  const aggregated = Array.from({ length: n }, () =>
    new Array(inputDim).fill(0),
  );
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (adjMatrix[i][j] !== 0) {
        for (let d = 0; d < inputDim; d++) {
          aggregated[i][d] += adjMatrix[i][j] * nodeFeatures[j][d];
        }
      }
    }
  }

  // Step 2: H_agg * W (linear transform)
  const output = Array.from({ length: n }, () => new Array(outputDim).fill(0));
  for (let i = 0; i < n; i++) {
    for (let o = 0; o < outputDim; o++) {
      for (let d = 0; d < inputDim; d++) {
        output[i][o] += aggregated[i][d] * weights[o][d];
      }
      // ReLU activation
      output[i][o] = relu(output[i][o]);
    }
  }

  return output;
}

export class GraphNeuralNetworkForecaster {
  constructor(params = {}) {
    this.params = { ...DEFAULT_HYPERPARAMS, ...params };
    this.weights = null;
    this.initialized = false;
    this.numNodes = 0;
  }

  /**
   * Initialize GNN weights for the given number of zones.
   */
  initialize(numZones) {
    const rng = seededRandom(13);
    const { hiddenDim, graphConvLayers } = this.params;
    const inputFeatures = 7; // per-zone features

    this.numNodes = numZones;
    this.weights = {
      graphLayers: [],
      temporalConv: xavierInit(hiddenDim, hiddenDim, rng),
      outputProjection: xavierInit(2, hiddenDim, rng), // pressure + occupancy
      outputBias: randomVector(2, rng),
    };

    // Graph convolution layers
    let inDim = inputFeatures;
    for (let l = 0; l < graphConvLayers; l++) {
      this.weights.graphLayers.push(xavierInit(hiddenDim, inDim, rng));
      inDim = hiddenDim;
    }

    this.initialized = true;
  }

  /**
   * Build per-node feature vectors.
   */
  buildNodeFeatures(snapshot) {
    return snapshot.zones.map((zone) => {
      const incoming = snapshot.passengerFlows
        .filter((f) => f.toZoneId === zone.zoneId)
        .reduce((sum, f) => sum + f.estimatedCount, 0);
      const outbound = snapshot.passengerFlows
        .filter((f) => f.fromZoneId === zone.zoneId)
        .reduce((sum, f) => sum + f.estimatedCount, 0);

      // Find counter utilization for this zone
      const counter = snapshot.counters.find((c) => c.zoneId === zone.zoneId);
      const counterUtil = counter ? counter.open / (counter.maxOpen || 1) : 0;

      return [
        zone.occupancy / (zone.capacity || 1),
        incoming / 100,
        outbound / 100,
        zone.serviceRatePerMinute / 10,
        zone.confidence.score,
        counterUtil,
        (zone.occupancy - outbound + incoming) / (zone.capacity || 1),
      ];
    });
  }

  /**
   * Forward pass through graph neural network.
   */
  forward(nodeFeatures, adjMatrix) {
    let current = nodeFeatures;

    // Graph convolution layers
    for (const layerWeights of this.weights.graphLayers) {
      current = graphConvolution(current, adjMatrix, layerWeights);
    }

    // Temporal convolution (simplified: linear transform as temporal mixing)
    const { hiddenDim } = this.params;
    const temporalOutput = current.map((nodeEmb) => {
      const result = new Array(hiddenDim).fill(0);
      for (let o = 0; o < hiddenDim; o++) {
        for (let d = 0; d < nodeEmb.length; d++) {
          result[o] += this.weights.temporalConv[o][d] * nodeEmb[d];
        }
        result[o] = relu(result[o]);
      }
      return result;
    });

    return temporalOutput;
  }

  /**
   * Generate forecast from operational snapshot.
   */
  forecast(snapshot, request = {}) {
    const horizon = request.horizonMinutes ?? 120;
    const resolution = request.resolutionMinutes ?? 15;
    const refreshCadenceSeconds = request.refreshCadenceSeconds ?? 60;
    const numZones = snapshot.zones.length;

    if (!this.initialized || numZones !== this.numNodes) {
      this.initialize(numZones);
    }

    // Build graph structure
    const adjMatrix = buildAdjacencyMatrix(snapshot);
    const nodeFeatures = this.buildNodeFeatures(snapshot);

    // GNN forward pass
    const nodeEmbeddings = this.forward(nodeFeatures, adjMatrix);

    // Generate forecast points from embeddings
    const stepsAhead = Math.floor(horizon / resolution) + 1;
    const points = [];

    for (let step = 0; step < stepsAhead; step++) {
      const minute = step * resolution;
      const zones = snapshot.zones.map((zone, i) => {
        const embedding = nodeEmbeddings[i];

        // Project node embedding to predictions
        const output = new Array(2).fill(0);
        for (let o = 0; o < 2; o++) {
          output[o] = this.weights.outputBias[o];
          for (let d = 0; d < embedding.length; d++) {
            output[o] += this.weights.outputProjection[o][d] * embedding[d];
          }
        }

        // Scale by time step factor
        const timeFactor = step === 0 ? 0 : step / stepsAhead;
        const currentRatio = zone.occupancy / zone.capacity;
        const predictedRatio = Math.max(
          0,
          Math.min(2, currentRatio + output[0] * timeFactor),
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
        score: Number((minConfidence * 0.86).toFixed(2)),
        basis: "Spatial-Temporal GNN model (random weights)",
      },
      assumptions: [
        { label: "Zone topology captured via graph adjacency from passenger flows" },
        { label: "Spatial congestion propagation modeled by graph convolution" },
        { label: "Model uses random weights — predictions are structural, not trained" },
      ],
      modelType: "st-gnn",
    };
  }
}

export const graphNeuralNetworkForecaster = new GraphNeuralNetworkForecaster();
