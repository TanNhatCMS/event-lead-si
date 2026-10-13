# Sổ tay RAG & LLM (bản viết tay v1.0)

> Trích xuất text từ 16 hình infographic trong series "RAG & LLMs SERIES VIẾT TAY v1.0"
> (nguồn: @datasciencebrain) + 1 hình "Top 15 RAG Concepts" tiếng Anh.
> Mục đích: tài liệu tham khảo khi xây dựng hạ tầng agent RAG cho EventLead SI.
> Trích ngày 2026-10-13. Hình mới bổ sung sau sẽ được append tiếp vào cuối.

## Ánh xạ nhanh vào EventLead SI (spec 002-rag-chatbot)

| Khái niệm trong sổ tay | Áp dụng ở EventLead |
|---|---|
| Document parsing (PDF/DOCX/TXT) | T002 — trích text giữ số trang (pdfjs-dist/mammoth) |
| Chunking ~1000 ký tự, overlap ~200, recursive splitter | T003 — đã chốt trong spec |
| Embeddings 1536 chiều | T003 — `RAG_EMBEDDING_MODEL`, capability `rag_embedding` |
| Vector DB (Pinecone/Qdrant/...) | Thay bằng **pgvector + HNSW trên Supabase sẵn có** (single-user, không thêm DB ngoài) — T001 |
| Metadata filtering | Q2-A đã chốt: metadata loại tài liệu + ngày hiệu lực khi upload — T001/T002 |
| Time-aware RAG | Ưu tiên bản đang hiệu lực, nêu rõ dùng bản nào (Q2-A) |
| Routing RAG (multi-source) | 2 kho song song: tài liệu upload vs danh bạ nội bộ — T006 |
| Grounding & citation | Q3-A đã chốt: tên file + tiêu đề mục/đoạn gần nhất; danh bạ: tên hồ sơ — T006/T007 |
| QUOTE-MODE (số liệu trích nguyên văn, không bịa) | T007 — system prompt luật chống bịa số |
| Hybrid search + rerank | Để phase sau; spec hiện tại: vector search + ngưỡng similarity 0.3 |
| Evaluation (SC-001..SC-008) | T011 — bộ 30 câu hỏi kiểm thử chấp nhận |

---

## Phần 1. Kiến thức nền tảng về LLM

*Hiểu nền tảng. Xây dựng tương lai.*

### LLM là gì?

LLM (Large Language Model) là một mô hình AI được huấn luyện trên lượng dữ liệu
văn bản khổng lồ, tạo ra và tương tác bằng ngôn ngữ của con người.

- Học các pattern từ văn bản
- Hiểu ngữ cảnh
- Tạo phản hồi giống con người
- Có thể fine-tune cho các tác vụ cụ thể

Ví dụ: GPT-4o (OpenAI), Gemini 1.5 (Google), Claude 3 (Anthropic), Llama 3 (Meta),
Mistral Large.

Vì sao LLM quan trọng?

- Vận hành chatbot, copilot và trợ lý ảo
- Tự động hóa việc tạo nội dung và tóm tắt
- Hiểu và phân tích văn bản phi cấu trúc
- Cho phép tương tác tự nhiên với dữ liệu và hệ thống
- Nền tảng cho nhiều ứng dụng AI (RAG, Agents, v.v.)

LLM hoạt động thế nào (tổng quan):
Dữ liệu văn bản khổng lồ → Training (Pretraining) → Model học các pattern → Sinh văn bản.

### Năng lực chính

- **Sinh văn bản**: Tạo câu trả lời, câu chuyện, code, email, v.v.
- **Thấu hiểu**: Tóm tắt, phân loại, dịch thuật, trích xuất thông tin.
- **Suy luận**: Giải quyết vấn đề, lập luận logic, trả các câu hỏi phức tạp.
- **Làm theo chỉ dẫn**: Tuân theo hướng dẫn và các ràng buộc của người dùng.
- **Thích ứng**: Thích ứng với tác vụ mới thông qua fine-tuning hoặc prompting.

### Khái niệm cốt lõi

1. **Model**: Mạng neural đã được huấn luyện (ví dụ: GPT-4o).
2. **Parameters**: Các trọng số (weights) mà model học được (hàng tỷ trong các LLM hiện đại).
3. **Token**: Đơn vị nhỏ nhất của văn bản (từ/mảnh từ/ký tự).
4. **Context Window**: Lượng văn bản tối đa mà model có thể "ghi nhớ" cùng lúc.
5. **Inference**: Dùng model để sinh output từ input.
6. **Probability**: LLM dự đoán token tiếp theo dựa trên xác suất.

### Các loại LLM (theo mục đích sử dụng)

- **Base Models**: Huấn luyện trên dữ liệu khổng lồ, dùng cho mục đích chung
  (ví dụ: Llama, GPT base).
- **Instruction Tuned**: Huấn luyện trên dữ liệu làm theo chỉ dẫn (ví dụ: Alpaca, Vicuna).
- **Chat Models**: Tối ưu cho hội thoại (ví dụ: ChatGPT).
- **Code Models**: Chuyên về sinh code (ví dụ: CodeLlama, StarCoder).
- **Multimodal Models**: Làm việc với văn bản, hình ảnh, âm thanh, video.

### Văn bản được xử lý thế nào?

Văn bản đầu vào ("Hello, how are you?") → Tokenization → Token IDs
([15496, 11, 1128, 389, 345, 30]) → Embeddings (0.12, -0.45, 0.33, ..., 0.91)
→ Model (Neural Network) → Văn bản đầu ra ("I'm good, thank you!").

*LLM không hiểu từ ngữ như con người. Chúng làm việc với các con số (token và pattern).*

### Điểm mạnh & hạn chế

Điểm mạnh: Hiểu ngôn ngữ tự nhiên; Tạo văn bản giống con người; Tổng quát hóa
cho nhiều tác vụ; Giảm thời gian phát triển; Tăng năng suất.

Hạn chế: Có thể tạo ra thông tin sai (hallucinations); Bị giới hạn bởi dữ liệu
huấn luyện; Không có kiến thức real-time (trừ khi được kết nối); Tốn nhiều tài
nguyên tính toán; Vấn đề đạo đức & quyền riêng tư.

---

## Phần 2. Transformers & Attention

*Trái tim của các LLM hiện đại.*

### Transformer là gì?

Một kiến trúc deep learning được giới thiệu trong bài báo "Attention Is All You Need"
(2017). Nó chỉ dựa vào cơ chế attention, loại bỏ recurrence và convolution.

- Xử lý toàn bộ chuỗi song song
- Nắm bắt được các phụ thuộc xa (long-range dependencies)
- Khả năng mở rộng cao và hiệu quả
- Nền tảng của các model như GPT, BERT, T5, PaLM, v.v.

Tổng quan kiến trúc: Input (Văn bản) → Encoder (N x) → Decoder (N x) → Output
(Văn bản/Xác suất).

- Encoder-only: BERT, RoBERTa (tác vụ hiểu — Understanding)
- Decoder-only: GPT, LLaMA (tác vụ sinh — Generation)
- Seq2Seq dùng cả hai: T5, BART

### Các thành phần chính

1. **Input Embedding**: Chuyển token thành các vector dày đặc (dense vector).
2. **Positional Encoding**: Thêm thông tin vị trí (vì transformer không có recurrence).
3. **Multi-Head Attention**: Cơ chế cốt lõi để tập trung vào những phần quan trọng của chuỗi.
4. **Add & Norm**: Residual connection + Layer Normalization.
5. **Feed Forward Network**: Hai lớp linear kèm hàm kích hoạt (activation).
6. **Masking**: Ngăn việc nhìn thấy các token tương lai (trong decoder).

### Self-Attention (ý tưởng cốt lõi)

Mỗi từ nhìn vào tất cả các từ trong chuỗi và quyết định mức độ chú ý dành cho
từng từ. *Mọi token đều chú ý lẫn nhau!*

### Scaled Dot-Product Attention

- Inputs: Q (Query), K (Key), V (Value).
- Công thức: `Attention(Q, K, V) = softmax(QKᵀ / √d_k) V`
- Trong đó: d_k = số chiều của key; QKᵀ = điểm tương đồng (similarity score);
  Softmax = chuyển điểm số thành xác suất.

### Multi-Head Attention

Chạy nhiều phép attention song song (Head 1, Head 2, ..., Head h → Concat → Linear).
Mỗi head học một cách biểu diễn khác nhau; giúp model nắm bắt các mối quan hệ đa
dạng. Thường h = 8, 12, 16...

### Transformer Block (Decoder)

Input Embedding → (+) Positional Encoding → Masked Multi-Head Self-Attention
→ Add & Norm → Multi-Head Masked Attention → Add & Norm → Feed Forward Network
→ Add & Norm.

- **Masked Multi-Head Self-Attention**: Mỗi vị trí chỉ chú ý đến các vị trí phía trước.
- **Multi-Head Masked Attention**: Chú ý lên output của encoder (trong các model encoder-decoder).
- **Feed Forward Network**: Áp dụng theo từng vị trí và giống hệt nhau.
- **Add & Norm**: Residual connection + LayerNorm giúp ổn định và cho gradient tốt hơn.

*"Attention giúp model tập trung vào điều quan trọng nhất."*

### Positional Encoding

Vì transformer không có recurrence, ta thêm thông tin vị trí vào embeddings:

- `PE(pos, 2i) = sin(pos / 10000^(2i/d_model))`
- `PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))`

→ Cộng vào input embeddings. Điều này giúp model hiểu thứ tự của các token.

### Các loại Transformer Model

- **Encoder-Only**: BERT, RoBERTa, DeBERTa (tác vụ hiểu — Understanding).
- **Decoder-Only**: GPT, LLaMA, Mistral (tác vụ sinh — Generation).
- **Encoder-Decoder**: T5, BART, mT5 (tác vụ Seq2Seq).

### Vì sao là Transformers?

Nắm bắt phụ thuộc xa; Song song hóa cao; Hiệu năng tốt hơn trên dữ liệu lớn;
Mở rộng tới hàng tỷ tham số; Nền tảng của các LLM hiện đại.

