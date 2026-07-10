-- profiles.id → auth.users: cambiar a CASCADE para que al borrar el auth user se borre el profile
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- pedidos.local_id → profiles: SET NULL para conservar historial
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_local_id_fkey;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_local_id_fkey
  FOREIGN KEY (local_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- conciliaciones.local_id → profiles: SET NULL para conservar historial
ALTER TABLE public.conciliaciones DROP CONSTRAINT IF EXISTS conciliaciones_local_id_fkey;
ALTER TABLE public.conciliaciones ADD CONSTRAINT conciliaciones_local_id_fkey
  FOREIGN KEY (local_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ventas_posberry.local_id → profiles: SET NULL para conservar historial
ALTER TABLE public.ventas_posberry DROP CONSTRAINT IF EXISTS ventas_posberry_local_id_fkey;
ALTER TABLE public.ventas_posberry ADD CONSTRAINT ventas_posberry_local_id_fkey
  FOREIGN KEY (local_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
