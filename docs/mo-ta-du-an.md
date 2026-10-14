# EventLead SI — Mô tả dự án

## Tổng quan

**EventLead SI** là web app quản lý lead và khách hàng cho công ty tổ chức sự kiện,
chạy ở chế độ **single-user** (một tài khoản dùng toàn bộ hệ thống, không có mô hình
tổ chức/nhóm).

Ứng dụng kết hợp quản lý danh bạ truyền thống với AI: quét danh thiếp bằng vision,
làm giàu dữ liệu tự động, chatbot RAG tra cứu tài liệu nội bộ, và gợi ý sourcing
nhà cung cấp — với nguyên tắc xuyên suốt **"AI gợi ý, người quyết định"**:
mọi thao tác quan trọng đều cần con người xác nhận, hệ thống không tự gửi bất cứ
thứ gì ra ngoài.

## Tính năng chính

### Danh bạ & quan hệ
- **Quét danh thiếp** (`/home/quet-danh-thiep`): chụp ảnh → AI vision trích xuất
  7 trường kèm confidence → người dùng xem lại từng trường, bấm xác nhận mới lưu.
- **Danh bạ** (`/home/danh-ba`): tìm kiếm, lọc, phát hiện trùng lặp, xuất
  CSV/Excel/vCard.
- **Công ty** (`/home/cong-ty`): hồ sơ công ty, tạo link chia sẻ công khai
  (`/chia-se/[token]`) không cần đăng nhập.
- **Ghi chú cuộc gặp**: ghi chú theo liên hệ, nhắc lịch follow-up.
- **Trí tuệ quan hệ** (`/home/quan-he`): đồ thị kết nối liên hệ — công ty,
  tìm "cầu nối" giới thiệu (AI chỉ gợi ý người trung gian phù hợp).

### AI
- **Trợ lý RAG** (`/home/tro-ly`): chatbot tra cứu trên 2 kho tri thức —
  tài liệu upload (PDF/DOCX/TXT) và danh bạ nội bộ. Mọi câu trả lời kèm trích dẫn
  nguồn (tên file + số trang/tiêu đề mục). Dự thảo báo giá chỉ trích nguyên văn
  số liệu, chatbot không tự tính toán.
- **Quản lý tài liệu RAG**: upload (bắt buộc chọn loại + ngày hiệu lực), xem cách
  chia chunk, xử lý lại khi lỗi. Chunking thích ứng theo loại tài liệu
  (bảng giá chunk nhỏ, hợp đồng chunk lớn).
- **Làm giàu dữ liệu**: sau khi quét card, agent tự động chuẩn hoá SĐT, suy ra
  website công ty, tìm kiếm web bổ sung — trả về gợi ý kèm confidence và nguồn.
- **Sourcing** (`/home/sourcing`): AI gợi ý ứng viên nhà cung cấp từ danh bạ,
  soạn câu hỏi xác minh, thư RFQ, dàn ý đàm phán.
- **Follow-up**: AI soạn tin nhắn chăm sóc khách hàng dựa trên ghi chú cuộc gặp.

### Quản trị & quan sát
- **Mô hình AI** (`/home/cai-dat/ai-models`): chọn model AI Gateway cho từng
  năng lực (card recognition, enrichment, sourcing, RAG chat, embeddings).
- **Prompts AI** (`/home/cai-dat/prompts`): tùy chỉnh 7 system prompts qua UI,
  khôi phục về mặc định khi cần.
- **Nhật ký** (`/home/nhat-ky`): audit log mọi hành động + tab **Trace AI**
  xem waterfall OpenTelemetry của từng lần gọi AI (model, thời gian, token).

## Kiến trúc kỹ thuật

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Next.js 16 │────▶│  Supabase    │────▶│ AI Gateway  │
│  App Router │     │  Postgres    │     │ (OpenAI-    │
│  React 19   │     │  + pgvector  │     │  compatible)│
└─────────────┘     │  + Auth      │     └─────────────┘
                    │  + Storage   │
                    └──────────────┘
```

- **Frontend**: Next.js 16.3 (App Router), React 19, Tailwind CSS 4, shadcn/ui,
  next-intl (Tiếng Việt mặc định).
- **Backend**: Route Handlers Next.js, Supabase (Postgres + pgvector + Auth +
  Storage). RLS `auth.uid() = user_id` trên mọi bảng nghiệp vụ.
- **AI**: Vercel AI SDK v7 — `streamText` (chat), `embedMany` (embeddings),
  `generateText` + tool calling (agent enrichment). Không dùng LangChain.
- **RAG**: chunking recursive (~1000 ký tự, overlap ~200, thích ứng theo loại),
  embeddings 1536 chiều, tìm kiếm vector HNSW trên pgvector, ngưỡng similarity 0.3.
- **Quan sát**: OpenTelemetry — span các bước AI lưu vào bảng `otel_spans`.
- **Monorepo**: Turborepo — `apps/web` (app chính), `packages/*` (shared).

## Luồng dữ liệu chính

1. **Quét card**: ảnh → vision model → 7 trường + confidence → user xác nhận →
   lưu contact → (tùy chọn) enrichment agent bổ sung thông tin.
2. **RAG**: upload tài liệu → extract text (giữ số trang/tiêu đề mục) → chunking
   thích ứng → embeddings → pgvector. Chat: câu hỏi → embedding → retrieval
   2 kho (tài liệu + danh bạ) → lọc bản mới nhất → LLM trả lời kèm citations.
3. **Sourcing**: yêu cầu → AI gợi ý ứng viên từ danh bạ → user chọn → soạn
   RFQ/đàm phán → user gửi thủ công.

## Bảo mật

- Single-user: mọi dữ liệu gắn `user_id`, RLS chặn truy cập chéo.
- Service-role key và API keys chỉ dùng phía server, không bao giờ ra client.
- Bucket `documents` private; link chia sẻ công ty dùng token ngẫu nhiên
  qua service-role phía server.
- Egress guard chặn IP nội bộ và cloud metadata cho tool web_fetch.

## Trạng thái

Xem `README.md` để biết cách chạy dev và danh sách migrations.
Hướng dẫn deploy Vercel: `docs/huong-dan-deploy.md`.
Sổ tay RAG tham khảo: `docs/rag-handbook-viet-tay.md`.
