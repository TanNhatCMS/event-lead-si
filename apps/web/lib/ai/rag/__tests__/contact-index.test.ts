import { describe, expect, it } from 'vitest';

import {
  buildCompanyText,
  buildContactText,
  buildMeetingNoteText,
  buildSourceLabel,
} from '../contact-index';

describe('buildContactText', () => {
  it('dòng đầu là nhãn "Hồ sơ liên hệ: <tên>"', () => {
    const text = buildContactText({ full_name: 'Nguyễn Văn A', phone: '0901234567' });
    const lines = text.split('\n');
    expect(lines[0]).toBe('Hồ sơ liên hệ: Nguyễn Văn A');
    expect(text).toContain('Điện thoại: 0901234567');
  });

  it('bỏ qua trường null', () => {
    const text = buildContactText({ full_name: 'Trần B' });
    expect(text).not.toContain('Email');
    expect(text.split('\n')).toHaveLength(1);
  });
});

describe('buildCompanyText', () => {
  it('dòng đầu là nhãn "Công ty: <tên>"', () => {
    const text = buildCompanyText({ display_name: 'ABC Corp', industry: 'SaaS' });
    expect(text.split('\n')[0]).toBe('Công ty: ABC Corp');
    expect(text).toContain('Lĩnh vực: SaaS');
  });
});

describe('buildMeetingNoteText', () => {
  it('gồm loại ghi chú, tên liên hệ và nội dung', () => {
    const text = buildMeetingNoteText({
      note_type: 'meeting_note',
      contact_name: 'Nguyễn Văn A',
      body: 'Trao đổi về báo giá Q1.',
      created_at: '2026-10-01T00:00:00Z',
    });
    expect(text).toContain('Ghi chú cuộc gặp — Nguyễn Văn A');
    expect(text).toContain('Trao đổi về báo giá Q1.');
  });
});

describe('buildSourceLabel — nhãn trích dẫn danh bạ', () => {
  it('contact → "Hồ sơ liên hệ: <tên>"', () => {
    expect(buildSourceLabel('contact', { name: 'Nguyễn Văn A' })).toBe(
      'Hồ sơ liên hệ: Nguyễn Văn A',
    );
  });

  it('company → "Công ty: <tên>"', () => {
    expect(buildSourceLabel('company', { name: 'ABC Corp' })).toBe('Công ty: ABC Corp');
  });

  it('meeting_note → có loại và ngày', () => {
    const label = buildSourceLabel('meeting_note', {
      name: 'Nguyễn Văn A',
      noteType: 'need',
      dateIso: '2026-10-01T00:00:00Z',
    });
    expect(label).toContain('nhu cầu');
    expect(label).toContain('Nguyễn Văn A');
  });
});
