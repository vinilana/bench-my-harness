export class FakeArtifactCollector {
  public calls: unknown[] = [];

  public async collect(input: unknown) {
    this.calls.push(input);
    return [];
  }
}