---

## Phần 3. Tokens, Embeddings & Context Window

*Biến văn bản thành ý nghĩa cho LLM.*

### 1. Tokens

Token là đơn vị cơ bản của văn bản mà LLM hiểu được. Chúng có thể là từ, subword,
hoặc thậm chí là ký tự.

Ví dụ — Văn bản: "I love building AI products! 😊"

- Word-level Tokens: `I | love | building | AI | products | ! | 😊`
- Subword Tokens (ví dụ BPE): `I | love | build | ing | AI | product | s | ! | 😊`

Điểm chính:

- LLM dùng subword tokenization (như BPE/WordPiece).
- Chuyển mọi văn bản thành một chuỗi token ID.
- Vocabulary nhỏ hơn, xử lý tốt hơn các từ hiếm & lỗi chính tả.

Tokenization hoạt động thế nào: Raw Text "building" → Tokenizer (BPE/WordPiece)
→ Token IDs [123, 456] → Embeddings [...].

Các Tokenizer phổ biến: GPT Models → tiktoken (BPE); BERT Models → WordPiece;
Llama Models → SentencePiece; Gemma/PaLM → SentencePiece.

Token ID là các con số đại diện cho token trong vocabulary của model. Các ID này
sau đó được chuyển thành embeddings (vector).

### 2. Embeddings

Embeddings là các biểu diễn vector dày đặc (dense vector) của token. Chúng nắm bắt
ý nghĩa và mối quan hệ giữa các từ.

| Token | Embedding Vector (Dimension = 5) | Ý nghĩa |
|---|---|---|
| king | [0.21, -0.13, 0.45, 0.33, -0.52] | Hoàng gia, Nam |
| queen | [0.20, -0.11, 0.44, 0.31, -0.49] | Hoàng gia, Nữ |
| man | [0.19, -0.30, 0.10, 0.25, -0.10] | Nam |
| woman | [0.18, -0.28, 0.11, 0.24, -0.10] | Nữ |

(Nghĩa tương tự thì nằm gần nhau hơn trong không gian vector.)

Điểm chính:

- Embeddings ánh xạ token sang vector nhiều chiều.
- Các token tương đồng về ngữ nghĩa có vector tương tự.
- Model học các embedding này trong quá trình training.
- Các embedding model phổ biến: word2vec, GloVe, FastText, BERT, OpenAI Ada.

Embeddings được dùng trong LLM thế nào: Token IDs [101, 203, 502, ...] →
Embedding Layer (Lookup Table) → Dense Vector Representations.

- Mỗi token ID tra cứu một vector trong embedding matrix.
- Các vector này được đưa vào các lớp Transformer.
- Positional Encoding được cộng thêm để giữ thứ tự từ.

*Input đưa vào Transformer = Token Embedding + Positional Encoding.*

### 3. Context Window

Context Window là số lượng token tối đa mà LLM có thể xử lý trong một lần. Nó bao
gồm cả token đầu vào (prompt) và đầu ra (response).

Ví dụ — Tổng Context Window 8,192 token: System Prompt (500) + User Prompt (2,000)
+ Model Response (tối đa 5,692).

Điểm chính:

- Khi context window đầy, các token cũ hơn sẽ bị quên.
- Context window lớn hơn = hiểu tài liệu dài tốt hơn.
- Mỗi model có kích thước context khác nhau: GPT-4 Turbo 128K token; Claude 3 Opus
  200K token; Llama 3 (8B/70B) 8K–128K token; Gemini 1.5 Pro 1M token.

Ví dụ thực tế: Bạn đặt câu hỏi về một tài liệu 50 trang — 30 trang đầu (trong window)
thì model "nhìn thấy" được; 20 trang cuối (ngoài window) thì không.

Giải pháp: Chia nhỏ tài liệu (chunking); Dùng RAG để truy xuất các chunk liên quan;
Tóm tắt và chỉ đưa vào thông tin thiết yếu.

Vì sao quan trọng? Context dài hơn = tốt hơn cho RAG, tóm tắt, code, hội thoại;
giúp model ghi nhớ nhiều thông tin hơn. *Nhiều context hơn, thông minh hơn!*

---

## Phần 4. Prompt Engineering

*Prompt tốt hơn → Phản hồi tốt hơn → Kết quả tốt hơn.*

### 1. Prompt Engineering là gì?

Nghệ thuật và khoa học của việc thiết kế đầu vào (prompt) để hướng LLM tạo ra
output chính xác, phù hợp và chất lượng cao.

- Vấn đề không nằm ở model, mà ở cách bạn hỏi.
- Prompt tốt = Chỉ dẫn rõ ràng + Ngữ cảnh đúng + Cấu trúc tốt.

### 2. Cấu trúc của một prompt tốt

Instruction (Bạn muốn model làm gì) → Context (Thông tin nền hoặc tình huống cần
hiểu) → Input Data (Dữ liệu hoặc thông tin cần xử lý) → Constraints (Quy tắc, giới
hạn, định dạng, giọng điệu, độ dài, v.v.) → Output Format (Cách bạn muốn câu trả
lời được trình bày).

*Bạn cung cấp những yếu tố này càng rõ ràng, output càng tốt!*

### 3. Nguyên tắc viết prompt

- Rõ ràng & cụ thể
- Cung cấp đủ ngữ cảnh
- Chia nhỏ tác vụ phức tạp thành các bước
- Chỉ định định dạng output
- Đưa ra ví dụ (Few-Shot Prompting)
- Nêu rõ các ràng buộc
- Lặp lại và tinh chỉnh
- Kiểm thử các edge case

*Prompt tốt giúp giảm sự mơ hồ và giúp model suy nghĩ đúng hướng.*

### 4. Kỹ thuật prompting (kèm ví dụ)

| Kỹ thuật | Mô tả | Ví dụ (đơn giản hóa) |
|---|---|---|
| Zero-Shot | Hỏi trực tiếp, không kèm ví dụ. | "Tóm tắt bài viết này." |
| Few-Shot | Cung cấp ví dụ trước khi hỏi. | "Q: 2+2=? A: 4 / Q: 3+3=? A: 6 / Q: 5+5=? A:" |
| Chain-of-Thought (CoT) | Yêu cầu model suy nghĩ từng bước. | "Hãy giải bài này từng bước. Nếu một đoàn tàu đi..." |
| Role Prompting | Gán một vai trò hoặc persona cho model. | "Bạn là một Data Scientist. Hãy giải thích regression một cách đơn giản." |
| Self-Consistency | Hỏi nhiều lần và chọn câu trả lời tốt nhất. | "Giải bài toán này theo nhiều cách khác nhau và chọn câu trả lời tốt nhất." |
| Tree of Thoughts (Nâng cao) | Khám phá nhiều hướng suy luận. | "Hãy nghĩ đến tất cả các cách tiếp cận có thể và chọn cách tối ưu nhất." |

### 5. Ví dụ trước & sau

- Prompt yếu: "Giải thích AI." → Quá mơ hồ → Output chung chung.
- Prompt mạnh: "Bạn là một giáo viên. Hãy giải thích Artificial Intelligence bằng từ
  ngữ đơn giản cho một đứa trẻ 10 tuổi. Đưa ra 3 ví dụ thực tế và giữ trong vòng
  150 từ." → Rõ ràng → Phù hợp → Output tốt hơn.

### 6. Ví dụ Few-Shot

Phân loại cảm xúc của các review sau: Positive, Neutral hoặc Negative.

- Review: Mình rất thích sản phẩm này! Dùng rất tốt. → Positive
- Review: Pin hết quá nhanh. → Negative
- Review: Cũng ổn, không phải tốt nhất nhưng cũng không tệ. → Neutral
- Review: Thiết kế tuyệt vời và rất cao cấp. → (để model điền)

### 7. Ví dụ Chain-of-Thought

Q: Nếu một cửa hàng bán 4 cuộn vở với giá ₹40, thì 7 cuộn vở giá bao nhiêu?
Hãy suy nghĩ từng bước:
1 cuộn vở = 40 / 4 = ₹10
7 cuộn vở = 7 × 10 = ₹70
Đáp án: ₹70 ✓

*CoT giúp model chia nhỏ vấn đề và giảm sai sót.*

### 8. Sử dụng ràng buộc

- Đặt giới hạn số từ/ký tự.
- Xác định giọng điệu (trang trọng, thân mật, kỹ thuật).
- Chỉ rõ những gì cần bao gồm / loại trừ.
- Nêu các quy tắc nghiệp vụ hoặc lĩnh vực.

Ví dụ: "Viết một email chuyên nghiệp gửi khách hàng để xin lỗi vì sự chậm trễ.
Giữ dưới 100 từ và dùng giọng điệu lịch sự."

### 9. Định dạng output

Yêu cầu model trả lời theo một định dạng cụ thể: Table, JSON, Bullet List, Markdown.

Ví dụ: "Cho tôi top 3 ngôn ngữ lập trình dưới dạng JSON."
`{"languages": ["Python", "JavaScript", "Go"], "count": 3}`

### 10. Mẹo & best practices

