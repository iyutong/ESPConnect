import { describe, expect, it } from 'vitest';
import type { ESPLoader } from 'tasmota-webserial-esptool';
import { readEsp32P4Metadata } from '../src/services/chipMetadata/esp32p4';

describe('ESP32-P4 metadata', () => {
  it('reads the package and complete major/minor revision from eFuse word 2', async () => {
    const efuseWord2 = (5 << 20) | (1 << 23) | (1 << 4) | 3;
    const loader = {
      chipName: 'ESP32-P4',
      chipRevision: 503,
      readRegister: async () => efuseWord2,
    } as unknown as ESPLoader;

    const metadata = await readEsp32P4Metadata(loader);

    expect(metadata.pkgVersion).toBe(5);
    expect(metadata.majorVersion).toBe(5);
    expect(metadata.minorVersion).toBe(3);
    expect(metadata.description).toBe('unknown ESP32-P4 (revision v5.3)');
  });

  it('reports the P4 capability set without assigning it wireless features', async () => {
    const loader = {
      chipName: 'ESP32-P4',
      chipRevision: 0,
      readRegister: async () => 0,
    } as unknown as ESPLoader;

    const metadata = await readEsp32P4Metadata(loader);

    expect(metadata.features).toContain('MIPI CSI and MIPI DSI');
    expect(metadata.features).toContain('No integrated Wi-Fi or Bluetooth (external co-processor required)');
  });
});
