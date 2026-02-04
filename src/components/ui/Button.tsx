'use client'

import { type ReactNode, type MouseEventHandler } from 'react'
import { motion } from 'framer-motion'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  isLoading?: boolean
  loadingText?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: MouseEventHandler<HTMLButtonElement>
  className?: string
  children?: ReactNode
  'aria-label'?: string
}

function Button({
  className = '',
  variant = 'primary',
  size = 'md',
  isLoading,
  loadingText,
  children,
  disabled,
  type = 'button',
  onClick,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-2xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-teal-500 hover:bg-teal-400 text-white focus:ring-teal-500',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100 focus:ring-slate-500',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-300 focus:ring-slate-500',
    danger: 'bg-red-500 hover:bg-red-400 text-white focus:ring-red-500',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm min-h-[36px]',
    md: 'px-4 py-2 text-base min-h-[44px]',
    lg: 'px-6 py-3 text-lg min-h-[52px]',
    xl: 'px-8 py-4 text-xl min-h-[64px]',
  }

  // Compute aria-label: use loadingText when loading, otherwise use provided aria-label
  const computedAriaLabel = isLoading && loadingText ? loadingText : ariaLabel

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      type={type}
      onClick={onClick}
      aria-busy={isLoading}
      aria-disabled={disabled || isLoading}
      aria-label={computedAriaLabel}
      aria-live="polite"
    >
      {isLoading ? (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : null}
      {children}
    </motion.button>
  )
}

export { Button }
