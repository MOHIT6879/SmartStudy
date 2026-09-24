import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { SCRIPT_LANGUAGES } from '../config/languages';

type Props = {
  value: string;
  onChange: (language: string) => void;
  id?: string;
  disabled?: boolean;
};

export default function LanguageSelect({ value, onChange, id, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...SCRIPT_LANGUAGES] as string[];
    return (SCRIPT_LANGUAGES as readonly string[]).filter((language) => language.toLowerCase().includes(needle));
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery('');
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (language: string) => {
    onChange(language);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(options.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); if (options[activeIndex]) commit(options[activeIndex]); }
  };

  return (
    <div className="lang-select" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        className="lang-select-trigger"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id ? `${id}-listbox` : undefined}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span>{value || 'Select language'}</span>
        <ChevronDown size={15} className={open ? 'lang-select-caret open' : 'lang-select-caret'} />
      </button>

      {open && (
        <div className="lang-select-popover">
          <div className="lang-select-search">
            <Search size={14} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder="Search language"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ul className="lang-select-list" role="listbox" id={id ? `${id}-listbox` : undefined} ref={listRef}>
            {options.length === 0 && <li className="lang-select-empty">No match</li>}
            {options.map((language, index) => (
              <li
                key={language}
                role="option"
                aria-selected={language === value}
                data-active={index === activeIndex}
                className={index === activeIndex ? 'lang-select-option active' : 'lang-select-option'}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(language)}
              >
                <span>{language}</span>
                {language === value && <Check size={14} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
