import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Secondary line, e.g. the department a person belongs to. */
  hint?: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string, option?: SearchableSelectOption) => void;
  /** Raises the typed term so the caller can query the server for matches. */
  onSearchChange?: (term: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  loading?: boolean;
  disabled?: boolean;
  /** Label of the "no selection" entry. Omit to make the field mandatory. */
  clearLabel?: string;
  className?: string;
  id?: string;
}

/**
 * Single-select with a search box inside the dropdown. The list is whatever the
 * caller passes: when `onSearchChange` is wired the term goes to the server and
 * the options arrive already filtered, so this only filters locally as a
 * fallback for callers that pass a complete list.
 */
export function SearchableSelect({
  value,
  options,
  onChange,
  onSearchChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  loading,
  disabled,
  clearLabel,
  className,
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const visible = useMemo(() => {
    // Server-side search already narrowed the list; filtering again would drop
    // matches the server found on fields this component never sees (e.g. email).
    if (onSearchChange || !term.trim()) return options;
    const needle = term.trim().toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.hint?.toLowerCase().includes(needle),
    );
  }, [options, term, onSearchChange]);

  const updateTerm = (next: string) => {
    setTerm(next);
    onSearchChange?.(next);
  };

  const close = () => {
    setOpen(false);
    updateTerm("");
  };

  const select = (option?: SearchableSelectOption) => {
    onChange(option?.value ?? "", option);
    close();
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm font-normal disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="relative border-b">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchRef}
              value={term}
              onChange={(event) => updateTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                }
              }}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent pl-9 pr-8 text-sm outline-none"
            />
            {term && (
              <button
                type="button"
                aria-label="clear-search"
                onClick={() => updateTerm("")}
                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto py-1" role="listbox">
            {clearLabel && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => select(undefined)}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                {clearLabel}
              </button>
            )}

            {loading && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}

            {!loading && visible.length === 0 && (
              <div className="px-3 py-3 text-sm text-muted-foreground">{emptyText}</div>
            )}

            {!loading &&
              visible.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => select(option)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Check
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.hint}
                      </span>
                    )}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
