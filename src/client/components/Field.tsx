import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface FieldShellProps {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}

export function FieldShell({ label, htmlFor, required, hint, error, children }: FieldShellProps) {
  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}{required ? <span className="field__required">必須</span> : null}
      </label>
      {children}
      {error ? <p className="field__message field__message--error">{error}</p> : hint ? <p className="field__message">{hint}</p> : null}
    </div>
  )
}

export function TextField({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = props.id ?? props.name ?? label
  return (
    <FieldShell label={label} htmlFor={id} required={props.required} hint={hint} error={error}>
      <input {...props} id={id} className="ui-input" />
    </FieldShell>
  )
}

export function TextAreaField({ label, error, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  const id = props.id ?? props.name ?? label
  return (
    <FieldShell label={label} htmlFor={id} required={props.required} hint={hint} error={error}>
      <textarea {...props} id={id} className="ui-textarea" />
    </FieldShell>
  )
}

export function SelectField({ label, error, hint, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string; children: ReactNode }) {
  const id = props.id ?? props.name ?? label
  return (
    <FieldShell label={label} htmlFor={id} required={props.required} hint={hint} error={error}>
      <select {...props} id={id} className="ui-select">{children}</select>
    </FieldShell>
  )
}
