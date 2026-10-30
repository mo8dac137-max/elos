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
    match(value: string, regExp: RegExp, message?: string | Error): void;
  }
  const assert: Assert;
  export = assert;
}

declare module 'node:fs' {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readdirSync(path: string, options?: { withFileTypes?: boolean }): (string | Dirent)[];
  export function readFileSync(path: string, encoding: string): string;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: string | Uint8Array, encoding?: string): void;
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function relative(from: string, to: string): string;
  export const sep: string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:process' {
  interface Process {
    cwd(): string;
    exit(code?: number): never;
  }
  const process: Process;
  export default process;
}

declare module 'node:crypto' {
  interface Hash {
    update(data: string | Uint8Array, encoding?: string): void;
    digest(encoding?: string): string;
  }
  export function createHash(algorithm: string): Hash;
}
