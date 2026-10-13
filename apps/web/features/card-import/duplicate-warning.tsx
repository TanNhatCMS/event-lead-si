'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';

const REASON_LABELS: Record<string, string> = {
  phone: 'trùng SĐT',
  email: 'trùng email',
  name: 'tên gần giống',
};

type Match = {
  contact: {
    id: string;
    full_name: string;
    job_title: string | null;
    company_name: string | null;
  };
  reasons: string[];
  score: number;
};

/**
 * Cảnh báo trùng lặp ở bước review quét danh thiếp.
 * Gọi API khi tên/email/SĐT thay đổi (debounce), hiển thị các hồ sơ
 * có thể trùng kèm lý do — người dùng quyết định mở hồ sơ cũ hay vẫn tạo mới.
 */
export function DuplicateWarning({
  fullName,
  email,
  phone,
}: {
  fullName: string;
  email: string;
  phone: string;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(false);
    setMatches([]);
    if (!fullName.trim() && !email.trim() && !phone.trim()) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/contacts/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: fullName, email, phone }),
        });
        const json = await res.json();
        if (res.ok) setMatches(json.matches ?? []);
      } catch {
        // kiểm tra trùng là tính năng phụ — lỗi thì im lặng
      } finally {
        setChecked(true);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [fullName, email, phone]);

  if (!checked || matches.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Có thể đã có {matches.length} liên hệ trùng trong danh bạ
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {matches.map((m) => (
          <li
            key={m.contact.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium text-amber-950">{m.contact.full_name}</span>
              <span className="text-amber-800">
                {' '}
                — {[m.contact.job_title, m.contact.company_name].filter(Boolean).join(' · ')}
              </span>
              <span className="ml-1.5 text-xs text-amber-700">
                ({m.reasons.map((r) => REASON_LABELS[r] ?? r).join(', ')})
              </span>
            </div>
            <Link
              href={`/home/danh-ba/${m.contact.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-amber-900 underline hover:text-amber-700"
            >
              Mở hồ sơ <ArrowUpRight className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800">
        Nếu đây là người khác, cứ bấm “Xác nhận &amp; lưu hồ sơ” như bình thường.
      </p>
    </div>
  );
}
