# PeerTube

[PeerTube](https://joinpeertube.org/) es la plataforma de vídeo libre y
federada desarrollada por Framasoft. Esta integración sigue una instancia (la
suya o cualquier instancia pública) y los canales que usted elija en Gladys:
los nuevos vídeos, los directos en emisión, las cifras de la instancia y, con
su cuenta, sus notificaciones no leídas. Solo lee: nunca publica, comenta ni
modifica nada en PeerTube.

Probada de verdad con PeerTube 7.3.0 (en Docker, con una cuenta, un canal,
vídeos subidos y un directo RTMP) y con framatube.org (PeerTube 8.3.1).

## Qué necesita

- Gladys Assistant 5.1.0 o posterior.
- La dirección de una instancia PeerTube: la suya en su red
  (`http://192.168.1.20:9000`) o una pública (`https://framatube.org`).
- Los identificadores de los canales que seguir. El identificador es el final
  de la dirección de la página del canal: `https://framatube.org/c/joinpeertube`
  da `joinpeertube`. Un canal de otra instancia se escribe `nombre@host`
  (`blender_channel@video.blender.org`): la instancia configurada debe
  conocerlo (federación), lo que siempre ocurre con un canal que ella o uno de
  sus usuarios sigue.
- Opcional: el usuario y la contraseña de su cuenta en esta instancia.

## Configuración

1. En Gladys, abra **Integraciones**, instale **PeerTube** y abra su pestaña
   **Configuración**.
2. **Dirección de la instancia**: la dirección del sitio PeerTube, como en su
   navegador. Se entiende una dirección sola: `framatube.org` (HTTPS),
   `192.168.1.20:9000` (HTTP en su red).
3. **Canales que seguir**: los identificadores, separados por comas (20 como
   máximo). También se acepta la dirección de la página de un canal.
4. **Cuenta (opcional)**: su **Usuario** y su **Contraseña**. Déjelos vacíos
   para leer solo las páginas públicas.
5. **Intervalo de actualización**: 1, 2 (por defecto), 5 o 10 minutos. Cada
   lectura hace dos peticiones ligeras por canal, y una o dos para la cuenta. Un
   directo se detecta como mucho con este retraso.
6. **Idioma de los nombres**: el idioma de los nombres de las funciones
   (fijados al añadir un dispositivo), de las fechas y de la frase de la acción
   de escena.
7. Guarde y use **Probar la conexión**: la respuesta da el nombre y la versión
   de la instancia, los canales encontrados y la cuenta.
8. Abra la pestaña **Descubrir** y añada los dispositivos que desee.

## Los dispositivos

Todos los dispositivos son de solo lectura. Gladys nunca los consulta: la
integración lee PeerTube con su propio temporizador, al intervalo elegido.

### La instancia

**PeerTube** seguido del nombre de la instancia:

- **En línea**: la instancia responde.
- **Vídeos locales**: los vídeos publicados en la propia instancia.
- **Vistas de los vídeos locales**: sus vistas, todas juntas.
- **Usuarios**: las cuentas de la instancia.
- **Instancias seguidas**: las otras instancias que sigue.

PeerTube recalcula estas cifras cada pocos minutos: avanzan por escalones.

### Los canales

Un dispositivo por canal, con el nombre del canal:

- **Directo en emisión**: el canal está en directo ahora mismo.
- **Espectadores del directo**: los espectadores de su directo (0 sin
  directo).
- **Último vídeo**: el título de su vídeo más reciente.
- **Último vídeo publicado el**: su fecha y hora.
- **Suscriptores**: los suscriptores del canal.
- **Vídeos**: sus vídeos (sin los directos en emisión).

### La cuenta

Con una cuenta, **PeerTube** seguido de su identificador (`nombre@host`):

- **Notificaciones no leídas**: lo que muestra la campana de PeerTube (nuevos
  comentarios, nuevos suscriptores, vídeos de sus suscripciones, etc.).
- **Suscriptores**: los suscriptores de todos sus canales juntos.

## Panel

El widget **Vídeos de PeerTube** muestra, de arriba abajo: sus notificaciones
no leídas (con una cuenta), una línea por directo en emisión (canal, título,
espectadores) y los seis últimos vídeos de los canales seguidos en cuadrícula
de carteles (miniatura, título, canal, fecha). Toque un vídeo para abrir su
detalle; en una instancia en HTTPS, un enlace **Ver** lo abre en PeerTube. Las
miniaturas las sirve la integración: su navegador nunca carga nada de la
instancia.

## Escenas

### Desencadenantes

- **Nuevo vídeo de PeerTube**: un canal seguido ha publicado un nuevo vídeo.
  Filtro: el canal (vacío: cualquiera). Variables: el canal, su identificador,
  el título, la dirección del vídeo, su duración (minutos) y su fecha de
  publicación.
- **Directo de PeerTube iniciado**: un canal seguido está en directo. Filtro: el
  canal. Variables: el canal, su identificador, el título y la dirección del
  directo.
- **Directo de PeerTube terminado**: un directo de un canal seguido ha
  terminado. Filtro: el canal. Variables: el canal, su identificador, el título,
  la dirección, la duración (minutos, contada desde la primera lectura que lo
  vio) y el pico de espectadores.

No se anuncia nada de lo que ya existía: la primera lectura de un canal solo
aprende sus vídeos, y lo visto se conserva entre reinicios.

### Acciones

- **Leer los últimos vídeos de PeerTube**: lee PeerTube ahora y da una frase
  para un mensaje o un anuncio de voz («PeerTube: en directo: …; últimos
  vídeos: …»), para todos los canales o para uno, con 1, 3 o 5 vídeos citados.
  Salidas: la frase, si hay un directo en emisión, el título del directo, el
  título, el canal y la dirección del último vídeo.

### Ideas de escenas

- **Nuevo vídeo de PeerTube** en su canal favorito → envíese un mensaje con
  `{{triggerEvent.data.title}}` y `{{triggerEvent.data.url}}`.
- **Directo de PeerTube iniciado** → baje las luces del salón y anuncie «El
  directo de {{triggerEvent.data.channel_name}} ha empezado» en el altavoz.
- Cada tarde a las 19:00 → **Leer los últimos vídeos de PeerTube** y envíe la
  frase por mensaje.
- **Notificaciones no leídas** mayor que 0 → ponga una lámpara en azul.

## Solución de problemas

- **PeerTube no responde**: compruebe la dirección y el puerto (9000 en una
  instalación Docker simple, ninguno detrás de un proxy inverso). El contenedor
  de la integración debe alcanzar esa dirección.
- **No hay ningún PeerTube en esta dirección**: la dirección es la del sitio, no
  la de una página incrustada ni la de un almacenamiento de objetos.
- **Canal … no encontrado**: compruebe el identificador en la página del canal.
  Un canal remoto debe ser conocido por la instancia: abra su página una vez
  desde la instancia (busque `nombre@host`) o sígalo.
- **La instancia limita las peticiones**: elija un intervalo más largo o menos
  canales. Las instancias públicas limitan la API por dirección.
- **Inicio de sesión rechazado**: compruebe el usuario y la contraseña en la
  interfaz web de la misma instancia. Las cuentas con autenticación en dos pasos
  y los inicios de sesión por OpenID Connect o SAML no son compatibles: deje la
  cuenta vacía y use la parte pública.
- Para todo lo demás, ponga `LOG_LEVEL=debug` y abra una incidencia:
  https://github.com/guim31/gladys-peertube/issues

## Límites

- Solo lectura: ni subida, ni comentario, ni suscripción desde Gladys.
- Un directo se detecta en la siguiente lectura, y su duración empieza ahí. Un
  directo que se corta y se reanuda entre dos lecturas no se considera
  terminado.
- Se anuncian como mucho 5 vídeos nuevos de un canal por lectura (los más
  recientes): una tanda mayor publicada de golpe se cuenta, pero no se anuncia
  entera.
- La miniatura y el enlace de un vídeo vienen de la instancia configurada: un
  canal remoto aparece tal como lo conoce esa instancia.
- Sin webhook: el entorno aislado de Gladys no tiene puerto de entrada, así que
  PeerTube se lee periódicamente.
- Sin relación con Framasoft ni con el proyecto PeerTube.
