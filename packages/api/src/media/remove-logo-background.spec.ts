import sharp from 'sharp';
import { removeLogoBackground } from './remove-logo-background';

async function buildTestPng(size: number, squareStart: number, squareEnd: number): Promise<Buffer> {
  const channels = 4;
  const data = Buffer.alloc(size * size * channels, 255); // tudo branco opaco
  for (let y = squareStart; y < squareEnd; y++) {
    for (let x = squareStart; x < squareEnd; x++) {
      const idx = (y * size + x) * channels;
      data[idx] = 0; // R
      data[idx + 1] = 0; // G
      data[idx + 2] = 0; // B
      data[idx + 3] = 255; // A (opaco)
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels } }).png().toBuffer();
}

describe('removeLogoBackground', () => {
  it('torna transparente o fundo branco conectado às bordas, preserva o desenho preto no meio', async () => {
    const input = await buildTestPng(20, 8, 12); // quadrado preto 4x4 no centro de uma imagem 20x20

    const output = await removeLogoBackground(input);
    const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const idx = (x: number, y: number) => (y * info.width + x) * info.channels;

    // Canto (fundo) — alpha deve ter ido a zero.
    expect(data[idx(0, 0) + 3]).toBe(0);
    expect(data[idx(19, 19) + 3]).toBe(0);

    // Centro do quadrado preto (desenho) — continua opaco e preto.
    const centerIdx = idx(10, 10);
    expect(data[centerIdx + 3]).toBe(255);
    expect(data[centerIdx]).toBe(0);
    expect(data[centerIdx + 1]).toBe(0);
    expect(data[centerIdx + 2]).toBe(0);
  });

  it('nunca quebra e devolve PNG mesmo se a entrada não for uma imagem decodificável', async () => {
    const garbage = Buffer.from('isto não é uma imagem');
    const output = await removeLogoBackground(garbage);
    expect(output.equals(garbage)).toBe(true); // último fallback: devolve o buffer original intacto
  });

  it('imagem já totalmente transparente não é alterada por engano (seeds já alpha=0 são ignorados)', async () => {
    const channels = 4;
    const size = 10;
    const data = Buffer.alloc(size * size * channels, 0); // tudo transparente
    const input = await sharp(data, { raw: { width: size, height: size, channels } }).png().toBuffer();

    const output = await removeLogoBackground(input);
    const { data: outData } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(outData.every((_, i) => (i % 4 === 3 ? outData[i] === 0 : true))).toBe(true);
  });
});