- Bắt đầu đơn giản và lặp lại.
- Giữ prompt ở dạng module và có thể tái sử dụng.
- Đánh giá output và tinh chỉnh prompt.
- Dùng dấu phân cách ("", ###, \<tag>) cho rõ ràng.
- Kết hợp các kỹ thuật để có kết quả tốt nhất.
- Luôn kiểm thử với các edge case.
- Lưu lại tài liệu về prompt để tái sử dụng.

## Phần 5. Kiến trúc LLM

*Cách Large Language Model vận hành bên trong.*

### 1. LLM là gì?

LLM (Large Language Model) là các model deep learning được huấn luyện trên lượng dữ
liệu văn bản khổng lồ để hiểu, tạo ra và tương tác bằng ngôn ngữ tự nhiên.

- Dựa trên kiến trúc Transformer
- Được huấn luyện để dự đoán token tiếp theo
- Có khả năng suy luận, sinh văn bản, dịch thuật, tóm tắt và nhiều hơn nữa

### 2. Kiến trúc tổng quan

Input Text ("Explain LLM architecture") → Tokenization (Chuyển văn bản thành token
[101, 2054, 2083, 29871, 102]) → Embedding Layer (Chuyển token thành dense vector)
→ Transformer Block (Lặp lại N lần) (Encoder/Decoder với cơ chế Attention)
→ Output Layer (Softmax) (Dự đoán xác suất token tiếp theo).

Auto-regressive generation (từng token một).

### 3. Transformer Block (tổng quan)

Input Embeddings → (+) Positional Encoding → Layer Norm → Masked Multi-Head
Self-Attention → Layer Norm → Feed Forward Network (FFN), với các residual connection.

- **Masked Multi-Head Self-Attention**: Cho phép mỗi vị trí chỉ chú ý đến các vị trí phía trước.
- **Add & Norm** (Residual Connection + Layer Normalization): Cải thiện độ ổn định
  khi training và giúp gradient lan truyền tốt hơn.
- **Feed Forward Network**: Hai lớp linear với một hàm phi tuyến ở giữa (ReLU / GeLU).

*Decoder block được xếp chồng N lần (ví dụ: 24, 48 hoặc nhiều hơn) tùy theo kích
thước model.*

### 4. Self-Attention (ý tưởng cốt lõi)

Self-attention giúp model tập trung vào những phần liên quan nhất của input.

Input Embeddings (x1, x2, x3 ... xn) → W_Q (Query), W_K (Key), W_V (Value) →
`Attention(Q, K, V) = softmax(QKᵀ / √d_k) V`; Q = XW_Q, K = XW_K, V = XW_V.

- Nắm bắt phụ thuộc xa
- Song song hóa hoàn toàn & hiệu quả
- Nền tảng của Transformers
- Giúp hiểu ngữ cảnh

### 5. Các thành phần của kiến trúc LLM

| # | Thành phần | Mô tả |
|---|---|---|
| 1 | Token Embedding Layer | Chuyển token ID thành dense vector có số chiều d_model. |
| 2 | Positional Encoding | Thêm thông tin vị trí vì transformer không có recurrence. |
| 3 | Transformer Blocks | Chồng các decoder block (Masked Self-Attention + FFN). |
| 4 | Layer Normalization | Chuẩn hóa activation để training ổn định và nhanh hơn. |
| 5 | Output Projection | Ánh xạ hidden state về kích thước vocabulary bằng một lớp linear. |
| 6 | Softmax | Chuyển logits thành phân phối xác suất trên token tiếp theo. |

### 6. Kiến trúc Decoder-Only (hầu hết LLM)

Vì sao Decoder-Only? Đơn giản hơn; Khả năng mở rộng cao; Rất tốt cho việc sinh.
Ví dụ: GPT, LLaMA, Mistral, Gemma, Phi.

Stacked Decoder Blocks: Token + Positional Embeddings → Decoder Block 1 →
Decoder Block 2 → ... → Decoder Block N.

Đặc điểm chính: Causal (masked) self-attention; Autoregressive generation;
Dự đoán token tiếp theo dựa trên các token trước đó; Dùng cho chat, code,
dịch thuật, tóm tắt, suy luận.

### 7. Kích thước LLM phổ biến (ví dụ)

| Model | Parameters | Layers | Hidden Size (d_model) | Attention Heads |
|---|---|---|---|---|
| GPT-2 Small | 117M | 12 | 768 | 12 |
| GPT-2 Medium | 345M | 24 | 1024 | 16 |
| LLaMA 2 7B | 7B | 32 | 4096 | 32 |
| LLaMA 2 13B | 13B | 40 | 5120 | 40 |
| GPT-4 (ước tính) | ~1.8T | ~120 | ~12288 | ~96 |

*Lưu ý: Nhiều tham số & layer hơn → năng lực tốt hơn nhưng cần nhiều compute
& dữ liệu hơn.*

### 8. Training Objective

LLM được huấn luyện bằng Next Token Prediction.
Input Tokens: T1, T2, T3, ..., T_{n-1} → Dự đoán Tn.

### 9. Inference (Generation)

1. Người dùng cung cấp một prompt.
2. Model chuyển prompt → token → embeddings.
3. Đi qua các decoder block xếp chồng.

### 10. Vì sao kiến trúc này hiệu quả?

- Học được các biểu diễn phong phú
- Hiểu ngữ cảnh sâu sắc
- Mở rộng tốt theo dữ liệu & compute

---

## Phần 6. Pretraining & Fine-tuning

*Từ kiến thức tổng quát đến trí tuệ chuyên biệt.*

### 1. Pretraining & Fine-tuning là gì?

- **Pretraining**: Huấn luyện model trên lượng dữ liệu tổng quát khổng lồ để học
  các pattern và kiến thức rộng.
- **Fine-tuning**: Tiếp tục huấn luyện model đã pretrain trên dữ liệu của một tác
  vụ hoặc lĩnh vực cụ thể để model chính xác và hữu ích hơn cho tác vụ đó.

Ví dụ so sánh: Pretraining (Học mọi thứ) → Fine-tuning (Học chuyên sâu) →
Model chuyên biệt (Làm việc).

### 2. Giai đoạn Pretraining

Dữ liệu khổng lồ (Sách, bài báo, Web, Code, v.v.) → Self-Supervised Learning →
Foundation Model (Mục đích chung).

Hoạt động thế nào?

- Model dự đoán token tiếp theo dựa trên các token trước đó.
- Học các pattern ngôn ngữ, sự kiện, khả năng suy luận, ngữ pháp, kiến thức về thế giới, v.v.
- Không cần gán nhãn thủ công (self-supervised).
- Tốn rất nhiều compute (GPU/TPU) + thời gian.

Mục tiêu: Next Token Prediction. Input: "The cat sat on the" ← Target: "mat".

### 3. Giai đoạn Fine-tuning

Pretrained Model → Dữ liệu theo tác vụ/lĩnh vực (có nhãn) → Fine-tuned Model.

Hoạt động thế nào?

- Bắt đầu với các trọng số đã pretrain.
- Huấn luyện trên tập dữ liệu nhỏ hơn, chất lượng cao, có gán nhãn.
- Model thích ứng với tác vụ hoặc lĩnh vực cụ thể.
- Cần ít compute & thời gian hơn pretraining.

Tác vụ ví dụ: Phân loại văn bản; Dịch thuật; Hỏi đáp; Tóm tắt; Sinh code; Chatbot.

### 4. Pretraining vs Fine-tuning

| Khía cạnh | Pretraining | Fine-tuning |
|---|---|---|
| Mục tiêu | Học hiểu ngôn ngữ tổng quát | Thích ứng với tác vụ/lĩnh vực cụ thể |
| Dữ liệu | Dữ liệu không nhãn khổng lồ (hàng TB văn bản) | Dữ liệu có nhãn nhỏ hơn (vài GB) |
| Kiểu học | Self-Supervised (Next Token Prediction) | Supervised / học theo tác vụ |
| Compute | Rất cao | Thấp hơn |
| Thời gian | Vài tuần / vài tháng | Vài giờ / vài ngày |
| Output | Foundation Model (Mục đích chung) | Model chuyên biệt (theo tác vụ) |
| Ví dụ | GPT-4, Llama 3 (Base), PaLM, Gemini (Base) | ChatGPT (RLHF + SFT), Code Llama (Code Data) |

### 5. Các phương pháp fine-tuning phổ biến

- **Full Fine-Tuning**: Cập nhật toàn bộ tham số của model.
- **Parameter-Efficient Fine-Tuning (PEFT)**: LoRA, QLoRA, Adapters, Prefix Tuning,
  Prompt Tuning → Chỉ huấn luyện một ít tham số bổ sung (hiệu quả).
- **Instruction Tuning**: Fine-tune trên các cặp chỉ dẫn + phản hồi.
- **Domain Adaptation**: Fine-tune trên kho dữ liệu chuyên ngành.

### 6. Luồng ví dụ (End-to-End)

Raw Text (Internet, sách, Wikipedia, v.v.) → Pretraining (Next Token Prediction)
→ Pretrained Model → Labeled Data (Tác vụ của bạn) → Fine-tuning (Supervised
Learning) → Fine-tuned Model (Sẵn sàng sử dụng!).

### 7. Mục tiêu Pretraining (chi tiết)

Hầu hết LLM dùng Causal Language Modeling (CLM). Cho chuỗi [The, cat, sat, on, the, mat],
model học cách dự đoán từng token theo:

- Input: [The] → Dự đoán: cat
- Input: [The, cat] → Dự đoán: sat
- Input: [The, cat, sat, on] → Dự đoán: the
- ...
- Input: [The, cat, sat, on, the] → Dự đoán: mat

Loss = Cross Entropy Loss trên tất cả các token.

### 8. Loss Function

Cross Entropy Loss: `L = -Σ(t=1→T) log P(x_t | x_<t)`

Trong đó: x_t = token tiếp theo thực tế; P(x_t | x_<t) = xác suất dự đoán (model);
T = tổng số token.

### 9. Vì sao fine-tuning quan trọng?

- Giúp model hiểu rõ tác vụ.
- Tăng độ chính xác trên các tác vụ cụ thể.
- Giảm hallucination (với dữ liệu tốt).
- Thích ứng với phong cách, giọng điệu, lĩnh vực.
- Hiện thực hóa các ứng dụng thực tế.

---

## Phần 7. Instruction Tuning & RLHF

*Giúp LLM hữu ích, trung thực & vô hại.*
(RLHF = Reinforcement Learning from Human Feedback)

### 1. Vì sao cần vượt ra ngoài pretraining?

LLM đã pretrain biết rất nhiều, nhưng chúng:

- Không làm theo chỉ dẫn tốt
- Có thể đưa ra câu trả lời sai hoặc không an toàn
- Không biết con người thích kiểu phản hồi nào

*Instruction Tuning + RLHF giúp model phù hợp (align) với ý định và giá trị của con người.*

### 2. Tổng quan Alignment Pipeline

Pretrained LLM (Base Model) → Instruction Tuning (SFT) (Dạy model làm theo chỉ dẫn)
→ Reward Model Training (Học sở thích của con người) → RLHF (PPO) (Tối ưu model để
tối đa hóa sự ưa thích của con người) → Aligned LLM (Hữu ích, Trung thực, Vô hại).

### 3. Instruction Tuning (SFT)

Mục tiêu: Dạy model làm theo chỉ dẫn và tạo ra các phản hồi hữu ích.

Hoạt động thế nào?

- Dùng một tập dữ liệu gồm các cặp (Instruction, Input, Output).
- Fine-tune model đã pretrain bằng Supervised Fine-Tuning (SFT).
- Model học cách ánh xạ chỉ dẫn thành phản hồi chất lượng cao.

Ví dụ (dữ liệu huấn luyện):

| Instruction | Input (Context) | Output (Response) |
|---|---|---|
| Giải thích quá trình quang hợp. | - | Quang hợp là quá trình thực vật sử dụng... |
| Dịch sang tiếng Hindi. | Good morning | शुभ प्रभात |
| Viết một hàm Python để cộng hai số. | - | def add(a, b): return a + b |

Loss Function: Cross Entropy Loss.

### 4. Reward Model Training (Preference Modeling)

Mục tiêu: Học xem con người thích gì.

- Con người xếp hạng nhiều phản hồi cho cùng một prompt.
- Reward model học cách dự đoán phản hồi nào tốt hơn.
- Được huấn luyện như một binary classifier hoặc regression model.

Ví dụ — Prompt: "Tập thể dục có lợi ích gì?"
Mức độ ưa thích của con người (Tốt nhất → Tệ nhất): A > B > C.

- A: "Tập thể dục đều đặn giúp cải thiện sức khỏe, nâng cao tâm trạng, tăng cường miễn dịch..."
- B: "Tập thể dục tốt cho sức khỏe và giúp ích theo nhiều cách."
- C: "Mình nghĩ tập thể dục có thể ổn, nhưng không chắc lắm."

Reward model học: score(A) > score(B) > score(C).
Loss Function: Pairwise Ranking Loss / Bradley-Terry Loss.

### 5. RLHF (với PPO)

Mục tiêu: Tạo ra phản hồi tối đa hóa sự ưa thích của con người bằng reinforcement learning.

Hoạt động thế nào?

- Policy khởi tạo chính là model đã qua instruction tuning.
- Reward model chấm điểm phản hồi.
- PPO cập nhật policy để tối đa hóa reward nhưng vẫn giữ nó gần với model gốc
  (tránh bị lệch — drifting).

PPO Loop: Prompt → Model (Policy) sinh phản hồi → Reward Model chấm điểm phản hồi
→ PPO Update (Cải thiện Policy) → lặp lại.

Mục tiêu (đơn giản hóa): `Maximize E_y~πθ[R(y)] − β KL(πθ | πref)`

Trong đó: R(y) = reward từ reward model; πθ = policy hiện tại (model);
πref = reference policy (model SFT); β = hệ số phạt KL (KL penalty coefficient).

### 6. SFT vs RLHF

| Khía cạnh | SFT (Instruction Tuning) | RLHF |
|---|---|---|
| Mục đích | Dạy model làm theo chỉ dẫn | Align model với sở thích & giá trị của con người |
| Tín hiệu huấn luyện | Câu trả lời chuẩn (ground truth) | Sự ưa thích của con người (ngầm định) |
| Phương pháp | Supervised Fine-Tuning | Reinforcement Learning (PPO) dùng Reward Model |
| Dữ liệu | Các cặp Instruction-Response | Xếp hạng / sở thích của con người |
| Tối ưu | Độ chính xác khi làm theo chỉ dẫn | Chất lượng, tính hữu ích, trung thực, vô hại |
| Output | Tốt nhưng có thể cứng nhắc hoặc không an toàn | Phù hợp hơn, an toàn & hữu ích hơn |

### 7. Dữ liệu sử dụng

- **Instruction Datasets** (cho SFT): Alpaca, Dolly, FLAN, OpenOrca, ShareGPT, v.v.
- **Preference Datasets** (cho RLHF): Anthropic HH-RLHF, OpenAI WebGPT,
  StackExchange comparisons, v.v.

### 8. Lợi ích

- Làm theo chỉ dẫn tốt hơn
- Phản hồi hữu ích và phù hợp hơn
- Giảm output độc hại, thiên lệch hoặc có hại
- Hiểu được các sở thích tinh tế của con người

### 9. Thách thức

- Phản hồi từ con người tốn kém và mất thời gian
- Sở thích mang tính chủ quan & thiếu nhất quán
- Reward hacking (lách luật để lấy điểm cao từ reward model)
- Thiên lệch (bias) trong phản hồi của con người

---

## Phần 8. Nền tảng về Retrieval-Augmented Generation (RAG)

*Đưa kiến thức của riêng bạn vào LLM.*

### 1. RAG là gì?

RAG (Retrieval-Augmented Generation) là một kỹ thuật kết hợp sức mạnh của LLM với
các nguồn kiến thức bên ngoài.

Ý tưởng: Thay vì chỉ dựa vào dữ liệu huấn luyện của LLM, ta truy xuất thông tin
liên quan từ một knowledge base và đưa nó cho model làm ngữ cảnh.

Mục tiêu: Đưa ra câu trả lời chính xác, cập nhật và chuyên sâu theo lĩnh vực,
ít hallucination hơn.

### 2. Vì sao cần RAG?

Vấn đề của LLM (khi dùng một mình):

- Kiến thức bị giới hạn ở mốc training cut-off
- Có thể đưa ra thông tin lỗi thời
- Hallucination với dữ liệu cụ thể / riêng tư
- Không thể truy cập tài liệu hoặc database riêng của bạn

RAG giúp gì:

- Truy cập dữ liệu mới nhất hoặc dữ liệu riêng tư
- Phản hồi chính xác hơn và có căn cứ (grounded)
- Giảm hallucination
- Bạn kiểm soát nguồn kiến thức

### 3. RAG vs LLM (không có RAG)

LLM (không có RAG): Trả lời chỉ từ kiến thức nội tại; Có thể lỗi thời; Khả năng
sai/bịa câu trả lời cao hơn; Không truy cập được dữ liệu riêng của bạn.

RAG (có RAG): Trả lời dựa trên ngữ cảnh liên quan được truy xuất; Thông tin cập
nhật; Chính xác hơn và có căn cứ; Dùng dữ liệu riêng / chuyên ngành của bạn.

### 4. RAG Pipeline (tổng quan)

1. **User Query** ("RAG là gì?")
2. **Retrieve** — Tìm thông tin liên quan (Top-k kết quả)
3. **Augment** — Thêm tài liệu truy xuất vào prompt
4. **Generate** — LLM tạo câu trả lời dựa trên ngữ cảnh đã bổ sung

`Query → (Search) Retrieve → (Thêm ngữ cảnh) Augment → (LLM) Generate → Answer`

### 5. Các thành phần cốt lõi

| Thành phần | Mô tả |
|---|---|
| Knowledge Source | Nơi lưu dữ liệu của bạn (PDF, Docs, DB, Website, API, Confluence, v.v.) |
| Retriever | Tìm kiếm trong knowledge base và trả về các kiến thức liên quan nhất. |
| Augmentor | Kết hợp ngữ cảnh truy xuất được với truy vấn của người dùng để tạo prompt nâng cao. |
| LLM (Generator) | Tạo câu trả lời cuối cùng dựa trên prompt đã bổ sung. |
| Answer | Phản hồi cuối cùng hiển thị cho người dùng. |

### 6. Cách hoạt động (từng bước)

1. **Ingestion**: Tải tài liệu từ nhiều nguồn khác nhau.
2. **Chunking**: Chia tài liệu thành các chunk nhỏ hơn, có ý nghĩa.
3. **Embedding**: Chuyển các chunk thành biểu diễn vector.
4. **Indexing**: Lưu embeddings vào Vector Database.
5. **Query Embedding**: Chuyển truy vấn của người dùng thành vector.
6. **Retrieval**: Tìm top-k chunk liên quan từ vector DB.
7. **Augmentation**: Thêm các chunk này vào prompt.
8. **Generation**: LLM tạo câu trả lời cuối cùng.

(Docs → Chunks → Embeddings [0.12, -0.34, ...] → Vector DB)

### 7. Các loại RAG

- **Naive RAG**: Truy xuất top-k chunk và đưa thẳng vào LLM.
- **Advanced RAG**: Bao gồm reranking, query rewriting, metadata filtering.
- **Hybrid RAG (Sparse + Dense)**: Kết hợp keyword search (BM25) + vector search.
- **Multi-Modal RAG**: Truy xuất từ văn bản, bảng, hình ảnh, code, v.v.

### 8. Luồng ví dụ (hỗ trợ e-commerce)

User: "Chính sách đổi trả cho sản phẩm mua khi giảm giá là gì?"
→ Retrieve: Lấy các phần chính sách liên quan từ tài liệu
→ Augment: Thêm chúng vào prompt
→ Generate: LLM tạo câu trả lời
→ Answer: "Sản phẩm giảm giá có thể được đổi trả trong vòng 7 ngày nếu còn nguyên
tình trạng ban đầu..."

### 9. Lợi ích

- Kiến thức luôn cập nhật
- Câu trả lời chuyên sâu theo lĩnh vực
- Chính xác & đáng tin cậy hơn
- Giảm hallucination
- Kiểm soát được kiến thức
- Phù hợp hơn cho doanh nghiệp và dữ liệu riêng tư

## Phần 9. Document Loading & Chunking

*Dữ liệu tốt vào → Chunk tốt ra → RAG tốt hơn.*

### 1. Document Loading là gì?

Document Loading là quá trình nhập dữ liệu từ nhiều nguồn khác nhau vào RAG pipeline
theo một định dạng có cấu trúc để có thể xử lý được.

- Hỗ trợ nhiều loại file và nguồn
- Chuyển dữ liệu thô sang định dạng chuẩn
- Chuẩn bị dữ liệu cho chunking và embedding

Mục tiêu: Đưa toàn bộ kiến thức của bạn vào hệ thống một cách sạch sẽ và dễ sử dụng.

### 2. Các nguồn Document Loading

PDF (File PDF — Báo cáo, bài báo, tài liệu hướng dẫn); Word (File Word/Docx);
TXT (File Text .txt); Trang web (URL); Database (SQL, NoSQL); Email (.eml);
Cloud Storage (Drive, S3, OneDrive).

Công cụ/thư viện phổ biến: LangChain Document Loaders, LlamaIndex Readers,
Unstructured, PyPDF, BeautifulSoup, v.v.

### 3. Document Loading Pipeline (tổng quan)

Source (Nơi chứa dữ liệu) → Loader (Đọc & trích xuất) → Parser (Trích xuất văn bản)
→ Document Objects (Định dạng chuẩn).

Document Object (ví dụ):

```
page_content: "Đây là một đoạn văn mẫu ..."
metadata: {
  "source": "example.pdf",
  "page": 1,
  "author": "An"
}
```

*Metadata cực kỳ quan trọng cho việc lọc (filtering) và truy vết (traceability)!*

### 4. Vì sao cần chunking?

Vấn đề:

- Tài liệu quá lớn so với context window của LLM
- Thông tin không liên quan làm tăng nhiễu
- Khó truy xuất chính xác thông tin
- Lãng phí token

Chunking giúp:

- Chia tài liệu lớn thành các phần nhỏ, có ý nghĩa
- Cải thiện độ chính xác khi truy xuất
- Vừa với context window
- Semantic search tốt hơn

(Tài liệu lớn → các chunk nhỏ hơn)

*Quy tắc vàng: Chunk thông minh, không chỉ là chunk nhỏ.*

### 5. Các chiến lược chunking

| Chiến lược | Cách hoạt động | Phù hợp cho |
|---|---|---|
| Fixed Size | Chia văn bản thành các chunk có kích thước cố định (ví dụ: 500 token) | Mục đích chung |
| Recursive Character Text Splitter | Chia theo đoạn văn → câu → từ nếu lớn hơn chunk size | Phổ biến nhất & hiệu quả |
| Semantic Chunking | Nhóm văn bản dựa trên độ tương đồng ngữ nghĩa (dùng embeddings) | Giữ ngữ cảnh tốt hơn |
| Document Structure Based | Dùng heading, section, tiêu đề để chia | Tài liệu kỹ thuật, Markdown, HTML |

### 6. Tham số chunking (hãy tinh chỉnh!)

- **Chunk Size**: Số ký tự/token trong mỗi chunk. Thông thường: 300–1000 token.
- **Chunk Overlap**: Số token chồng lấn giữa các chunk liên tiếp để giữ ngữ cảnh.
  Thông thường: 50–200 token.
- **Separator**: Các ký tự dùng để chia (\n\n, \n, ! ? v.v.)
- **Length Function**: Hàm đo kích thước (len, tiktoken, v.v.)

Cấu hình ví dụ:

```
chunk_size = 800
chunk_overlap = 100
separators = ["\n\n", "\n", " ", ""]
length_function = tiktoken_len
```

Mẹo: Chunk nhỏ hơn → truy xuất chính xác hơn nhưng nhiều embedding hơn.
Chunk lớn hơn → nhiều ngữ cảnh hơn nhưng truy xuất kém chính xác hơn.

### 7. Ví dụ chunking

Tài liệu gốc: "RAG kết hợp retrieval và generation. Đầu tiên nó truy xuất các tài
liệu liên quan từ một knowledge base và sau đó dùng chúng làm ngữ cảnh để tạo ra
câu trả lời chính xác. Điều này giúp giảm hallucination và cải thiện độ chính xác
về mặt dữ kiện."

Sau khi chunking (Size = 50 từ, Overlap = 10 từ):

- **Chunk 1**: "RAG kết hợp retrieval và generation. Đầu tiên nó truy xuất các tài
  liệu liên quan từ một..." (← 10 từ overlap)
- **Chunk 2**: "...knowledge base và sau đó dùng chúng làm ngữ cảnh để tạo ra câu
  trả lời chính xác. Điều này giúp..." (← 10 từ overlap)
- **Chunk 3**: "...giảm hallucination và cải thiện độ chính xác về mặt dữ kiện."

### 8. Best practices

- Luôn làm sạch văn bản trước khi chunking. Loại bỏ boilerplate, header, footer, số trang.
- Dùng recursive splitter để có kết quả tốt nhất.
- Giữ overlap để duy trì ngữ cảnh.
- Lưu metadata cùng mỗi chunk (source, page, title, date, v.v.)
- Thử nghiệm với các chunk size khác nhau tùy use case.
- Kiểm tra thủ công các chunk với tài liệu quan trọng.

Không nên:

- Chunk quá nhỏ (mất ngữ cảnh)
- Chunk quá lớn (thông tin không liên quan)
- Không có overlap
- Bỏ qua metadata

### 9. Công cụ có thể dùng

- LangChain: PyPDFLoader, WebBaseLoader, TextLoader, CSVLoader, v.v.

### 10. Mini checklist

- Mình đã load đúng dữ liệu chưa?
- Dữ liệu đã sạch và có cấu trúc chưa?

---

## Phần 10. Embeddings & Vector Databases

*Biến văn bản thành vector. Lưu trữ thông minh. Tìm kiếm tốt hơn.*

### 1. Embeddings là gì?

Embeddings là các biểu diễn vector dạng số của văn bản (hoặc dữ liệu khác) nắm bắt
ý nghĩa trong một không gian nhiều chiều.

- Nghĩa tương tự → vector gần nhau
- Nghĩa khác nhau → vector xa nhau
- Hỗ trợ semantic search, clustering, retrieval và nhiều hơn nữa

Ví dụ: `"king" − "man" + "woman" ≈ "queen"` (Embeddings nắm bắt được các mối quan hệ).

### 2. Embeddings hoạt động thế nào

Văn bản "The cat sat on the mat." → Embedding Model (OpenAI Ada, BGE, MiniLM,
all-MiniLM, ...) → Vector (Embedding) [0.013, -0.221, 0.305, -0.074, 0.482, ...,
0.714] (ví dụ: 1536 chiều) → Vector Space.

*Embeddings chuyển mọi văn bản thành những con số mà máy có thể so sánh.*

### 3. Đặc tính của embeddings tốt

- **Semantic Meaning**: Các văn bản tương tự nằm gần nhau trong không gian vector.
- **Generalization**: Hoạt động tốt với dữ liệu chưa từng thấy.
- **Contextual**: Nắm bắt ý nghĩa trong ngữ cảnh.
- **Robustness**: Xử lý được nhiễu và các biến thể.
- **Compact**: Lượng thông tin lớn trong vector có kích thước cố định.

### 4. Trực quan hóa embeddings (ví dụ 2D)

Trong không gian nhiều chiều (768, 1024, 1536...), các mục tương tự nằm gần nhau:

- Động vật (mèo, chó, ngựa)
- Trái cây (táo, xoài, chuối)
- Phương tiện (ô tô, xe đạp, tàu hỏa)
- Quốc gia (Ấn Độ, Mỹ, Nhật Bản)

### 5. Các embedding model phổ biến

| Model | Số chiều | Điểm mạnh | Use Cases |
|---|---|---|---|
| OpenAI text-embedding-3-small | 1536 | Chất lượng cao, hiệu năng mạnh | Mục đích chung, RAG, search |
| BAAI/bge-small-en-v1.5 | 384 | Chất lượng tốt, nhẹ, open source | RAG, semantic search |
| sentence-transformers/all-MiniLM-L6-v2 | 384 | Nhanh, nhẹ, open source | Prototyping, ứng dụng nhỏ |
| intfloat/multilingual-e5-small | 384 | Hỗ trợ đa ngôn ngữ | RAG đa ngôn ngữ |
| Cohere embed-english-v3.0 | 1024 | Mạnh cho retrieval | Enterprise search |

*Chọn model dựa trên chất lượng, kích thước, độ trễ (latency), chi phí & khả năng
hỗ trợ ngôn ngữ.*

### 6. Vector Database — là gì & vì sao?

Vector Database lưu trữ embeddings và cho phép tìm kiếm tương đồng (similarity
search) nhanh.

Vì sao cần chúng?

- Lưu trữ hàng triệu vector
- Thực hiện similarity search (nearest neighbors)
- Mở rộng tốt & tối ưu cho dữ liệu nhiều chiều
- Làm nền tảng cho RAG và các ứng dụng semantic

Hoạt động thế nào: Query [0.12, -0.23, ...] → Vector DB (Embeddings đã lưu) →
Top-k kết quả tương đồng: 1. ... 0.12, 2. ... 0.21, 3. ... 0.35.

### 7. Vector Search (tìm kiếm tương đồng)

Cho một query vector q và các document vector d1, d2, ..., dn, tìm các vector
tương đồng nhất.

Các metric tương đồng phổ biến:

- **Cosine Similarity** (phổ biến nhất): `cos(θ) = (A·B) / (|A||B|)`
- **Dot Product**: `A·B = Σi Ai·Bi`
- **Euclidean Distance**: `d(A,B) = √(Σi (Ai − Bi)²)`

Ví dụ Cosine Similarity: Query (q) [0.1, -0.2, 0.3, 0.4, ...]; Document Vectors:
d1 [0.1, -0.1, 0.2, 0.3, ...] → 0.92; d2 [-0.2, 0.1, -0.3, 0.2, ...] → 0.21;
d3 [0.3, 0.4, -0.1, 0.2, ...] → 0.15. Kết quả top → **d1** (tương đồng nhất).

### 8. Các Vector Database phổ biến

| Vector DB | Loại | Điểm mạnh | Phù hợp cho |
|---|---|---|---|
| Pinecone | Managed (Cloud) | Dễ dùng, mở rộng tốt, hiệu năng cao | Production RAG, enterprise |
| Weaviate | Open Source (Self/Cloud) | Hybrid search, filtering, GraphQL, modules | Semantic search, ứng dụng AI |
| Qdrant | Open Source (Self/Cloud) | Nhanh, nhẹ, payload filtering | RAG, recommendation, ứng dụng real-time |
| Milvus | Open Source (Self/Cloud) | Mở rộng cao, hỗ trợ multi-modal | Quy mô lớn, vector workload phức tạp |
| Chroma | Open Source (Local/Cloud) | Đơn giản, thân thiện với developer, xây dựng cho ứng dụng LLM | Prototyping, ứng dụng RAG nhỏ |

*Tất cả đều hỗ trợ similarity search trên vector nhiều chiều.*

### 9. Luồng end-to-end (với Vector DB)

Tài liệu → Load & Chunk → Tạo Embeddings [0.12, -0.23, 0.35, ...] → Lưu vào
Vector DB → Query "RAG là gì?" → Embed Query [0.15, -0.19, 0.31, ...] →
Similarity Search → Top-k kết quả → Gửi đến LLM.

*Dữ liệu tốt vào → truy xuất tốt hơn → câu trả lời tốt hơn.*

---

## Phần 11. Retrieval & Reranking

*Tìm đúng. Xếp hạng tốt hơn. Sinh câu trả lời thông minh hơn.*

### 1. Retrieval & Reranking là gì?

- **Retrieval** tìm một tập các tài liệu liên quan (ứng viên — candidates) từ
  knowledge base.
- **Reranking** sắp xếp lại các ứng viên đó bằng một model mạnh hơn để đưa các tài
  liệu liên quan nhất lên đầu.

Mục tiêu: Đảm bảo ngữ cảnh liên quan nhất đến được LLM để có câu trả lời chính
xác và đáng tin cậy.

### 2. Vị trí trong RAG pipeline

User Query ("RAG là gì?") → Retrieve (Tìm kiếm ban đầu) (Top-N ứng viên) →
Rerank (Sắp xếp lại) → Select Top-K (Ngữ cảnh cuối cùng) (Top-K tài liệu) →
Generate (LLM) (Câu trả lời).

*Retrieval tốt hơn + reranking tốt hơn = câu trả lời tốt hơn.*

### 3. Retrieval — cách hoạt động

1. **Query Embedding**: Chuyển query thành vector.
2. **Vector Search**: Tìm các vector tương đồng trong Vector DB (Similarity Search → Vector DB).
3. **Top-N Candidates**: Trả về N chunk tương đồng nhất.
4. **Pass to Reranker**: Gửi các ứng viên để chấm điểm lại.
5. **Select Top-K**: Dùng K chunk hàng đầu sau reranking cho LLM.

Các phương pháp Retrieval phổ biến: Dense Retrieval (Vector Search);
Sparse Retrieval (BM25 / Keyword Search); Hybrid Retrieval (Dense + Sparse).

### 4. Reranking — vì sao & thế nào?

Vì sao cần Rerank?

- Retrieval ban đầu có thể bỏ sót tài liệu tốt nhất.
- Độ tương đồng ngữ nghĩa ≠ độ liên quan thực sự.
- Rerank cải thiện độ chính xác (precision) nhờ hiểu ngữ cảnh sâu hơn.

Reranking hoạt động thế nào?

- Nhận query + tài liệu ứng viên.
- Dùng cross-encoder (hoặc LLM) để chấm điểm mức độ liên quan.
- Trả về một relevance score.
- Sắp xếp các ứng viên theo điểm (cao → thấp).

Ví dụ (Trước & Sau Reranking):

- Trước Reranking (theo similarity): 1. Doc A (score: 0.78), 2. Doc B (score: 0.72),
  3. Doc C (score: 0.71), 4. Doc D (score: 0.70)
- → Reranker (Cross-Encoder) →
- Sau Reranking (theo relevance): 1. Doc C (relevance: 0.92), 2. Doc A (relevance: 0.89),
  3. Doc D (relevance: 0.76), 4. Doc B (relevance: 0.58)

### 5. Retrieval vs Reranking

| Khía cạnh | Retrieval | Reranking |
|---|---|---|
| Mục đích | Tìm các ứng viên liên quan | Sắp xếp lại ứng viên theo độ liên quan thực sự |
| Input | Query | Query + các ứng viên đã truy xuất |
| Phương pháp | Bi-encoder / Dense / Sparse / Hybrid | Cross-encoder / LLM Reranker |
| Output | Top-N tài liệu tương đồng | Top-K tài liệu liên quan nhất |
| Tốc độ | Nhanh | Chậm hơn |
| Chi phí | Thấp | Cao hơn |
| Vị trí trong RAG | Bước đầu tiên | Sau retrieval, trước LLM |

### 6. Các reranker model phổ biến

| Model / Cách tiếp cận | Loại | Điểm mạnh | Use Cases |
|---|---|---|---|
| Cross-Encoder (ví dụ: bge-reranker, hkunlp/instructor-xl) | Transformer (Cross-Encoder) | Độ chính xác cao, hiểu ngữ cảnh sâu | RAG tổng quát, Q&A, search |
| LLM as Reranker (GPT-4o, Claude, Llama 3, v.v.) | Chấm điểm bằng LLM | Tốt nhất cho suy luận phức tạp, mức độ liên quan tinh tế | Lĩnh vực cần độ chính xác cao, ngữ cảnh dài |
| Bi-Encoder Score (ví dụ: Sentence-BERT) | Cosine Similarity (Nhanh) | Rất nhanh, mở rộng tốt | Khi tốc độ là quan trọng |

*Cross-encoder reranker cho chất lượng tốt nhất nhưng chậm hơn và tốn kém hơn.*

### 7. Chấm điểm trong reranking

Reranker nhận vào: Query (Q); Candidate Document (D); Trả về Relevance Score
(0 đến 1 hoặc thang điểm bất kỳ).

Các yếu tố được xét: Mức độ liên quan ngữ nghĩa; Hiểu ngữ cảnh; Tầm quan trọng
của từ khóa; Vị trí & mức độ nhấn mạnh; Độ mạch lạc & khớp ý định.

### 8. Luồng Retrieval + Reranking (chi tiết)

1. **Embed** Query → 2. **Retrieve** Top-N (Vector Search) → 3. **Rerank**
   Candidates (Cross-Encoder / LLM) → 4. **Select** Top-K (Ngữ cảnh cuối cùng)
   → 5. **Gửi đến LLM & Generate**.

*Reranking tốt hơn → ngữ cảnh chính xác hơn → câu trả lời LLM tốt hơn.*

### 9. Best practices

- Retrieve nhiều (N lớn), rerank ít (K nhỏ).
- Dùng hybrid retrieval để có recall tốt hơn.

### 10. Thách thức

- Reranking chậm hơn và tốn kém hơn.
- Cross-encoder không mở rộng được với N quá lớn.

### 11. Công cụ & thư viện phổ biến

- **Vector Search**: FAISS, Pinecone, Weaviate, Qdrant, Milvus
- **Sparse Search**: BM25 (Elasticsearch), Lucene

## Phần 12. Pipeline & Kiến trúc RAG

*Đúng dữ liệu — Đúng ngữ cảnh — Đúng câu trả lời.*

(Ghi chú: hình này bị cắt một phần trong ảnh chụp; dưới đây là các mục còn đọc được.)

Các lớp kiến trúc được đề cập:

1. **RAG là gì?**
2. **RAG Pipeline tổng quan**
3. **Ingestion Layer** (Nguồn dữ liệu)
4. **Preparation Layer** (Chuẩn bị: chunking, cleaning, embedding)
5. **Storage Layer** (Vector Database)
6. **Retrieval Layer** (Truy xuất: query embedding, similarity search, top-K)
7. **Augmentation Layer** (Bổ sung ngữ cảnh vào prompt)
8. **Generation Layer** (LLM sinh câu trả lời)
9. **Kiến trúc end-to-end** (toàn bộ luồng từ nguồn dữ liệu đến câu trả lời,
   kèm feedback/monitoring)
10. **Lợi ích chính của RAG**

---

## Phần 13. Các kỹ thuật RAG nâng cao

*Truy xuất thông minh hơn. Ngữ cảnh sâu hơn. Câu trả lời tốt hơn.*

### 1. Vì sao cần Advanced RAG?

- Basic RAG hoạt động tốt, nhưng dữ liệu thực tế thì lộn xộn, thay đổi liên tục và rất lớn.
- Các kỹ thuật nâng cao cải thiện mức độ liên quan, hiệu quả, độ chính xác
  & độ bền vững (robustness).
- Giảm hallucination và xử lý các truy vấn phức tạp.

Mục tiêu: *Có đúng ngữ cảnh, đúng thời điểm, theo đúng cách.*

### 2. Hạn chế của Basic RAG

- Bỏ sót thông tin liên quan (recall kém)
- Trả về quá nhiều / quá ít ngữ cảnh
- Gặp khó với truy vấn multi-hop hoặc phức tạp
- Kiến thức trong LLM bị lỗi thời
- Tốn kém với context lớn

*Advanced RAG giải quyết điều này!* → Recall tốt hơn với hybrid & multi-query;
Xếp hạng thông minh hơn với re-ranker; Xử lý truy vấn phức tạp (decomposition);
Cập nhật với iterative retrieval; Chi phí thấp hơn nhờ compression & filtering.

### 3. Advanced RAG Pipeline (tổng quan)

1. **Query** → 2. **Rewrite / Multi-Query** → 3. **Retrieve (Hybrid)** (BM25 + Vector)
→ 4. **Rerank (Cross-Encoder)** → 5. **Filter / Compress** → 6. **Augment**
(Top Context) → 7. **Generate (LLM)**.

*Retrieval tốt hơn → Ngữ cảnh tốt hơn → Generation tốt hơn.*

### 4. Query Rewriting & Multi-Query Retrieval

**Query Rewriting** — Viết lại truy vấn của người dùng cho retrieval (rõ ràng hơn,
từ đồng nghĩa, mở rộng). Ví dụ: Q: "Lợi ích táo" → Viết lại: "Lợi ích sức khỏe
của việc ăn táo".

**Multi-Query Retrieval** — Tạo nhiều góc nhìn khác nhau cho truy vấn và truy xuất
từ tất cả. Các truy vấn ví dụ: "Lợi ích của táo"; "Giá trị dinh dưỡng của táo";
"Táo có tốt cho sức khỏe không?"; "Ưu điểm sức khỏe của táo".

### 5. Hybrid Retrieval

Kết hợp keyword (BM25) + semantic (vector) search để có recall tốt hơn.

User Query → BM25 (Keyword Search) + Vector DB (Semantic Search) →
Kết hợp kết quả (RRF / Weighted).

*Tốt cho cả thuật ngữ chính xác + ý nghĩa ngữ nghĩa.*

### 6. Reranking (Cross-Encoder)

Xếp hạng lại các tài liệu truy xuất được bằng cross-encoder model để tăng độ liên quan.

Top-K từ Retriever (Doc A, Doc B, Doc C, Doc D, Doc E) → Cross-Encoder
(ví dụ: BGE-reranker, Cohere Rerank) → Reranked Top-K (Doc C, Doc A, Doc E, Doc B, Doc D).

*Cải thiện độ chính xác (precision) đáng kể.*

### 7. Context Compression

Giảm lượng token sử dụng mà vẫn giữ thông tin quan trọng.

- **Extractive**: Chỉ giữ lại các câu quan trọng.
- **Abstractive**: Tóm tắt nội dung đã truy xuất.
- **LLM-based**: Để LLM lọc & giữ lại những gì liên quan.

*Tiết kiệm token, giảm chi phí, sinh câu trả lời nhanh hơn.*

### 8. Iterative Retrieval

Retrieve → Tạo câu hỏi phụ → Retrieve thêm → Tinh chỉnh câu trả lời.

Bước 1 Retrieve ban đầu → Bước 2 Tạo câu hỏi phụ → Bước 3 Retrieve thêm →
Bước 4 Tạo câu trả lời cuối.

*Rất tốt cho các câu hỏi phức tạp, multi-hop.*

### 9. Self-Refine / Self-Correcting RAG

LLM kiểm tra câu trả lời, xác định chỗ còn thiếu, truy xuất thêm và cải thiện.

Câu trả lời ban đầu → Đánh giá & tìm thông tin còn thiếu → Truy xuất thêm
& tinh chỉnh câu trả lời.

*Cải thiện tính chính xác về dữ kiện & giảm hallucination.*

### 10. Routing RAG (Multi-Source)

Định tuyến truy vấn đến nguồn dữ liệu hoặc index liên quan nhất.

User Query → Route 1 (Docs DB) / Route 2 (Code Base) / Route 3 (Web) →
Truy xuất → Kết quả tốt nhất → Generate.

*Hữu ích khi dữ liệu nằm ở nhiều nguồn.*
(→ Liên quan trực tiếp EventLead: kho tài liệu upload vs kho danh bạ nội bộ.)

### 11. Knowledge Graph + RAG

Dùng Knowledge Graph để tăng cường retrieval bằng các mối quan hệ & thực thể.

User Query → KG (Thực thể & sự kiện liên quan) → Truy xuất tài liệu → Câu trả lời LLM.

*Tốt hơn cho truy vấn nhiều thực thể & mang tính quan hệ.*
(→ Liên quan EventLead: quan hệ liên hệ ↔ công ty.)

### 12. Adaptive Chunking

Tạo chunk một cách linh hoạt dựa trên loại nội dung. Tài liệu dài →
(cho dữ kiện) Chunk lớn; (cho khái niệm) Chunk lớn; Chia theo cấu trúc bảng/danh sách.

*Giữ được ngữ cảnh, cải thiện retrieval.*

### 13. Time-Aware RAG

Ưu tiên truy xuất trong khoảng thời gian gần đây / còn hiệu lực.

User Query → Lọc theo ngày/độ mới → Truy xuất tài liệu gần đây → Câu trả lời LLM.

*Hữu ích cho tin tức, sự kiện, xu hướng.*
(→ Liên quan EventLead Q2-A: ưu tiên tài liệu đang hiệu lực.)

---

## Phần 14. Ứng dụng LLM, Agents & Đánh giá

*Use case thực tế. Agent thông minh. AI đáng tin cậy.*

### 1. LLM được dùng ở đâu?

Chatbot & trợ lý ảo; Tạo nội dung; Sinh code; Tóm tắt; Hỏi đáp/Tìm kiếm;
Dịch thuật; Trích xuất dữ liệu; Gợi ý (Recommendation); Giáo dục & gia sư;
Tự động hóa doanh nghiệp; Viết sáng tạo; Và nhiều hơn nữa...

*LLM có mục đích tổng quát — sự sáng tạo của bạn quyết định use case!*

### 2. LLM Agents — là gì & vì sao?

Agent dùng LLM + tools + memory để tự động đạt được mục tiêu.

Vì sao cần Agent?

- Xử lý tác vụ phức tạp
- Lập kế hoạch, suy luận & hành động
- Dùng tools & dữ liệu bên ngoài
- Làm việc tự động
- Tốt hơn cho các tác vụ end-to-end

Agent Loop: 1. **Perceive** (Nhận input/quan sát) → 2. **Plan** (Suy luận & quyết định
bước tiếp theo) → 3. **Act (Tool Use)** (Dùng tool/thực hiện hành động) →
4. **Observe** (Nhận kết quả/feedback) → lặp lại.

*Think → Plan → Act → Observe → Lặp lại cho đến khi đạt mục tiêu.*

### 3. Các loại LLM Agent

| Loại Agent | Mô tả | Ví dụ |
|---|---|---|
| Simple Reflex Agent | Hành động dựa trên input hiện tại | FAQ bot |
| Tool-Using Agent | Dùng tools bên ngoài (search, calculator, API) | Code Interpreter, web search agent |
| Planning Agent | Chia mục tiêu thành các bước và lập kế hoạch | Agent lên kế hoạch du lịch |
| Memory-Based Agent | Dùng memory để duy trì ngữ cảnh qua các lượt | Trợ lý cá nhân |
| Multi-Agent System | Nhiều agent phối hợp trong một tác vụ | Nhóm agent nghiên cứu |

*Agents = LLMs + Reasoning + Tools + Memory.*

### 4. Kiến trúc Agent (tham khảo)

User → Agent Interface (Chat/API) → Agent Core (LLM/Reasoning, Planning & Control,
Memory (Short-term/Long-term)) → Tools & Actions (Web Search, Calculator,
Code Executor, DB/APIs, Files/Docs, Dịch vụ khác) → Environment.

*Quan sát → Suy luận → Hành động → Học → Lặp lại.*

### 5. Các agent framework phổ biến

- **LangChain**: Xây dựng ứng dụng LLM với chain, agent & memory.
- **LangGraph**: Xây dựng agent workflow có trạng thái (stateful), nhiều actor.
- **AutoGen**: Hội thoại & cộng tác giữa nhiều agent.
- **LlamaIndex**: Kết nối dữ liệu, indexing & retrieval cho ứng dụng LLM.
- **CrewAI**: Các nhóm agent tự động dựa trên vai trò.
- **OpenAI Assistants API**: Xây dựng agent với tools, files & instructions.

*Chọn framework phù hợp với use case & độ phức tạp của bạn.*
(Ghi chú EventLead: không dùng LangChain — dùng Vercel AI SDK + tool system tự xây.)

### 6. Use case phổ biến của agent

- **Trợ lý nghiên cứu**: Tìm kiếm → Đọc → Tóm tắt → Báo cáo
- **Agent hỗ trợ khách hàng**: Hiểu → Tìm kiếm → Trả lời → Chuyển
- **Agent phân tích dữ liệu**: Truy vấn → Phân tích → Trực quan hóa → Insight
- **Agent kế hoạch du lịch**: Sở thích → Lên kế hoạch → Đặt chỗ → Lịch trình
- **Agent lập trình**: Đọc → Gợi ý → Test → Cải thiện

Ví dụ luồng Research Agent:

1. Người dùng đặt một câu hỏi nghiên cứu
2. Agent lên chiến lược tìm kiếm
3. Tìm kiếm & đọc nhiều nguồn
4. Tóm tắt các phát hiện
5. Viết một báo cáo có cấu trúc tốt kèm trích dẫn

### 7. Evaluation — vì sao?

Ta đánh giá LLM & agent để đảm bảo chúng chính xác, hữu ích, an toàn & đáng tin cậy.

- Đo lường chất lượng & hiệu năng
- Phát hiện hallucination & lỗi
- So sánh các model/prompt
- Cải thiện liên tục

Đánh giá những gì? Tính đúng đắn; Mức độ liên quan; Tính đầy đủ; Tính mạch lạc;
Faithfulness (không hallucination); An toàn; Hiệu quả (Latency/Cost).

### 8. Các cấp độ đánh giá

1. **Component Level**: Đánh giá prompt, retrieval, reranking, v.v.
2. **System Level**: Đánh giá toàn bộ pipeline (ví dụ: hệ thống RAG, agent workflow).
3. **User Experience Level**: Đánh giá mức độ hữu ích, sự hài lòng, khả năng sử dụng.

*Đánh giá ở mọi cấp độ để có một hệ thống vững chắc!*

### 9. Các metric đánh giá phổ biến

- **Accuracy / Correctness**: Câu trả lời có đúng về mặt dữ liệu không?
- **Relevance**: Phản hồi liên quan đến mức nào?
- **Faithfulness**: Câu trả lời có dựa trên ngữ cảnh được cung cấp không?
- **Hallucination Rate**: Tần suất bịa ra thông tin?
- **Answer Completeness**: Có bao quát hết các ý chính không?
- **User Satisfaction**: Người dùng có thấy nó hữu ích không?

Metric tự động: BLEU/ROUGE, Exact Match (EM), Semantic Similarity (Cosine/BERTScore),
Faithfulness Score, Groundedness Score.

Human Evaluation: Tốt nhất để đánh giá chất lượng & tính hữu ích tổng thể.

---

## Phần 15. Phỏng vấn RAG & LLM + Kiến thức thực tế

*Hiểu sâu. Giải thích rõ. Xây dựng tự tin.*

### 1. Câu hỏi phỏng vấn RAG hàng đầu

- RAG là gì và vì sao nó quan trọng?
- RAG giảm hallucination như thế nào?
- Giải thích RAG pipeline.
- Các thành phần chính của RAG là gì?
- Embeddings hoạt động thế nào trong RAG?
- Chunking là gì? Bạn quyết định chunk size như thế nào?
- Bạn chọn vector database như thế nào?
- Reranking là gì? Vì sao cần nó?
- Bạn xử lý tài liệu lớn như thế nào?
- Bạn đánh giá một hệ thống RAG như thế nào?
- Những thách thức trong RAG là gì?
- Bạn sẽ cải thiện RAG về độ chính xác / độ trễ như thế nào?

### 2. Câu hỏi phỏng vấn LLM

- Sự khác biệt giữa pretraining, fine-tuning, instruction tuning & RLHF là gì?
- Cơ chế attention hoạt động thế nào?
- Context window là gì?
- Temperature, top-p, top-k là gì?
- Giải thích beam search vs greedy decoding.
- Transformers là gì?
- Tokenization là gì?
- Bạn xử lý bias & safety trong LLM như thế nào?
- Bạn giảm chi phí khi dùng LLM như thế nào?
- Giải thích function calling / tools trong LLM.
- Sự khác biệt giữa RAG và Fine-tuning là gì?

### 3. RAG Pipeline — tóm tắt nhanh

User Query → **Retrieve** (Tìm các chunk liên quan) → **Rerank** (Chọn top-K liên quan
nhất) → **Augment** (Thêm ngữ cảnh vào prompt) → **Generate** (LLM tạo câu trả lời).

Thành phần chính:

- Ingestion, Chunking, Embedding, Vector DB
- Retrieval, Reranking, Prompt, Generation
- Logging, Monitoring, Evaluation

### 4. Use case RAG thực tế

- **FAQs / Helpdesk**: Tài liệu công ty, hướng dẫn sản phẩm → câu trả lời chính xác.
- **Knowledge Base**: Tài liệu nội bộ, wiki, SOP → trợ lý cho nhân viên.
- **Research Assistant**: Bài báo khoa học, bài viết → tóm tắt, phân tích, trích dẫn.
- **Legal / Contracts**: Hợp đồng, án lệ → tìm kiếm, điều khoản, Q&A.
- **Healthcare**: Hướng dẫn y khoa, báo cáo → hỗ trợ chuyên môn.
- **E-commerce**: Tài liệu sản phẩm, đánh giá → gợi ý thông minh.
- **Finance**: Báo cáo, hồ sơ tài chính → insight, phân tích rủi ro.
- **Education**: Ghi chú, sách → giải đáp thắc mắc, gia sư.

*RAG kết hợp dữ liệu riêng của bạn + khả năng hiểu của LLM.*

### 5. Các quyết định thiết kế quan trọng

| Quyết định | Điều cần cân nhắc |
|---|---|
| Chunk Size | Nhỏ hơn = chính xác, Lớn hơn = nhiều ngữ cảnh (thường dùng 200–500 token) |
| Chunk Overlap | Giúp duy trì ngữ cảnh giữa các chunk (overlap 10–20%) |
| Embedding Model | Chất lượng vs Chi phí vs Tốc độ (ví dụ: text-embedding-3-large) |
| Vector DB | Quy mô, filtering, hybrid search, chi phí, managed vs self-hosted |
| Reranker | Cross-encoder cho độ chính xác, nhưng tăng latency & chi phí |
| Top-K | K cao hơn = recall tốt hơn, nhưng chi phí & latency cao hơn |
| Prompt Design | Chỉ dẫn rõ ràng, trích dẫn nguồn, giới hạn phạm vi |
| Generation Params | Temperature, top-p, max tokens ảnh hưởng đến phong cách câu trả lời & chi phí |

### 6. Thách thức RAG & cách giải quyết

| Thách thức | Cách khắc phục |
|---|---|
| Truy xuất không liên quan | Embeddings tốt hơn, metadata filter, hybrid search, chunking tốt |
| Hallucinations | Dùng ngữ cảnh chất lượng cao, grounding, trích dẫn, temperature thấp |
| Context / Memory lớn | Tóm tắt, map-reduce RAG, hierarchical retrieval |
| Latency | Caching, chỉ rerank top-N, model nhỏ hơn |
| Chi phí | Model nhỏ hơn, chọn lọc ngữ cảnh, batching |
| Dữ liệu cũ | Ingestion dữ liệu mới, versioning, lọc theo thời gian |
| Bảo mật / Quyền riêng tư | Kiểm soát truy cập, che dữ liệu (data masking), loại bỏ PII, mã hóa |

### 7. Chiến lược tìm kiếm trong RAG

- **Dense Search (Semantic)**: Tốt nhất cho truy xuất dựa trên ý nghĩa.
- **Sparse Search (BM25)**: Tốt nhất cho từ khóa & khớp chính xác.
- **Hybrid Search (Dense + Sparse)**: Kết hợp recall của BM25 + sức mạnh ngữ nghĩa.
- **Multi-Query Retrieval**: Tạo nhiều truy vấn từ truy vấn của người dùng.
- **Self-Query Retrieval**: LLM chuyển query → filter → search.

*Hybrid + Rerank = Cân bằng tốt nhất giữa Recall & Precision.*

### 8. Reranking — vì sao & thế nào

Trước Reranking (theo similarity): 1. Doc A (score: 0.78), 2. Doc B (score: 0.74),
3. Doc C (score: 0.65), 4. Doc D (score: 0.61), 5. Doc E (score: 0.58)
→ Cross-Encoder Reranker (ví dụ: BGE-reranker, Cohere Rerank) →
Sau Reranking (theo relevance): 1. Doc C (relevance: 0.92), 2. Doc A (relevance: 0.89),
3. Doc E (relevance: 0.76), 4. Doc B (relevance: 0.63), 5. Doc D (relevance: 0.45).

*Reranking cải thiện độ chính xác nhờ hiểu sâu mối quan hệ giữa query và tài liệu.*

### 9. Metric đánh giá cho RAG

- **Retrieval Metrics**: Recall@K, Precision@K, MRR, nDCG
- **Generation Metrics**: Faithfulness, Correctness, Answer Relevancy
- **End-to-End Metrics**: Answer Accuracy, Helpfulness, Completeness
- **Human Evaluation**: User Satisfaction, Safety, Usability

*Đo lường cả chất lượng retrieval + chất lượng câu trả lời.*

Metric tự động: BLEU/ROUGE, Exact Match (EM), Semantic Similarity (Cosine/BERTScore),
Faithfulness Score, Groundedness Score.

Human Evaluation: Tốt nhất để đánh giá chất lượng & tính hữu ích tổng thể.

### 10. Kiến trúc RAG — thực tế

Data Sources (PDFs, Docs, Web Pages, DBs/APIs, Emails...) → Ingestion (Load & Extract)
→ Chunking (Split & Clean) → Embedding (Create Vectors) → Vector DB →
User Query → Retriever (Top-K) → Reranker (Cross-Encoder) → Augment Prompt (+ Context)
→ LLM → Answer.

(Xuyên suốt: Logging • Evaluation • Caching • Alerts • Access Control.)

### 11. LLM Agents — thực tế

- **Customer Support Agent**: Trả lời FAQ, chuyển cấp, tạo ticket.
- **Data Analyst Agent**: Truy vấn dữ liệu, tạo biểu đồ, insight.
- **Travel Planner Agent**: Lên kế hoạch chuyến đi, đặt chỗ, gợi ý lịch trình.
- **Code Assistant Agent**: Viết code, debug, giải thích, refactor.
- **Research Agent**: Tìm kiếm, đọc, tóm tắt, báo cáo.

Agent Loop: **Perceive** (Nhận input/quan sát) → **Plan** (Suy luận & quyết định bước
tiếp theo) → **Act (Tool Use)** (Dùng tool/thực hiện hành động) → **Observe**
(Nhận kết quả/feedback) → lặp lại.

*Agent dùng suy luận + tools + memory để hoàn thành công việc.*

---

## Phụ lục. Top 15 RAG Concepts (tiếng Anh — từ hình Reels)

1. **Document parsing** — Extract clean text and structure from different file types.
   (PDF, Word, Excel → Text, Tables, Images)
2. **Chunking** — Split documents into smaller, meaningful chunks.
3. **Contextual retrieval** — Retrieve chunks relevant to the query's context and intent.
4. **Embeddings** — Convert text into dense vectors that capture meaning.
5. **Vector search & ANN indexes** — Find similar vectors using approximate nearest
   neighbor search.
6. **Lexical search (BM25)** — Match keywords using traditional inverted index.
7. **Hybrid search & fusion** — Combine vector and lexical results for better
   relevance (Fusion: RRF, etc.).
8. **Metadata filtering & access control** — Filter results using metadata and user
   permissions (Date range, Department, Access level, Custom filters).
9. **Query understanding** — Interpret intent, expand or rewrite the user query
   (Intent detection, Query rewriting, Keyword expansion).
10. **Reranking** — Reorder retrieved results using a more powerful model.
11. **Small-to-big retrieval** — First retrieve small chunks, then expand to larger context.
12. **Context assembly** — Combine and format relevant chunks for the LLM.
13. **Grounding & citation** — Link answers to source documents with citations.
    (Ví dụ: "The policy allows 30 days of travel in Europe. [1]" → [1] Travel Policy.pdf, Section 2.1)
14. **Evaluation** — Measure retrieval quality and end-to-end performance
    (Precision, Recall, MRR, Answer Relevance).
15. **Serving concerns** — Ensure low latency, scalability, monitoring and freshness
    (Low latency, Scalability, Monitoring, Index updates).
