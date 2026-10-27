import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock SDK — 不调用 API 真实服务。vi.hoisted 让 mock 函数在 vi.mock 工厂里可用。
const { searchQuery, fetchGetContents } = vi.hoisted(() => ({
  searchQuery: vi.fn(),
  fetchGetContents: vi.fn(),
}));

vi.mock('@tiny-fish/sdk', () => ({
  TinyFish: class MockTinyFish {
    search = { query: searchQuery };
    fetch = { getContents: fetchGetContents };
    constructor(_opts?: { apiKey?: string }) {}
  },
}));

import {
  TinyFishFetchError,
  TinyFishNotConfiguredError,
  getTinyFishApiKey,
  tinyFishFetch,
  tinyFishSearch,
} from '../tinyfish';

describe('tinyfish (issue #88)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('getTinyFishApiKey', () => {
    it('trả key từ env TINYFISH_API_KEY, trim khoảng trắng', () => {
      vi.stubEnv('TINYFISH_API_KEY', '  sk-tinyfish-test  ');
      expect(getTinyFishApiKey()).toBe('sk-tinyfish-test');
    });

    it('trả null khi env rỗng', () => {
      vi.stubEnv('TINYFISH_API_KEY', '   ');
      expect(getTinyFishApiKey()).toBeNull();
    });
  });

  describe('tinyFishSearch', () => {
    it('map kết quả về đúng shape position/title/url/snippet/site_name', async () => {
      vi.stubEnv('TINYFISH_API_KEY', 'sk-test');
      searchQuery.mockResolvedValue({
        query: 'web automation',
        total_results: 3,
        page: 0,
        results: [
          {
            position: 1,
            title: 'TinyFish',
            url: 'https://www.tinyfish.ai/',
            snippet: 'Web infrastructure for AI agents',
            site_name: 'www.tinyfish.ai',
            date: '2026-10-01',
          },
          {
            position: 2,
            title: 'Docs',
            url: 'https://docs.tinyfish.ai',
            snippet: 'Search + Fetch API',
            site_name: 'docs.tinyfish.ai',
          },
          {
            position: 3,
            title: 'Bị cắt vì vượt maxResults',
            url: 'https://example.com/third',
            snippet: '…',
            site_name: 'example.com',
          },
        ],
      });

      const items = await tinyFishSearch('web automation', { maxResults: 2 });

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        position: 1,
        title: 'TinyFish',
        url: 'https://www.tinyfish.ai/',
        snippet: 'Web infrastructure for AI agents',
        site_name: 'www.tinyfish.ai',
      });
      // search.query nhận đúng query
      expect(searchQuery).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'web automation' }),
      );
    });

    it('ném TinyFishNotConfiguredError khi thiếu key', async () => {
      vi.stubEnv('TINYFISH_API_KEY', '');
      await expect(tinyFishSearch('test')).rejects.toThrow(TinyFishNotConfiguredError);
      expect(searchQuery).not.toHaveBeenCalled();
    });
  });

  describe('tinyFishFetch', () => {
    it('trả markdown sạch: title + text từ results[0]', async () => {
      vi.stubEnv('TINYFISH_API_KEY', 'sk-test');
      fetchGetContents.mockResolvedValue({
        results: [
          {
            url: 'https://www.tinyfish.ai/',
            title: 'TinyFish — Web Infrastructure for AI Agents',
            text: '# TinyFish\n\nNội dung markdown sạch…',
            format: 'markdown',
          },
        ],
        errors: [],
      });

      const page = await tinyFishFetch('https://www.tinyfish.ai/');
      expect(page.title).toBe('TinyFish — Web Infrastructure for AI Agents');
      expect(page.text).toContain('Nội dung markdown sạch');
      expect(fetchGetContents).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'markdown' }),
      );
    });

    it('ném TinyFishFetchError khi URL vào errors[] (vd bot_blocked)', async () => {
      vi.stubEnv('TINYFISH_API_KEY', 'sk-test');
      fetchGetContents.mockResolvedValue({
        results: [],
        errors: [{ url: 'https://example.com/blocked', error: 'bot_blocked' }],
      });

      await expect(tinyFishFetch('https://example.com/blocked')).rejects.toThrow(
        TinyFishFetchError,
      );
    });

    it('chặn URL đích là localhost trước khi gọi API (egress)', async () => {
      vi.stubEnv('TINYFISH_API_KEY', 'sk-test');
      await expect(tinyFishFetch('http://localhost:3000/internal')).rejects.toThrow(
        /host|egress/i,
      );
      expect(fetchGetContents).not.toHaveBeenCalled();
    });

    it('ném TinyFishNotConfiguredError khi thiếu key', async () => {
      vi.stubEnv('TINYFISH_API_KEY', '');
      await expect(tinyFishFetch('https://www.tinyfish.ai/')).rejects.toThrow(
        TinyFishNotConfiguredError,
      );
      expect(fetchGetContents).not.toHaveBeenCalled();
    });
  });
});
