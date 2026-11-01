# Publicar Cuadre en AWS (EC2 + tu dominio)

Todo corre en **una instancia EC2** con Docker: PostgreSQL, la API y la web (Caddy, que saca y renueva el certificado HTTPS solo). Respaldos diarios a S3.

```
Internet ──443──▶ Caddy (web + HTTPS) ──/api──▶ API Node ──▶ PostgreSQL
                                                  └─ comprobantes (volumen)
```

> **¿Ya tienes una EC2 con otra app (y su nginx en 80/443)?** Salta a [En una instancia que ya existe](#en-una-instancia-que-ya-existe).

## 1. Crear la instancia (consola AWS → EC2 → Launch instance)

| Campo | Valor |
|---|---|
| AMI | Ubuntu Server 24.04 LTS |
| Tipo | `t3.small` (2 GB). `t3.micro` sirve para probar, justo de memoria |
| Disco | 30 GB gp3 |
| Key pair | crea una nueva y guarda el `.pem` |
| Security group | SSH 22 **solo tu IP**, HTTP 80 y HTTPS 443 desde cualquier lugar |

Después: **Elastic IP** → Allocate → Associate a la instancia (para que la IP no cambie al reiniciar).

## 2. Apuntar el dominio

En tu proveedor de DNS (o Route 53) crea un registro **A**:

```
finanzas.tudominio.com  →  <Elastic IP>
```

Espera a que resuelva (`nslookup finanzas.tudominio.com`) antes del paso 4; si no, Caddy no puede sacar el certificado.

## 3. Respaldos en S3 (recomendado)

1. S3 → crea un bucket privado, p. ej. `tecnossync-finance-backups`. Actívale una regla de ciclo de vida (borrar a los 90 días).
2. IAM → Roles → crea un rol para **EC2** con una política que permita `s3:PutObject` en ese bucket.
3. EC2 → la instancia → Actions → Security → **Modify IAM role** → asigna el rol.

## 4. Instalar en el servidor

```bash
ssh -i tu-llave.pem ubuntu@<Elastic IP>
git clone https://github.com/tecnossync-crypto/tecnossync-finance.git
cd tecnossync-finance
bash deploy/setup-server.sh
exit   # vuelve a entrar para usar docker sin sudo
```

```bash
ssh -i tu-llave.pem ubuntu@<Elastic IP>
cd tecnossync-finance
cp .env.production.example .env.production
nano .env.production   # DOMAIN, ACME_EMAIL, DB_PASSWORD y JWT_SECRET (openssl rand -hex 32)
./deploy/deploy.sh
```

Abre `https://finanzas.tudominio.com` y crea tu cuenta. (No corras el `seed` en producción.)

> Repo privado: `git clone` pedirá credenciales. Usa un *fine-grained token* de GitHub con permiso de solo lectura al repo, o una deploy key SSH.

## 5. Respaldo diario

```bash
crontab -e
# añadir:
30 2 * * * /home/ubuntu/tecnossync-finance/deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
```

Restaurar la base de datos:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  pg_restore -U cuadre -d cuadre --clean --if-exists < backups/db-AAAAMMDD-HHMM.dump
```

## Actualizar a una nueva versión

```bash
cd ~/tecnossync-finance && ./deploy/deploy.sh
```

Hace `git pull` de `main`, reconstruye y reinicia; el esquema de la base se aplica solo al arrancar la API.

## En una instancia que ya existe

Cuadre corre en sus propios contenedores (su base de datos, su API, su web) sin tocar la otra app; solo comparten el nginx que ya publica los puertos 80/443.

```
Internet ──443──▶ nginx existente ─┬─ dominio actual ──▶ la otra app
                                   └─ finanzas.tudominio.com ──▶ 127.0.0.1:8090 (Cuadre)
```

**0. Mira qué hay en el servidor** (memoria libre y quién usa 80/443):

```bash
free -h && df -h / && docker ps --format '{{.Names}}\t{{.Ports}}' && sudo ss -tlnp | grep -E ':80 |:443 '
```

Cuadre necesita unos 400–600 MB de RAM; para compilarla en el servidor conviene tener swap (ver abajo).

**1. DNS:** registro **A** `finanzas.tudominio.com` → la IP pública (Elastic IP) de esa instancia.

**2. Requisitos** (Amazon Linux usa `ec2-user` y `dnf`; Ubuntu `ubuntu` y `apt`):

```bash
docker compose version || sudo dnf install -y docker-compose-plugin   # o apt-get
git --version || sudo dnf install -y git
# swap de 2 GB si no hay:
swapon --show | grep -q . || { sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab; }
```

**3. Instalar Cuadre en modo compartido:**

```bash
git clone https://github.com/tecnossync-crypto/tecnossync-finance.git ~/tecnossync-finance
cd ~/tecnossync-finance
cp .env.production.example .env.production
nano .env.production   # rellena y DESCOMENTA SITE_ADDRESS, HTTP_BIND, HTTPS_BIND y PROXY_NETWORK
./deploy/deploy.sh
curl -s http://127.0.0.1:8090/api/health   # → {"ok":true}
```

**4a. Si el proxy existente es Caddy en Docker** (servidor de voz-ia, `app-caddy-1`, red `app_default`): agrega este bloque a `deploy/Caddyfile` del repo **plataforma-voz-ia** y despliega voz-ia como siempre (`cd ~/app && bash deploy/deploy.sh`, que valida el Caddyfile antes de tocar nada). Caddy saca el certificado del dominio nuevo solo.

```
finanzas.tudominio.com {
	reverse_proxy cuadre-web:80
}
```

No edites el Caddyfile directamente en el servidor: el próximo despliegue de voz-ia lo sobrescribiría.

**4b. Si el proxy existente es nginx**, usa el bloque de [`deploy/nginx-cuadre.conf`](deploy/nginx-cuadre.conf) (en este caso no hace falta `PROXY_NETWORK`):

- **nginx instalado en el servidor:** copia el bloque a `/etc/nginx/conf.d/cuadre.conf`, saca el certificado y recarga:
  ```bash
  sudo certbot --nginx -d finanzas.tudominio.com
  sudo nginx -t && sudo systemctl reload nginx
  ```
- **nginx dentro de Docker** (como el omnicanal, `tecnossync_frontend`): pon `HTTP_BIND=172.17.0.1:8090` en `.env.production`, cambia `proxy_pass` a `http://172.17.0.1:8090`, añade el bloque al archivo de configuración que monta ese contenedor, monta también el certificado del dominio nuevo y reinicia ese contenedor. Ojo: si ese nginx usa `server_name _`, el bloque de Cuadre (con su `server_name` exacto) tiene prioridad y no afecta a la otra app.

Los respaldos (paso 5) y las actualizaciones (`./deploy/deploy.sh`) funcionan igual.

## Comandos útiles

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.production logs web   # problemas de certificado
```
