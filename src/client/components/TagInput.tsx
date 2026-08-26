import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { FieldShell } from './Field'

interface TagInputProps {
  id: string
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  hint?: string
  maxItems?: number
}

export function TagInput({ id, label, value, onChange, placeholder = '入力してEnter', hint, maxItems = 20 }: TagInputProps) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const item = draft.trim().replace(/^,|,$/g, '')
    if (!item || value.includes(item) || value.length >= maxItems) {
      setDraft('')
      return
    }
    onChange([...value, item])
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    }
    if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <FieldShell label={label} htmlFor={id} hint={hint}>
      <div className="tag-input" onClick={() => document.getElementById(id)?.focus()}>
        {value.map((tag) => (
          <span className="tag-input__tag" key={tag}>
            {tag}
            <button type="button" aria-label={`${tag}を削除`} onClick={() => onChange(value.filter((item) => item !== tag))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={value.length === 0 ? placeholder : ''}
        />
      </div>
    </FieldShell>
  )
}
