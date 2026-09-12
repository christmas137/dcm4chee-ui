import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Field({
  label, hint, children, className = '',
}: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] text-muted">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-muted">{hint}</span>}
    </label>
  )
}

const inputClass =
  'h-7 w-full rounded border border-line bg-panel px-2 text-[12px] text-fg placeholder:text-muted focus-visible:border-accent disabled:opacity-50'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function Checkbox({
  label, checked, onChange, disabled,
}: { label: ReactNode; checked: boolean; onChange(checked: boolean): void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 accent-accent"
      />
      {label}
    </label>
  )
}

type ButtonTone = 'primary' | 'ghost' | 'danger'

const tones: Record<ButtonTone, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  ghost: 'border border-line text-fg hover:bg-panel-2',
  danger: 'border border-danger/50 text-danger hover:bg-danger/10',
}

export function Button({
  tone = 'ghost', children, ...props
}: { tone?: ButtonTone } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`h-7 rounded px-2.5 text-[12px] font-medium disabled:opacity-40 ${tones[tone]} ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}
