declare function describe(
  name: string,
  fn: () => void | Promise<void>
): void;

declare function it(
  name: string,
  fn: () => void | Promise<void>
): void;

declare function beforeAll(
  fn: () => void | Promise<void>
): void;

declare function afterAll(
  fn: () => void | Promise<void>
): void;

type JestMatcher = {
  toBe(expected: unknown): void;
  toBeDefined(): void;
  toBeNull(): void;
  toHaveLength(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toThrow(message?: unknown): void;
  not: JestMatcher;
  rejects: {
    toThrow(message?: unknown): Promise<void>;
  };
};

declare function expect(value: unknown): JestMatcher;
