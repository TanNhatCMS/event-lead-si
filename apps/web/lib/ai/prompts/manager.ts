import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';

import { getPromptDefault, PROMPT_DEFAULTS } from './defaults';

type RagSupabaseClient = SupabaseClient<Database>;

export interface PromptInfo {
  key: string;
  name: string;
  description: string;
  content: string;
  is_custom: boolean;
  updated_at: string | null;
}

/**
 * Lấy nội dung prompt cho một `prompt_key`:
 * 1. Nếu user đã tùy chỉnh qua UI (`ai_prompts`) → dùng bản custom.
 * 2. Ngược lại → dùng bản mặc định trong `defaults.ts`.
 *
 * Không bao giờ ném lỗi — luôn trả về default khi DB lỗi/chưa có bản custom.
 */
export async function getPrompt(
  key: string,
  userId: string,
  supabase: RagSupabaseClient,
): Promise<string> {
  const fallback = getPromptDefault(key)?.content ?? '';
  try {
    const { data, error } = await supabase
      .from('ai_prompts')
      .select('content')
      .eq('user_id', userId)
      .eq('prompt_key', key)
      .maybeSingle();
    if (error || !data?.content) return fallback;
    return data.content;
  } catch {
    return fallback;
  }
}

/**
 * Liệt kê tất cả prompts kèm trạng thái custom của user (cho UI quản lý).
 */
export async function listPrompts(
  userId: string,
  supabase: RagSupabaseClient,
): Promise<PromptInfo[]> {
  const { data } = await supabase
    .from('ai_prompts')
    .select('prompt_key, name, description, content, is_custom, updated_at')
    .eq('user_id', userId);

  const customByKey = new Map((data ?? []).map((r) => [r.prompt_key, r]));

  return PROMPT_DEFAULTS.map((def) => {
    const custom = customByKey.get(def.key);
    return {
      key: def.key,
      name: custom?.name ?? def.name,
      description: custom?.description ?? def.description,
      content: custom?.content ?? def.content,
      is_custom: custom?.is_custom ?? false,
      updated_at: custom?.updated_at ?? null,
    };
  });
}
