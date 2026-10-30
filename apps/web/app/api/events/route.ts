import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logLifecycleAudit } from '~/lib/lifecycle/audit';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/** Chấp nhận ISO datetime (có/không timezone) — Postgres tự chuẩn hoá timestamptz. */
function isParsableDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

const dateInput = z
  .string()
  .trim()
  .max(40)
  .refine(isParsableDate, 'Thời gian không hợp lệ.');

const createEventSchema = z.object({
  name: z.string().trim().min(1, 'Thiếu tên sự kiện.').max(160),
  location: z.string().trim().max(240).optional(),
  starts_at: dateInput.optional(),
  ends_at: dateInput.optional(),
  notes: z.string().trim().max(4000).optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * GET /api/events
 *
 * Danh sách sự kiện của user + số contact gắn vào mỗi sự kiện.
 * Sắp xếp theo thời gian bắt đầu mới nhất (null cuối), tie-break created_at.
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_query', 'Tham số không hợp lệ.', 400);
  }
  const params = parsed.data;

  const { data, error, count } = await supabase
    .from('events')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('starts_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (error) {
    return errorJson(requestId, 'list_failed', 'Chưa tải được danh sách sự kiện.', 500);
  }

  const events = data ?? [];

  // Đếm contact theo sự kiện — một query duy nhất rồi gom nhóm bằng JS.
  const contactCounts = new Map<string, number>();
  if (events.length > 0) {
    const { data: contactRows, error: contactError } = await supabase
      .from('contacts')
      .select('event_id')
      .eq('user_id', user.id)
      .not('event_id', 'is', null)
      .limit(10000);
    if (!contactError) {
      for (const row of contactRows ?? []) {
        const eventId = (row as { event_id: string | null }).event_id;
        if (eventId) {
          contactCounts.set(eventId, (contactCounts.get(eventId) ?? 0) + 1);
        }
      }
    }
  }

  return NextResponse.json({
    events: events.map((event) => ({
      ...event,
      contacts_count: contactCounts.get(event.id) ?? 0,
    })),
    total: count ?? 0,
    request_id: requestId,
  });
}

/**
 * POST /api/events
 *
 * Tạo sự kiện mới: { name, location?, starts_at?, ends_at?, notes? }.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'validation_error',
      'Dữ liệu sự kiện không hợp lệ.',
      400,
    );
  }
  const input = parsed.data;

  const { data: event, error } = await supabase
    .from('events')
    .insert({
      user_id: user.id,
      name: input.name,
      location: input.location || null,
      starts_at: input.starts_at || null,
      ends_at: input.ends_at || null,
      notes: input.notes || null,
    })
    .select('*')
    .single();

  if (error || !event) {
    return errorJson(requestId, 'create_failed', 'Chưa tạo được sự kiện.', 500);
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'event.create',
    entityType: 'event',
    entityId: event.id,
    summary: 'Tạo sự kiện: ' + input.name,
    metadata: { name: input.name },
  });

  return NextResponse.json({ event, request_id: requestId }, { status: 201 });
}
