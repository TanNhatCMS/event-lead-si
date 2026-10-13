'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  FileText,
  Loader2,
  ScanSearch,
  Trash2,
  UploadCloud,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogTrigger,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kit/ui/alert-dialog';
import { Badge } from '@kit/ui/badge';
import { Button, buttonVariants } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { cn } from '@kit/ui/utils';

const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'txt'] as const;

type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'needs_ocr';

type RagDocument = {
  id: string;
  file_name: string;
  mime_type: string;
  document_type: string;
  effective_date: string;
  file_size_bytes: number | null;
  page_count: number | null;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number | null;
  created_at: string;
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  price_list: 'Bảng giá',
  catalogue: 'Catalogue',
  contract_template: 'Hợp đồng mẫu',
  capability_profile: 'Hồ sơ năng lực',
  other: 'Khác',
};

const STATUS_META: Record<DocumentStatus, { label: string; className: string }> =
  {
    uploaded: {
      label: 'Đã tải lên',
      className:
        'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
    },
    processing: {
      label: 'Đang xử lý',
      className:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    },
    ready: {
      label: 'Đã sẵn sàng',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    failed: {
      label: 'Lỗi',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    },
    needs_ocr: {
      label: 'Cần OCR',
      className:
        'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    },
  };

const POLLING_STATUSES: DocumentStatus[] = ['uploaded', 'processing'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes: number | null) {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Panel quản lý tài liệu RAG (task T010):
 * upload drag-drop (chỉ PDF/DOCX/TXT, file khác báo lỗi ngay ở client) +
 * form document_type/effective_date (bắt buộc) + danh sách tài liệu với
 * trạng thái màu sắc, xóa có xác nhận, polling 3s khi còn processing.
 */
export function DocumentsPanel() {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge/documents?limit=100');
      const body = await res.json();
      if (!res.ok) {
        setListError(body?.message ?? 'Chưa tải được danh sách tài liệu.');
        return;
      }
      setListError(null);
      setDocuments((body.items ?? []) as RagDocument[]);
    } catch {
      setListError('Chưa tải được danh sách tài liệu, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Tải lần đầu.
  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  // Polling nhẹ 3s chỉ khi còn tài liệu ở trạng thái uploaded/processing.
  useEffect(() => {
    const needsPolling = documents.some((d) =>
      POLLING_STATUSES.includes(d.status),
    );

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (needsPolling) {
      pollingRef.current = setInterval(() => {
        void fetchDocuments();
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [documents, fetchDocuments]);

  const pickFile = useCallback((candidate: File | undefined) => {
    setFormError(null);
    if (!candidate) return;

    const ext = extensionOf(candidate.name);
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
      setFile(null);
      setFormError(
        'Định dạng file không hỗ trợ. Chỉ nhận PDF, DOCX hoặc TXT.',
      );
      return;
    }

    setFile(candidate);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      pickFile(event.dataTransfer.files?.[0]);
    },
    [pickFile],
  );

  const handleUpload = useCallback(async () => {
    if (!file) {
      setFormError('Vui lòng chọn file tài liệu.');
      return;
    }
    if (!documentType) {
      setFormError('Vui lòng chọn loại tài liệu.');
      return;
    }
    if (!effectiveDate) {
      setFormError('Vui lòng chọn ngày hiệu lực của tài liệu.');
      return;
    }

    setUploading(true);
    setFormError(null);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('document_type', documentType);
      form.append('effective_date', effectiveDate);

      const res = await fetch('/api/knowledge/documents', {
        method: 'POST',
        body: form,
      });
      const body = await res.json();

      if (!res.ok) {
        setFormError(body?.message ?? 'Tải tài liệu thất bại, vui lòng thử lại.');
        return;
      }

      // Upload thành công: reset form và refresh danh sách ngay
      // (polling sẽ tự theo dõi khi tài liệu đang xử lý).
      setFile(null);
      setDocumentType('');
      setEffectiveDate('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchDocuments();
    } catch {
      setFormError('Tải tài liệu thất bại, vui lòng thử lại.');
    } finally {
      setUploading(false);
    }
  }, [file, documentType, effectiveDate, fetchDocuments]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/knowledge/documents/${id}`, {
          method: 'DELETE',
        });
        const body = await res.json();
        if (!res.ok) {
          setListError(body?.message ?? 'Xóa tài liệu thất bại, vui lòng thử lại.');
          return;
        }
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } catch {
        setListError('Xóa tài liệu thất bại, vui lòng thử lại.');
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  return (
    <div className="space-y-6">
      {/* Khu vực upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tải tài liệu lên</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Kéo thả file hoặc bấm để chọn file"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
              dragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50',
            )}
          >
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Kéo thả file vào đây hoặc bấm để chọn
            </p>
            <p className="text-xs text-muted-foreground">
              Chỉ nhận PDF, DOCX, TXT — tối đa 25MB mỗi file
            </p>
            {file && (
              <p className="mt-1 text-sm text-foreground">
                <FileText className="mr-1 inline h-4 w-4" />
                {file.name} ({formatSize(file.size)})
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="document-type">
                Loại tài liệu <span className="text-destructive">*</span>
              </Label>
              <Select value={documentType} onValueChange={(v) => setDocumentType(v ?? '')}>
                <SelectTrigger id="document-type" className="w-full">
                  <SelectValue placeholder="Chọn loại tài liệu" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="effective-date">
                Ngày hiệu lực <span className="text-destructive">*</span>
              </Label>
              <Input
                id="effective-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>

          {formError && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {formError}
            </p>
          )}

          <Button onClick={handleUpload} disabled={uploading}>
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {uploading ? 'Đang tải lên…' : 'Tải lên'}
          </Button>
        </CardContent>
      </Card>

      {/* Danh sách tài liệu */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tài liệu đã tải {documents.length > 0 && `(${documents.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải danh sách…
            </div>
          ) : listError ? (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {listError}
            </p>
          ) : documents.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Chưa có tài liệu nào. Tải tài liệu lên rồi hỏi tôi nhé.
            </p>
          ) : (
            <ul className="divide-y">
              {documents.map((doc) => {
                const status = STATUS_META[doc.status] ?? STATUS_META.failed;
                return (
                  <li
                    key={doc.id}
                    className="flex items-start justify-between gap-4 py-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {doc.file_name}
                        </span>
                        <Badge className={status.className}>
                          {(doc.status === 'uploaded' ||
                            doc.status === 'processing') && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {DOCUMENT_TYPE_LABELS[doc.document_type] ??
                          doc.document_type}
                        {' · '}Hiệu lực: {formatDate(doc.effective_date)}
                        {' · '}Tải lên: {formatDateTime(doc.created_at)}
                        {doc.page_count !== null &&
                          ` · ${doc.page_count} trang`}
                        {doc.chunk_count !== null &&
                          ` · ${doc.chunk_count} đoạn`}
                      </p>
                      {doc.status === 'needs_ocr' && (
                        <p className="flex items-start gap-1.5 text-xs text-orange-700 dark:text-orange-300">
                          <ScanSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          File không có nội dung chữ — cần OCR (phase sau)
                        </p>
                      )}
                      {doc.status === 'failed' && doc.error_message && (
                        <p className="text-xs text-destructive">
                          {doc.error_message}
                        </p>
                      )}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger
                        className={cn(
                          buttonVariants({ variant: 'ghost', size: 'icon' }),
                          'shrink-0 text-muted-foreground hover:text-destructive',
                        )}
                        aria-label={`Xóa tài liệu ${doc.file_name}`}
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Xóa tài liệu này?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Tài liệu “{doc.file_name}” và toàn bộ nội dung đã
                            index sẽ bị xóa vĩnh viễn. Thao tác này không thể
                            hoàn tác.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Hủy</AlertDialogCancel>
                          <AlertDialogAction
                            className={buttonVariants({ variant: 'destructive' })}
                            onClick={() => handleDelete(doc.id)}
                          >
                            Xóa tài liệu
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
