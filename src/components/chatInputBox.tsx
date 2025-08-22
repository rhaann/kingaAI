"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxRows?: number; // optional, default caps via px value below
};

export default function ChatInputBox({
  onSend,
  disabled = false,
  placeholder = "Start typing...",
}: Props) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Smooth auto-resize (cap height ~ 208px ≈ 13rem)
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`; // 208px ≈ h-52
  }, [value]);

  const doSend = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    const el = taRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = "44px"; // reset to base
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  return (
    <div className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        {/* ChatGPT-like wrapper: not rounded-full */}
        <div
          className="
            flex items-end gap-2
            rounded-2xl border border-border bg-secondary
            px-3 py-2 shadow-sm
            focus-within:border-[#FF3000] focus-within:ring-1 focus-within:ring-[#FF3000]/50
          "
        >
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="
              block w-full flex-1
              min-h-[44px] max-h-52 resize-none
              bg-transparent px-3 py-2
              leading-6 text-foreground placeholder:text-muted-foreground
              outline-none border-0 rounded-xl
            "
            aria-label="Message input"
          />

          <button
            type="button"
            onClick={doSend}
            disabled={disabled || !value.trim()}
            className="
              h-10 w-10 shrink-0
              rounded-lg bg-[#FF3000] text-white
              hover:bg-[#e62b00]
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center
            "
            aria-label="Send message"
            title="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Press Enter to send • Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}
