# 💼 FinanzasVH v2.0
Sistema de gestión financiera personal — Victor Hugo  
**Stack:** React + Vite · FastAPI · SQLite · Docker

---

## 🚀 Instalación en 3 pasos

### Prerequisitos
- Docker Desktop (ya instalado ✅)
- VS Code (ya instalado ✅)

### 1. Clonar / descomprimir el proyecto
```bash
# Coloca la carpeta finanzas-vh en cualquier directorio, por ejemplo:
# C:\Users\VictorHugo\Proyectos\finanzas-vh   (Windows)
# ~/proyectos/finanzas-vh                      (Linux/Mac)
```

### 2. Levantar todo con un solo comando
```bash
cd finanzas-vh
docker-compose up -d --build
```

Espera ~2 minutos la primera vez (descarga de imágenes + build).

### 3. Abrir en el navegador
```
http://localhost:3000   → Frontend React
http://localhost:8000   → API FastAPI (documentación en /docs)
```

---

## 📁 Estructura del proyecto

```
finanzas-vh/
├── docker-compose.yml          ← Orquestación de servicios
├── data/
│   └── finanzas.db             ← Base de datos SQLite (persiste aquí)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                 ← API REST FastAPI
│   ├── models.py               ← Modelos SQLAlchemy
│   └── database.py             ← Configuración BD
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx             ← Aplicación React principal
        ├── api.js              ← Capa de comunicación con backend
        └── index.css
```

---

## 🗄️ Base de datos

Los datos se guardan en `data/finanzas.db` (SQLite).  
**Este archivo es tu base de datos real — respáldalo periódicamente.**

```bash
# Backup manual
cp data/finanzas.db data/finanzas-backup-$(date +%Y%m%d).db
```

También puedes exportar desde la app con el botón **⬇️ (Download)** en el header → genera un `finanzas-vh-backup-YYYY-MM-DD.json`.

---

## 🔌 API Endpoints principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Estado del servicio |
| GET | `/transactions?period=2026-03` | Listar transacciones |
| POST | `/transactions` | Crear transacción |
| POST | `/transactions/import` | Importar batch con deduplicación |
| DELETE | `/transactions/{id}` | Eliminar transacción |
| GET | `/budgets/{period}` | Obtener presupuesto |
| PUT | `/budgets` | Guardar presupuesto |
| GET | `/profile` | Obtener perfil |
| PUT | `/profile` | Actualizar perfil |
| GET | `/export` | Exportar todo (JSON backup) |

Documentación interactiva: **http://localhost:8000/docs**

---

## 🔧 Comandos útiles

```bash
# Levantar servicios
docker-compose up -d

# Ver logs en tiempo real
docker-compose logs -f

# Ver logs solo del backend
docker-compose logs -f backend

# Detener servicios
docker-compose down

# Reconstruir después de cambios en código
docker-compose up -d --build

# Acceder al contenedor backend (para debugging)
docker exec -it finanzas-backend bash

# Ver la base de datos directamente (requiere sqlite3)
sqlite3 data/finanzas.db ".tables"
sqlite3 data/finanzas.db "SELECT COUNT(*) FROM transactions;"
```

---

## 💡 Flujo de uso mensual (10-15 min/mes)

1. **Día 7-10 de cada mes** → descarga extractos del mes anterior
2. Abre `http://localhost:3000` → pestaña **Importar**
3. Selecciona el banco, pega el texto o sube el CSV
4. Revisa el preview → los duplicados ya están marcados
5. Confirma importación → el sistema guarda en SQLite
6. Revisa Dashboard y Presupuesto

---

## 🔒 Seguridad

- El sistema corre **solo en localhost** — no es accesible desde internet
- Los datos nunca salen de tu máquina
- SQLite es un archivo local en `data/finanzas.db`
- Para acceso desde tu red local (ej. desde el celular):
  ```bash
  # En docker-compose.yml, cambia los ports del frontend:
  ports:
    - "0.0.0.0:3000:80"
  # Luego accede con tu IP local: http://192.168.x.x:3000
  ```

---

## 🆙 Actualizar el sistema

```bash
# Detener, reconstruir e iniciar
docker-compose down
docker-compose up -d --build
# Los datos en data/finanzas.db se preservan siempre
```
