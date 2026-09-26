import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ALARM_LEVELS,
  DEVICE_STATUSES,
  METRIC_POINTS,
  sampleData,
  type Alarm,
  type Device,
  type DeviceSettings,
  type Metric,
} from "../index.js";

const { devices, deviceSettings, metrics, alarms } = sampleData;
const deviceIds = new Set(devices.map((d) => d.id));
const isIsoUtc = (s: string): boolean => new Date(s).toISOString() === s;

describe("sample data types", () => {
  it("is typed as the domain model", () => {
    expectTypeOf(devices).toEqualTypeOf<Device[]>();
    expectTypeOf(deviceSettings).toEqualTypeOf<DeviceSettings[]>();
    expectTypeOf(metrics).toEqualTypeOf<Metric[]>();
    expectTypeOf(alarms).toEqualTypeOf<Alarm[]>();
  });
});

describe("devices", () => {
  it("has about 5 devices with unique ids", () => {
    expect(devices).toHaveLength(5);
    expect(deviceIds.size).toBe(devices.length);
  });

  it("covers every status", () => {
    expect(new Set(devices.map((d) => d.status))).toEqual(new Set(DEVICE_STATUSES));
  });
});

describe("deviceSettings", () => {
  it("has exactly one entry per device", () => {
    expect(deviceSettings.map((s) => s.deviceId).sort()).toEqual([...deviceIds].sort());
  });

  it("has sane values", () => {
    for (const s of deviceSettings) {
      expect(s.pollingIntervalSec).toBeGreaterThan(0);
      expect(s.thresholds.cpuMax).toBeLessThanOrEqual(100);
    }
  });
});

describe("metrics", () => {
  it("references existing devices with ISO timestamps", () => {
    for (const m of metrics) {
      expect(deviceIds.has(m.deviceId)).toBe(true);
      expect(isIsoUtc(m.timestamp)).toBe(true);
      expect(m.cpu).toBeGreaterThanOrEqual(0);
      expect(m.cpu).toBeLessThanOrEqual(100);
    }
  });

  it("has dozens of points for online devices and fewer for offline ones", () => {
    for (const d of devices) {
      const count = metrics.filter((m) => m.deviceId === d.id).length;
      if (d.status === "offline") expect(count).toBeLessThan(METRIC_POINTS);
      else expect(count).toBe(METRIC_POINTS);
    }
  });

  it("is sorted by timestamp per device", () => {
    for (const id of deviceIds) {
      const ts = metrics.filter((m) => m.deviceId === id).map((m) => m.timestamp);
      expect(ts).toEqual([...ts].sort());
    }
  });
});

describe("alarms", () => {
  it("has about 10 alarms with unique ids referencing existing devices", () => {
    expect(alarms).toHaveLength(10);
    expect(new Set(alarms.map((a) => a.id)).size).toBe(alarms.length);
    for (const a of alarms) {
      expect(deviceIds.has(a.deviceId)).toBe(true);
      expect(isIsoUtc(a.occurredAt)).toBe(true);
    }
  });

  it("covers every level and both acknowledged states", () => {
    expect(new Set(alarms.map((a) => a.level))).toEqual(new Set(ALARM_LEVELS));
    expect(new Set(alarms.map((a) => a.acknowledged))).toEqual(new Set([true, false]));
  });
});
