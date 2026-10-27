import 'server-only';

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { ToolSet } from 'ai';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';

import { toolRegistry } from './tools/registry';
import { buildEnrichmentTools } from './enrichment/tools';

/**
 * Agent tooling — cấu hình năng lực cho các agent loop (MCP servers, Skills,
 * Hooks, Plugins), quản lý ở trang /admin/agent:
 *
 * - Plugins: bật/tắt từng tool built-in của registry (theo tên tool).
 *   Mặc định: mọi tool đăng ký đều BẬT — chỉ tool bị tắt tường minh mới bị
 *   loại khỏi toolset đưa cho LLM.
 * - Hooks: hành vi chạy kèm vòng lặp. Hiện có `audit_tool_calls` (ghi
 *   audit_logs mỗi lần agent gọi tool — mặc định BẬT) và `egress_guard`
 *   (luôn bật, nằm cứng trong webfetch/egress-guard).
 * - Skills: markdown do người dùng viết, được nối vào system prompt của
 *   agent loop (bên cạnh skill file mặc định trong `skills/`).
 * - MCP servers: endpoint streamable-http/sse; tools của server enabled
 *   được hợp nhất vào toolset (một server lỗi thì bỏ qua, không chặn run).
 */

export interface AgentMcpServerRow {
  id: string;
  name: string;
  url: string;
  /** Header auth đã lưu (write-only — API không trả lại cho UI). */
  headers: Record<string, string>;
  enabled: boolean;
}

export interface AgentSkillRow {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}

export interface AgentToolingConfig {
  hooks: Record<string, boolean>;
  plugins: Record<string, boolean>;
  mcpServers: AgentMcpServerRow[];
  skills: AgentSkillRow[];
}

export const DEFAULT_HOOKS: Record<string, boolean> = {
  audit_tool_calls: true,
};

// ---------------------------------------------------------------------------
// Đọc cấu hình
// ---------------------------------------------------------------------------

export async function loadAgentTooling(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<AgentToolingConfig> {
  const [configRes, serversRes, skillsRes] = await Promise.all([
    supabase.from('agent_config').select('hooks, plugins').eq('user_id', userId).maybeSingle(),
    supabase
      .from('agent_mcp_servers')
      .select('id, name, url, headers, enabled')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('agent_skills')
      .select('id, name, description, content, enabled')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  return {
    hooks: { ...DEFAULT_HOOKS, ...((configRes.data?.hooks as Record<string, boolean>) ?? {}) },
    plugins: (configRes.data?.plugins as Record<string, boolean>) ?? {},
    mcpServers: (serversRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      headers: (s.headers ?? {}) as Record<string, string>,
      enabled: s.enabled,
    })),
    skills: (skillsRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      content: s.content,
      enabled: s.enabled,
    })),
  };
}

// ---------------------------------------------------------------------------
// Hooks: bọc execute của mỗi tool để ghi audit_logs
// ---------------------------------------------------------------------------

type AnyTool = { execute?: (...args: any[]) => unknown };

function wrapWithAudit(
  tools: ToolSet,
  userId: string,
  supabase: SupabaseClient<Database>,
): ToolSet {
  const wrapped: ToolSet = { ...tools };
  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as AnyTool;
    if (typeof t?.execute !== 'function') {
      continue;
    }
    const original = t.execute.bind(t);
    wrapped[name] = {
      ...tool,
      execute: async (...args: any[]) => {
        const startedAt = Date.now();
        try {
          return await original(...args);
        } finally {
          // Ghi audit best-effort — lỗi audit không được chặn kết quả tool.
          try {
            await supabase.from('audit_logs').insert({
              user_id: userId,
              action: 'agent.tool_call',
              entity_type: 'agent_tool',
              entity_id: name,
              summary: `Agent gọi tool ${name}`,
              metadata: { duration_ms: Date.now() - startedAt },
            });
          } catch {
            // ignore
          }
        }
      },
    } as ToolSet[string];
  }
  return wrapped;
}

// ---------------------------------------------------------------------------
// MCP: nối server và hợp nhất tools
// ---------------------------------------------------------------------------

