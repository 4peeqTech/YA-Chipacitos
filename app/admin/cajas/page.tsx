import TablaMaestra from '@/components/ui/TablaMaestra'
export const metadata = { title: 'Cajas | YA! Chipacitos' }
export default function CajasPage() {
  return <TablaMaestra titulo="Cajas" descripcion="Cajas y cuentas disponibles para registrar pagos" apiPath="/api/cajas" />
}
