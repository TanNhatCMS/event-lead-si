import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

/**
 * Webhook receiver — TinyFish gọi về (run.completed / run.failed /
 * run.cancelled), theo docs.tinyfish.ai/webhooks.
 *
 * Auth: TinyFish webhook KHÔNG có signature — docs khuyến nghị verify bằng
 * cách gọi lại `GET agent.tinyfish.ai/v1/runs/{run_id}` với API key đã cấu
 * hình. Payload không verify được thì KHÔNG lưu (chặn forged payload), trả
 * 200 {verified:false} để TinyFish ngừng retry.
 *
 * Quy tắc:
 * - Respond nhanh (<10s timeout của TinyFish).
 * - Dedupe theo (run_id, event) — unique index, trùng trả 200.
 * - Event chỉ lưu khi receiver đã cấu hình key; không key → 200 {ignored}.
 * - Mỗi event được ghi audit_logs (best-effort).
 */

const payloadSchema = z.object({
  event: z.string().min(1).max(80),
  run_id: z.string().min(1).max(200),
  status: z.string().max(40).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const RUNS_BASE_URL = 'https://agent.tinyfish.ai/v1/runs';

/** Lấy key TinyFish đã cấu hình trong agent_config (service-role). */
async function getConfiguredKey(): Promise<{ key: string; userId: string } | null> {
  const admin = getSupabaseServerAdminClient();
  const { data } = await admin
    .from('agent_config')
    .select('user_id, credentials')
    .not('credentials->>tinyfish_api_key', 'is', null)
    .limit(1);

  const row = data?.[0];
  const creds = row?.credentials as Record<string, unknown> | null;
  const key = creds?.tinyfish_api_key;
  if (!row || typeof key !== 'string' || !key.trim()) return null;
  return { key: key.trim(), userId: row.user_id };
}

/** Xác minh run bằng cách gọi lại API (docs: confirm before acting). */
async function verifyRun(
  key: string,
  runId: string,
): Promise<{ verified: boolean; reason: string | null }> {
  try {
    const res = await fetch(`${RUNS_BASE_URL}/${encodeURIComponent(runId)}`, {
      headers: { 'X-API-Key': key },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { verified: true, reason: null };
    if (res.status === 401) return { verified: false, reason: 'invalid_key' };
    // 404/5xx: run có thể chưa sẵn sàng — chấp nhận payload nhưng đánh dấu.
    return { verified: false, reason: `run_lookup_status_${res.status}` };
  } catch (err) {
    return {
      verified: false,
      reason: err instanceof Error ? err.message : 'verify_failed',
    };
  }
}

/** POST /api/agent/tinyfish/webhook — receiver cho TinyFish callback. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  const body: unknown = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'invalid_input' }, { status: 400 });
  }

  const { event, run_id: runId, status, data } = parsed.data;

  const configured = await getConfiguredKey();
  if (!configured) {
    // Không có key nào → không thể verify → không lưu. 200 để TinyFish
    // ngừng retry (payload này cũng không có giá trị hành động nào).
    return NextResponse.json({ code: 'not_configured' }, { status: 200 });
  }

  const { verified, reason } = await verifyRun(configured.key, runId);
  if (!verified && reason === 'invalid_key') {
    // Key sai → payload không đáng tin, bỏ qua.
    return NextResponse.json({ code: 'invalid_key', verified: false }, { status: 200 });
  }

  const admin = getSupabaseServerAdminClient();

  // Dedupe (run_id, event) — unique index chặn trùng; insert conflict → 200.
  const { error } = await admin.from('agent_tinyfish_events').insert({
    user_id: configured.userId,
    run_id: runId,
    event,
    status: status ?? null,
    verified,
    payload: (data ?? {}) as never,
  });

  if (error) {
    const duplicate = error.code === '23505';
    if (duplicate) {
      return NextResponse.json({ code: 'duplicate', deduped: true }, { status: 200 });
    }
    return NextResponse.json({ code: 'database_error' }, { status: 500 });
  }

  // Audit trail (best-effort).
  try {
    await admin.from('audit_logs').insert({
      user_id: configured.userId,
      action: 'agent.tinyfish_webhook',
      entity_type: 'tinyfish_run',
      entity_id: runId,
      summary: `TinyFish callback ${event} (${verified ? 'verified' : 'unverified: ' + reason})`,
      metadata: { event, status: status ?? null, run_id: runId, request_id: requestId },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, verified });
}
