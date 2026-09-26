declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: (string | null)[]): unknown;
      get(...params: string[]): Record<string, string | null> | undefined;
    };
  }
}
