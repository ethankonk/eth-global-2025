export function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce(
        (acc, k) => {
          acc[k] = canonicalize(value[k]);
          return acc;
        },
        {} as Record<string, any>,
      );
  }
  return value;
}

export function toCanonicalJson(obj: any): string {
  return JSON.stringify(canonicalize(obj));
}
