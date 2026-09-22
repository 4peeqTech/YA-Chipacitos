import type { Database } from './database.types'

export type Tabla<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Insertar<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Actualizar<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
