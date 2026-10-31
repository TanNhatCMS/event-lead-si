
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounts": {
                  Row: {
                    "created_at": string | null,"created_by": string | null,"email": string | null,"id": string,"name": string,"picture_url": string | null,"public_data": NonNullable<Json>,"updated_at": string | null,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"created_by"?: string | null,"email"?: string | null,"id"?: string,"name": string,"picture_url"?: string | null,"public_data"?: NonNullable<Json>,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"created_by"?: string | null,"email"?: string | null,"id"?: string,"name"?: string,"picture_url"?: string | null,"public_data"?: NonNullable<Json>,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"agent_config": {
                  Row: {
                    "budgets": NonNullable<Json>,"credentials": NonNullable<Json>,"hooks": NonNullable<Json>,"plugins": NonNullable<Json>,"settings": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budgets"?: NonNullable<Json>,"credentials"?: NonNullable<Json>,"hooks"?: NonNullable<Json>,"plugins"?: NonNullable<Json>,"settings"?: NonNullable<Json>,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "budgets"?: NonNullable<Json>,"credentials"?: NonNullable<Json>,"hooks"?: NonNullable<Json>,"plugins"?: NonNullable<Json>,"settings"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"agent_mcp_servers": {
                  Row: {
                    "created_at": string,"enabled": boolean,"headers": NonNullable<Json>,"id": string,"name": string,"updated_at": string,"url": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"headers"?: NonNullable<Json>,"id"?: string,"name": string,"updated_at"?: string,"url": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"headers"?: NonNullable<Json>,"id"?: string,"name"?: string,"updated_at"?: string,"url"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"agent_skills": {
                  Row: {
                    "content": string,"created_at": string,"description": string,"enabled": boolean,"id": string,"name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"description"?: string,"enabled"?: boolean,"id"?: string,"name": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"description"?: string,"enabled"?: boolean,"id"?: string,"name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"agent_tinyfish_events": {
                  Row: {
                    "created_at": string,"event": string,"id": string,"payload": NonNullable<Json>,"run_id": string,"status": string | null,"user_id": string,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event": string,"id"?: string,"payload"?: NonNullable<Json>,"run_id": string,"status"?: string | null,"user_id": string,"verified"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"event"?: string,"id"?: string,"payload"?: NonNullable<Json>,"run_id"?: string,"status"?: string | null,"user_id"?: string,"verified"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"ai_model_configs": {
                  Row: {
                    "capability": string,"config": NonNullable<Json>,"created_at": string,"enabled": boolean,"id": string,"model": string | null,"provider": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capability": string,"config"?: NonNullable<Json>,"created_at"?: string,"enabled"?: boolean,"id"?: string,"model"?: string | null,"provider": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "capability"?: string,"config"?: NonNullable<Json>,"created_at"?: string,"enabled"?: boolean,"id"?: string,"model"?: string | null,"provider"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_prompts": {
                  Row: {
                    "content": string,"created_at": string,"description": string | null,"id": string,"is_custom": boolean,"name": string,"prompt_key": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_custom"?: boolean,"name": string,"prompt_key": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_custom"?: boolean,"name"?: string,"prompt_key"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_usage": {
                  Row: {
                    "cached_tokens": number,"cost_usd": number | null,"created_at": string,"id": string,"input_tokens": number,"latency_ms": number | null,"model": string,"output_tokens": number,"provider": string,"source": string,"total_tokens": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cached_tokens"?: number,"cost_usd"?: number | null,"created_at"?: string,"id"?: string,"input_tokens"?: number,"latency_ms"?: number | null,"model": string,"output_tokens"?: number,"provider": string,"source": string,"total_tokens"?: number,"user_id": string
                  }
                  Update: {
                    "cached_tokens"?: number,"cost_usd"?: number | null,"created_at"?: string,"id"?: string,"input_tokens"?: number,"latency_ms"?: number | null,"model"?: string,"output_tokens"?: number,"provider"?: string,"source"?: string,"total_tokens"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>,"summary": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"summary"?: string,"user_id": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"summary"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"business_chunks": {
                  Row: {
                    "content": string,"embedding": string | null,"embedding_model": string | null,"embedding_version": number | null,"entity_id": string,"entity_type": string,"id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"embedding"?: string | null,"embedding_model"?: string | null,"embedding_version"?: number | null,"entity_id": string,"entity_type": string,"id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "content"?: string,"embedding"?: string | null,"embedding_model"?: string | null,"embedding_version"?: number | null,"entity_id"?: string,"entity_type"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"card_imports": {
                  Row: {
                    "batch_id": string | null,"confirmed_contact_id": string | null,"created_at": string,"error_code": string | null,"file_size": number,"id": string,"media_type": string,"processed_at": string | null,"processing_started_at": string | null,"recognition_model": string | null,"recognition_provider": string | null,"recognition_result": Json | null,"schema_version": number,"state": string,"storage_path": string,"submitted_by": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"confirmed_contact_id"?: string | null,"created_at"?: string,"error_code"?: string | null,"file_size": number,"id"?: string,"media_type": string,"processed_at"?: string | null,"processing_started_at"?: string | null,"recognition_model"?: string | null,"recognition_provider"?: string | null,"recognition_result"?: Json | null,"schema_version"?: number,"state"?: string,"storage_path": string,"submitted_by"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "batch_id"?: string | null,"confirmed_contact_id"?: string | null,"created_at"?: string,"error_code"?: string | null,"file_size"?: number,"id"?: string,"media_type"?: string,"processed_at"?: string | null,"processing_started_at"?: string | null,"recognition_model"?: string | null,"recognition_provider"?: string | null,"recognition_result"?: Json | null,"schema_version"?: number,"state"?: string,"storage_path"?: string,"submitted_by"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_imports_confirmed_contact_id_fkey"
      columns: ["confirmed_contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_conversations": {
                  Row: {
                    "created_at": string,"id": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"title"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"chat_messages": {
                  Row: {
                    "citations": NonNullable<Json>,"content": string,"conversation_id": string,"created_at": string,"id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "citations"?: NonNullable<Json>,"content": string,"conversation_id": string,"created_at"?: string,"id"?: string,"role": string,"user_id": string
                  }
                  Update: {
                    "citations"?: NonNullable<Json>,"content"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "chat_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "country_code": string | null,"created_at": string,"display_name": string,"employee_size_range": string | null,"founded_year": number | null,"id": string,"industry": string | null,"legal_name": string | null,"market_summary": string | null,"products_summary": string | null,"profile_state": string,"share_token": string,"tax_or_registration_id": string | null,"updated_at": string,"user_id": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "country_code"?: string | null,"created_at"?: string,"display_name": string,"employee_size_range"?: string | null,"founded_year"?: number | null,"id"?: string,"industry"?: string | null,"legal_name"?: string | null,"market_summary"?: string | null,"products_summary"?: string | null,"profile_state"?: string,"share_token"?: string,"tax_or_registration_id"?: string | null,"updated_at"?: string,"user_id": string,"website"?: string | null
                  }
                  Update: {
                    "country_code"?: string | null,"created_at"?: string,"display_name"?: string,"employee_size_range"?: string | null,"founded_year"?: number | null,"id"?: string,"industry"?: string | null,"legal_name"?: string | null,"market_summary"?: string | null,"products_summary"?: string | null,"profile_state"?: string,"share_token"?: string,"tax_or_registration_id"?: string | null,"updated_at"?: string,"user_id"?: string,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"contact_field_evidence": {
                  Row: {
                    "contact_id": string,"created_at": string,"field_name": string,"id": string,"normalized_value": string | null,"raw_value": string | null,"retrieved_at": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"schema_version": number,"source_reference": string | null,"source_type": string,"user_id": string,"value_snapshot": string | null,"verification_state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_id": string,"created_at"?: string,"field_name": string,"id"?: string,"normalized_value"?: string | null,"raw_value"?: string | null,"retrieved_at"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"schema_version"?: number,"source_reference"?: string | null,"source_type": string,"user_id": string,"value_snapshot"?: string | null,"verification_state"?: string
                  }
                  Update: {
                    "contact_id"?: string,"created_at"?: string,"field_name"?: string,"id"?: string,"normalized_value"?: string | null,"raw_value"?: string | null,"retrieved_at"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"schema_version"?: number,"source_reference"?: string | null,"source_type"?: string,"user_id"?: string,"value_snapshot"?: string | null,"verification_state"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_field_evidence_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"contacts": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"company_id": string | null,"created_at": string,"email": string | null,"event_id": string | null,"full_name": string,"id": string,"job_title": string | null,"labels": (string)[],"owner_user_id": string | null,"phone": string | null,"preferred_language": string | null,"relationship_stage": string,"schema_version": number,"share_token": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"company_id"?: string | null,"created_at"?: string,"email"?: string | null,"event_id"?: string | null,"full_name": string,"id"?: string,"job_title"?: string | null,"labels"?: (string)[],"owner_user_id"?: string | null,"phone"?: string | null,"preferred_language"?: string | null,"relationship_stage"?: string,"schema_version"?: number,"share_token"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"company_id"?: string | null,"created_at"?: string,"email"?: string | null,"event_id"?: string | null,"full_name"?: string,"id"?: string,"job_title"?: string | null,"labels"?: (string)[],"owner_user_id"?: string | null,"phone"?: string | null,"preferred_language"?: string | null,"relationship_stage"?: string,"schema_version"?: number,"share_token"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contacts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"document_chunks": {
                  Row: {
                    "chunk_index": number,"content": string,"document_id": string,"embedding": string | null,"embedding_model": string | null,"embedding_version": number | null,"id": string,"page_number": number | null,"section_title": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chunk_index": number,"content": string,"document_id": string,"embedding"?: string | null,"embedding_model"?: string | null,"embedding_version"?: number | null,"id"?: string,"page_number"?: number | null,"section_title"?: string | null,"user_id": string
                  }
                  Update: {
                    "chunk_index"?: number,"content"?: string,"document_id"?: string,"embedding"?: string | null,"embedding_model"?: string | null,"embedding_version"?: number | null,"id"?: string,"page_number"?: number | null,"section_title"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_chunks_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "chunk_count": number,"created_at": string,"document_type": string,"effective_date": string,"error_message": string | null,"file_name": string,"file_size_bytes": number,"id": string,"mime_type": string,"page_count": number | null,"status": string,"storage_path": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chunk_count"?: number,"created_at"?: string,"document_type": string,"effective_date": string,"error_message"?: string | null,"file_name": string,"file_size_bytes": number,"id"?: string,"mime_type": string,"page_count"?: number | null,"status"?: string,"storage_path": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "chunk_count"?: number,"created_at"?: string,"document_type"?: string,"effective_date"?: string,"error_message"?: string | null,"file_name"?: string,"file_size_bytes"?: number,"id"?: string,"mime_type"?: string,"page_count"?: number | null,"status"?: string,"storage_path"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"enrichment_runs": {
                  Row: {
                    "created_at": string,"run_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"run_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"run_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"events": {
                  Row: {
                    "created_at": string,"ends_at": string | null,"id": string,"location": string | null,"name": string,"notes": string | null,"starts_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_at"?: string | null,"id"?: string,"location"?: string | null,"name": string,"notes"?: string | null,"starts_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string | null,"id"?: string,"location"?: string | null,"name"?: string,"notes"?: string | null,"starts_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"follow_ups": {
                  Row: {
                    "body": string,"channel": string,"contact_id": string,"created_at": string,"generated_by": string,"id": string,"sent_at": string | null,"status": string,"subject": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel"?: string,"contact_id": string,"created_at"?: string,"generated_by"?: string,"id"?: string,"sent_at"?: string | null,"status"?: string,"subject"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"channel"?: string,"contact_id"?: string,"created_at"?: string,"generated_by"?: string,"id"?: string,"sent_at"?: string | null,"status"?: string,"subject"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follow_ups_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"meeting_notes": {
                  Row: {
                    "author_user_id": string,"body": string,"contact_id": string,"created_at": string,"deleted_at": string | null,"done_at": string | null,"due_at": string | null,"id": string,"note_type": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_user_id": string,"body": string,"contact_id": string,"created_at"?: string,"deleted_at"?: string | null,"done_at"?: string | null,"due_at"?: string | null,"id"?: string,"note_type"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "author_user_id"?: string,"body"?: string,"contact_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"done_at"?: string | null,"due_at"?: string | null,"id"?: string,"note_type"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_notes_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"model_prices": {
                  Row: {
                    "cached_input_per_million": number | null,"input_per_million": number,"model": string,"output_per_million": number,"provider": string,"source": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cached_input_per_million"?: number | null,"input_per_million"?: number,"model": string,"output_per_million"?: number,"provider": string,"source": string,"updated_at"?: string
                  }
                  Update: {
                    "cached_input_per_million"?: number | null,"input_per_million"?: number,"model"?: string,"output_per_million"?: number,"provider"?: string,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"otel_spans": {
                  Row: {
                    "attributes": NonNullable<Json>,"created_at": string,"duration_ms": number,"ended_at": string,"events": NonNullable<Json>,"id": string,"kind": string,"name": string,"parent_span_id": string | null,"span_id": string,"started_at": string,"status_code": string,"status_message": string | null,"trace_id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attributes"?: NonNullable<Json>,"created_at"?: string,"duration_ms"?: number,"ended_at": string,"events"?: NonNullable<Json>,"id"?: string,"kind"?: string,"name": string,"parent_span_id"?: string | null,"span_id": string,"started_at": string,"status_code"?: string,"status_message"?: string | null,"trace_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"created_at"?: string,"duration_ms"?: number,"ended_at"?: string,"events"?: NonNullable<Json>,"id"?: string,"kind"?: string,"name"?: string,"parent_span_id"?: string | null,"span_id"?: string,"started_at"?: string,"status_code"?: string,"status_message"?: string | null,"trace_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"outgoing_webhooks": {
                  Row: {
                    "created_at": string,"enabled": boolean,"events": NonNullable<Json>,"id": string,"secret": string,"updated_at": string,"url": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"events"?: NonNullable<Json>,"id"?: string,"secret"?: string,"updated_at"?: string,"url": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"events"?: NonNullable<Json>,"id"?: string,"secret"?: string,"updated_at"?: string,"url"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rag_index_queue": {
                  Row: {
                    "attempts": number,"created_at": string,"entity_id": string,"entity_type": string,"error_message": string | null,"id": string,"operation": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"entity_id": string,"entity_type": string,"error_message"?: string | null,"id"?: string,"operation": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"error_message"?: string | null,"id"?: string,"operation"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sourcing_candidates": {
                  Row: {
                    "company_id": string | null,"contact_id": string | null,"created_at": string,"evidence": NonNullable<Json>,"fit_summary": string | null,"id": string,"name": string,"notes": string,"request_id": string,"shortlisted": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"evidence"?: NonNullable<Json>,"fit_summary"?: string | null,"id"?: string,"name": string,"notes"?: string,"request_id": string,"shortlisted"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "company_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"evidence"?: NonNullable<Json>,"fit_summary"?: string | null,"id"?: string,"name"?: string,"notes"?: string,"request_id"?: string,"shortlisted"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sourcing_candidates_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_candidates_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_candidates_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "sourcing_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"sourcing_requests": {
                  Row: {
                    "created_at": string,"criteria": NonNullable<Json>,"id": string,"product_description": string,"status": string,"target_market": string | null,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"criteria"?: NonNullable<Json>,"id"?: string,"product_description"?: string,"status"?: string,"target_market"?: string | null,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"criteria"?: NonNullable<Json>,"id"?: string,"product_description"?: string,"status"?: string,"target_market"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "match_rag_chunks":
{ Args: { "match_count"?: number,"match_threshold"?: number,"p_sources"?: (string)[],"p_user_id": string,"query_embedding": string }; Returns: {
              "chunk_id": string,"content": string,"document_type": string,"effective_date": string,"label": string,"page_number": number,"section_title": string,"similarity": number,"source_id": string,"source_type": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"storage": {
          Tables: {
            "buckets": {
                  Row: {
                    "allowed_mime_types": (string)[] | null,"avif_autodetection": boolean | null,"created_at": string | null,"file_size_limit": number | null,"id": string,"lifecycle_configuration": Json | null,"lifecycle_configuration_generation": string | null,"name": string,"owner": string | null,"owner_id": string | null,"public": boolean | null,"type": Database["storage"]['Enums']["buckettype"],"updated_at": string | null,"versioning_status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_mime_types"?: (string)[] | null,"avif_autodetection"?: boolean | null,"created_at"?: string | null,"file_size_limit"?: number | null,"id": string,"lifecycle_configuration"?: Json | null,"lifecycle_configuration_generation"?: string | null,"name": string,"owner"?: string | null,"owner_id"?: string | null,"public"?: boolean | null,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string | null,"versioning_status"?: string
                  }
                  Update: {
                    "allowed_mime_types"?: (string)[] | null,"avif_autodetection"?: boolean | null,"created_at"?: string | null,"file_size_limit"?: number | null,"id"?: string,"lifecycle_configuration"?: Json | null,"lifecycle_configuration_generation"?: string | null,"name"?: string,"owner"?: string | null,"owner_id"?: string | null,"public"?: boolean | null,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string | null,"versioning_status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"buckets_analytics": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"format": string,"id": string,"name": string,"type": Database["storage"]['Enums']["buckettype"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"format"?: string,"id"?: string,"name": string,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"format"?: string,"id"?: string,"name"?: string,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"buckets_vectors": {
                  Row: {
                    "created_at": string,"id": string,"type": Database["storage"]['Enums']["buckettype"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"type"?: Database["storage"]['Enums']["buckettype"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"iceberg_namespaces": {
                  Row: {
                    "bucket_name": string,"catalog_id": string,"created_at": string,"id": string,"metadata": NonNullable<Json>,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_name": string,"catalog_id": string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "bucket_name"?: string,"catalog_id"?: string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
      columns: ["catalog_id"]
isOneToOne: false
      referencedRelation: "buckets_analytics"
      referencedColumns: ["id"]
    }
                  ]
                },"iceberg_tables": {
                  Row: {
                    "bucket_name": string,"catalog_id": string,"created_at": string,"id": string,"location": string,"name": string,"namespace_id": string,"remote_table_id": string | null,"shard_id": string | null,"shard_key": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_name": string,"catalog_id": string,"created_at"?: string,"id"?: string,"location": string,"name": string,"namespace_id": string,"remote_table_id"?: string | null,"shard_id"?: string | null,"shard_key"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "bucket_name"?: string,"catalog_id"?: string,"created_at"?: string,"id"?: string,"location"?: string,"name"?: string,"namespace_id"?: string,"remote_table_id"?: string | null,"shard_id"?: string | null,"shard_key"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "iceberg_tables_catalog_id_fkey"
      columns: ["catalog_id"]
isOneToOne: false
      referencedRelation: "buckets_analytics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "iceberg_tables_namespace_id_fkey"
      columns: ["namespace_id"]
isOneToOne: false
      referencedRelation: "iceberg_namespaces"
      referencedColumns: ["id"]
    }
                  ]
                },"migrations": {
                  Row: {
                    "executed_at": string | null,"hash": string,"id": number,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "executed_at"?: string | null,"hash": string,"id": number,"name": string
                  }
                  Update: {
                    "executed_at"?: string | null,"hash"?: string,"id"?: number,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"objects": {
                  Row: {
                    "archived_at": string | null,"bucket_id": string | null,"created_at": string | null,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"last_accessed_at": string | null,"metadata": Json | null,"name": string | null,"owner": string | null,"owner_id": string | null,"path_tokens": (string)[] | null,"updated_at": string | null,"user_metadata": Json | null,"version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"bucket_id"?: string | null,"created_at"?: string | null,"id"?: string,"is_delete_marker"?: boolean,"is_versioned"?: boolean,"last_accessed_at"?: string | null,"metadata"?: Json | null,"name"?: string | null,"owner"?: string | null,"owner_id"?: string | null,"path_tokens"?: never,"updated_at"?: string | null,"user_metadata"?: Json | null,"version"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"bucket_id"?: string | null,"created_at"?: string | null,"id"?: string,"is_delete_marker"?: boolean,"is_versioned"?: boolean,"last_accessed_at"?: string | null,"metadata"?: Json | null,"name"?: string | null,"owner"?: string | null,"owner_id"?: string | null,"path_tokens"?: never,"updated_at"?: string | null,"user_metadata"?: Json | null,"version"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "objects_bucketId_fkey"
      columns: ["bucket_id"]
isOneToOne: false
      referencedRelation: "buckets"
      referencedColumns: ["id"]
    }
                  ]
                },"s3_multipart_uploads": {
                  Row: {
                    "bucket_id": string,"created_at": string,"id": string,"in_progress_size": number,"key": string,"metadata": Json | null,"owner_id": string | null,"upload_signature": string,"user_metadata": Json | null,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_id": string,"created_at"?: string,"id": string,"in_progress_size"?: number,"key": string,"metadata"?: Json | null,"owner_id"?: string | null,"upload_signature": string,"user_metadata"?: Json | null,"version": string
                  }
                  Update: {
                    "bucket_id"?: string,"created_at"?: string,"id"?: string,"in_progress_size"?: number,"key"?: string,"metadata"?: Json | null,"owner_id"?: string | null,"upload_signature"?: string,"user_metadata"?: Json | null,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
      columns: ["bucket_id"]
isOneToOne: false
      referencedRelation: "buckets"
      referencedColumns: ["id"]
    }
                  ]
                },"s3_multipart_uploads_parts": {
                  Row: {
                    "bucket_id": string,"created_at": string,"etag": string,"id": string,"key": string,"owner_id": string | null,"part_number": number,"size": number,"upload_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_id": string,"created_at"?: string,"etag": string,"id"?: string,"key": string,"owner_id"?: string | null,"part_number": number,"size"?: number,"upload_id": string,"version": string
                  }
                  Update: {
                    "bucket_id"?: string,"created_at"?: string,"etag"?: string,"id"?: string,"key"?: string,"owner_id"?: string | null,"part_number"?: number,"size"?: number,"upload_id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
      columns: ["bucket_id"]
isOneToOne: false
      referencedRelation: "buckets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
      columns: ["upload_id"]
isOneToOne: false
      referencedRelation: "s3_multipart_uploads"
      referencedColumns: ["id"]
    }
                  ]
                },"vector_indexes": {
                  Row: {
                    "bucket_id": string,"created_at": string,"data_type": string,"dimension": number,"distance_metric": string,"id": string,"metadata_configuration": Json | null,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_id": string,"created_at"?: string,"data_type": string,"dimension": number,"distance_metric": string,"id"?: string,"metadata_configuration"?: Json | null,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "bucket_id"?: string,"created_at"?: string,"data_type"?: string,"dimension"?: number,"distance_metric"?: string,"id"?: string,"metadata_configuration"?: Json | null,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vector_indexes_bucket_id_fkey"
      columns: ["bucket_id"]
isOneToOne: false
      referencedRelation: "buckets_vectors"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "allow_any_operation":
{ Args: { "expected_operations": (string)[] }; Returns: boolean
                           },
"allow_only_operation":
{ Args: { "expected_operation": string }; Returns: boolean
                           },
"can_insert_object":
{ Args: { "bucketid": string,"metadata": Json,"name": string,"owner": string }; Returns: undefined
                           },
"extension":
{ Args: { "name": string }; Returns: string
                           },
"filename":
{ Args: { "name": string }; Returns: string
                           },
"foldername":
{ Args: { "name": string }; Returns: (string)[]
                           },
"get_common_prefix":
{ Args: { "p_delimiter": string,"p_key": string,"p_prefix": string }; Returns: string
                           },
"get_size_by_bucket":
{ Args: { "delete_markers"?: string,"noncurrent_versions"?: string }; Returns: {
              "bucket_id": string,"size": number
            }[]
                           },
"list_multipart_uploads_with_delimiter":
{ Args: { "bucket_id": string,"delimiter_param": string,"max_keys"?: number,"next_key_token"?: string,"next_upload_token"?: string,"prefix_param": string,"raw_prefix_param"?: string }; Returns: {
              "created_at": string,"id": string,"key": string
            }[]
                           },
"list_objects_with_delimiter":
{ Args: { "_bucket_id": string,"delete_markers"?: string,"delimiter_param": string,"max_keys"?: number,"next_token"?: string,"next_token_archived_at"?: string,"next_token_version"?: string,"noncurrent_versions"?: string,"prefix_param": string,"sort_order"?: string,"start_after"?: string }; Returns: {
              "archived_at": string,"created_at": string,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"last_accessed_at": string,"metadata": Json,"name": string,"updated_at": string,"version": string
            }[]
                           },
"operation":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"search":
{ Args: { "bucketname": string,"delete_markers"?: string,"levels"?: number,"limits"?: number,"noncurrent_versions"?: string,"offsets"?: number,"prefix": string,"search"?: string,"sortcolumn"?: string,"sortorder"?: string }; Returns: {
              "archived_at": string,"created_at": string,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"last_accessed_at": string,"metadata": Json,"name": string,"updated_at": string,"version": string
            }[]
                           },
"search_by_timestamp":
{ Args: { "delete_markers"?: string,"noncurrent_versions"?: string,"p_bucket_id": string,"p_level": number,"p_limit": number,"p_prefix": string,"p_sort_column": string,"p_sort_column_after": string,"p_sort_order": string,"p_start_after": string,"p_start_after_version"?: string }; Returns: {
              "archived_at": string,"created_at": string,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"key": string,"last_accessed_at": string,"metadata": Json,"name": string,"updated_at": string,"version": string
            }[]
                           },
"search_v2":
{ Args: { "bucket_name": string,"delete_markers"?: string,"levels"?: number,"limits"?: number,"noncurrent_versions"?: string,"prefix": string,"sort_column"?: string,"sort_column_after"?: string,"sort_order"?: string,"start_after"?: string,"start_after_archived_at"?: string,"start_after_is_continuation"?: boolean,"start_after_version"?: string }; Returns: {
              "archived_at": string,"created_at": string,"id": string,"is_delete_marker": boolean,"is_versioned": boolean,"key": string,"last_accessed_at": string,"metadata": Json,"name": string,"updated_at": string,"version": string
            }[]
                           }
          }
          Enums: {
            "buckettype": "STANDARD"|"ANALYTICS"|"VECTOR"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        },"storage": {
          Enums: {
            "buckettype": ["STANDARD", "ANALYTICS", "VECTOR"]
          }
        }
} as const
