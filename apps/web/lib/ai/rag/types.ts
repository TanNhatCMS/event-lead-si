/**
 * Kiểu dữ liệu tối thiểu cho 2 bảng RAG (do migration T001 tạo).
 *
 * GHI CHÚ: `database.types.ts` được regenerate từ Supabase — sau khi migration
 * `*_rag_chatbot.sql` được apply (issue #35) và regenerate types, có thể đổi
 * sang dùng `Database` thật thay cho kiểu tạm này.
 */
export type BusinessEntityType = "contact" | "company" | "meeting_note";

export type QueueOperation = "upsert" | "delete";

export type QueueStatus = "pending" | "processing" | "done" | "failed";

export interface RagIndexQueueRow {
  id: string;
  user_id: string;
  entity_type: BusinessEntityType;
  entity_id: string;
  operation: QueueOperation;
  status: QueueStatus;
  attempts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessChunkRow {
  id: string;
  user_id: string;
  entity_type: BusinessEntityType;
  entity_id: string;
  content: string;
  embedding: string | null;
  embedding_model: string | null;
  embedding_version: number | null;
  updated_at: string;
}

/** Database tối thiểu để supabase-js typecheck các bảng RAG. */
export interface RagDatabase {
  public: {
    Tables: {
      rag_index_queue: {
        Row: RagIndexQueueRow;
        Insert: {
          id?: string;
          user_id: string;
          entity_type: BusinessEntityType;
          entity_id: string;
          operation: QueueOperation;
          status?: QueueStatus;
          attempts?: number;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: QueueStatus;
          attempts?: number;
          error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_chunks: {
        Row: BusinessChunkRow;
        Insert: {
          id?: string;
          user_id: string;
          entity_type: BusinessEntityType;
          entity_id: string;
          content: string;
          embedding?: string | null;
          embedding_model?: string | null;
          embedding_version?: number | null;
          updated_at?: string;
        };
        Update: {
          content?: string;
          embedding?: string | null;
          embedding_model?: string | null;
          embedding_version?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
