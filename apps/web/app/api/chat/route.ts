import 'server-only';

import { createGateway, createUIMessageStream, createUIMessageStreamResponse, streamText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@kit/supabase/server-client";
import type { Json } from "@kit/supabase/database";

import { getGatewayApiKey } from "~/lib/ai/enrichment/model-config";
import { getPrompt } from "~/lib/ai/prompts/manager";
import { resolveRagChatModel } from "~/lib/ai/rag/config";
import { type RagCitation } from "~/lib/ai/rag/db-types";
import { retrieveContext, type RagChunk } from "~/lib/ai/rag/retrieval";
import { endSpanError, endSpanOk, startUserSpan } from "~/lib/otel/trace";

const chatRequestSchema = z.object({
  /** null = tạo hội thoại mới. */
  conversation_id: z.string().uuid().nullable().optional(),
  messages: z
    .array(
      z.object({
        role: z.literal("user"),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1),
  top_k: z.number().int().min(1).max(50).optional(),
});

const DEFAULT_TOP_K = 8;
const TITLE_MAX_LENGTH = 60;

function errorResponse(
  code: string,
  message: string,
  requestId: string,
  status: number,
) {
  return NextResponse.json(
    { code, message, request_id: requestId },
    { status },
  );
}

/** Dựng khối CONTEXT đánh số [1], [2]... từ các chunk truy xuất được. */
function buildContextText(chunks: RagChunk[]): string {
  if (chunks.length === 0) {
    return "(Không tìm thấy đoạn trích liên quan nào trong tài liệu và danh bạ.)";
  }
  return chunks
    .map((chunk, i) => {
      const n = i + 1;
      let source: string;
      if (chunk.source_type === "document") {
        const parts = [chunk.label];
        if (chunk.document_type) parts.push(chunk.document_type);
        if (typeof chunk.page_number === "number") {
          parts.push(`trang ${chunk.page_number}`);
        } else if (chunk.section_title) {
          parts.push(`mục "${chunk.section_title}"`);
        }
        if (chunk.effective_date) {
          parts.push(`hiệu lực từ ${chunk.effective_date}`);
        }
        source = parts.join(", ");
      } else {
        source = `${chunk.label} (danh bạ)`;
      }
      return `[${n}] ${source}\n${chunk.content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * POST /api/chat
 *
 * Chat RAG streaming: lưu tin nhắn user → retrieveContext (T006) →
 * streamText qua AI Gateway (capability rag_chat) với system prompt
 * tiếng Việt (prompts/system.md) → stream UIMessage về client, kèm data
 * part `data-citations` cuối stream; onFinish lưu tin nhắn assistant.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse(
      "unauthorized",
      "Vui lòng đăng nhập.",
      requestId,
      401,
    );
  }

  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "invalid_request",
      "Dữ liệu gửi lên không hợp lệ.",
      requestId,
      400,
    );
  }

  const { conversation_id, messages, top_k } = parsed.data;
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return errorResponse(
      "invalid_request",
      "Dữ liệu gửi lên không hợp lệ.",
      requestId,
      400,
    );
  }
  const topK = top_k ?? DEFAULT_TOP_K;

  // Xác định hội thoại: dùng lại nếu client gửi id (phải thuộc về user),
  // tạo mới với title = 60 ký tự đầu của tin nhắn khi id null.
  let conversationId: string;
  if (conversation_id) {
    const { data: existing, error } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", conversation_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !existing) {
      return errorResponse(
        "conversation_not_found",
        "Không tìm thấy đoạn chat.",
        requestId,
        404,
      );
    }
    conversationId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("chat_conversations")
      .insert({
        user_id: user.id,
        title: lastMessage.content.slice(0, TITLE_MAX_LENGTH),
      })
      .select("id")
      .single();
    if (error || !created) {
      return errorResponse(
        "conversation_create_failed",
        "Không tạo được đoạn chat mới.",
        requestId,
        500,
      );
    }
    conversationId = created.id;
  }

  // Lưu tin nhắn của user trước khi gọi model.
  const { error: userMsgError } = await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: lastMessage.content,
    citations: [],
  });
  if (userMsgError) {
    return errorResponse(
      "message_save_failed",
      "Không lưu được tin nhắn.",
      requestId,
      500,
    );
  }

  // Cấu hình model chat RAG (capability rag_chat → env RAG_CHAT_MODEL).
  const chatConfig = await resolveRagChatModel(user.id, supabase);
  if (!chatConfig.enabled || !chatConfig.model) {
    return errorResponse(
      "ai_not_configured",
      "Chưa cấu hình model chat RAG. Vào Cài đặt → Mô hình AI để bật capability rag_chat hoặc đặt biến RAG_CHAT_MODEL.",
      requestId,
      503,
    );
  }
  const gatewayApiKey = getGatewayApiKey();
  if (!gatewayApiKey) {
    return errorResponse(
      "ai_not_configured",
      "Chưa cấu hình AI Gateway (AI_GATEWAY_API_KEY).",
      requestId,
      503,
    );
  }

  // Trace OTel cho chat RAG: span `rag.chat` mở từ trước khi truy xuất context
  // và chỉ đóng khi stream kết thúc (onFinish) / lỗi (onError) / client ngắt
  // (abort). Không dùng withUserSpan ở đây vì streamText() của AI SDK là lazy —
  // withUserSpan sẽ đóng span ngay khi streamText() trả về, trước cả khi model
  // được gọi. Xem tab "Trace AI" ở /home/nhat-ky.
  const chatSpan = startUserSpan("rag.chat", user.id, {
    "rag.conversation_id": conversationId,
    "rag.model": chatConfig.model,
    "rag.top_k": topK,
  });
  let spanFinished = false;
  const finishSpanOk = () => {
    if (!spanFinished) {
      spanFinished = true;
      endSpanOk(chatSpan);
    }
  };
  const finishSpanError = (err: unknown) => {
    if (!spanFinished) {
      spanFinished = true;
      endSpanError(chatSpan, err);
    }
  };
  request.signal.addEventListener("abort", () => finishSpanError(new Error("client aborted")), {
    once: true,
  });

  // Truy xuất context (embed query + RPC match_rag_chunks, lọc theo user).
  let chunks: RagChunk[];
  try {
    ({ chunks } = await retrieveContext(user.id, lastMessage.content, topK));
  } catch (err) {
    finishSpanError(err);
    return errorResponse(
      "ai_not_configured",
      err instanceof Error ? err.message : "Không truy xuất được ngữ cảnh.",
      requestId,
      503,
    );
  }
  chatSpan.setAttribute("rag.chunks_count", chunks.length);

  // Citations theo contracts/rag-api.md: lưu DB (chat_messages.citations)
  // và gửi client qua data part cuối stream.
  const citations: RagCitation[] = chunks.map((chunk, i) => ({
    index: i + 1,
    source_type: chunk.source_type,
    source_id: chunk.source_id,
    label: chunk.label,
    page_number: chunk.page_number,
    section_title: chunk.section_title,
    effective_date: chunk.effective_date,
    snippet: chunk.content.slice(0, 300),
  }));

  const systemPrompt = (await getPrompt('rag_chat', user.id, supabase)).replace(
    "{{CONTEXT}}",
    buildContextText(chunks),
  );

  const gateway = createGateway({ apiKey: gatewayApiKey });
  const result = streamText({
    model: gateway(chatConfig.model),
    system: systemPrompt,
    messages: messages.map((m) => ({ role: "user" as const, content: m.content })),
    // Lưu tin nhắn assistant + citations khi stream xong (fire-and-forget,
    // không chặn stream trả về cho client). Đồng thời đóng span `rag.chat`
    // với token usage để tab Trace AI hiển thị đầy đủ.
    onFinish: async ({ text, usage, finishReason }) => {
      try {
        await supabase.from("chat_messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: text,
          citations: citations as unknown as Json,
        });
      } catch {
        // Bỏ qua lỗi lưu — câu trả lời đã stream về client.
      }
      chatSpan.setAttribute("rag.finish_reason", finishReason);
      chatSpan.setAttribute("rag.citations_count", citations.length);
      if (usage) {
        chatSpan.setAttribute("rag.input_tokens", usage.inputTokens ?? 0);
        chatSpan.setAttribute("rag.output_tokens", usage.outputTokens ?? 0);
        chatSpan.setAttribute("rag.total_tokens", usage.totalTokens ?? 0);
      }
      finishSpanOk();
    },
  });

  // Stream UIMessage về client; ghi data part `data-citations` ở cuối stream
  // trước khi stream đóng, để UI render panel "Nguồn tham khảo".
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.merge(
        result.toUIMessageStream({
          onEnd: () => {
            writer.write({ type: "data-citations", data: citations });
          },
        }),
      );
    },
    onError: (err) => {
      finishSpanError(err);
      return "Đã xảy ra lỗi khi tạo câu trả lời.";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
