export const dynamic = 'force-dynamic'

import PosberryClient from './PosberryClient'

export default function PosberryPage() {
  return (
    <div className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold font-['Syne'] text-[#f0f0f0]">Ventas Posberry</h1>
        <p className="text-sm text-[#888]">Todos los registros de la planilla · sucursales y mayoristas</p>
      </div>
      <PosberryClient />
    </div>
  )
}
