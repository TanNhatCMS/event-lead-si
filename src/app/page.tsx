import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  ContactRound,
  FileUp,
  Filter,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Upload,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { OrgSwitcher } from "@/components/auth/org-switcher";
import { getOrgOptions, hasOrganizationRole } from "@/lib/auth/organization";

const contacts = [
  { initials: "ML", name: "Minh Anh Lê", role: "Giám đốc phát triển kinh doanh", company: "Nexora Technologies", event: "Vietnam Expo 2026", date: "12 thg 10, 2026", status: "Đã xác nhận", tone: "blue", color: "bg-blue-100 text-blue-700" },
  { initials: "JH", name: "Ji-hoon Park", role: "Trưởng phòng đối tác", company: "Hanwha Solutions", event: "Vietnam Expo 2026", date: "12 thg 10, 2026", status: "Cần rà soát", tone: "amber", color: "bg-orange-100 text-orange-700" },
  { initials: "YT", name: "Yuki Tanaka", role: "Quản lý xuất khẩu", company: "Morioka Trading Co.", event: "Kết nối doanh nghiệp HCM", date: "11 thg 10, 2026", status: "Đã xác nhận", tone: "blue", color: "bg-rose-100 text-rose-700" },
  { initials: "WC", name: "Wei Chen", role: "Giám đốc bán hàng khu vực", company: "Shenzhen GreenTech", event: "Vietnam Expo 2026", date: "11 thg 10, 2026", status: "Đang xử lý", tone: "violet", color: "bg-violet-100 text-violet-700" },
  { initials: "TH", name: "Thu Hà Nguyễn", role: "Quản lý mua hàng", company: "An Phát Holdings", event: "Kết nối doanh nghiệp HCM", date: "10 thg 10, 2026", status: "Đã xác nhận", tone: "blue", color: "bg-emerald-100 text-emerald-700" },
];

function SidebarItem({ icon: Icon, label, active = false, count }: { icon: typeof LayoutDashboard; label: string; active?: boolean; count?: string }) {
  return (
    <div className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
      <Icon size={17} strokeWidth={1.8} />
      <span className="flex-1">{label}</span>
      {count && <span className={`${active ? "text-slate-300" : "text-slate-400"} text-xs`}>{count}</span>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, delta, color }: { icon: typeof ContactRound; label: string; value: string; delta: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}><Icon size={18} /></div>
        <button aria-label="Tùy chọn chỉ số" className="text-slate-400"><MoreHorizontal size={19} /></button>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-[27px] font-semibold tracking-tight">{value}</p></div>
        <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700"><ArrowUpRight size={13} />{delta}</span>
      </div>
    </div>
  );
}

