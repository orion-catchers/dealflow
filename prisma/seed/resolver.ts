export class SymbolResolver {
  private readonly map = new Map<string, string>();

  register(symbol: string, id: string): void {
    this.map.set(symbol, id);
  }

  resolve(symbol: string): string {
    const id = this.map.get(symbol);
    if (!id) {
      throw new Error(`Unknown symbol: ${symbol}`);
    }
    return id;
  }

  tryResolve(symbol: string): string | undefined {
    return this.map.get(symbol);
  }
}
