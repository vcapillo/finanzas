# 🚀 Guía de Instalación — FinanzasOS v2.0
**Instalación desde cero en servidor con Docker**
Sin datos de prueba — base de datos vacía lista para tu uso real.

---

## ✅ Requisitos previos

Antes de empezar, verifica que tienes:

| Requisito | Cómo verificar | Versión mínima |
|-----------|---------------|----------------|
| Docker Engine | `docker --version` | 20.x o superior |
| Docker Compose | `docker compose version` | v2.x (plugin) |
| Puerto 8090 libre | `ss -tlnp \| grep 8090` | — |
| Puerto 8000 libre | `ss -tlnp \| grep 8000` | — |
| ~500 MB disco libre | `df -h .` | — |

> **Nota sobre Compose:** Los servidores modernos usan `docker compose` (sin guión).  
> Si tu servidor tiene la versión antigua, usa `docker-compose` (con guión) en todos los comandos.

---

## PASO 1 — Transferir los archivos al servidor

Tienes dos opciones según cómo tengas acceso:

### Opción A: desde tu PC con SCP (recomendado)
```bash
# Ejecuta esto desde tu PC, no desde el servidor
scp finanzas-vh-docker.zip usuario@IP_SERVIDOR:/home/usuario/

# Ejemplo real:
scp finanzas-vh-docker.zip victor@192.168.1.50:/home/victor/
```

### Opción B: descarga directa en el servidor
```bash
# Si tienes el ZIP en alguna URL accesible:
wget -O finanzas-vh-docker.zip "https://tu-url/finanzas-vh-docker.zip"

# O con curl:
curl -L -o finanzas-vh-docker.zip "https://tu-url/finanzas-vh-docker.zip"
```

### Opción C: copiar con git (si tienes repositorio)
```bash
git clone https://github.com/tu-usuario/finanzas-vh.git
cd finanzas-vh
```

---

## PASO 2 — Descomprimir y preparar

```bash
# Conectarte al servidor (si no estás ya)
ssh usuario@IP_SERVIDOR

# Ir al directorio home o donde quieras instalar
cd /home/usuario

# Descomprimir
unzip finanzas-vh-docker.zip

# Entrar a la carpeta del proyecto
cd finanzas-vh

# Verificar que la estructura esté correcta
ls -la
```

Deberías ver algo así:
```
drwxr-xr-x  backend/
drwxr-xr-x  data/
drwxr-xr-x  frontend/
-rw-r--r--  .env.example
-rw-r--r--  .gitignore
-rw-r--r--  docker-compose.yml
-rw-r--r--  README.md
```

---

## PASO 3 — Configurar la IP del servidor

Este es el paso más importante para acceder desde otros dispositivos.

```bash
# Obtener la IP de tu servidor
ip addr show | grep "inet " | grep -v 127.0.0.1
# Resultado ejemplo: inet 192.168.1.50/24  ← esa es tu IP
```

```bash
# Crear el archivo de configuración
cp .env.example .env

# Editar con tu IP real
nano .env
```

Cambia el archivo para que quede así (con TU IP):
```
SERVER_IP=192.168.1.50
```

> **Si accedes SOLO desde el mismo servidor** (teclado+pantalla local o SSH tunnel):  
> Deja `SERVER_IP=localhost` sin cambiar.

Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

---

## PASO 4 — Crear el directorio de datos

```bash
# El directorio data/ debe existir con permisos correctos
mkdir -p data
chmod 755 data

# Verificar
ls -la data/
```

---

## PASO 5 — Construir y levantar los contenedores

```bash
# Construir imágenes y levantar todo en segundo plano
docker compose up -d --build
```

La primera vez descarga las imágenes base y compila el frontend React.  
**Tiempo estimado: 3-8 minutos** dependiendo de la conexión a internet del servidor.

Verás algo como:
```
[+] Building 45.2s (18/18) FINISHED
[+] Running 2/2
 ✔ Container finanzas-backend   Healthy
 ✔ Container finanzas-frontend  Started
```

---

## PASO 6 — Verificar que funciona

```bash
# Verificar que ambos contenedores están corriendo
docker compose ps

# Resultado esperado:
# NAME                  STATUS          PORTS
# finanzas-backend      Up (healthy)    0.0.0.0:8000->8000/tcp
# finanzas-frontend     Up              0.0.0.0:8090->8090/tcp
```

```bash
# Probar el backend directamente
curl http://localhost:8000/health

# Respuesta esperada:
# {"status":"ok","app":"FinanzasOS","version":"2.0.0"}
```

---

## PASO 7 — Acceder a la aplicación

Abre en tu navegador:

| Desde... | URL |
|---------|-----|
| El mismo servidor | `http://localhost:8090` |
| Otro equipo en tu red | `http://192.168.1.50:8090` ← tu IP |
| API (documentación) | `http://192.168.1.50:8000/docs` |

