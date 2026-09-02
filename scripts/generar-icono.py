"""
Icono del Sistema de Facturación.

Concepto: el ticket con el borde troquelado. Es lo que el sistema produce y lo
que el cliente se lleva en la mano; la silueta dentada se reconoce a 16px,
donde un rectángulo cualquiera no dice nada.

Se dibuja con detalle distinto según el tamaño --a 16px el contenido interno
sería barro, así que ahí queda solo la silueta-- y se supersamplea x8 antes de
reducir, para que el troquelado salga limpio.

Nada de gradientes ni brillos: la app es un terminal industrial de retail y el
icono tiene que verse como software de gestión, no como un stock icon.
"""
from PIL import Image, ImageDraw

# Paleta: sale de la propia app (src/renderer/styles/index.css).
TILE      = (18, 22, 29, 255)      # grafito, el fondo de ventana de la app
PAPEL     = (248, 250, 252, 255)   # el blanco del ticket
TINTA     = (148, 158, 171, 255)   # las líneas de artículo
TINTA_STR = (61, 71, 84, 255)      # la cabecera
TOTAL     = (21, 128, 61, 255)     # verde: cobrado. La convención de la app.
BARRAS    = (28, 34, 44, 255)      # el código de barras

SS = 8  # supersampling


def dibujar(px: int) -> Image.Image:
    """Dibuja el icono a `px`, con el nivel de detalle que ese tamaño aguanta."""
    S = px * SS
    im = Image.new("RGBA", (S, S), TILE)
    d = ImageDraw.Draw(im)

    u = S / 100.0  # unidad: 1% del lienzo, para pensar en proporciones

    # ── El ticket ────────────────────────────────────────────────────────
    # Ocupa casi todo el lienzo: en la barra de tareas el icono ya es chico,
    # y un tile con mucho aire desperdicia los pocos píxeles que hay. Abajo
    # queda algo más de margen que arriba para compensar el troquelado, que
    # ópticamente "baja" la figura.
    #
    # A tamaños chicos crece, pero con cuidado: si el ticket ocupa todo, el
    # troquelado cae por debajo del píxel y queda un rectángulo blanco, que no
    # identifica nada. A 16px un diente tiene que medir ~2px reales, así que
    # van pocos y profundos --tres-- y se conserva margen oscuro alrededor
    # para que la silueta tenga contra qué recortarse.
    if px <= 16:
        izq, der = 21 * u, 79 * u
        arriba, base = 11 * u, 74 * u
        dientes, prof = 3, 11 * u
    elif px <= 24:
        izq, der = 18 * u, 82 * u
        arriba, base = 9 * u, 80 * u
        dientes, prof = 5, 7 * u
    else:
        izq, der = 21 * u, 79 * u
        arriba, base = 10 * u, 82 * u
        dientes, prof = 8, 4.5 * u

    contorno = [(izq, arriba), (der, arriba), (der, base)]
    paso = (der - izq) / dientes
    for i in range(dientes):
        x_valle = der - paso * i - paso / 2
        x_pico = der - paso * (i + 1)
        contorno.append((x_valle, base + prof))
        contorno.append((x_pico, base))
    contorno.append((izq, arriba))
    d.polygon(contorno, fill=PAPEL)

    # El interior se posiciona en fracciones del alto del ticket, no en
    # coordenadas absolutas: así la composición se mantiene si cambia la caja.
    alto = base - arriba
    def y(f): return arriba + alto * f

    m = 7 * u          # margen interno
    x0, x1 = izq + m, der - m
    ancho = x1 - x0

    # A 16 y 20px el interior es barro. Queda la silueta --que es lo que
    # identifica-- y una sola barra que da el golpe de color y evita que el
    # icono parezca una hoja en blanco.
    if px <= 20:
        d.rectangle([x0, y(0.44), x1, y(0.60)], fill=TOTAL)
        return im.resize((px, px), Image.LANCZOS)

    # ── Cabecera: el nombre del comercio ─────────────────────────────────
    d.rectangle([x0, y(0.09), x0 + ancho * 0.60, y(0.15)], fill=TINTA_STR)

    # ── Líneas de artículo ───────────────────────────────────────────────
    # Largos desparejos: un ticket real no tiene tres renglones iguales.
    for f, largo in ((0.24, 0.96), (0.32, 0.74), (0.40, 0.88)):
        d.rectangle([x0, y(f), x0 + ancho * largo, y(f + 0.045)], fill=TINTA)

    # ── El total ─────────────────────────────────────────────────────────
    # La barra más pesada del icono: es el dato que importa en una caja.
    d.rectangle([x0, y(0.52), x1, y(0.645)], fill=TOTAL)

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
                d.rectangle([x, y(0.74), x + w * esc, y(0.90)], fill=BARRAS)
            x += (w + 1) * esc

    return im.resize((px, px), Image.LANCZOS)


TAMANOS = [16, 20, 24, 32, 48, 64, 128, 256]

if __name__ == "__main__":
    import sys
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    salida = args[0] if args else "."
    capas = [dibujar(s) for s in TAMANOS]

    # El .ico lleva todas las medidas: si va una sola, Windows reescala y el
    # icono de la barra de tareas queda sucio. Es lo que pasaba con el anterior.
    capas[-1].save(f"{salida}/icon.ico", format="ICO",
                   sizes=[(s, s) for s in TAMANOS], append_images=capas[:-1])

    dibujar(256).save(f"{salida}/icon.png")

    # Tira de contactos, solo con --contacto: sirve para revisar cómo cae el
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
