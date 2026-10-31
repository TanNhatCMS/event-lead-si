import { describe, expect, it } from 'vitest';

import {
  computeMergePlan,
  findMergeReasons,
  levenshteinCapped,
  NAME_SIMILARITY_MAX_DISTANCE,
  namesSimilar,
  normalizeMergeEmail,
  normalizeMergeName,
  normalizeMergePhone,
  type MergeContactCore,
} from '../contacts/merge';

/**
 * Test gộp liên hệ trùng — phần thuần (lib/contacts/merge.ts): chuẩn hoá
 * tên/email/SĐT, Levenshtein giới hạn, lý do khớp và kế hoạch gộp trường.
 * Route chỉ việc ghi DB nên không cần mock Supabase ở đây.
 */

function contact(overrides: Partial<MergeContactCore> & { id: string }): MergeContactCore {
  return {
    full_name: '',
    job_title: null,
    email: null,
    phone: null,
    address: null,
    labels: [],
    company_id: null,
    ...overrides,
  };
}

describe('normalizeMergeName', () => {
  it('lowercase, bỏ dấu tiếng Việt, đ→d, bỏ ký tự không chữ/số', () => {
    expect(normalizeMergeName('Nguyễn Văn Ả')).toBe('nguyenvana');
    expect(normalizeMergeName('  Trần  Thị  B! ')).toBe('tranthib');
    expect(normalizeMergeName('Đỗ Đức Huấn')).toBe('doduchuan');
  });

  it('chuỗi rỗng/null → rỗng', () => {
    expect(normalizeMergeName(null)).toBe('');
    expect(normalizeMergeName('')).toBe('');
    expect(normalizeMergeName('   ')).toBe('');
  });
});

describe('normalizeMergeEmail / normalizeMergePhone', () => {
  it('email: lowercase + trim; rỗng → null', () => {
    expect(normalizeMergeEmail('  A@X.COM ')).toBe('a@x.com');
    expect(normalizeMergeEmail('   ')).toBeNull();
    expect(normalizeMergeEmail(null)).toBeNull();
  });

  it('phone: +84/84 đầu → 0, so khớp theo 9 số cuối', () => {
    expect(normalizeMergePhone('+84 901 234 567')).toBe(
      normalizeMergePhone('0901234567'),
    );
    expect(normalizeMergePhone('84-901-234-567')).toBe(
      normalizeMergePhone('0901234567'),
    );
    expect(normalizeMergePhone('abc')).toBeNull();
    expect(normalizeMergePhone(null)).toBeNull();
  });
});

describe('levenshteinCapped', () => {
  it('trường hợp cơ bản', () => {
    expect(levenshteinCapped('kitten', 'sitting', 3)).toBe(3);
    expect(levenshteinCapped('abc', 'abc', 3)).toBe(0);
    expect(levenshteinCapped('', 'ab', 3)).toBe(2);
    expect(levenshteinCapped('ab', '', 3)).toBe(2);
  });

  it('vượt cap → trả cap + 1 (dừng sớm)', () => {
    expect(levenshteinCapped('aaaaaaaa', 'bbbbbbbb', 3)).toBe(4);
    // Chênh độ dài > cap → chắc chắn > cap.
    expect(levenshteinCapped('abcdefgh', 'ab', 3)).toBe(4);
  });

  it('đúng bằng cap → trả cap', () => {
    expect(levenshteinCapped('nguyenvana', 'nguyenvanb', 3)).toBe(1);
    expect(
      levenshteinCapped('abcd', 'axcy', NAME_SIMILARITY_MAX_DISTANCE),
    ).toBe(2);
  });
});

describe('namesSimilar', () => {
  it('bằng nhau sau chuẩn hoá → giống', () => {
    expect(namesSimilar('Nguyễn Văn A', 'nguyen van a')).toBe(true);
    expect(namesSimilar('Đỗ Đức', 'do duc')).toBe(true);
  });

  it('inclusion: một tên chứa tên kia → giống', () => {
    expect(namesSimilar('Nguyễn Văn An', 'van an')).toBe(true);
  });

  it('Levenshtein ≤ 3 → giống', () => {
    expect(namesSimilar('Nguyen Van An', 'Nguyen Van Anh')).toBe(true);
  });

  it('khác xa nhau → không giống', () => {
    expect(namesSimilar('Tran Thi Bich', 'Le Van Cong')).toBe(false);
  });

  it('tên rỗng → không giống', () => {
    expect(namesSimilar('', 'nguyen van a')).toBe(false);
    expect(namesSimilar(null, null)).toBe(false);
  });
});

