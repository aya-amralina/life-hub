import { Chip } from '@/components/ui/Chip'

/** One choice of chips; tapping the chosen one clears it. */
export function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T | null; onChange: (v: T | null) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-cap text-ink2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.value} selected={value === o.value} onClick={() => onChange(value === o.value ? null : o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}
