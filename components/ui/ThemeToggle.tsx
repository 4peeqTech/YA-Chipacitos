'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [light, setLight] = useState(false)

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'))
  }, [])

  function toggle() {
    const next = !light
    setLight(next)
    if (next) {
      document.documentElement.classList.add('light')
      document.cookie = 'theme=light; path=/; max-age=31536000'
    } else {
      document.documentElement.classList.remove('light')
      document.cookie = 'theme=dark; path=/; max-age=31536000'
    }
  }

  return (
    <button
      onClick={toggle}
      title={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]"
    >
      <span className="text-base">{light ? '🌙' : '☀️'}</span>
      {light ? 'Tema oscuro' : 'Tema claro'}
    </button>
  )
}
