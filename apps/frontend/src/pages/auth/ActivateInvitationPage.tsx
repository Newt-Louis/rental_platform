import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ActivateInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password.length < 8) return setError("Mật khẩu phải có ít nhất 8 ký tự");
    if (password !== confirm) return setError("Mật khẩu xác nhận không khớp");
    setLoading(true);
    try { await api.post("/auth/activate-invitation", { token, password }); setDone(true); }
    catch (e: any) { setError(e?.response?.data?.message || "Không thể kích hoạt tài khoản"); }
    finally { setLoading(false); }
  }
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm"><h1 className="text-2xl font-semibold">Kích hoạt Tenant Portal</h1>{done ? <div className="mt-6 space-y-4"><p className="text-emerald-700">Tài khoản đã được kích hoạt thành công.</p><Button asChild className="w-full"><Link to="/login">Đăng nhập Tenant Portal</Link></Button></div> : <form className="mt-6 space-y-4" onSubmit={submit}><p className="text-sm text-muted-foreground">Đặt mật khẩu để truy cập hợp đồng, hóa đơn và các tiện ích dành cho khách thuê.</p><Input type="password" placeholder="Mật khẩu mới" value={password} onChange={(e) => setPassword(e.target.value)} /><Input type="password" placeholder="Xác nhận mật khẩu" value={confirm} onChange={(e) => setConfirm(e.target.value)} />{error && <p className="text-sm text-red-600">{error}</p>}<Button className="w-full" disabled={loading || !token}>{loading ? "Đang kích hoạt..." : "Kích hoạt tài khoản"}</Button></form>}</div></div>;
}
