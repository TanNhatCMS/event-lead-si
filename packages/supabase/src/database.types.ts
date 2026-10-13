export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          operationName?: string;
          query?: string;
          variables?: Json;
          extensions?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: Json;
          summary: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: Json;
          summary?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          summary?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      accounts: {        Row: {
          created_at: string | null;
          created_by: string | null;
          email: string | null;
          id: string;
          name: string;
          picture_url: string | null;
          public_data: Json;
          updated_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          picture_url?: string | null;
          public_data?: Json;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          picture_url?: string | null;
          public_data?: Json;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      ai_model_configs: {
        Row: {
          capability: string;
          config: Json;
          created_at: string;
          enabled: boolean;
          id: string;
          model: string | null;
          provider: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          capability: string;
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          model?: string | null;
          provider: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          capability?: string;
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          model?: string | null;
          provider?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      card_imports: {
        Row: {
          batch_id: string | null;
          confirmed_contact_id: string | null;
          created_at: string;
          error_code: string | null;
          file_size: number;
          id: string;
          media_type: string;
          processed_at: string | null;
          processing_started_at: string | null;
          recognition_model: string | null;
          recognition_provider: string | null;
          recognition_result: Json | null;
          schema_version: number;
          state: string;
          storage_path: string;
          submitted_by: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          batch_id?: string | null;
          confirmed_contact_id?: string | null;
          created_at?: string;
          error_code?: string | null;
          file_size: number;
          id?: string;
          media_type: string;
          processed_at?: string | null;
          processing_started_at?: string | null;
          recognition_model?: string | null;
          recognition_provider?: string | null;
          recognition_result?: Json | null;
          schema_version?: number;
          state?: string;
          storage_path: string;
          submitted_by: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          batch_id?: string | null;
          confirmed_contact_id?: string | null;
          created_at?: string;
          error_code?: string | null;
          file_size?: number;
          id?: string;
          media_type?: string;
          processed_at?: string | null;
          processing_started_at?: string | null;
          recognition_model?: string | null;
          recognition_provider?: string | null;
          recognition_result?: Json | null;
          schema_version?: number;
          state?: string;
          storage_path?: string;
          submitted_by?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          country_code: string | null;
          created_at: string;
          display_name: string;
          employee_size_range: string | null;
          founded_year: number | null;
          id: string;
          industry: string | null;
          legal_name: string | null;
          market_summary: string | null;
          products_summary: string | null;
          profile_state: string;
          share_token: string;
          tax_or_registration_id: string | null;
          updated_at: string;
          user_id: string;
          website: string | null;
        };
        Insert: {
          country_code?: string | null;
          created_at?: string;
          display_name: string;
          employee_size_range?: string | null;
          founded_year?: number | null;
          id?: string;
          industry?: string | null;
          legal_name?: string | null;
          market_summary?: string | null;
          products_summary?: string | null;
          profile_state?: string;
          share_token?: string;
          tax_or_registration_id?: string | null;
          updated_at?: string;
          user_id: string;
          website?: string | null;
        };
        Update: {
          country_code?: string | null;
          created_at?: string;
          display_name?: string;
          employee_size_range?: string | null;
          founded_year?: number | null;
          id?: string;
          industry?: string | null;
          legal_name?: string | null;
          market_summary?: string | null;
          products_summary?: string | null;
          profile_state?: string;
          share_token?: string;
          tax_or_registration_id?: string | null;
          updated_at?: string;
          user_id?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      contact_field_evidence: {
        Row: {
          contact_id: string;
          created_at: string;
          field_name: string;
          id: string;
          normalized_value: string | null;
          raw_value: string | null;
          retrieved_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          schema_version: number;
          source_reference: string | null;
          source_type: string;
          user_id: string;
          value_snapshot: string | null;
          verification_state: string;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          field_name: string;
          id?: string;
          normalized_value?: string | null;
          raw_value?: string | null;
          retrieved_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          schema_version?: number;
          source_reference?: string | null;
          source_type: string;
          user_id: string;
          value_snapshot?: string | null;
          verification_state?: string;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          field_name?: string;
          id?: string;
          normalized_value?: string | null;
          raw_value?: string | null;
          retrieved_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          schema_version?: number;
          source_reference?: string | null;
          source_type?: string;
          user_id?: string;
          value_snapshot?: string | null;
          verification_state?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          address: string | null;
          archived_at: string | null;
          company_id: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          job_title: string | null;
          labels: string[];
          owner_user_id: string;
          phone: string | null;
          preferred_language: string | null;
          relationship_stage: string;
          schema_version: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          archived_at?: string | null;
          company_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          job_title?: string | null;
          labels?: string[];
          owner_user_id: string;
          phone?: string | null;
          preferred_language?: string | null;
          relationship_stage?: string;
          schema_version?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          archived_at?: string | null;
          company_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          job_title?: string | null;
          labels?: string[];
          owner_user_id?: string;
          phone?: string | null;
          preferred_language?: string | null;
          relationship_stage?: string;
          schema_version?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sourcing_candidates: {
        Row: {
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          evidence: unknown;
          fit_summary: string | null;
          id: string;
          name: string;
          notes: string;
          request_id: string;
          shortlisted: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          evidence?: unknown;
          fit_summary?: string | null;
          id?: string;
          name: string;
          notes?: string;
          request_id: string;
          shortlisted?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          evidence?: unknown;
          fit_summary?: string | null;
          id?: string;
          name?: string;
          notes?: string;
          request_id?: string;
          shortlisted?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sourcing_requests: {
        Row: {
          created_at: string;
          criteria: unknown;
          id: string;
          product_description: string;
          status: string;
          target_market: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          criteria?: unknown;
          id?: string;
          product_description?: string;
          status?: string;
          target_market?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          criteria?: unknown;
          id?: string;
          product_description?: string;
          status?: string;
          target_market?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      meeting_notes: {
        Row: {
          author_user_id: string;
          body: string;
          contact_id: string;
          created_at: string;
          deleted_at: string | null;
          done_at: string | null;
          due_at: string | null;
          id: string;
          note_type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          author_user_id: string;
          body: string;
          contact_id: string;
          created_at?: string;
          deleted_at?: string | null;
          done_at?: string | null;
          due_at?: string | null;
          id?: string;
          note_type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          author_user_id?: string;
          body?: string;
          contact_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          done_at?: string | null;
          due_at?: string | null;
          id?: string;
          note_type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      otel_spans: {
        Row: {
          attributes: Json;
          created_at: string;
          duration_ms: number;
          ended_at: string;
          events: Json;
          id: string;
          kind: string;
          name: string;
          parent_span_id: string | null;
          span_id: string;
          started_at: string;
          status_code: string;
          status_message: string | null;
          trace_id: string;
          user_id: string | null;
        };
        Insert: {
          attributes?: Json;
          created_at?: string;
          duration_ms?: number;
          ended_at: string;
          events?: Json;
          id?: string;
          kind?: string;
          name: string;
          parent_span_id?: string | null;
          span_id: string;
          started_at: string;
          status_code?: string;
          status_message?: string | null;
          trace_id: string;
          user_id?: string | null;
        };
        Update: {
          attributes?: Json;
          created_at?: string;
          duration_ms?: number;
          ended_at?: string;
          events?: Json;
          id?: string;
          kind?: string;
          name?: string;
          parent_span_id?: string | null;
          span_id?: string;
          started_at?: string;
          status_code?: string;
          status_message?: string | null;
          trace_id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          name: string;
          owner: string | null;
          owner_id: string | null;
          public: boolean | null;
          updated_at: string | null;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          name: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          name?: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          last_accessed_at: string | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          owner_id: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          user_metadata: Json | null;
          version: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'objects_bucketId_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          in_progress_size: number;
          key: string;
          owner_id: string | null;
          upload_signature: string;
          user_metadata: Json | null;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id: string;
          in_progress_size?: number;
          key: string;
          owner_id?: string | null;
          upload_signature: string;
          user_metadata?: Json | null;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          in_progress_size?: number;
          key?: string;
          owner_id?: string | null;
          upload_signature?: string;
          user_metadata?: Json | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string;
          created_at: string;
          etag: string;
          id: string;
          key: string;
          owner_id: string | null;
          part_number: number;
          size: number;
          upload_id: string;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          etag: string;
          id?: string;
          key: string;
          owner_id?: string | null;
          part_number: number;
          size?: number;
          upload_id: string;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          etag?: string;
          id?: string;
          key?: string;
          owner_id?: string | null;
          part_number?: number;
          size?: number;
          upload_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_parts_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 's3_multipart_uploads_parts_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 's3_multipart_uploads';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_insert_object: {
        Args: {
          bucketid: string;
          name: string;
          owner: string;
          metadata: Json;
        };
        Returns: undefined;
      };
      extension: {
        Args: {
          name: string;
        };
        Returns: string;
      };
      filename: {
        Args: {
          name: string;
        };
        Returns: string;
      };
      foldername: {
        Args: {
          name: string;
        };
        Returns: string[];
      };
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>;
        Returns: {
          size: number;
          bucket_id: string;
        }[];
      };
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string;
          prefix_param: string;
          delimiter_param: string;
          max_keys?: number;
          next_key_token?: string;
          next_upload_token?: string;
        };
        Returns: {
          key: string;
          id: string;
          created_at: string;
        }[];
      };
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string;
          prefix_param: string;
          delimiter_param: string;
          max_keys?: number;
          start_after?: string;
          next_token?: string;
        };
        Returns: {
          name: string;
          id: string;
          metadata: Json;
          updated_at: string;
        }[];
      };
      operation: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      search: {
        Args: {
          prefix: string;
          bucketname: string;
          limits?: number;
          levels?: number;
          offsets?: number;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          name: string;
          id: string;
          updated_at: string;
          created_at: string;
          last_accessed_at: string;
          metadata: Json;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
  TableName extends (PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] &
        PublicSchema['Views'])
    ? (PublicSchema['Tables'] &
        PublicSchema['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends (PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends (PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema['Enums']
    | { schema: keyof Database },
  EnumName extends (PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
    ? PublicSchema['Enums'][PublicEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema['CompositeTypes']
    | { schema: keyof Database },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema['CompositeTypes']
    ? PublicSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;
