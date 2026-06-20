export class FakeHarnessRunner {
  public calls: Array<{ prompt: string }> = [];

  public constructor(private readonly result: { exitCode: number }) {}

  public async execute(input: { prompt: string }) {
    this.calls.push({ prompt: input.prompt });
    return {
      exitCode: this.result.exitCode,
      stdout: this.result.exitCode === 0 ? "ok" : "",
      stderr: this.result.exitCode === 0 ? "" : "failed"
    };
  }
}