---

## PASO 8 — Configuración inicial en la app

La primera vez que abras la app verás el sistema vacío y listo.  
Sigue estos pasos en la interfaz:

### 8.1 Configurar tu perfil
1. Clic en el botón **⚙️** (esquina superior derecha)
2. Cambia el nombre "Victor Hugo" por el tuyo
3. Ingresa tu ingreso mensual real
4. Cambia el día de cobro (día en que recibes tu sueldo)
5. Clic en **Guardar perfil**

### 8.2 Configurar cuentas y tarjetas
1. Clic en **⚙️** → sección **🏦 Cuentas**
2. Activa solo las cuentas que usas (desactiva las que no)
3. Agrega las que falten con **+ Nueva cuenta**
4. Clic en **💾 Guardar todo**

### 8.3 Configurar ciclos de tarjetas de crédito
1. Clic en **⚙️** → sección **📅 Ciclos**
2. Edita los días de corte y vencimiento de cada tarjeta
3. Agrega tus tarjetas si no están
4. Clic en **💾 Guardar todo**

### 8.4 Agregar tus primeras transacciones
Dos formas:
- **Manual**: pestaña **Movimientos** → botón **+ Agregar**
- **Importar extracto**: pestaña **Importar** → pegar texto del PDF o subir CSV

---

## Comandos de administración útiles

```bash
# Ver logs en tiempo real (útil para depurar)
docker compose logs -f

# Ver solo logs del backend
docker compose logs -f backend

# Detener los servicios (sin borrar datos)
docker compose down

# Reiniciar después de cambios
docker compose restart

# Reconstruir después de actualizar el código
docker compose up -d --build

# Ver uso de recursos
docker stats
```

---

## 🔒 Firewall — abrir puertos si es necesario

Si accedes desde otro equipo y no carga, puede que el firewall esté bloqueando:

```bash
# Ubuntu/Debian con UFW
sudo ufw allow 8090/tcp
sudo ufw allow 8000/tcp
sudo ufw reload
sudo ufw status

# CentOS/RHEL con firewalld
sudo firewall-cmd --permanent --add-port=8090/tcp
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --reload
```

---

## 💾 Backup de datos

Todos tus datos viven en `data/finanzas.db`. Haz copias regularmente:

```bash
# Backup manual con fecha
cp data/finanzas.db data/finanzas-$(date +%Y%m%d).db

# Backup automático diario con cron (opcional)
crontab -e
# Agregar esta línea para backup a las 2am cada día:
# 0 2 * * * cp /home/usuario/finanzas-vh/data/finanzas.db /home/usuario/finanzas-vh/data/finanzas-$(date +\%Y\%m\%d).db
```

También puedes exportar desde la app: botón **⬇️** en el header → descarga `finanzas-vh-backup-FECHA.json`.

---

## ❓ Solución de problemas frecuentes

### La app no carga en el navegador
```bash
# Verificar que los contenedores están corriendo
docker compose ps

# Si están caídos, ver por qué
docker compose logs backend
docker compose logs frontend
```

### "Error de conexión" en la app
El frontend no llega al backend. Causas comunes:
1. `SERVER_IP` en `.env` no coincide con la IP desde donde accedes
2. El puerto 8000 está bloqueado por firewall
3. Reconstruir después de cambiar `.env`:
   ```bash
   docker compose down
   docker compose up -d --build
   ```

### Los puertos 8090 o 8000 ya están en uso
```bash
# Ver qué proceso usa el puerto
ss -tlnp | grep 8090

# Cambiar el puerto en docker-compose.yml (lado izquierdo)
# "8090:80"  →  "3001:80"  (usar 3001 en el navegador)
```

### Error de permisos en `data/`
```bash
# Dar permisos al directorio de datos
chmod 777 data/
docker compose restart backend
```

### Reconstrucción limpia (si algo falla misteriosamente)
```bash
docker compose down
docker system prune -f        # limpia caché de build
docker compose up -d --build  # reconstruye desde cero
# Los datos en data/finanzas.db NO se borran
```

---

## 📁 Estructura final de archivos en el servidor

```
finanzas-vh/
├── .env                    ← tu configuración (SERVER_IP)
├── .env.example            ← plantilla
├── docker-compose.yml      ← orquestación de servicios
├── data/
│   └── finanzas.db         ← 🔴 TU BASE DE DATOS — respalda esto
├── backend/
│   ├── Dockerfile
│   ├── main.py             ← API FastAPI
│   ├── models.py           ← esquema de base de datos
│   ├── database.py
│   └── requirements.txt
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── App.jsx         ← interfaz React
        └── api.js          ← cliente HTTP
```

---

*Sistema listo. Ningún dato de prueba. Todo lo que registres es tuyo desde el primer movimiento.*
