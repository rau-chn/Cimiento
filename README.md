# Cimiento

PWA personal, local-first y sin servidor para seguimiento de crecimiento espiritual.

## Características

- Hoy: lectura, oración e iglesia.
- Lecturas estructuradas y mapa de los 66 libros.
- Planes de lectura calculados desde las lecturas reales.
- Oración rápida y profunda con cronómetro resistente al bloqueo de pantalla.
- Peticiones de oración.
- Asistencia por culto y horario semanal configurable.
- Estudio personal, versículos resaltados, favorito y memorización.
- Dashboard, rachas, metas semanales y revisión dominical.
- IndexedDB, respaldo JSON versionado, PWA offline y almacenamiento persistente.

## Ejecutar localmente

Los módulos ES y el service worker requieren servir los archivos por HTTP. Desde la raíz:

```bash
python -m http.server 8080
```

Abrir `http://localhost:8080`.

## Pruebas

No hay dependencias externas ni paso de compilación.

```bash
npm test
```

## GitHub Pages

1. Subir estos archivos a la rama principal del repositorio.
2. En GitHub: **Settings → Pages**.
3. En **Build and deployment**, elegir **Deploy from a branch**.
4. Seleccionar la rama principal y la carpeta `/ (root)`.
5. Guardar y abrir la URL HTTPS publicada por GitHub Pages.

El manifest, los recursos y el service worker usan rutas relativas para funcionar tanto en un dominio raíz como en `usuario.github.io/repositorio/`.
