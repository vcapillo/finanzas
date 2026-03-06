# 🚀 Instalación con Nginx Proxy Manager (Red Local)

## Cómo funciona esta arquitectura

```
Tu PC / celular
     │
     │  http://finanzas.local  (o el dominio que elijas)
     ▼
┌─────────────────────────────────────┐
│     Nginx Proxy Manager             │  puerto 80/443
│     (ya instalado en tu servidor)   │
└───────────────┬─────────────────────┘
                │  proxy → servidor:8090
                ▼
┌─────────────────────────────────────┐
│     finanzas-frontend (nginx)       │  puerto 8090
│                                     │
│  /           → React App            │
│  /api/*      → backend:8000 interno │
└───────────────┬─────────────────────┘
                │  red Docker interna
                ▼
┌─────────────────────────────────────┐
│     finanzas-backend (FastAPI)      │  solo interno
│     data/finanzas.db                │  solo interno
└─────────────────────────────────────┘
```

**Ventaja clave:** NPM solo maneja UNA entrada. El backend nunca
tiene puerto abierto hacia afuera. Todo pasa por el frontend.

---

## Requisitos previos

- Servidor con Docker y Docker Compose instalados
- Nginx Proxy Manager ya corriendo en ese servidor
- Un subdominio o nombre que resuelva a la IP del servidor
  - Opción A: entrada en tu router DNS → `finanzas.local`
  - Opción B: entrada en `/etc/hosts` de cada PC cliente
  - Opción C: dominio real con wildcard apuntando al servidor

---

## PASO 1 — Transferir y descomprimir

```bash
# Desde tu PC, copiar el ZIP al servidor
scp finanzas-vh-docker.zip usuario@192.168.1.50:/opt/

# Conectarse al servidor
ssh usuario@192.168.1.50

# Ir al directorio y descomprimir
cd /opt
unzip finanzas-vh-docker.zip
cd finanzas-vh
```

---

## PASO 2 — Crear el archivo de configuración

```bash
cp .env.example .env
nano .env
```

Cambia el dominio por el que usarás en NPM:

```
APP_DOMAIN=finanzas.local
```

> Usa el mismo valor que pondrás en NPM como "Domain Names".
> Sin `http://`, sin barra final.

---

## PASO 3 — Preparar directorio de datos

```bash
mkdir -p data
chmod 755 data
```

---

## PASO 4 — Levantar los contenedores

```bash
docker compose up -d --build
```

Primera vez: 3-8 minutos (descarga imágenes + compila React).

### Verificar que levantó correctamente

```bash
docker compose ps
```

Resultado esperado:

```
NAME                  STATUS           PORTS
finanzas-backend      Up (healthy)     (sin puertos externos)
finanzas-frontend     Up               0.0.0.0:8090->80/tcp
```

```bash
# Prueba rápida local — debe responder
curl http://localhost:8090
```

---

## PASO 5 — Configurar Nginx Proxy Manager

### 5.1 Abrir el panel de NPM

Generalmente en: `http://IP-SERVIDOR:81`

### 5.2 Crear nuevo Proxy Host

Ve a **Hosts → Proxy Hosts → Add Proxy Host**

#### Pestaña "Details"

| Campo | Valor |
|-------|-------|
| **Domain Names** | `finanzas.local` ← el mismo de tu .env |
| **Scheme** | `http` |
| **Forward Hostname / IP** | `IP-del-servidor` o `172.17.0.1` |
| **Forward Port** | `8090` |
| **Block Common Exploits** | ✅ activado |
| **Websockets Support** | ☐ (no necesario) |

> **¿Cuál IP poner?**
>
> - Si NPM corre en el **mismo servidor** que FinanzasOS:
>   - Usa la IP del host Docker: `172.17.0.1`
>   - O la IP LAN del servidor: `192.168.1.50`
>
> - Si NPM corre en un **servidor diferente**:
>   - Usa la IP LAN del servidor donde está FinanzasOS: `192.168.1.50`

#### Pestaña "Custom Locations" — NO necesaria

El proxy `/api/` ya lo maneja el nginx **interno** del contenedor.
No hay que configurar nada adicional en NPM para la API.

#### Pestaña "SSL" (opcional pero recomendado)

Si tienes un certificado wildcard o Let's Encrypt con tu dominio real:

| Campo | Valor |
|-------|-------|
| SSL Certificate | Selecciona o solicita uno |
| Force SSL | ✅ |
| HTTP/2 Support | ✅ |

> Si usas `.local` sin dominio real, deja SSL desactivado por ahora.

