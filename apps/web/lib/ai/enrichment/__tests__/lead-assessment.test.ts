import { describe, expect, it } from 'vitest';

import { recordLeadAssessment, isAssessmentActionable, LEAD_ASSESSMENT_MIN_CONFIDENCE } from '../assessment';
import { enrichmentResultSchema, leadAssessmentSchema, type LeadAssessment } from '../types';

/**
 * Test thuần cho lead assessment của agent enrichment: schema chặt (heat
 * enum, confidence 0–1, tối đa 5 nhãn), ngưỡng ghi nhận 0.6 và việc ghi
 * audit 'lead.assessed' vào supabase giả.
 */

const VALID_ASSESSMENT: LeadAssessment = {
  heat: 'hot',
  heat_confidence: 0.85,
  suggested_labels: ['C-level', 'nhu cầu rõ'],
  reason: 'Giám đốc kinh doanh của công ty logistics, có nhu cầu triển khai ngay.',
};

describe('leadAssessmentSchema', () => {
  it('nhận assessment hợp lệ', () => {
    const parsed = leadAssessmentSchema.safeParse(VALID_ASSESSMENT);
    expect(parsed.success).toBe(true);
  });

  it('từ chối heat ngoài enum', () => {
    const parsed = leadAssessmentSchema.safeParse({
      ...VALID_ASSESSMENT,
      heat: 'burning',
    });
    expect(parsed.success).toBe(false);
  });

  it('từ chối confidence ngoài [0, 1]', () => {
    expect(
      leadAssessmentSchema.safeParse({ ...VALID_ASSESSMENT, heat_confidence: 1.2 }).success,
    ).toBe(false);
    expect(
      leadAssessmentSchema.safeParse({ ...VALID_ASSESSMENT, heat_confidence: -0.1 }).success,
    ).toBe(false);
  });

  it('từ chối quá 5 nhãn gợi ý', () => {
    const parsed = leadAssessmentSchema.safeParse({
      ...VALID_ASSESSMENT,
      suggested_labels: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(parsed.success).toBe(false);
  });

  it('từ chối nhãn rỗng hoặc quá dài', () => {
    expect(
      leadAssessmentSchema.safeParse({ ...VALID_ASSESSMENT, suggested_labels: [''] }).success,
    ).toBe(false);
    expect(
      leadAssessmentSchema.safeParse({
        ...VALID_ASSESSMENT,
        suggested_labels: ['x'.repeat(41)],
      }).success,
    ).toBe(false);
  });

  it('từ chối khi thiếu reason', () => {
    const parsed = leadAssessmentSchema.safeParse({
      heat: 'cold',
      heat_confidence: 0.4,
      suggested_labels: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('enrichmentResultSchema với lead_assessment', () => {
  it('nhận result có lead_assessment', () => {
    const parsed = enrichmentResultSchema.safeParse({
      findings: [],
      lead_assessment: VALID_ASSESSMENT,
      steps: [],
      modelUsed: 'openai:gpt-4o',
    });
    expect(parsed.success).toBe(true);
  });

  it('vẫn nhận result KHÔNG có lead_assessment (tương thích ngược)', () => {
    const parsed = enrichmentResultSchema.safeParse({
      findings: [],
      steps: [],
      modelUsed: 'openai:gpt-4o',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.lead_assessment).toBeUndefined();
    }
  });
});

describe('isAssessmentActionable', () => {
  it('chỉ assessment có confidence >= 0.6 mới được ghi nhận', () => {
    expect(LEAD_ASSESSMENT_MIN_CONFIDENCE).toBe(0.6);
    expect(
      isAssessmentActionable({ ...VALID_ASSESSMENT, heat_confidence: 0.6 }),
    ).toBe(true);
    expect(
      isAssessmentActionable({ ...VALID_ASSESSMENT, heat_confidence: 0.59 }),
    ).toBe(false);
  });
});

describe('recordLeadAssessment', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const CONTACT_ID = '22222222-2222-4222-8222-222222222222';

  function fakeClient() {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    return {
      client: {
        from(table: string) {
          return {
            insert(row: Record<string, unknown>) {
              inserts.push({ table, row });
              return Promise.resolve({ error: null });
            },
          };
        },
      },
      inserts,
    } as const;
  }

  it('ghi audit lead.assessed với metadata heat/labels/reason', async () => {
    const { client, inserts } = fakeClient();
    const result = await recordLeadAssessment({
      userId: USER_ID,
      contactId: CONTACT_ID,
      assessment: VALID_ASSESSMENT,
      modelUsed: 'openai:gpt-4o',
      supabase: client as never,
    });
    expect(result).toEqual({ recorded: true, skippedReason: null });
    expect(inserts).toHaveLength(1);
    const insert = inserts[0];
    if (!insert) return;
    expect(insert.table).toBe('audit_logs');
    expect(insert.row.action).toBe('lead.assessed');
    expect(insert.row.entity_type).toBe('contact');
    expect(insert.row.entity_id).toBe(CONTACT_ID);
    expect(insert.row.user_id).toBe(USER_ID);
    const metadata = insert.row.metadata as Record<string, unknown>;
    expect(metadata.heat).toBe('hot');
    expect(metadata.heat_confidence).toBe(0.85);
    expect(metadata.suggested_labels).toEqual(['C-level', 'nhu cầu rõ']);
    expect(typeof metadata.reason).toBe('string');
  });

  it('bỏ qua assessment dưới ngưỡng 0.6 (không ghi gì)', async () => {
    const { client, inserts } = fakeClient();
    const result = await recordLeadAssessment({
      userId: USER_ID,
      contactId: CONTACT_ID,
      assessment: { ...VALID_ASSESSMENT, heat_confidence: 0.3 },
      supabase: client as never,
    });
    expect(result).toEqual({ recorded: false, skippedReason: 'low_confidence' });
    expect(inserts).toHaveLength(0);
  });

  it('bỏ qua assessment sai schema (không ném, không ghi)', async () => {
    const { client, inserts } = fakeClient();
    const result = await recordLeadAssessment({
      userId: USER_ID,
      contactId: CONTACT_ID,
      assessment: { heat: 'molten', heat_confidence: 0.9, reason: 'x' },
      supabase: client as never,
    });
    expect(result).toEqual({ recorded: false, skippedReason: 'invalid_assessment' });
    expect(inserts).toHaveLength(0);
  });
});
