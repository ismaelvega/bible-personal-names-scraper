## Extractor de Nombres Bíblicos

Aplicación Next.js para extraer nombres propios de la Biblia (personas y lugares), usando OpenAI y una base local SQLite con datos en `public/bible_data`.

### Características principales
- Procesar versículos, capítulos completos o libros completos con actualización en tiempo real (badges de nombres aparecen mientras se procesa).
- Clasificación de nombres: `person` vs `place`; exclusión de divinidades, sustantivos genéricos y gentilicios.
- Prompt con contexto del versículo anterior para desambiguar genealogías y nombres compuestos.
- Reprocesar un versículo individual (borra y recalcula resultados).
- Explorador de nombres con referencias y opción de eliminar un nombre.
- Métricas de uso bajo demanda (tokens / requests).

### Requisitos
- Node.js 18+
- pnpm (recomendado)
- Clave de OpenAI

### Configuración
1) Instala dependencias
```bash
pnpm install
```

2) Crea `.env.local`
```env
OPENAI_API_KEY=tu_clave
# Opcional para estadísticas administradas
OPENAI_ADMIN_KEY=tu_clave_admin
```

### Ejecutar en desarrollo
```bash
pnpm dev
# abre http://localhost:3000
```

### Uso rápido
1) Selecciona libro y capítulo en la UI.
2) Opciones de proceso:
   - Versículo: botón azul por cada verso.
   - Capítulo: botón “Procesar Todo”.
   - Libro: botón ⚡ en la cabecera de “Libros” (muestra progreso cap a cap en tiempo real).
3) Reprocesar: botón ámbar 🔄 en versos ya procesados (relee con el prompt actual).
4) Eliminar nombre: ícono de basura en el explorador de nombres.
5) Actualizar usage: botón en el header (tokens/requests).

### Datos y base
- Textos bíblicos en `public/bible_data` (JSON por libro).
- SQLite manejada con `better-sqlite3` (tablas: `processed_verses`, `extracted_names`).

### Prompt (resumen)
- Extrae solo nombres propios de personas y lugares.
- Excluye divinidades, genéricos, fenómenos naturales y todos los gentilicios.
- Usa el versículo anterior como contexto; en genealogías, los nombres (incluso con sufijo “-im”) son personas.
- Salida estricta JSON: `{ "names": [{ "name": string, "type": "person" | "place" }] }`.

### Scripts útiles
- `pnpm dev` — servidor de desarrollo
- `pnpm lint` — linting

### Notas
- Los capítulos están filtrados según el índice `_index.json`; algunos libros pueden omitirse.
- Si cambias los datos de `public/bible_data`, reinicia para recargar el contenido en memoria.
