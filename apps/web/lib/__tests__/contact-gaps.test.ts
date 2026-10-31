import { describe, expect, it } from 'vitest';

import {
  computeContactGaps,
  hasFieldValue,
  UNVERIFIED_EVIDENCE_STATES,
  type EvidenceVerificationRow,
} from '../contacts/contact-gaps';
import { defaultContactSettings } from '../contacts/settings';

/**
 * Test FR-011/012 khoảng trống bằng chứng — phần thuần: liệt kê trường còn
 * thiếu, chọn evidence mới nhất theo field. Không gọi DB.
 */

const FULL_CONTACT = {
  email: 'a@x.com',
  phone: '0901234567',
  address: 'Q1, TP.HCM',
  website: 'x.com',
  job_title: 'CEO',
  company_name: 'Công ty X',
};

describe('hasFieldValue', () => {
  it('null / undefined / chuỗi rỗng / chỉ khoảng trắng → chưa có giá trị', () => {
    expect(hasFieldValue(null)).toBe(false);
    expect(hasFieldValue(undefined)).toBe(false);
    expect(hasFieldValue('')).toBe(false);
    expect(hasFieldValue('   ')).toBe(false);
  });

  it('chuỗi có nội dung → có giá trị', () => {
    expect(hasFieldValue('a@x.com')).toBe(true);
    expect(hasFieldValue(' x ')).toBe(true);
  });
});

describe('computeContactGaps — missing_fields', () => {
  it('đủ mọi trường → không missing', () => {
    expect(computeContactGaps(FULL_CONTACT, []).missing_fields).toEqual([]);
  });

  it('thiếu/null/chuỗi trắng → nằm trong missing, đúng thứ tự tracked fields', () => {
    const gaps = computeContactGaps({ email: '', phone: null, address: '   ' }, []);
    expect(gaps.missing_fields).toEqual([
      'email',
      'phone',
      'address',
      'website',
      'job_title',
      'company_name',
    ]);
  });

  it('chỉ thiếu một trường', () => {
    const gaps = computeContactGaps({ ...FULL_CONTACT, company_name: null }, []);
    expect(gaps.missing_fields).toEqual(['company_name']);
  });

  it('object rỗng → thiếu toàn bộ 6 trường', () => {
    const gaps = computeContactGaps({}, []);
    expect(gaps.missing_fields).toEqual([
      'email',
      'phone',
      'address',
      'website',
      'job_title',
      'company_name',
    ]);
  });
});

describe('computeContactGaps — unverified_fields', () => {
  it('state unreviewed / uncertain / inferred → unverified', () => {
    const evidence: EvidenceVerificationRow[] = [
      { field_name: 'email', verification_state: 'unreviewed' },
      { field_name: 'phone', verification_state: 'uncertain' },
      { field_name: 'address', verification_state: 'inferred' },
    ];
    expect(computeContactGaps(FULL_CONTACT, evidence).unverified_fields).toEqual(evidence);
  });

  it('user_confirmed / source_verified / unavailable → bỏ qua', () => {
    const evidence: EvidenceVerificationRow[] = [
      { field_name: 'email', verification_state: 'user_confirmed' },
      { field_name: 'phone', verification_state: 'source_verified' },
      { field_name: 'address', verification_state: 'unavailable' },
    ];
    expect(computeContactGaps(FULL_CONTACT, evidence).unverified_fields).toEqual([]);
  });

  it('mỗi field lấy state của evidence MỚI NHẤT (input sắp mới nhất trước)', () => {
    const evidence: EvidenceVerificationRow[] = [
      // email: mới nhất đã confirm → bỏ qua state cũ hơn
      { field_name: 'email', verification_state: 'user_confirmed' },
      { field_name: 'email', verification_state: 'unreviewed' },
      // phone: mới nhất là uncertain → tính là unverified
      { field_name: 'phone', verification_state: 'uncertain' },
      { field_name: 'phone', verification_state: 'source_verified' },
    ];
    expect(computeContactGaps(FULL_CONTACT, evidence).unverified_fields).toEqual([
      { field_name: 'phone', verification_state: 'uncertain' },
    ]);
  });

  it('trùng field_name nhiều dòng → chỉ giữ một kết quả', () => {
    const evidence: EvidenceVerificationRow[] = [
      { field_name: 'job_title', verification_state: 'unreviewed' },
      { field_name: 'job_title', verification_state: 'unreviewed' },
    ];
    expect(computeContactGaps(FULL_CONTACT, evidence).unverified_fields).toEqual([
      { field_name: 'job_title', verification_state: 'unreviewed' },
    ]);
  });

  it('evidence cho field ngoài danh sách tracked vẫn được báo unverified', () => {
    const evidence: EvidenceVerificationRow[] = [
      { field_name: 'preferred_language', verification_state: 'unreviewed' },
    ];
    expect(computeContactGaps(FULL_CONTACT, evidence).unverified_fields).toEqual([
      { field_name: 'preferred_language', verification_state: 'unreviewed' },
    ]);
  });

  it('dòng evidence lỗi hình (field_name rỗng) bị bỏ qua', () => {
    const evidence: EvidenceVerificationRow[] = [
      { field_name: '', verification_state: 'uncertain' },
    ];
    expect(computeContactGaps(FULL_CONTACT, evidence).unverified_fields).toEqual([]);
  });
});

describe('computeContactGaps — shape tổng', () => {
  it('missing và unverified độc lập, cùng tồn tại trong một kết quả', () => {
    const gaps = computeContactGaps(
      { email: 'a@x.com' },
      [{ field_name: 'phone', verification_state: 'uncertain' }],
    );
    expect(gaps).toEqual({
      missing_fields: ['phone', 'address', 'website', 'job_title', 'company_name'],
      unverified_fields: [{ field_name: 'phone', verification_state: 'uncertain' }],
    });
  });
});

describe('UNVERIFIED_EVIDENCE_STATES + settings mặc định (FR-014)', () => {
  it('3 state chưa xác thực', () => {
    expect(UNVERIFIED_EVIDENCE_STATES).toEqual(['unreviewed', 'uncertain', 'inferred']);
  });

  it('settings mặc định: 4 nhãn, 6 giai đoạn, retention tắt', () => {
    const settings = defaultContactSettings();
    expect(settings.labels).toEqual([
      'VIP',
      'Khách hàng tiềm năng',
      'Đối tác',
      'Cần theo dõi',
    ]);
    expect(settings.stages.map((s) => s.id)).toEqual([
      'new',
      'contacted',
      'meeting',
      'negotiating',
      'customer',
      'lost',
    ]);
    expect(settings.retention_days).toBeNull();
  });
});
