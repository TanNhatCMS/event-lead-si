import { FatalError } from "workflow";
import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";
import type { RecognizedCard } from "~/lib/ai/card-recognition";
import { EnrichmentNotConfiguredError, runEnrichmentLoop } from "./loop";
import type { EnrichmentResult } from "./types";

export async function enrichLeadWorkflow(recognized: RecognizedCard, userId: string) {
  "use workflow";
  return runEnrichmentStep(recognized, userId);
}

async function runEnrichmentStep(recognized: RecognizedCard, userId: string): Promise<EnrichmentResult> {
  "use step";
  const supabase = getSupabaseServerAdminClient();
  try {
    return await runEnrichmentLoop({ recognized, userId, supabase });
  } catch (err) {
    if (err instanceof EnrichmentNotConfiguredError) throw new FatalError(err.message);
    throw err; // lỗi còn lại: RetryableError mặc định của SDK (tối đa 3 lần retry sau lần đầu — tổng tối đa 4 lần thực thi; plan §8.1)
  }
}
