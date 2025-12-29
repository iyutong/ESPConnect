import type { Detector, DetectorContext } from '../types';
import { buildImprovPacket, findImprovPacket, ImprovPacket, packetDetails } from './improv-utils';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function waitForAscii(
  ctx: DetectorContext,
  re: RegExp,
  ms: number,
): Promise<RegExpMatchArray | null> {
  const deadline = ctx.now() + ms;
  while (ctx.now() < deadline) {
    const m = ctx.buffer.matchRegex(re, 4096);
    if (m) return m;
    await sleep(20);
  }
  return null;
}

async function waitForImprovPacket(ctx: DetectorContext, ms: number): Promise<ImprovPacket | null> {
  const deadline = ctx.now() + ms;
  while (ctx.now() < deadline) {
    const hit = findImprovPacket(ctx.buffer.snapshot(4096));
    if (hit?.packet) return hit.packet;
    await sleep(20);
  }
  return null;
}

function packetDetails(p: ImprovPacket): Record<string, string> | undefined {
  if (p.type === 0x01 && p.length === 1) {
    const state = p.data[0]!;
    const name = state === 0x02
      ? 'Ready (Authorized)'
      : state === 0x03
        ? 'Provisioning'
        : state === 0x04
          ? 'Provisioned'
          : 'Unknown';
    return { packet: 'Current State', state: `0x${state.toString(16).padStart(2, '0')}`, stateName: name };
  }
  if (p.type === 0x02 && p.length === 1) {
    const code = p.data[0]!;
    const name = code === 0x00
      ? 'No error'
      : code === 0x01
        ? 'Invalid RPC packet'
        : code === 0x02
          ? 'Unknown RPC command'
          : code === 0x03
            ? 'Unable to connect'
            : code === 0x05
              ? 'Bad Hostname'
              : code === 0xff
                ? 'Unknown Error'
                : 'Unknown';
    return { packet: 'Error State', error: `0x${code.toString(16).padStart(2, '0')}`, errorName: name };
  }
  return undefined;
}

export const improvSerialDetector: Detector = {
  id: 'improv-serial',
  name: 'Improv Serial',
  priority: 850,
  passive: ctx => {
    const hit = findImprovPacket(ctx.buffer.snapshot(4096));
    if (hit?.packet) {
      return {
        id: 'improv-serial',
        name: 'Improv Serial',
        confidence: hit.packet.hasLfTerminator ? 'high' : 'med',
        details: packetDetails(hit.packet),
      };
    }

    // Fallback: some firmwares may print "IMPROV" in a human-readable banner.
    if (hit?.maybe || ctx.buffer.includesAscii('IMPROV')) {
      return { id: 'improv-serial', name: 'Improv Serial', confidence: 'low' };
    }
    return null;
  },
  active: async ctx => {
    ctx.buffer.clear();

    // Official probe per https://www.improv-wifi.com/serial/:
    // Send "RPC Command: Request current state" and expect a valid Improv packet back.
    const requestCurrentState = buildImprovPacket(0x03, new Uint8Array([0x02, 0x00]));
    await ctx.io.write(requestCurrentState);

    const packet = await waitForImprovPacket(ctx, 250);
    if (packet) {
      return {
        id: 'improv-serial',
        name: 'Improv Serial',
        confidence: 'high',
        details: packetDetails(packet),
      };
    }

    // Best-effort fallback: some Improv-enabled firmwares print an "IMPROV" banner on demand.
    // Clear any echoed bytes from the probe to avoid banner false-positives.
    ctx.buffer.clear();
    await ctx.io.write(new Uint8Array([0x0d, 0x0a]));
    const banner = await waitForAscii(ctx, /IMPROV/i, 150);
    if (!banner) return null;

    return { id: 'improv-serial', name: 'Improv Serial', confidence: 'med' };
  },
};