describe('findMergeReasons', () => {
  // Tên khác xa nhau (không rơi vào ngưỡng Levenshtein ≤ 3) để lý do 'name'
  // không lẫn vào các case chỉ muốn khớp công ty/email/SĐT.
  const NAME_A = 'Tran Thi Bich';
  const NAME_B = 'Le Van Cong';

  it('cùng company_id → same_company', () => {
    const reasons = findMergeReasons(
      contact({ id: 'a', full_name: NAME_A, company_id: 'co-1' }),
      contact({ id: 'b', full_name: NAME_B, company_id: 'co-1' }),
    );
    expect(reasons).toEqual(['same_company']);
  });

  it('trùng email chuẩn hoá → email', () => {
    const reasons = findMergeReasons(
      contact({ id: 'a', full_name: NAME_A, email: 'A@x.com ' }),
      contact({ id: 'b', full_name: NAME_B, email: 'a@x.com' }),
    );
    expect(reasons).toEqual(['email']);
  });

  it('trùng SĐT (+84 so với 0) → phone', () => {
    const reasons = findMergeReasons(
      contact({ id: 'a', full_name: NAME_A, phone: '+84901234567' }),
      contact({ id: 'b', full_name: NAME_B, phone: '0901234567' }),
    );
    expect(reasons).toEqual(['phone']);
  });

  it('tên giống → name', () => {
    const reasons = findMergeReasons(
      contact({ id: 'a', full_name: 'Nguyễn Văn A' }),
      contact({ id: 'b', full_name: 'nguyen van a' }),
    );
    expect(reasons).toEqual(['name']);
  });

  it('cùng công ty + trùng email → 2 lý do', () => {
    const reasons = findMergeReasons(
      contact({ id: 'a', full_name: NAME_A, email: 'a@x.com', company_id: 'co-1' }),
      contact({ id: 'b', full_name: NAME_B, email: 'a@x.com', company_id: 'co-1' }),
    );
    expect(reasons).toEqual(['same_company', 'email']);
  });

  it('không giống gì / trùng id → rỗng', () => {
    expect(
      findMergeReasons(
        contact({ id: 'a', full_name: 'Tran Thi Bich' }),
        contact({ id: 'b', full_name: 'Le Van Cong' }),
      ),
    ).toEqual([]);
    expect(
      findMergeReasons(
        contact({ id: 'a', full_name: 'Same', email: 's@x.com' }),
        contact({ id: 'a', full_name: 'Same', email: 's@x.com' }),
      ),
    ).toEqual([]);
  });

  it('cả hai chưa có công ty/email/SĐT → không nhận same_company/email/phone', () => {
    expect(
      findMergeReasons(
        contact({ id: 'a', full_name: 'Khác Nhau' }),
        contact({ id: 'b', full_name: 'Cũng Khác' }),
      ),
    ).toEqual([]);
  });
});

describe('computeMergePlan', () => {
  it('điền trường TRỐNG của target từ source', () => {
    const plan = computeMergePlan(
      contact({ id: 't', full_name: 'T', email: null, phone: '', job_title: 'CEO' }),
      contact({
        id: 's',
        full_name: 'S',
        email: 's@x.com',
        phone: '0901234567',
        job_title: 'CTO',
      }),
    );
    expect(plan.patch.email).toBe('s@x.com');
    expect(plan.patch.phone).toBe('0901234567');
    expect(plan.patch.job_title).toBeUndefined(); // target đã có job_title
    expect(plan.fieldsTaken).toEqual(['email', 'phone']);
  });

  it('gộp nhãn union, giữ thứ tự target trước', () => {
    const plan = computeMergePlan(
      contact({ id: 't', full_name: 'T', labels: ['VIP', 'Đối tác'] }),
      contact({ id: 's', full_name: 'S', labels: ['Đối tác', 'Cần theo dõi'] }),
    );
    expect(plan.patch.labels).toEqual(['VIP', 'Đối tác', 'Cần theo dõi']);
    expect(plan.fieldsTaken).toEqual(['labels']);
  });

  it('nhãn trùng hoàn toàn → không đổi', () => {
    const plan = computeMergePlan(
      contact({ id: 't', full_name: 'T', labels: ['VIP'] }),
      contact({ id: 's', full_name: 'S', labels: ['VIP'] }),
    );
    expect(plan.patch.labels).toBeUndefined();
    expect(plan.fieldsTaken).toEqual([]);
    expect(plan.labels).toEqual(['VIP']);
  });

  it('không đè trường target đã có giá trị', () => {
    const plan = computeMergePlan(
      contact({ id: 't', full_name: 'T', address: 'Q1, TP.HCM' }),
      contact({ id: 's', full_name: 'S', address: 'Q7, TP.HCM' }),
    );
    expect(plan.patch.address).toBeUndefined();
    expect(plan.fieldsTaken).toEqual([]);
  });

  it('trim giá trị lấy từ source', () => {
    const plan = computeMergePlan(
      contact({ id: 't', full_name: 'T', email: null }),
      contact({ id: 's', full_name: 'S', email: '  spaced@x.com  ' }),
    );
    expect(plan.patch.email).toBe('spaced@x.com');
  });
});
