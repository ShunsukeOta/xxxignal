import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`ui-button ui-button--${variant} ui-button--${size} ${className}`.trim()} {...props}>
      {icon ? <span className="ui-button__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  )
}
