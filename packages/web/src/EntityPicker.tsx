import { useEffect, useMemo, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import type { GameEntity } from "./gameData";
import { inputCls } from "./ui";

/**
 * Searchable combobox over a Pal/item catalog: type a name, see icons, pick
 * one to fill its id. Free text still works for entities not in the catalog
 * (new IDs after a game update), so the field never blocks a valid command.
 */
export function EntityPicker({
  catalog,
  iconUrl,
  value,
  onChange,
  placeholder,
}: {
  catalog: GameEntity[];
  iconUrl: (icon: string) => string;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = catalog.find((e) => e.id === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? catalog.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
      : catalog;
    return list.slice(0, 60);
  }, [catalog, query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (entity: GameEntity) => {
    onChange(entity.id);
    setQuery("");
    setOpen(false);
  };

  // A value not in the catalog (raw id) is shown as-is in the text field.
  if (value && !open) {
    return (
      <div className="flex items-center gap-2">
        <div className={`${inputCls} flex flex-1 items-center gap-2`}>
          {selected?.icon ? (
            <img src={iconUrl(selected.icon)} alt="" className="size-6 shrink-0" />
          ) : (
            <span className="size-6 shrink-0 rounded bg-card-soft" />
          )}
          <span className="truncate">
            {selected ? selected.name : value}
            <span className="ml-2 font-mono text-xs text-ink-muted">{value}</span>
          </span>
          <button
            type="button"
            className="ml-auto text-ink-muted transition hover:text-berry"
            onClick={() => {
              onChange("");
              setOpen(true);
            }}
            aria-label="清除"
          >
            <FiX className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className={inputCls + " w-full"}
        value={query}
        placeholder={placeholder ?? "搜尋名稱或直接輸入 ID…"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && matches[highlight]) { e.preventDefault(); pick(matches[highlight]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {/* Allow committing whatever was typed as a raw id. */}
      {query.trim() && (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-xs font-bold text-pal"
          onClick={() => pick({ id: query.trim(), name: query.trim() })}
        >
          用此 ID
        </button>
      )}
      {open && matches.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border-2 border-line bg-card shadow-(--shadow-cute)">
          {matches.map((entity, i) => (
            <button
              key={entity.id}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition ${i === highlight ? "bg-card-soft" : "hover:bg-card-soft"}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(entity)}
            >
              {entity.icon ? (
                <img src={iconUrl(entity.icon)} alt="" className="size-7 shrink-0" />
              ) : (
                <span className="size-7 shrink-0 rounded bg-card-soft" />
              )}
              <span className="flex-1 truncate text-sm font-bold">{entity.name}</span>
              <span className="font-mono text-xs text-ink-muted">{entity.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
