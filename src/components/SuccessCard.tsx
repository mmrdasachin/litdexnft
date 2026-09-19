import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Trophy, X } from "lucide-react";
import type { SuccessPayload } from "@/lib/feedback";

export default function SuccessCard() {
  const [data, setData] = useState<SuccessPayload | null>(null);

  useEffect(() => {
    const onSuccess = (e: any) => {
      setData(e.detail as SuccessPayload);
    };
    window.addEventListener("litdex:success", onSuccess);
    return () => window.removeEventListener("litdex:success", onSuccess);
  }, []);

  const isError = data?.variant === "error";

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => setData(null), data.variant === "error" ? 6000 : 5000);
    return () => clearTimeout(t);
  }, [data]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setData(null)}
        >
          <motion.div
            initial={{ scale: 0.9, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 8 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            role={isError ? "alert" : "status"}
            className="relative bg-brand-surface border border-brand-border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] w-full min-w-[320px] max-w-[420px] p-6 success-alert-card"
          >
            <button
              onClick={() => setData(null)}
              className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-brand-text-muted"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 border ${
                  isError ? "bg-[#FF4D4D]/10 border-[#FF4D4D]/30" : "bg-white/5 border-white/10"
                }`}
              >
                {isError ? (
                  <AlertCircle size={20} className="text-[#FF6B6B]" />
                ) : (
                  <Trophy size={20} className="text-white" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-black uppercase tracking-tight text-base text-brand-text-primary truncate">
                  {data.title}
                </div>
                {data.subtitle && (
                  <div className="text-[10px] font-bold uppercase tracking-widest text-brand-text-muted">
                    {data.subtitle}
                  </div>
                )}
              </div>
            </div>

            {data.message && (
              <p className="border-t border-brand-border pt-4 text-xs font-mono font-bold text-brand-text-primary break-words">
                {data.message}
              </p>
            )}

            {data.rows.length > 0 && (
            <div className="border-t border-brand-border pt-4 space-y-3">
              {data.rows.map((row, i) => (
                <div key={i} className="flex justify-between items-center gap-4 text-xs font-mono">
                  <span className="font-bold uppercase tracking-widest text-brand-text-muted">
                    {row.label}
                  </span>
                  {row.href ? (
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-brand-text-primary text-right break-all underline decoration-white/30 underline-offset-4 hover:decoration-white"
                    >
                      {row.value}
                    </a>
                  ) : (
                    <span className="font-bold text-brand-text-primary text-right break-all">
                      {row.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
