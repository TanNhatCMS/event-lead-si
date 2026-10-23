import { eveChannel } from "eve/channels/eve";
import { localDev } from "eve/channels/auth";

import { supabaseSession } from "../../lib/eve/supabase-auth";

/**
 * Kênh HTTP mặc định của eve (mount tại /eve/v1/* bởi withEve).
 *
 * Auth walk: phiên Supabase của ứng dụng trước (người dùng thật),
 * `localDev()` cuối làm fallback chỉ khi chạy eve dev/vercel dev —
 * production không có cờ dev thì entry này không xác thực được ai,
 * request lạ nhận 401 (fail-closed theo mặc định của eve).
 */
export default eveChannel({
  auth: [supabaseSession(), localDev()],
  uploadPolicy: "disabled",
});
