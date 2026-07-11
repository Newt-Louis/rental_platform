import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { mediaUrl } from '@/pages/spaces/spaces.constants';
import { Upload, Image, Trash2, Star, X, FileText } from 'lucide-react';
import type { UnitMedia } from '@/types';

const MEDIA_TYPE_LABELS: Record<string, string> = {
  PHOTO: 'Ảnh',
  FLOOR_PLAN: 'Floor Plan',
  VIDEO: 'Video',
  RENDER_3D: '3D Render',
  BROCHURE: 'Brochure',
  SITE_MAP: 'Sơ đồ',
};

export function UnitMediaTab({ unitId }: { unitId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mediaType, setMediaType] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null);

  const { data: mediaList = [], isLoading } = useQuery<UnitMedia[]>({
    queryKey: ['unit-media', unitId, mediaType],
    queryFn: () => spacesApi.listUnitMedia(unitId, mediaType || undefined),
    enabled: !!unitId,
  });

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => spacesApi.deleteUnitMedia(unitId, mediaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-media', unitId] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unitId] });
      toast({ title: 'Đã xóa media' });
    },
    onError: () => toast({ title: 'Lỗi xóa media', variant: 'destructive' }),
  });

  const setCoverMutation = useMutation({
    mutationFn: (mediaId: string) => spacesApi.updateUnitMedia(unitId, mediaId, { isCover: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-media', unitId] });
      toast({ title: 'Đã đặt ảnh bìa' });
    },
    onError: () => toast({ title: 'Lỗi', variant: 'destructive' }),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const ext = file.name.split('.').pop()?.toLowerCase();
      const typeByExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext ?? '') ? 'PHOTO'
        : ['pdf'].includes(ext ?? '') ? 'BROCHURE'
        : ['mp4', 'mov', 'avi'].includes(ext ?? '') ? 'VIDEO'
        : 'PHOTO';
      const type = mediaType || typeByExt;
      fd.append('type', type);
      await spacesApi.uploadUnitMedia(unitId, fd);
      qc.invalidateQueries({ queryKey: ['unit-media', unitId] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unitId] });
      toast({ title: 'Đã tải lên thành công' });
    } catch {
      toast({ title: 'Lỗi tải lên', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {['', ...Object.keys(MEDIA_TYPE_LABELS)].map((t) => (
            <button
              key={t}
              onClick={() => setMediaType(t)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                mediaType === t
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t === '' ? 'Tất cả' : MEDIA_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium cursor-pointer hover:bg-gray-800 transition-colors">
          <Upload size={12} />
          {uploading ? 'Đang tải...' : 'Thêm'}
          <input
            type="file"
            className="hidden"
            accept="image/*,video/*,application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : mediaList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
          <Image size={32} className="opacity-30" />
          <p className="text-sm">Chưa có tài liệu nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {mediaList.map((m) => (
            <div
              key={m.id}
              className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                m.isCover ? 'border-amber-400' : 'border-transparent hover:border-gray-200'
              }`}
            >
              {m.type === 'PHOTO' || m.type === 'RENDER_3D' || m.type === 'FLOOR_PLAN' || m.type === 'SITE_MAP' ? (
                <img
                  src={mediaUrl(m.fileUrl)}
                  alt={m.caption ?? m.fileName}
                  className="w-full aspect-square object-cover bg-gray-100"
                />
              ) : (
                <div className="w-full aspect-square bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-1">
                  <FileText size={24} />
                  <span className="text-xs text-center px-1 leading-tight">{MEDIA_TYPE_LABELS[m.type] ?? m.type}</span>
                </div>
              )}
              {m.isCover && (
                <div className="absolute top-1 left-1 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Cover</div>
              )}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!m.isCover && (m.type === 'PHOTO' || m.type === 'RENDER_3D') && (
                  <button
                    className="w-5 h-5 rounded bg-amber-400 text-white flex items-center justify-center hover:bg-amber-500"
                    title="Đặt làm ảnh bìa"
                    onClick={() => setCoverMutation.mutate(m.id)}
                  >
                    <Star size={10} />
                  </button>
                )}
                <button
                  className="w-5 h-5 rounded bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                  title="Xóa"
                  onClick={() => deleteMutation.mutate(m.id)}
                >
                  <X size={10} />
                </button>
              </div>
              {m.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                  {m.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
