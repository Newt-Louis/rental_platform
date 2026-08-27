import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fitoutSubmittalApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';

/**
 * Trao đổi (activity) trên 1 submittal — dùng chung giữa FitoutPage (người phụ trách xem/trả lời)
 * và FitoutApprovalsPage (người duyệt để lại nhận xét thay vì chỉ Từ chối). Backed by
 * EntityComment qua fitoutSubmittalApi.listComments/addComment — không phải quyết định duyệt,
 * chỉ là kênh trao đổi để người phụ trách biết cách sửa.
 */
export function FitoutCommentThread({ submittalId }: { submittalId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');

  const { data: comments = [] } = useQuery({
    queryKey: ['fitout-submittal-comments', submittalId],
    queryFn: () => fitoutSubmittalApi.listComments(submittalId),
    enabled: open,
  });

  const addComment = useMutation({
    mutationFn: () => fitoutSubmittalApi.addComment(submittalId, body.trim()),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['fitout-submittal-comments', submittalId] });
      toast({ title: 'Đã gửi bình luận' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể gửi bình luận', variant: 'destructive' }),
  });

  return (
    <div className="border-t border-gray-100 pt-2 mt-2">
      <button
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
        onClick={() => setOpen((v) => !v)}
      >
        <MessageSquare size={12} />
        {open ? 'Ẩn trao đổi' : `Trao đổi${(comments as any[]).length ? ` (${(comments as any[]).length})` : ''}`}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {(comments as any[]).length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {(comments as any[]).map((c) => (
                <div key={c.id} className="text-xs bg-gray-50 rounded-md px-2 py-1.5">
                  <span className="font-medium text-gray-700">{c.author?.fullName ?? '—'}</span>
                  <span className="text-gray-400 ml-1.5">{new Date(c.createdAt).toLocaleString('vi-VN')}</span>
                  <p className="text-gray-600 mt-0.5 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ghi chú cho người phụ trách biết cách sửa..."
              rows={2}
              className="text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-auto self-end shrink-0"
              disabled={!body.trim() || addComment.isPending}
              onClick={() => addComment.mutate()}
            >
              Gửi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
