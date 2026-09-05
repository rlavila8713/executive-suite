import os from 'node:os';

/** Non-loopback IPv4 addresses on this machine (for mobile clients on the LAN). */
export function getLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const addrs: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        addrs.push(net.address);
      }
    }
  }
  return [...new Set(addrs)];
}
