// jsdom に無い API を React Flow のために足す（React Flow の公式のテストの手順と同じ）。
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale !== undefined ? Number(scale) : 1;
  }
}
const g = globalThis as Record<string, unknown>;
g.ResizeObserver ??= ResizeObserverStub;
g.DOMMatrixReadOnly ??= DOMMatrixReadOnlyStub;