/** Nối một MCP server và liệt kê tool — dùng cho nút "Kiểm tra kết nối". */
export async function probeMcpServer(opts: {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<{ ok: true; tools: string[]; instructions?: string } | { ok: false; error: string }> {
  let client: MCPClient | undefined;
  try {
    client = await withTimeout(
      createMCPClient({
        transport: { type: 'http', url: opts.url, headers: opts.headers },
      }),
      opts.timeoutMs ?? 8000,
    );
    const result = await client.listTools();
    return {
      ok: true,
      tools: result.tools.map((t) => t.name),
      instructions: client.instructions,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Không kết nối được MCP server.',
    };
  } finally {
    try {
      await client?.close();
    } catch {
      // ignore
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Hết thời gian chờ ${Math.round(ms / 1000)}s.`)), ms),
    ),
  ]);
}

async function mergeMcpTools(
  toolset: ToolSet,
  servers: AgentMcpServerRow[],
): Promise<ToolSet> {
  const merged: ToolSet = { ...toolset };
  for (const server of servers) {
    let client: MCPClient | undefined;
    try {
      client = await withTimeout(
        createMCPClient({
          transport: { type: 'http', url: server.url, headers: server.headers },
        }),
        8000,
      );
      const mcpTools = await client.tools();
      for (const [name, tool] of Object.entries(mcpTools)) {
        // Tiền tố theo tên server để tránh đụng tên với tool built-in.
        merged[`mcp_${server.name}_${name}`] = tool as ToolSet[string];
      }
    } catch (error) {
      // Fail-open: một server lỗi không được chặn run của agent.
      console.warn(
        `[agent-tooling] MCP server "${server.name}" lỗi, bỏ qua: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      try {
        await client?.close();
      } catch {
        // ignore
      }
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Lắp toolset cuối cùng cho agent loop
// ---------------------------------------------------------------------------

/**
 * Lọc tool built-in theo plugins (tool chỉ bị loại khi cấu hình ghi tường
 * minh `false`), hợp nhất tools từ MCP servers enabled, rồi bọc audit hook.
 */
export async function buildAgentToolset(input: {
  userId: string;
  supabase: SupabaseClient<Database>;
  tooling: AgentToolingConfig;
  baseTools: ToolSet;
}): Promise<{ toolset: ToolSet; skipped: string[] }> {
  const { tooling, userId, supabase } = input;

  const enabledBuiltIn: ToolSet = {};
  const skipped: string[] = [];
  for (const [name, tool] of Object.entries(input.baseTools)) {
    if (tooling.plugins[name] === false) {
      skipped.push(name);
      continue;
    }
    enabledBuiltIn[name] = tool;
  }

  let toolset = await mergeMcpTools(enabledBuiltIn, tooling.mcpServers.filter((s) => s.enabled));

  if (tooling.hooks.audit_tool_calls !== false) {
    toolset = wrapWithAudit(toolset, userId, supabase);
  }

  return { toolset, skipped };
}

/** Ghép skills enabled của user vào system prompt (sau prompt mặc định). */
export function appendSkillsToPrompt(
  systemPrompt: string,
  skills: AgentSkillRow[],
): string {
  const enabled = skills.filter((s) => s.enabled && s.content.trim());
  if (enabled.length === 0) return systemPrompt;

  const sections = enabled
    .map((s) => `## Skill: ${s.name}\n\n${s.content.trim()}`)
    .join('\n\n');

  return `${systemPrompt.trimEnd()}\n\n# Skills bổ sung (do người dùng cấu hình)\n\n${sections}`;
}

/** Metadata các tool built-in trong registry — cho UI tab Plugins. */
export function listBuiltInTools(): Array<{
  name: string;
  description: string;
  category: string;
  riskLevel: string;
}> {
  // Registry được seed lười trong buildEnrichmentTools — gọi sync để chắc
  // chắn registry có dữ liệu kể cả khi chưa run agent nào trong tiến trình.
  buildEnrichmentTools();
  return toolRegistry.list().map((entry) => ({
    name: entry.metadata.name,
    description: entry.metadata.description,
    category: entry.metadata.category,
    riskLevel: entry.metadata.riskLevel,
  }));
}

/**
 * Đảm bảo mỗi user có dòng agent_config (default '{}' lúc insert lần đầu).
 * Dùng nội bộ cho API PATCH trước khi update.
 */
export async function ensureAgentConfigRow(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  await supabase.from('agent_config').upsert({ user_id: userId }, { onConflict: 'user_id' });
}
