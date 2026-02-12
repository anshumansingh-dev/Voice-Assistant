export interface VADConfig {
  confidence: number;   // Silero probability threshold
  startFrames: number;  // frames required before speech start
  stopFrames: number;   // frames required before speech stop
}

export const defaultVADConfig: VADConfig = {
  confidence: 0.5,
  startFrames: 3,   // 3 x 20ms = 60ms
  stopFrames: 15    // 15 x 20ms = 300ms
};
