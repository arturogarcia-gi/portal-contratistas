// Registra una transición en eventos_documento. Nunca bloquea el flujo principal:
// si falla, solo se deja constancia en consola.
// usuario_nombre = email del usuario autenticado (null si no se puede obtener).
export async function registrarEventoDocumento(supabase, evento) {
  try {
    let usuario_nombre = null
    try {
      const { data } = await supabase.auth.getUser()
      usuario_nombre = data?.user?.email ?? null
    } catch {
      usuario_nombre = null
    }
    const { error } = await supabase
      .from('eventos_documento')
      .insert([{ usuario_nombre, ...evento }])
    if (error) console.error('Error al registrar evento:', error)
  } catch (error) {
    console.error('Error al registrar evento:', error)
  }
}
