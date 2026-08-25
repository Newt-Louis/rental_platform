import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ContentLoading() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center transition-opacity duration-500 ease-out",
        visible ? "opacity-100" : "opacity-0",
      )}
      role="status"
      aria-live="polite"
    >
      <img
        src="/logo.png"
        alt=""
        className="h-72 w-72 object-contain animate-logo-pulse"
      />
      <span className="sr-only">Đang tải nội dung</span>
    </div>
  );
}