export default async function Home() {
  const { user, options, activeOrgId } = await getOrgOptions();
  const activeRole = options.find((option) => option.organization_id === activeOrgId)?.role;
  const canManageMembers = hasOrganizationRole(activeRole, ["owner", "admin"]);

  return (
    <div className="flex min-h-screen bg-[#f7f8fa]">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[246px] flex-col border-r border-slate-200 bg-white px-4 lg:flex">
        <div className="flex h-[68px] items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-indigo-600 text-white shadow-sm"><ContactRound size={19} /></div>
          <div><div className="text-[15px] font-semibold tracking-tight">EventLead <span className="text-indigo-600">SI</span></div><div className="text-[10px] font-medium uppercase tracking-[.12em] text-slate-400">Partner intelligence</div></div>
        </div>
        <div className="mt-4">
          {user && options.length > 0 ? (
            <OrgSwitcher options={options} activeId={activeOrgId} />
          ) : (
            <button className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)]">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-50 text-[11px] font-semibold text-indigo-700">EL</div>
              <div className="flex-1"><div className="text-xs font-semibold">EventLead Vietnam</div><div className="mt-0.5 text-[10px] text-slate-500">Gói dùng thử</div></div><ChevronDown size={15} className="text-slate-400" />
            </button>
          )}
        </div>
        <div className="mt-8 space-y-1">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">Không gian làm việc</p>
          <SidebarItem icon={LayoutDashboard} label="Tổng quan" active />
          <SidebarItem icon={ContactRound} label="Danh bạ đối tác" count="128" />
          <SidebarItem icon={CalendarDays} label="Sự kiện" count="6" />
          <SidebarItem icon={FileUp} label="Nhập danh thiếp" />
          {canManageMembers && (
            <Link href="/thanh-vien" className="flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-slate-600 hover:bg-slate-100">
              <UsersRound size={17} strokeWidth={1.8} />
              <span className="flex-1">Thành viên</span>
            </Link>
          )}
          <SidebarItem icon={Building2} label="Doanh nghiệp" />
        </div>
        <div className="mt-8 space-y-1">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">Quan hệ</p>
          <SidebarItem icon={Clock3} label="Theo dõi" count="8" />
          <SidebarItem icon={ArrowDownToLine} label="Xuất dữ liệu" />
        </div>
        <div className="mt-auto space-y-1 pb-4">
          <SidebarItem icon={CircleHelp} label="Trợ giúp" />
          <SidebarItem icon={Settings2} label="Cài đặt" />
          {user ? (
            <div className="mt-3 flex items-center gap-3 border-t border-slate-100 px-2 pt-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-800">
                {(user.email ?? "U").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">{user.email}</div>
                <div className="text-[10px] text-slate-500">Đã đăng nhập</div>
              </div>
              <LogoutButton />
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3 border-t border-slate-100 px-2 pt-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">EL</div>
              <div className="flex-1"><div className="text-xs font-semibold">Tài khoản minh họa</div><div className="text-[10px] text-slate-500">Chưa kết nối</div></div><MoreHorizontal size={17} className="text-slate-400" />
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 lg:ml-[246px]">
        <header className="sticky top-0 z-[5] flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 text-[13px] text-slate-400"><span>Tổng quan</span><ChevronRight size={14} /><span className="font-medium text-slate-700">Bảng điều khiển</span></div>
          <div className="flex items-center gap-3">
            {user && options.length > 1 && (
              <div className="lg:hidden">
                <OrgSwitcher options={options} activeId={activeOrgId} />
              </div>
            )}
            {!user && (
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Đăng nhập
              </Link>
            )}
            <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Thông báo"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" /></button><div className="h-6 w-px bg-slate-200" /><button className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"><CalendarDays size={15} />30 ngày qua<ChevronDown size={14} /></button></div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-8 md:py-9">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="text-sm text-slate-500">Thứ Hai, 12 tháng 10, 2026 <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">Bản xem trước · dữ liệu minh họa</span></p><h1 className="mt-1 text-[27px] font-semibold tracking-tight">Chào buổi sáng <span className="text-2xl">👋</span></h1><p className="mt-1 text-sm text-slate-500">Đây là tình hình dữ liệu đối tác của bạn hôm nay.</p></div>
            <div className="flex gap-2"><button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"><ArrowDownToLine size={16} />Xuất dữ liệu</button><Link href="/card-imports/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"><Plus size={17} />Thêm danh thiếp</Link></div>
          </div>

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={ContactRound} label="Tổng đối tác" value="128" delta="12,8%" color="bg-indigo-50 text-indigo-600" />
            <Metric icon={FileUp} label="Danh thiếp đã quét" value="46" delta="8,2%" color="bg-sky-50 text-sky-600" />
            <Metric icon={Clock3} label="Chờ rà soát" value="7" delta="3 mới" color="bg-amber-50 text-amber-600" />
            <Metric icon={UsersRound} label="Sự kiện đã tham gia" value="6" delta="2 sắp tới" color="bg-emerald-50 text-emerald-600" />
          </section>

          <section className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,.8fr)]">
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.03)] md:p-6">
              <div className="flex items-start justify-between gap-4"><div><h2 className="text-[15px] font-semibold">Hoạt động đối tác</h2><p className="mt-1 text-xs text-slate-500">Số lượng danh thiếp được số hóa theo thời gian</p></div><button className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600">30 ngày qua<ChevronDown size={13} /></button></div>
              <div className="mt-7 flex h-[190px] items-end gap-3 border-b border-slate-100 px-1 pb-0">
                {[34, 48, 39, 57, 49, 68, 44, 60, 74, 53, 82, 65, 90, 71, 100, 77, 63, 88, 69, 94, 80, 60, 83, 72, 100, 77, 89, 67, 95, 85].map((height, i) => <div key={i} className="group relative flex h-full flex-1 items-end"><div className={`w-full rounded-t-[3px] transition-colors ${i > 24 ? "bg-indigo-500" : "bg-indigo-100 group-hover:bg-indigo-300"}`} style={{ height: `${height}%` }} /></div>)}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>13 thg 9</span><span>20 thg 9</span><span>27 thg 9</span><span>4 thg 10</span><span>12 thg 10</span></div>
              <div className="mt-5 flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full bg-indigo-500" /><span className="text-slate-500">Danh thiếp đã thêm</span><span className="ml-auto font-semibold text-slate-700">46 thẻ</span><span className="inline-flex items-center text-emerald-700"><ArrowUpRight size={13} />8,2%</span></div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.03)] md:p-6">
              <div className="flex items-center justify-between"><div><h2 className="text-[15px] font-semibold">Cần bạn rà soát</h2><p className="mt-1 text-xs text-slate-500">Xác nhận để hoàn thiện hồ sơ</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">7 mục</span></div>
              <div className="mt-5 space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50/40 p-3"><div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-700"><FileUp size={16} /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold">Danh thiếp cần xác nhận</p><p className="mt-1 text-[11px] leading-4 text-slate-500">3 trường thông tin chưa chắc chắn</p><button className="mt-2 text-[11px] font-semibold text-indigo-600">Rà soát ngay <ArrowRight className="ml-1 inline" size={12} /></button></div><span className="mt-1 h-2 w-2 rounded-full bg-amber-500" /></div>
                <div className="flex items-start gap-3 rounded-lg border border-slate-100 p-3"><div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-sky-50 text-sky-700"><Clock3 size={16} /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold">Nhắc theo dõi đến hạn</p><p className="mt-1 text-[11px] leading-4 text-slate-500">4 đối tác cần được liên hệ hôm nay</p><button className="mt-2 text-[11px] font-semibold text-indigo-600">Xem danh sách <ArrowRight className="ml-1 inline" size={12} /></button></div></div>
              </div>
              <button className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">Xem tất cả công việc</button>
            </div>
          </section>

          <section className="mt-7 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.03)]">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 px-5 py-5 md:flex-row md:items-center md:px-6">
              <div><h2 className="text-[15px] font-semibold">Đối tác mới nhất</h2><p className="mt-1 text-xs text-slate-500">Các hồ sơ vừa được thêm vào không gian làm việc</p></div>
              <div className="flex flex-wrap gap-2"><label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs text-slate-400"><Search size={15} /><input aria-label="Tìm đối tác" placeholder="Tìm đối tác..." className="w-28 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400 sm:w-36" /></label><button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600"><Filter size={14} />Bộ lọc</button><button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600"><ArrowDown size={14} />Mới nhất</button></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead><tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400"><th className="px-6 py-3">Tên / Chức danh</th><th className="px-4 py-3">Doanh nghiệp</th><th className="px-4 py-3">Sự kiện</th><th className="px-4 py-3">Ngày thêm</th><th className="px-4 py-3">Trạng thái</th><th className="px-5 py-3"></th></tr></thead>
                <tbody>{contacts.map((contact) => <tr key={contact.name} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"><td className="px-6 py-3.5"><div className="flex items-center gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${contact.color}`}>{contact.initials}</div><div><div className="text-xs font-semibold text-slate-800">{contact.name}</div><div className="mt-1 text-[11px] text-slate-500">{contact.role}</div></div></div></td><td className="px-4 py-3.5 text-xs font-medium text-slate-700">{contact.company}</td><td className="px-4 py-3.5 text-xs text-slate-500">{contact.event}</td><td className="px-4 py-3.5 text-xs text-slate-500">{contact.date}</td><td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ${contact.tone === "amber" ? "bg-amber-50 text-amber-700" : contact.tone === "violet" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}><span className={`h-1.5 w-1.5 rounded-full ${contact.tone === "amber" ? "bg-amber-500" : contact.tone === "violet" ? "bg-violet-500" : "bg-emerald-500"}`} />{contact.status}</span></td><td className="px-5 py-3.5 text-right"><button aria-label={`Tùy chọn ${contact.name}`} className="rounded p-1 text-slate-400 hover:bg-slate-100"><MoreHorizontal size={17} /></button></td></tr>)}</tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 md:px-6"><span className="text-[11px] text-slate-500">Hiển thị <b className="font-semibold text-slate-700">1–5</b> trong <b className="font-semibold text-slate-700">128</b> đối tác</span><div className="flex items-center gap-1"><button aria-label="Trang trước" className="rounded-md border border-slate-200 p-1.5 text-slate-400"><ChevronLeft size={14} /></button><button className="h-7 w-7 rounded-md bg-indigo-600 text-[11px] font-semibold text-white">1</button><button className="h-7 w-7 rounded-md text-[11px] text-slate-600 hover:bg-slate-100">2</button><button className="h-7 w-7 rounded-md text-[11px] text-slate-600 hover:bg-slate-100">3</button><span className="px-1 text-xs text-slate-400">…</span><button className="h-7 w-7 rounded-md text-[11px] text-slate-600 hover:bg-slate-100">26</button><button aria-label="Trang sau" className="rounded-md border border-slate-200 p-1.5 text-slate-500"><ChevronRight size={14} /></button></div></div>
          </section>

          <section className="mt-6 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-white p-5 md:flex md:items-center md:gap-5 md:p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm"><Sparkles size={20} /></div><div className="mt-3 flex-1 md:mt-0"><h2 className="text-sm font-semibold">Biến danh thiếp thành hồ sơ đối tác hoàn chỉnh</h2><p className="mt-1 text-xs text-slate-500">Tải ảnh lên để trích xuất thông tin, rà soát và lưu hồ sơ tập trung.</p></div><Link href="/card-imports/new" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-3.5 text-xs font-medium text-white hover:bg-indigo-700 md:mt-0"><Upload size={15} />Quét danh thiếp<ArrowRight size={14} /></Link>
          </section>
          <footer className="flex items-center justify-between py-7 text-[10px] text-slate-400"><span>© 2026 EventLead SI · Dữ liệu đối tác của bạn được bảo vệ</span><span>Phiên bản 0.1.0</span></footer>
        </div>
      </main>
    </div>
  );
}
