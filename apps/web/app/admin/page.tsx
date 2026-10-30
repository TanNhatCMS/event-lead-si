import Link from 'next/link';

import {
  BarChart3,
  Bot,
  Cpu,
  FileText,
  History,
  Plug,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { PageBody, PageHeader } from '@kit/ui/page';

import pathsConfig from '~/config/paths.config';
import { getGatewayApiKey, getOpenAiApiKey } from '~/lib/ai/model-config';
import { requireAdminInServerComponent } from '~/lib/server/require-user-in-server-component';

// Auth là per-request (connection()) — cho phép route chặn dữ liệu thay vì
// đòi shell tĩnh khi prerender (Cache Components).
export const instant = false;

/**
 * Trang tổng quan quản trị: điểm vào các cấu hình hệ thống (mô hình AI,
 * prompts, nhật ký) kèm trạng thái nhanh của credential server.
 * App single-user — mọi người dùng đăng nhập là chủ hệ thống.
 */
export default async function AdminPage() {
  await requireAdminInServerComponent();

  const gatewayConfigured = Boolean(getGatewayApiKey());
  const openaiConfigured = Boolean(getOpenAiApiKey());

  const sections = [
    {
      href: pathsConfig.app.usageStats,
      Icon: BarChart3,
      title: 'Thống kê Token',
      description:
        'Token theo model (đầu vào/đầu ra/cache), chi phí quy đổi USD và bảng giá.',
    },
    {
      href: pathsConfig.app.users,
      Icon: Users,
      title: 'Người dùng',
      description:
        'Quản lý tài khoản hệ thống: xem trạng thái đăng nhập, chặn/bỏ chặn, xóa người dùng.',
    },
    {
      href: pathsConfig.app.agentTooling,
      Icon: Plug,
      title: 'Năng lực Agent',
      description:
        'Quản lý MCP Tools, Skills, Hooks, Plugins cho các agent — mở rộng và kiểm soát agent.',
    },
    {
      href: pathsConfig.app.aiModels,
      Icon: Cpu,
      title: 'Mô hình AI',
      description:
        'Chọn nhà cung cấp và model cho từng năng lực: nhận dạng danh thiếp, enrichment, soạn follow-up, chatbot RAG.',
    },
    {
      href: pathsConfig.app.aiPrompts,
      Icon: FileText,
      title: 'Prompts AI',
      description:
        'Tùy chỉnh system prompt cho từng tính năng AI, khôi phục về bản mặc định khi cần.',
    },
    {
      href: pathsConfig.app.auditLog,
      Icon: History,
      title: 'Nhật ký hoạt động',
      description:
        'Theo dõi audit log và distributed trace của các thao tác trên hệ thống.',
    },
    {
      href: pathsConfig.app.assistant,
      Icon: Bot,
      title: 'Trợ lý AI',
      description:
        'Chatbot RAG tra cứu tri thức từ tài liệu và danh bạ, kèm trích dẫn nguồn.',
    },
    {
      href: pathsConfig.app.profileSettings,
      Icon: User,
      title: 'Hồ sơ',
      description: 'Thông tin tài khoản và cài đặt cá nhân.',
    },
  ];

  return (
    <>
      <PageHeader
        title={'Quản trị'}
        description={
          'Trung tâm quản lý hệ thống EventLead: cấu hình AI, prompts và theo dõi hoạt động.'
        }
      />

      <PageBody>
        <div className={'flex w-full flex-1 flex-col gap-y-5 lg:max-w-5xl'}>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-5" />
                    Trạng thái hệ thống
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Credential AI cấu hình qua biến môi trường server. Thiếu key
                    thì năng lực tương ứng sẽ báo lỗi khi chạy.
                  </CardDescription>
                </div>
                <Badge variant={gatewayConfigured || openaiConfigured ? 'default' : 'secondary'}>
                  {gatewayConfigured || openaiConfigured
                    ? 'Có kênh AI khả dụng'
                    : 'Chưa có kênh AI nào'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">AI Gateway</p>
                    <p className="text-xs text-muted-foreground">
                      Một key cho mọi nhà cung cấp (AI_GATEWAY_API_KEY)
                    </p>
                  </div>
                  <Badge variant={gatewayConfigured ? 'default' : 'secondary'}>
                    {gatewayConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">OpenAI trực tiếp</p>
                    <p className="text-xs text-muted-foreground">
                      Gọi thẳng OpenAI (OPENAI_API_KEY)
                    </p>
                  </div>
                  <Badge variant={openaiConfigured ? 'default' : 'secondary'}>
                    {openaiConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-colors group-hover:border-primary/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <section.Icon className="size-4 text-muted-foreground" />
                      {section.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{section.description}</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </PageBody>
    </>
  );
}
