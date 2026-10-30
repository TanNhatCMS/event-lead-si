import 'server-only';

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessageChunk,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@kit/supabase/server-client";
import type { Json } from "@kit/supabase/database";

import {
  buildModelChain,
  ModelFailoverError,
  runWithModelFailover,
  type ModelChainLink,
} from "~/lib/ai/model-failover";
import { getPrompt } from "~/lib/ai/prompts/manager";
import { resolveChatModelConfig } from "~/lib/ai/rag/config";
import { type RagCitation } from "~/lib/ai/rag/db-types";
import { retrieveContext, type RagChunk } from "~/lib/ai/rag/retrieval";
import { recordUsage } from "~/lib/ai/usage";
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

/** Gom chi tiết từng lượt thử failover thành một dòng log cho response. */
function describeFailoverAttempts(error: ModelFailoverError): string {
  const detail = error.attempts
    .map(
      (attempt) =>
        `${attempt.provider}/${attempt.model}${attempt.keyIndex > 0 ? ` (key #${attempt.keyIndex + 1})` : ""}: ${attempt.reason}`,
    )
    .join("; ");
  return detail ? `${error.message} Chi tiết: ${detail}` : error.message;
}

/**
 * Nhãn provider cho bảng giá/usage: "vision" là bí danh gateway của capability
 * card_recognition — chuẩn hoá về "gateway"; provider khác giữ nguyên (đã
 * lowercase để khớp cách lưu của các luồng AI khác).
 */
function usageProviderLabel(provider: string): string {
  const value = (provider ?? "").trim().toLowerCase();
  return value === "vision" ? "gateway" : value;
}

/**
 * Bọc stream UIMessage và ĐỌC SỚM chunk đầu tiên để phát hiện lỗi
 * request-time của model (401/429/5xx…) — streamText của AI SDK là lazy và
 * lỗi model xuất hiện dưới dạng chunk `error` bên trong stream chứ không
 * phải rejection, nên phải consume chunk đầu mới biết lần gọi có sống không.
 *
 * - Chunk đầu là `error` → ném lỗi GỐC (bắt qua onError của toUIMessageStream)
 *   để vòng failover phân loại bằng isRetryableModelError và thử link/key kế.
 * - reader.read() tự rejection (lỗi trước stream) → ném lại nguyên bản.
 * - Chunk đầu hợp lệ → trả stream mới phát lại chunk đầu + toàn bộ phần còn
 *   lại; khi nguồn kết thúc sẽ phát chunk trailer (data-citations) trước khi
 *   đóng — giữ nguyên giao thức client hiện có (thay cho onEnd cũ).
 *
 * GIỚI HẠN ĐÃ BIẾT: lỗi xảy ra GIỮA stream (sau chunk đầu) KHÔNG failover
 * được — phần đã stream cho client không thể phát lại trên model khác.
 */
async function primeUIMessageStream(
  stream: ReadableStream<UIMessageChunk>,
  trailer: UIMessageChunk,
  onErrorCapture: { current: unknown },
): Promise<ReadableStream<UIMessageChunk>> {
  const reader = stream.getReader();
  let first: ReadableStreamReadResult<UIMessageChunk>;
  try {
    first = await reader.read();
  } catch (err) {
    try {
      await reader.cancel(err);
    } catch {
      // ignore
    }
    throw err;
  }
  if (first.done) {
    throw new Error("Model không trả về dữ liệu nào.");
  }
  if (first.value.type === "error") {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    const captured = onErrorCapture.current;
    if (captured instanceof Error && captured.message.trim()) {
      throw captured;
    }
    throw new Error(
      "errorText" in first.value && first.value.errorText
        ? first.value.errorText
        : "Model trả về lỗi ngay khi bắt đầu stream.",
    );
  }
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue(first.value);
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(trailer);
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch {
        // ignore
      }
    },
  });
}

