import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";

/**
 * Kiểu dữ liệu RAG mở rộng — TẠM THỜI cho tới khi migration schema RAG
 * (T001: chat_conversations, chat_messages, RPC match_rag_chunks) được apply
 * và `apps/web/lib/database.types.ts` được regenerate.
 *
 * Khi database.types.ts đã có các bảng/hàm này, bỏ file này và dùng trực
 * tiếp kiểu từ `@kit/supabase/database`.
 */

export type RagSourceType = "document" | "contact" | "company" | "meeting_note";

export type ChatConversationRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type ChatConversationInsert = {
  user_id: string;
  title: string;
}

export type ChatConversationUpdate = {
  title?: string;
  updated_at?: string;
}

/** Trích dẫn nguồn lưu trong chat_messages.citations (jsonb) — theo contracts/rag-api.md. */
export type RagCitation = {
  index: number;
  source_type: RagSourceType;
  source_id: string;
  label: string;
  page_number?: number | null;
  section_title?: string | null;
  effective_date?: string | null;
  snippet: string;
}

export type ChatMessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  citations: RagCitation[];
  created_at: string;
}

export type ChatMessageInsert = {
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  citations?: RagCitation[];
}

/** Dòng trả về của RPC match_rag_chunks (T001). */
export type RagChunkRow = {
  chunk_id: string;
  source_type: RagSourceType;
  source_id: string;
  label: string;
  document_type: string | null;
  effective_date: string | null;
  section_title: string | null;
  page_number: number | null;
  content: string;
  similarity: number;
}

type RagTables = {
  chat_conversations: {
    Row: ChatConversationRow;
    Insert: ChatConversationInsert;
    Update: ChatConversationUpdate;
    Relationships: [];
  };
  chat_messages: {
    Row: ChatMessageRow;
    Insert: ChatMessageInsert;
    Update: never;
    Relationships: [];
  };
};

type RagFunctions = {
  match_rag_chunks: {
    Args: {
      query_embedding: string;
      p_user_id: string;
      p_sources?: string[];
      match_count?: number;
      match_threshold?: number;
    };
    Returns: RagChunkRow[];
  };
};

/**
 * Gộp 2 map bảng/hàm thành MỘT object type duy nhất.
 *
 * BẮT BUỘC dùng mapped type thay vì intersection (`A & B`): supabase-js
 * v2.117 resolve generic Schema qua điều kiện
 * `... extends GenericSchema ? ... : never`, trong đó
 * `GenericSchema["Tables"] = Record<string, GenericTable>` — intersection
 * không được cấp implicit index signature nên điều kiện thành false và mọi
 * `.from("chat_conversations")` suy ra `never`.
 */
type MergeMaps<Base, Extra> = {
  [K in keyof Base | keyof Extra]: K extends keyof Extra
    ? Extra[K]
    : K extends keyof Base
      ? Base[K]
      : never;
};

/** Database gốc + bảng/hàm RAG (xóa khi database.types.ts đã regenerate). */
export type RagExtendedDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: MergeMaps<Database["public"]["Tables"], RagTables>;
    Functions: MergeMaps<Database["public"]["Functions"], RagFunctions>;
  };
};

/** Cast client đã type sẵn sang client hỗ trợ bảng RAG. */
export function withRagTables(
  supabase: SupabaseClient<Database>,
): SupabaseClient<RagExtendedDatabase> {
  return supabase as unknown as SupabaseClient<RagExtendedDatabase>;
}
