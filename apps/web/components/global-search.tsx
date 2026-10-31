'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, StickyNote, User } from 'lucide-react';

import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@kit/ui/command';
import { Spinner } from '@kit/ui/spinner';

// ---------------------------------------------------------------------------
// Hợp đồng GET /api/search?q= (tối thiểu 2 ký tự)
// ---------------------------------------------------------------------------

interface SearchContact {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
}

interface SearchCompany {
  id: string;
  display_name: string;
  industry: string | null;
}

interface SearchNote {
  id: string;
  contact_id: string;
  contact_name: string | null;
  body: string;
}

interface SearchResults {
  contacts: SearchContact[];
  companies: SearchCompany[];
  notes: SearchNote[];
}

const EMPTY_RESULTS: SearchResults = {
  contacts: [],
  companies: [],
  notes: [],
};

/** true khi cả 3 nhóm đều trống — dùng cho empty state. */
function isAllEmpty(results: SearchResults): boolean {
  return (
    results.contacts.length === 0 &&
    results.companies.length === 0 &&
    results.notes.length === 0
  );
}

/**
 * ⌘K / Ctrl+K global search (chỉ mount trong dashboard layout).
 *
 * Gõ tối thiểu 2 ký tự → debounce 250ms → GET /api/search?q= → hiển thị 3 nhóm
 * (Liên hệ / Công ty / Ghi chú). Chọn một dòng là điều hướng tới trang tương
 * ứng và đóng palette. Kết quả đến từ server nên tắt lọc cục bộ của cmdk
 * (shouldFilter={false}).
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);

  // Nghe phím tắt toàn cửa sổ: ⌘K (mac) / Ctrl+K (win, linux).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Debounce 250ms rồi fetch kết quả; huỷ fetch cũ khi gõ tiếp (AbortController).
  // setState chỉ chạy trong timer/async callback — không gọi đồng bộ trong effect.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(q)}`,
            { signal: controller.signal },
          );
          const json = (await res.json().catch(() => null)) as {
            contacts?: SearchContact[];
            companies?: SearchCompany[];
            notes?: SearchNote[];
          } | null;
          if (controller.signal.aborted) return;
          setResults({
            contacts: json?.contacts ?? [],
            companies: json?.companies ?? [],
            notes: json?.notes ?? [],
          });
          setLoading(false);
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          setResults(EMPTY_RESULTS);
          setLoading(false);
        }
      })();
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, query]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      setResults(null);
      setLoading(false);
    }
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const hasQuery = query.trim().length >= 2;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Tìm kiếm toàn cục"
      description="Tìm liên hệ, công ty và ghi chú trong dashboard."
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Tìm liên hệ, công ty, ghi chú…"
        />
        <CommandList>
          {!hasQuery ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nhập ít nhất 2 ký tự để bắt đầu tìm kiếm.
            </p>
          ) : loading || results === null ? (
            // results === null nghĩa là đang chờ debounce hoặc fetch chưa về.
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              <span>Đang tìm kiếm…</span>
            </div>
          ) : isAllEmpty(results) ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Không tìm thấy kết quả phù hợp.
            </p>
          ) : (
            <>
              {results.contacts.length > 0 && (
                <CommandGroup heading="Liên hệ">
                  {results.contacts.map((contact) => (
                    <CommandItem
                      key={contact.id}
                      value={`contact-${contact.id}`}
                      onSelect={() => go(`/dashboard/danh-ba/${contact.id}`)}
                    >
                      <User className="shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {contact.full_name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {contact.job_title ?? ''}
                          {contact.job_title && contact.email ? ' · ' : ''}
                          {contact.email ?? ''}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.companies.length > 0 && (
                <CommandGroup heading="Công ty">
                  {results.companies.map((company) => (
                    <CommandItem
                      key={company.id}
                      value={`company-${company.id}`}
                      onSelect={() => go(`/dashboard/cong-ty/${company.id}`)}
                    >
                      <Building2 className="shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {company.display_name}
                        </p>
                        {company.industry && (
                          <p className="truncate text-xs text-muted-foreground">
                            {company.industry}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.notes.length > 0 && (
                <CommandGroup heading="Ghi chú">
                  {results.notes.map((note) => (
                    <CommandItem
                      key={note.id}
                      value={`note-${note.id}`}
                      onSelect={() => go(`/dashboard/danh-ba/${note.contact_id}`)}
                    >
                      <StickyNote className="shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        {note.contact_name && (
                          <p className="truncate text-sm font-medium">
                            {note.contact_name}
                          </p>
                        )}
                        <p className="truncate text-xs text-muted-foreground">
                          {note.body}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
