'use client'

import { useRouter, usePathname } from 'next/navigation'

const chipBase = 'px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border'
const chipActive = 'bg-[#e8c547] text-black border-[#e8c547]'
const chipInactive = 'bg-[#1a1a1a] text-[#888] border-[#2a2a2a] hover:text-[#f0f0f0]'

/** Chips Hoy/Ayer + date picker libre. El supervisor no tiene límite de fecha. */
export default function SelectorDia({ dia, hoy, ayer }: { dia: string; hoy: string; ayer: string }) {
  const router = useRouter()
  const pathname = usePathname()

  function ir(nuevoDia: string) {
    if (!nuevoDia) return
    router.push(`${pathname}?dia=${nuevoDia}`)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#888]">Viendo</span>
      <button type="button" onClick={() => ir(ayer)} className={`${chipBase} ${dia === ayer ? chipActive : chipInactive}`}>Ayer</button>
      <button type="button" onClick={() => ir(hoy)} className={`${chipBase} ${dia === hoy ? chipActive : chipInactive}`}>Hoy</button>
      <input
        type="date"
        value={dia}
        onChange={e => ir(e.target.value)}
        className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-[#e8c547] transition-colors"
      />
    </div>
  )
}
