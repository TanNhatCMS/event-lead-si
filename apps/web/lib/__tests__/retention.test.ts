import { describe, expect, it } from 'vitest';

import { isRetentionExpired, retentionCutoff } from '../contacts/retention';
import { normalizeContactSettings } from '../contacts/settings';

/**
 * Test FR-024 retention — phần thuần: tính mốc thời gian cắt, so sánh hết
 * hạn, và parse retention_days từ `agent_config.settings`. Không gọi DB.
 */

describe('retentionCutoff', () => {
  it('trừ đúng 30 ngày, giữ nguyên giờ:phút:giây', () => {
    const now = new Date('2026-10-31T12:34:56.789Z');
    expect(retentionCutoff(now, 30).toISOString()).toBe('2026-10-01T12:34:56.789Z');
  });

  it('1 ngày lùi đúng về hôm trước', () => {
    const now = new Date('2026-03-15T08:30:45.123Z');
    expect(retentionCutoff(now, 1).toISOString()).toBe('2026-03-14T08:30:45.123Z');
  });

  it('365 ngày lùi qua năm trước', () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    expect(retentionCutoff(now, 365).toISOString()).toBe('2025-06-15T00:00:00.000Z');
  });

  it('days = 0 → trùng now (không đổi)', () => {
    const now = new Date('2026-10-31T00:00:00.000Z');
    expect(retentionCutoff(now, 0).getTime()).toBe(now.getTime());
  });
});

describe('isRetentionExpired', () => {
  const cutoff = new Date('2026-10-01T00:00:00.000Z');

  it('archived_at trước cutoff → hết hạn', () => {
    expect(isRetentionExpired('2026-07-01T00:00:00.000Z', cutoff)).toBe(true);
    expect(isRetentionExpired('2026-09-30T23:59:59.999Z', cutoff)).toBe(true);
  });

  it('archived_at sau cutoff → chưa hết hạn', () => {
    expect(isRetentionExpired('2026-10-30T00:00:00.000Z', cutoff)).toBe(false);
  });

  it('đúng bằng cutoff → CHƯA xóa (chỉ xóa cái cũ hơn mốc)', () => {
    expect(isRetentionExpired('2026-10-01T00:00:00.000Z', cutoff)).toBe(false);
  });

  it('archived_at null/rỗng/không parse được → false (an toàn mặc định)', () => {
    expect(isRetentionExpired(null, cutoff)).toBe(false);
    expect(isRetentionExpired(undefined, cutoff)).toBe(false);
    expect(isRetentionExpired('', cutoff)).toBe(false);
    expect(isRetentionExpired('khong-phai-ngay', cutoff)).toBe(false);
  });

  it('nhận trực tiếp Date', () => {
    expect(isRetentionExpired(new Date('2026-08-01T00:00:00.000Z'), cutoff)).toBe(true);
    expect(isRetentionExpired(new Date('2026-12-01T00:00:00.000Z'), cutoff)).toBe(false);
  });
});

describe('normalizeContactSettings — retention_days', () => {
  it('settings trống/không hợp lệ → null (không tự dọn)', () => {
    expect(normalizeContactSettings(undefined).retention_days).toBeNull();
    expect(normalizeContactSettings(null).retention_days).toBeNull();
    expect(normalizeContactSettings('khong-phai-object').retention_days).toBeNull();
    expect(normalizeContactSettings({}).retention_days).toBeNull();
  });

  it('số ngày hợp lệ được giữ nguyên', () => {
    expect(normalizeContactSettings({ retention_days: 90 }).retention_days).toBe(90);
    expect(normalizeContactSettings({ retention_days: 3650 }).retention_days).toBe(3650);
  });

  it('giá trị sai kiểu/ngoài khoảng → null', () => {
    expect(normalizeContactSettings({ retention_days: 0 }).retention_days).toBeNull();
    expect(normalizeContactSettings({ retention_days: -5 }).retention_days).toBeNull();
    expect(normalizeContactSettings({ retention_days: 1.5 }).retention_days).toBeNull();
    expect(normalizeContactSettings({ retention_days: 4000 }).retention_days).toBeNull();
    expect(normalizeContactSettings({ retention_days: '30' }).retention_days).toBeNull();
    expect(normalizeContactSettings({ retention_days: null }).retention_days).toBeNull();
  });
});
