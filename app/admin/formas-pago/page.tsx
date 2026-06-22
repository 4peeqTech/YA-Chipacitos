import TablaMaestra from '@/components/ui/TablaMaestra'
export const metadata = { title: 'Formas de pago | YA! Chipacitos' }
export default function FormasPagoPage() {
  return <TablaMaestra titulo="Formas de pago" descripcion="Medios de pago disponibles para registrar gastos" apiPath="/api/formas-pago" />
}
