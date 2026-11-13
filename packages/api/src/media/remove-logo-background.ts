import sharp from './sharp-safe';

/**
 * Reimplementação fiel de `campos/utils.py::remover_fundo_logo` do sistema
 * Django original. NÃO é segmentação por IA (não usa nenhum modelo) — é
 * flood-fill de cor sólida a partir das bordas, pensado pro caso comum de
 * logo com fundo liso (branco, geralmente). Só afeta a região de fundo que
 * está CONECTADA às bordas (4 cantos + meio de cada lado), então uma cor
 * parecida usada dentro do próprio desenho do logo não é apagada por engano
 * se não tocar numa dessas 8 bordas.
 *
 * Diferença deliberada do PIL original: o Django comparava cada pixel
 * candidato à cor do PRÓPRIO seed (ImageDraw.floodfill com thresh);  aqui
 * a tolerância é contra a cor de fundo já detectada nos 4 cantos (mesmo
 * valor de referência pros 8 seeds) — equivalente na prática, já que cada
 * seed só é usado como ponto de partida se ele mesmo já está dentro da
 * tolerância da cor de fundo, mas mais simples de implementar sem a API
 * interna do PIL. Não precisa ser byte-a-byte idêntico, só ter o mesmo
 * comportamento percebido.
 *
 * Sempre devolve os bytes em PNG (único formato aceito que guarda
 * transparência). Se o processamento falhar por qualquer motivo, devolve a
 * imagem original (convertida pra PNG) sem alterar — nunca quebra o upload
 * por causa disso, mesmo fallback do Django.
 */
const TOLERANCE = 30;

export async function removeLogoBackground(buffer: Buffer): Promise<Buffer> {
  try {
    return await floodFillTransparent(buffer);
  } catch {
    try {
      return await sharp(buffer).png().toBuffer();
    } catch {
      return buffer;
    }
  }
}

async function floodFillTransparent(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;

  const idx = (x: number, y: number) => (y * w + x) * channels;
  const pixelAt = (x: number, y: number): [number, number, number, number] => [
    data[idx(x, y)],
    data[idx(x, y) + 1],
    data[idx(x, y) + 2],
    data[idx(x, y) + 3],
  ];

  const corners: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  const cornerColors = corners.map(([x, y]) => pixelAt(x, y));
  const counts = new Map<string, number>();
  for (const c of cornerColors) {
    const key = c.join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bgKey = cornerColors[0].join(',');
  let bgCount = 0;
  for (const [key, count] of counts) {
    if (count > bgCount) {
      bgCount = count;
      bgKey = key;
    }
  }
  const bgColor = bgKey.split(',').map(Number);

  const looksLikeBackground = (x: number, y: number): boolean => {
    const [r, g, b, a] = pixelAt(x, y);
    if (a === 0) return false; // já transparente — não reprocessa
    return (
      Math.abs(r - bgColor[0]) <= TOLERANCE &&
      Math.abs(g - bgColor[1]) <= TOLERANCE &&
      Math.abs(b - bgColor[2]) <= TOLERANCE
    );
  };

  const setTransparent = (x: number, y: number) => {
    data[idx(x, y) + 3] = 0;
  };

  // Flood-fill 4-conectado, iterativo (pilha explícita — evita stack
  // overflow de recursão em imagens grandes). setTransparent dobra como
  // marca de "já visitado": looksLikeBackground já exclui alpha=0.
  const floodFillFrom = (startX: number, startY: number) => {
    const stack: Array<[number, number]> = [[startX, startY]];
    while (stack.length > 0) {
      const next = stack.pop();
      if (!next) break;
      const [x, y] = next;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (!looksLikeBackground(x, y)) continue;
      setTransparent(x, y);
      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
  };

  const seeds: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)],
    [w - 1, Math.floor(h / 2)],
  ];

  for (const [sx, sy] of seeds) {
    if (looksLikeBackground(sx, sy)) {
      floodFillFrom(sx, sy);
    }
  }

  return sharp(data, { raw: { width: w, height: h, channels } }).png().toBuffer();
}
