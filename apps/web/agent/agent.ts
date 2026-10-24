import { defineAgent } from "eve";
import { openai } from "eve/models/openai";

/**
 * Agent eve của EventLead SI (tích hợp vercel/eve — xem specs/004-eve-agent).
 *
 * Model: gọi thẳng OpenAI bằng `OPENAI_API_KEY` qua helper `openai()` của
 * eve — cùng quyết định provider ngày 2026-10-24 như lead enrichment,
 * KHÔNG qua Vercel AI Gateway. Đổi model bằng env `EVE_OPENAI_MODEL`
 * (mặc định "gpt-5-mini").
 */
export default defineAgent({
  model: openai(process.env.EVE_OPENAI_MODEL ?? "gpt-5-mini"),
  // Tắt toàn bộ tool mặc định của eve (bash/read_file/write_file trong
  // sandbox, web_search/web_fetch, agent): trợ lý EventLead chỉ được dùng
  // hai tool nghiệp vụ tự viết (lookup_contact, enrich_lead) — bề mặt tấn
  // công nhỏ nhất, đúng nguyên tắc đặc quyền tối thiểu.
  defaultTools: false,
});
