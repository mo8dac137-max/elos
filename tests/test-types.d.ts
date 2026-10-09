declare module 'node:test' {
  export interface TestContext {
    diagnostic(message: string): void;
  }
  export function test(
    name: string,
    fn: (t: TestContext) => void | Promise<void>
  ): Promise<void> | void;
  export function describe(
    name: string,
    fn: () => void | Promise<void>
  ): Promise<void> | void;
  export function it(
    name: string,
    fn: (t: TestContext) => void | Promise<void>
  ): Promise<void> | void;
  export default test;
}

declare module 'node:assert' {
  interface Assert {
    (value: unknown, message?: string | Error): void;
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    ok(value: unknown, message?: string | Error): void;
    fail(message?: string | Error): never;
    throws(block: () => unknown, error?: unknown, message?: string | Error): void;
  }
  const assert: Assert;
  export = assert;
}

declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: string): string;
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:process' {
  const process: {
    cwd(): string;
  };
  export default process;
}
