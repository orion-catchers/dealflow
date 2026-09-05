'use client';

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

type Option = { value: string; label: string; disabled?: boolean };

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

function collectOptions(children: ReactNode): Option[] {
  const options: Option[] = [];
  Children.forEach(children, child => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(child)) return;
    if (child.type === 'optgroup') {
      options.push(...collectOptions(child.props.children));
      return;
    }
    if (child.type !== 'option') return;
    const label = nodeText(child.props.children);
    const value = child.props.value !== undefined && child.props.value !== null ? String(child.props.value) : label;
    options.push({ value, label: label || value, disabled: Boolean(child.props.disabled) });
  });
  return options;
}

export type GlassSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
};

export function GlassSelect({
  label,
  error,
  id,
  children,
  className = '',
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  multiple,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: GlassSelectProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const listId = `${fieldId}-list`;
  const errorId = `${fieldId}-error`;
  const options = useMemo(() => collectOptions(children), [children]);
  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultValue !== undefined ? String(defaultValue) : '');
  const current = isControlled ? String(value ?? '') : uncontrolled;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number; maxHeight: number; openUp: boolean } | null>(null);
  const [menuRoot, setMenuRoot] = useState<HTMLElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find(option => option.value === current);
  const display = selected?.label || (current ? current : 'Select…');

  const emit = useCallback((next: string) => {
    if (!isControlled) setUncontrolled(next);
    onChange?.({
      target: { value: next, name: name ?? '' },
      currentTarget: { value: next, name: name ?? '' },
    } as ChangeEvent<HTMLSelectElement>);
  }, [isControlled, name, onChange]);

  const updateMenu = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    setMenuBox({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left: rect.left,
      width: Math.max(rect.width, 168),
      maxHeight: Math.min(280, Math.max(120, openUp ? spaceAbove : spaceBelow)),
      openUp,
    });
  };

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!open) {
      setMenuRoot(null);
      return;
    }
    const root = wrapRef.current?.closest('dialog');
    setMenuRoot(root instanceof HTMLElement ? root : document.body);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = Math.max(0, options.findIndex(option => option.value === current));
    setActive(selectedIndex);
    activeRef.current = selectedIndex;
    updateMenu();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (document.getElementById(listId)?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(index => {
          const step = event.key === 'ArrowDown' ? 1 : -1;
          let next = index;
          for (let i = 0; i < options.length; i += 1) {
            next = (next + step + options.length) % options.length;
            if (!options[next]?.disabled) {
              activeRef.current = next;
              return next;
            }
          }
          return index;
        });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const option = options[activeRef.current];
        if (option && !option.disabled) {
          emit(option.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };
    const onReposition = () => updateMenu();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, listId, options, current, emit]);

  if (multiple || options.length === 0) {
    return (
      <div className={`df-field df-select ${className}`.trim()}>
        {label ? <label htmlFor={fieldId}>{label}</label> : null}
        <select
          id={fieldId}
          name={name}
          multiple={multiple}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-invalid={error ? true : ariaInvalid}
          aria-describedby={[ariaDescribedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined}
        >
          {children}
        </select>
        {error ? <span id={errorId} className="df-field-error">{error}</span> : null}
      </div>
    );
  }
  const describedBy = [ariaDescribedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const menu = open && menuBox && menuRoot
    ? createPortal(
      <ul
        id={listId}
        role="listbox"
        className="df-select-menu"
        style={{
          top: menuBox.openUp ? undefined : menuBox.top,
          bottom: menuBox.openUp ? window.innerHeight - menuBox.top : undefined,
          left: menuBox.left,
          width: menuBox.width,
          maxHeight: menuBox.maxHeight,
        }}
      >
        {options.map((option, index) => (
          <li key={`${option.value}-${index}`} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={option.value === current}
              disabled={option.disabled}
              className={[option.value === current ? 'is-selected' : '', index === active ? 'is-active' : ''].filter(Boolean).join(' ') || undefined}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                if (option.disabled) return;
                emit(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>,
      menuRoot,
    )
    : null;

  return (
    <div className={`${label || error ? 'df-field' : ''} df-select ${className}`.trim()} ref={wrapRef}>
      {label ? <label htmlFor={fieldId}>{label}</label> : null}
      <button
        ref={triggerRef}
        type="button"
        id={fieldId}
        className="df-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={error ? true : ariaInvalid}
        aria-label={ariaLabel ?? (label ? undefined : 'Select')}
        aria-describedby={describedBy}
        onClick={() => {
          if (disabled) return;
          setOpen(isOpen => !isOpen);
        }}
      >
        <span>{display}</span>
      </button>
      <select
        tabIndex={-1}
        aria-hidden
        className="df-select-native"
        required={required}
        disabled={disabled}
        value={current}
        onChange={event => emit(event.target.value)}
      >
        {children}
      </select>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      {error ? <span id={errorId} className="df-field-error">{error}</span> : null}
      {menu}
    </div>
  );
}
