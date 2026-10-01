import { HIGHLIGHTED_FLAGS, flagLabel } from './labels'

export default function FlagChip({ flag, count }: { flag: string; count?: number }) {
  return (
    <span className={`chip${HIGHLIGHTED_FLAGS.has(flag) ? ' chip--alert' : ' chip--muted'}`}>
      {flagLabel(flag)}
      {count !== undefined && count > 1 && ` ×${count}`}
    </span>
  )
}
