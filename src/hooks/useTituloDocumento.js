import { useEffect } from 'react'

// Pone el título de la pestaña (Chrome lo usa como nombre al "Guardar como PDF")
// y restaura el anterior al salir de la página.
export function useTituloDocumento(titulo) {
  useEffect(() => {
    if (!titulo) return
    const anterior = document.title
    document.title = titulo
    return () => { document.title = anterior }
  }, [titulo])
}
