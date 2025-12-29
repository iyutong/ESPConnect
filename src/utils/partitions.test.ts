import { describe, expect, it } from 'vitest';

import { detectFilesystemType, readPartitionTable } from './partitions';

const textEncoder = new TextEncoder();

function makePartitionEntry({
  type,
  subtype,
  offset,
  size,
  label,
}: {
  type: number;
  subtype: number;
  offset: number;
  size: number;
  label: string;
}) {
  const entry = new Uint8Array(32).fill(0xff);
  const view = new DataView(entry.buffer);
  view.setUint16(0, 0x50aa, true);
  view.setUint8(2, type);
  view.setUint8(3, subtype);
  view.setUint32(4, offset, true);
  view.setUint32(8, size, true);

  const labelBytes = textEncoder.encode(label);
  const labelLen = Math.min(labelBytes.length, 16);
  entry.set(labelBytes.subarray(0, labelLen), 12);
  if (labelLen < 16) {
    entry.fill(0x00, 12 + labelLen, 28);
  }

  return entry;
}

function makeTerminator() {
  const entry = new Uint8Array(32);
  const view = new DataView(entry.buffer);
  view.setUint16(0, 0xffff, true);
  return entry;
}

describe('partition utilities', () => {
  describe('detectFilesystemType', () => {
    it('defaults to SPIFFS when the read buffer is too small', async () => {
      const loader = {
        readFlash: async () => new Uint8Array(16),
      };
      expect(await detectFilesystemType(loader, 0x1000, 0x2000)).toBe('spiffs');
    });

    it('detects LittleFS when the magic string is present', async () => {
      const loader = {
        readFlash: async (_offset: number, length: number) => {
          const data = new Uint8Array(length);
          data.set(textEncoder.encode('hello littlefs world'));
          return data;
        },
      };
      expect(await detectFilesystemType(loader, 0x1000, 0x2000)).toBe('littlefs');
    });

    it('falls back to SPIFFS when readFlash throws', async () => {
      const loader = {
        readFlash: async () => {
          throw new Error('boom');
        },
      };
      expect(await detectFilesystemType(loader, 0x1000, 0x2000)).toBe('spiffs');
    });
  });

  describe('readPartitionTable', () => {
    function createPartitionTable(entries: Uint8Array[]) {
      const table = new Uint8Array(0x400).fill(0xff);
      let offset = 0;
      for (const entry of entries) {
        table.set(entry, offset);
        offset += 32;
      }
      return table;
    }

    it('parses entries and detects filesystem type for LittleFS partitions', async () => {
      const fsLabel = 'appfs';
      const entry = makePartitionEntry({ type: 0x01, subtype: 0x82, offset: 0x1000, size: 0x2000, label: fsLabel });
      const table = createPartitionTable([entry, makeTerminator()]);

      const littleFsContent = textEncoder.encode('greeting littlefs - test');
      const fsMap = new Map<number, Uint8Array>([
        [0x1000, littleFsContent],
      ]);

      const loader = {
        readFlash: async (offset: number, length: number) => {
          if (offset === 0x8000) return table.subarray(0, length);
          const stored = fsMap.get(offset);
          if (!stored) return new Uint8Array(length);
          const buffer = new Uint8Array(length);
          buffer.set(stored.subarray(0, Math.min(stored.length, length)));
          return buffer;
        },
      };

      const entries = await readPartitionTable(loader);
      expect(entries).toEqual([
        {
          label: fsLabel,
          type: 0x01,
          subtype: 0x82,
          offset: 0x1000,
          size: 0x2000,
          detectedFilesystem: 'littlefs',
        },
      ]);
    });

    it('returns an empty array when reading the table fails', async () => {
      const loader = {
        readFlash: async () => {
          throw new Error('fail');
        },
      };
      const entries = await readPartitionTable(loader);
      expect(entries).toEqual([]);
    });
  });
});
