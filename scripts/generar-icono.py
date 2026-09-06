"""
Icono del Sistema de Facturación.

Concepto: el ticket troquelado, en blanco sobre un tile verde.

Es lo que el sistema produce y lo que el cliente se lleva en la mano, y la
silueta dentada se reconoce a 16px, donde un rectángulo cualquiera no dice
nada. El verde --el mismo que la app usa para «cobrado»-- carga el trabajo de
identificar: en una barra de tareas de Windows hay veinte iconos oscuros y el
anterior se perdía entre ellos. A 16px el color se ve antes que la forma.

Se dibuja con detalle distinto según el tamaño --a 16px el contenido interno
sería barro, así que ahí queda solo la silueta y la barra del total-- y se
supersamplea x8 antes de reducir, para que el troquelado salga limpio.

Nada de gradientes ni brillos: la app es un terminal industrial de retail y el
icono tiene que verse como software de gestión, no como un stock icon.

Uso: npm run icono          -> genera build/icon.ico y build/icon.png
     npm run icono -- --contacto  -> agrega contacto.png para revisar medidas
"""
from PIL import Image, ImageDraw

# Paleta: sale de la propia app (src/renderer/styles/index.css).
VERDE  = (21, 128, 61, 255)        # el verde de «cobrado». Es el tile.
PAPEL  = (248, 250, 252, 255)      # el blanco del ticket
TINTA  = (148, 158, 171, 255)      # las líneas de artículo
TOTAL  = (15, 23, 42, 255)         # grafito: la barra del total y el fondo de app
BARRAS = (28, 34, 44, 255)         # el código de barras

SS = 8      # supersampling
RADIO = 0.18  # radio del tile, en fracción del lado


def dibujar(px: int) -> Image.Image:
    """Dibuja el icono a `px`, con el nivel de detalle que ese tamaño aguanta."""
    S = px * SS
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * RADIO), fill=VERDE)

    u = S / 100.0  # unidad: 1% del lienzo, para pensar en proporciones

    # ── El ticket ────────────────────────────────────────────────────────
    # A tamaños chicos el troquelado cae por debajo del píxel y queda un
    # rectángulo blanco, que no identifica nada. A 16px un diente tiene que
    # medir ~2px reales, así que van pocos y profundos.
    if px <= 16:
        izq, der = 28 * u, 72 * u
        arriba, base = 16 * u, 70 * u
        dientes, prof = 3, 10 * u
    elif px <= 24:
        izq, der = 27 * u, 73 * u
        arriba, base = 15 * u, 72 * u
        dientes, prof = 4, 7 * u
    else:
        izq, der = 26 * u, 74 * u
        arriba, base = 15 * u, 74 * u
        dientes, prof = 7, 4.5 * u

    contorno = [(izq, arriba), (der, arriba), (der, base)]
    paso = (der - izq) / dientes
    for i in range(dientes):
        contorno.append((der - paso * i - paso / 2, base + prof))
        contorno.append((der - paso * (i + 1), base))
    contorno.append((izq, arriba))
    d.polygon(contorno, fill=PAPEL)

    # El interior se posiciona en fracciones del alto del ticket, no en
    # coordenadas absolutas: así la composición se mantiene si cambia la caja.
    alto = base - arriba
    def y(f): return arriba + alto * f

    m = 7 * u
    x0, x1 = izq + m, der - m
    ancho = x1 - x0

    # A 16 y 20px el interior es barro. Queda la silueta --que es lo que
    # identifica-- y la barra del total, que evita que el icono parezca una
    # hoja en blanco y le da el contraste contra el verde.
    if px <= 20:
        d.rectangle([x0, y(0.42), x1, y(0.58)], fill=TOTAL)
        return im.resize((px, px), Image.LANCZOS)

    # ── Líneas de artículo ───────────────────────────────────────────────
    # Dos, de largo desparejo: un ticket real no tiene renglones iguales, y
    # más de dos ensucian a 32px.
    for f, largo in ((0.13, 0.88), (0.25, 0.64)):
        d.rectangle([x0, y(f), x0 + ancho * largo, y(f + 0.055)], fill=TINTA)

    # ── El total ─────────────────────────────────────────────────────────
    # La barra más pesada del icono: es el dato que importa en una caja.
    d.rectangle([x0, y(0.40), x1, y(0.56)], fill=TOTAL)

    # ── Código de barras ─────────────────────────────────────────────────
    # Anchos irregulares, como un EAN real. A 32px ya no se distinguen las
    # barras una por una, pero queda la textura de retail, que es lo que
    # tiene que leerse.
    if px >= 32:
        patron = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1]
        esc = ancho / (sum(patron) + len(patron) - 1)
        x = x0
        for i, w in enumerate(patron):
            if i % 2 == 0:
                d.rectangle([x, y(0.69), x + w * esc, y(0.89)], fill=BARRAS)
            x += (w + 1) * esc

    return im.resize((px, px), Image.LANCZOS)


TAMANOS = [16, 20, 24, 32, 48, 64, 128, 256]

if __name__ == "__main__":
    import sys
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    salida = args[0] if args else "."
    capas = [dibujar(s) for s in TAMANOS]

    # El .ico lleva todas las medidas: si va una sola, Windows reescala y el
    # icono de la barra de tareas queda sucio.
    capas[-1].save(f"{salida}/icon.ico", format="ICO",
                   sizes=[(s, s) for s in TAMANOS], append_images=capas[:-1])

    dibujar(256).save(f"{salida}/icon.png")

    # Tira de contactos, solo con --contacto: sirve para revisar como cae el
    # icono en cada medida, pero no es un asset del build.
    if "--contacto" in sys.argv:
        tira = Image.new("RGBA", (560, 300), (255, 255, 255, 255))
        x = 10
        for s in TAMANOS:
            tira.paste(dibujar(s), (x, 10), dibujar(s))
            x += s + 12
        tira.paste(dibujar(256), (10, 40), dibujar(256))
        tira.paste(dibujar(64), (280, 40), dibujar(64))
        tira.save(f"{salida}/contacto.png")

    print("icon.ico e icon.png generados en", salida)
    print("resoluciones:", ", ".join(str(s) for s in TAMANOS))
