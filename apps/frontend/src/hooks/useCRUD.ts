import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

interface UseCRUDOptions<TData, TCreate, TUpdate> {
  queryKey: unknown[];
  queryFn: () => Promise<TData>;
  createFn?: (data: TCreate) => Promise<unknown>;
  updateFn?: (payload: { id: string; data: TUpdate }) => Promise<unknown>;
  deleteFn?: (id: string) => Promise<unknown>;
  entityLabel: string;
}

export function useCRUD<TData, TCreate = unknown, TUpdate = unknown>(
  options: UseCRUDOptions<TData, TCreate, TUpdate>
) {
  const { queryKey, queryFn, createFn, updateFn, deleteFn, entityLabel } = options;
  const qc = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey[0]] });

  const onError = (e: unknown) => {
    const msg = (e as { response?: { data?: { message?: string } } })
      ?.response?.data?.message ?? 'Đã xảy ra lỗi';
    toast({ title: msg, variant: 'destructive' });
  };

  const { data, isLoading } = useQuery({ queryKey, queryFn });

  const create = useMutation<unknown, unknown, TCreate>({
    mutationFn: (data: TCreate) => createFn ? createFn(data) : Promise.resolve(),
    onSuccess: () => { invalidate(); toast({ title: `${entityLabel} đã được tạo` }); },
    onError,
  });

  const update = useMutation<unknown, unknown, { id: string; data: TUpdate }>({
    mutationFn: (payload) => updateFn ? updateFn(payload) : Promise.resolve(),
    onSuccess: () => { invalidate(); toast({ title: `${entityLabel} đã được cập nhật` }); },
    onError,
  });

  const remove = useMutation<unknown, unknown, string>({
    mutationFn: (id: string) => deleteFn ? deleteFn(id) : Promise.resolve(),
    onSuccess: () => { invalidate(); toast({ title: `${entityLabel} đã được xóa` }); },
    onError,
  });

  return { data, isLoading, create, update, remove };
}
