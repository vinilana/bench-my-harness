export class FakeHookInstaller {
  public installCalls: unknown[] = [];
  public uninstallCalls: unknown[] = [];

  public async install(input: unknown) {
    this.installCalls.push(input);
    return { id: "installation_1", files: [] };
  }

  public async uninstall(input: unknown) {
    this.uninstallCalls.push(input);
  }
}
