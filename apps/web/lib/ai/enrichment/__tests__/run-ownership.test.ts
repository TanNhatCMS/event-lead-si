import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { checkRunOwnership, recordRunOwner } from "../run-ownership";

/**
 * Kiểm thử chéo 2 tài khoản cho logic sở hữu lần chạy (spec 003 FR-015,
 * quyết định cuối D5 phương án (b) — T016). Dùng Supabase client giả
 * trong bộ nhớ: hai "tài khoản" USER_A/USER_B tra cứu run của nhau phải
 * bị chặn ở mức logic trước khi route chạm tới Workflow SDK.
 * (Kiểm thử chéo chạy thật trên Supabase cloud vẫn là phần nghiệm thu
 * còn nợ cùng các AC chạy thật.)
 */

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

interface Row {
  run_id: string;
  user_id: string;
}

function fakeSupabase(rows: Row[], opts: { fail?: boolean } = {}) {
  const state = { inserted: null as Row | null };
  const client = {
    from(_table: string) {
      return {
        insert(row: Row) {
          state.inserted = row;
          return Promise.resolve(
            opts.fail ? { error: { message: "boom" } } : { error: null },
          );
        },
        select(_cols: string) {
          return {
            eq(_col: string, runId: string) {
              return {
                maybeSingle() {
                  if (opts.fail) {
                    return Promise.resolve({
                      data: null,
                      error: { message: "boom" },
                    });
                  }
                  const found = rows.find((r) => r.run_id === runId) ?? null;
                  return Promise.resolve({
                    data: found ? { user_id: found.user_id } : null,
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, state };
}

describe("recordRunOwner", () => {
  it("ghi mapping run→user và trả true khi insert thành công", async () => {
    const { client, state } = fakeSupabase([]);
    await expect(recordRunOwner(client, "run_1", USER_A)).resolves.toBe(true);
    expect(state.inserted).toEqual({ run_id: "run_1", user_id: USER_A });
  });

  it("trả false khi insert lỗi (vd bảng chưa tồn tại) để route fail-closed", async () => {
    const { client } = fakeSupabase([], { fail: true });
    await expect(recordRunOwner(client, "run_1", USER_A)).resolves.toBe(false);
  });
});

describe("checkRunOwnership — kịch bản chéo 2 tài khoản", () => {
  const rows: Row[] = [{ run_id: "run_cua_a", user_id: USER_A }];

  it("đúng chủ run → owner", async () => {
    const { client } = fakeSupabase(rows);
    await expect(
      checkRunOwnership(client, "run_cua_a", USER_A),
    ).resolves.toBe("owner");
  });

  it("tài khoản khác tra cứu run của A → forbidden (route sẽ trả 404)", async () => {
    const { client } = fakeSupabase(rows);
    await expect(
      checkRunOwnership(client, "run_cua_a", USER_B),
    ).resolves.toBe("forbidden");
  });

  it("run không tồn tại → not_found cho cả hai tài khoản", async () => {
    const { client } = fakeSupabase(rows);
    await expect(
      checkRunOwnership(client, "run_khong_co", USER_A),
    ).resolves.toBe("not_found");
    await expect(
      checkRunOwnership(client, "run_khong_co", USER_B),
    ).resolves.toBe("not_found");
  });

  it("lỗi đọc bảng → unavailable (route trả 500, không đoán bừa)", async () => {
    const { client } = fakeSupabase(rows, { fail: true });
    await expect(
      checkRunOwnership(client, "run_cua_a", USER_A),
    ).resolves.toBe("unavailable");
  });
});
