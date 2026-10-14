import { describe, expect, it } from 'vitest';

import { getPromptDefault, PROMPT_DEFAULTS } from '../defaults';

describe('PROMPT_DEFAULTS', () => {
  it('có đủ 7 prompts', () => {
    expect(PROMPT_DEFAULTS).toHaveLength(7);
    const keys = PROMPT_DEFAULTS.map((p) => p.key).sort();
    expect(keys).toEqual(
      [
        'card_recognize',
        'followup_draft',
        'lead_enrichment',
        'rag_chat',
        'relationships_intro',
        'sourcing_draft',
        'sourcing_suggest',
      ].sort(),
    );
  });

  it('mỗi prompt có name, description và content không rỗng', () => {
    for (const p of PROMPT_DEFAULTS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.content.length).toBeGreaterThan(50);
    }
  });

  it('rag_chat chứa QUOTE-MODE và placeholder CONTEXT', () => {
    const rag = getPromptDefault('rag_chat');
    expect(rag?.content).toContain('QUOTE-MODE');
    expect(rag?.content).toContain('{{CONTEXT}}');
  });

  it('getPromptDefault trả undefined cho key lạ', () => {
    expect(getPromptDefault('khong-ton-tai')).toBeUndefined();
  });
});