### 5.3 Guardar → "Save"

NPM recarga su configuración automáticamente.

---

## PASO 6 — Configurar resolución del dominio

Para que `finanzas.local` resuelva a tu servidor, elige una opción:

### Opción A: DNS del router (recomendado, funciona en toda la red)

Entra al panel de tu router → DNS local / Hosts →
agrega una entrada:

```
finanzas.local  →  192.168.1.50   (IP de tu servidor)
```

Cada router lo llama diferente: "DNS Override", "Static DNS",
"Local DNS Records", "Hosts".

### Opción B: Archivo hosts en cada PC cliente

**Windows** → `C:\Windows\System32\drivers\etc\hosts`
**Linux/Mac** → `/etc/hosts`

Agrega esta línea:
```
192.168.1.50    finanzas.local
```

### Opción C: Pi-hole o AdGuard Home

Si usas Pi-hole/AdGuard como DNS en tu red:
- Ve a **Local DNS Records**
- Agrega: `finanzas.local` → `192.168.1.50`

---

## PASO 7 — Acceder a la aplicación

```
http://finanzas.local
```

La primera vez cargará con base de datos vacía y perfil por defecto.

### Configuración inicial recomendada

1. Clic en **⚙️** (esquina superior derecha)
2. Actualiza tu nombre e ingreso mensual real
3. En **🏦 Cuentas** → activa solo las que usas
4. En **📅 Ciclos** → ajusta días de corte/vencimiento
5. Guarda con **💾 Guardar todo**

---

## Comandos de administración

```bash
# Ver estado de los contenedores
docker compose ps

# Ver logs en tiempo real
docker compose logs -f

# Detener sin borrar datos
docker compose down

# Reiniciar
docker compose restart

# Reconstruir (después de actualizar código)
docker compose down && docker compose up -d --build

# Ver uso de CPU/memoria
docker stats finanzas-backend finanzas-frontend
```

---

## Backup de datos

```bash
# Backup manual (ejecutar en el servidor)
cp data/finanzas.db "data/backup-$(date +%Y%m%d-%H%M).db"

# Backup automático diario — agregar al cron del servidor
crontab -e
# Añadir:
# 0 3 * * * cp /opt/finanzas-vh/data/finanzas.db /opt/finanzas-vh/data/backup-$(date +\%Y\%m\%d).db
```

También desde la app: botón **⬇️** en el header descarga un JSON completo.

---

## Solución de problemas

### NPM muestra "Bad Gateway"

```bash
# Verificar que el frontend está corriendo
docker compose ps
docker compose logs frontend

# Verificar que el puerto 8090 responde desde el servidor
curl -s -o /dev/null -w "%{http_code}" http://localhost:8090
# Debe responder: 200
```

### La app carga pero dice "Error de conexión"

El frontend llega pero no puede hablar con el backend internamente.

```bash
# Ver logs del backend
docker compose logs backend

# Verificar que ambos están en la misma red Docker
docker network inspect finanzas_net

# Probar el proxy /api desde el servidor
curl http://localhost:8090/api/health
# Debe responder: {"status":"ok","app":"FinanzasOS","version":"2.0.0"}
```

### El dominio no resuelve desde los clientes

```bash
# Verificar que el servidor responde en el puerto 8090
# (ejecutar desde otro equipo de la red)
curl http://192.168.1.50:8090

# Verificar resolución DNS
ping finanzas.local
nslookup finanzas.local
```

### Puerto 8090 ya está en uso en el servidor

```bash
# Ver qué proceso usa el puerto
ss -tlnp | grep :8090

# Cambiar el puerto en docker-compose.yml:
# "8090:80"  →  "3001:80"
# Y en NPM cambiar Forward Port a 3001
```

### NPM y FinanzasOS en el mismo Docker host — red compartida

Si quieres que NPM apunte al contenedor por nombre (sin IP):

```bash
# Ver el nombre de la red de NPM
docker network ls | grep npm
# Ejemplo: npm_default

# Editar docker-compose.yml:
# Descomentar las líneas de npm_network al final del archivo
# Cambiar el nombre si es diferente a npm_default

docker compose down && docker compose up -d
```

Luego en NPM usar como Forward Hostname: `finanzas-frontend`

---

## Estructura final

```
/opt/finanzas-vh/
├── .env                    ← APP_DOMAIN=finanzas.local
├── docker-compose.yml
├── data/
│   └── finanzas.db         ← 🔴 RESPALDAR ESTO
├── backend/
└── frontend/
```

---

*Una sola entrada en NPM. Un solo dominio. Backend completamente interno.*
