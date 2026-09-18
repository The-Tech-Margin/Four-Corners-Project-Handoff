/**
 * IP classification for the outbound fetch guard. Anything that is not a
 * routable public address is refused, which is what stops a link preview
 * from reaching localhost, a private network or a cloud metadata service.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/** Reserved, private, loopback, link-local, carrier-grade NAT and multicast. */
const IPV4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** True when the address must not be fetched from the server. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.trim().toLowerCase();
  if (!ip) return true;

  // An IPv4-mapped IPv6 address is an IPv4 address wearing a hat.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);

  const v4 = ipv4ToInt(ip);
  if (v4 !== null) {
    return IPV4_BLOCKS.some(([base, bits]) => {
      const baseInt = ipv4ToInt(base);
      if (baseInt === null) return false;
      const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
      return ((v4 & mask) >>> 0) === ((baseInt & mask) >>> 0);
    });
  }

  if (!ip.includes(":")) return true; // not an address we can classify

  if (ip === "::" || ip === "::1") return true;
  const head = ip.split(":")[0];
  // fc00::/7 unique local, fe80::/10 link local, ff00::/8 multicast
  if (/^f[cd]/.test(head)) return true;
  if (/^fe[89ab]/.test(head)) return true;
  if (/^ff/.test(head)) return true;
  return false;
}