/**
 * POST /api/chat
 *
 * Chat RAG streaming: lưu tin nhắn user → retrieveContext (T006) → dựng
 * chuỗi model failover (capability rag_chat: gateway | provider trực tiếp |
 * openai-compatible, đa API key + config.fallbacks) → streamText qua
 * `runWithModelFailover` với system prompt tiếng Việt (prompts/system.md) →
 * stream UIMessage về client, kèm data part `data-citations` cuối stream;
 * onFinish lưu tin nhắn assistant.
 *
 * Failover ở mức setup: từng link (model) × từng key được thử khi lỗi xuất
 * hiện NGAY LÚC tạo stream hoặc trong lần consume đầu (chunk đầu tiên của
 * stream là lỗi). Lỗi giữa chừng sau khi đã stream dữ liệu không failover
 * được (hạn chế đã biết — xem primeUIMessageStream).
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

  // Cấu hình model chat RAG đa provider (capability rag_chat →
  // env RAG_CHAT_PROVIDER + RAG_CHAT_MODEL) và chuỗi failover tương ứng
  // (mỗi link mang danh sách key của provider: DB → legacy → env).
  const chatConfig = await resolveChatModelConfig(user.id, supabase);
  if (!chatConfig.enabled || !chatConfig.model) {
    return errorResponse(
      "ai_not_configured",
      "Chưa cấu hình model chat RAG. Vào Cài đặt → Mô hình AI để bật capability rag_chat hoặc đặt biến RAG_CHAT_MODEL.",
      requestId,
      503,
    );
  }
  const chain = await buildModelChain({
    userId: user.id,
    supabase,
    config: {
      provider: chatConfig.provider,
      model: chatConfig.model,
      baseUrl: chatConfig.baseUrl,
      source: chatConfig.source,
      fallbacks: chatConfig.fallbacks,
    },
  });
  if (
    chain.length === 0 ||
    // Fast-fail thân thiện: mọi link đều thiếu key và không phải
    // openai-compatible (self-host có thể không cần key).
    !chain.some(
      (link) =>
        link.keys.length > 0 || link.provider === "openai-compatible",
    )
  ) {
    return errorResponse(
      "ai_not_configured",
      "Chưa cấu hình API key cho model chat RAG (provider " +
        `${chatConfig.provider}) — đặt key ở khung API Keys trong /admin/settings hoặc biến môi trường của provider.`,
      requestId,
      503,
    );
  }

  // Trace OTel cho chat RAG: span `rag.chat` mở từ trước khi truy xuất context
  // và chỉ đóng khi stream kết thúc (onFinish) / lỗi (onError) / client ngắt
  // (abort). Không dùng withUserSpan ở đây vì streamText() của AI SDK là lazy —
  // withUserSpan sẽ đóng span ngay khi streamText() trả về, trước cả khi model
  // được gọi. Xem tab "Trace AI" ở /admin/nhat-ky.
  const chatSpan = startUserSpan("rag.chat", user.id, {
    "rag.conversation_id": conversationId,
    "rag.model": chatConfig.model,
    "rag.provider": chatConfig.provider,
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

  // Link đã dùng thực tế — biết sau khi failover chọn xong; onFinish chạy
  // sau đó nên đọc qua holder để ghi usage đúng model/provider đã gọi.
  const usedLinkRef: { current: ModelChainLink | null } = { current: null };
  // Mốc đo latency của lượt stream (streamText lazy — hoàn tất ở onFinish).
  const streamStartedAt = Date.now();

  let primedStream: ReadableStream<UIMessageChunk>;
  let failoverAttempts = 0;
  try {
    ({ result: primedStream, used: usedLinkRef.current, attempts: failoverAttempts } =
      await runWithModelFailover({
        chain,
        userId: user.id,
        supabase,
        execute: (model) => {
          usedLinkRef.current = null;
          const onErrorCapture: { current: unknown } = { current: null };
          const result = streamText({
            model,
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
                    // citations là cột jsonb NOT NULL (NonNullable<Json>).
                    citations: citations as unknown as NonNullable<Json>,
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
              // Thống kê token/chi phí — best-effort (recordUsage tự nuốt lỗi).
              // onError của stream không mang usage nên chỉ ghi khi stream hoàn tất.
              // Ghi theo link ĐÃ DÙNG (provider/model thực tế của lượt gọi).
              const used = usedLinkRef.current;
              await recordUsage({
                userId: user.id,
                source: "rag_chat",
                provider: used
                  ? usageProviderLabel(used.provider)
                  : chatConfig.provider,
                model: used?.model ?? chatConfig.model ?? "",
                usage,
                latencyMs: Date.now() - streamStartedAt,
                supabase,
              });
              finishSpanOk();
            },
          });
          // Failover trên lần consume đầu: đọc chunk đầu của UI stream ngay
          // tại đây (trước khi trả response) để 401/429… chuyển sang key/link kế.
          return primeUIMessageStream(
            result.toUIMessageStream({
              onError: (error) => {
                onErrorCapture.current = error;
                // Giữ nguyên text mặc định của AI SDK cho error chunk tới client.
                return "An error occurred.";
              },
            }),
            { type: "data-citations", data: citations },
            onErrorCapture,
          );
        },
      }));
  } catch (err) {
    finishSpanError(err);
    if (err instanceof ModelFailoverError) {
      return errorResponse(
        "ai_request_failed",
        describeFailoverAttempts(err),
        requestId,
        502,
      );
    }
    return errorResponse(
      "ai_request_failed",
      err instanceof Error ? err.message : "Không tạo được câu trả lời.",
      requestId,
      502,
    );
  }

  const usedLink = usedLinkRef.current;
  if (usedLink) {
    chatSpan.setAttribute("rag.model", usedLink.model);
    chatSpan.setAttribute("rag.provider", usageProviderLabel(usedLink.provider));
    chatSpan.setAttribute("rag.failover_attempts", failoverAttempts);
  }

  // Stream UIMessage về client; stream đã được prime (chunk đầu hợp lệ) nên
  // writer.merge chỉ bọc lại luồng. Chunk `data-citations` được phát ở cuối
  // stream bởi primeUIMessageStream, để UI render panel "Nguồn tham khảo".
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.merge(primedStream);
    },
    onError: (err) => {
      finishSpanError(err);
      return "Đã xảy ra lỗi khi tạo câu trả lời.";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
