export function gainTestContext() {
  const param = () => ({ value: 0 });
  const node = () => ({ connect: jest.fn(), disconnect: jest.fn() });
  return {
    state: "running", currentTime: 0, sampleRate: 8000, destination: {},
    resume: jest.fn(() => Promise.resolve()),
    createMediaElementSource: jest.fn(() => node()),
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createBiquadFilter: () => ({ ...node(), gain: param(), frequency: param(), Q: param() }),
    createConvolver: node,
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(),
      ratio: param(), attack: param(), release: param() }),
    createAnalyser: node,
    createBuffer: (_channels, size) => ({ getChannelData: () => new Float32Array(size) }),
  };
}
