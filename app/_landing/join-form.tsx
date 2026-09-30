'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import s from '../landing.module.css'

// "Email address + Get Started": continues to signup with the email filled in.
export function JoinForm({ className }: { className: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')

  return (
    <form
      className={className}
      onSubmit={e => {
        e.preventDefault()
        const value = email.trim()
        router.push(value ? `/signup?email=${encodeURIComponent(value)}` : '/signup')
      }}
    >
      <input
        className={s.inp}
        type="email"
        placeholder="Email address"
        aria-label="Email address"
        autoComplete="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <button type="submit" className={s.btnDark}>
        Get Started
      </button>
    </form>
  )
}
