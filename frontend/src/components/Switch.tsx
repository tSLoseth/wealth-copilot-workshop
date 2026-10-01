interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  compact?: boolean
}

export default function Switch({ checked, onChange, label, description, compact = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch${compact ? ' switch--compact' : ''}`}
      onClick={() => onChange(!checked)}
      title={description}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label">{label}</span>
    </button>
  )
}
