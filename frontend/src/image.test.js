import { describe, it, expect, vi, afterEach } from 'vitest';
import { fitWithin, resizeToJpeg, ImageReadError, MAX_SIDE } from './image.js';

describe('fitWithin', () => {
  it('riduce il lato lungo a 768 px mantenendo le proporzioni', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 768, height: 576 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 576, height: 768 });
  });

  it('non ingrandisce le foto piccole', () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('usa 768 come predefinito', () => {
    expect(MAX_SIDE).toBe(768);
  });
});

describe('resizeToJpeg', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubCanvas() {
    const context = { drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback, type) => callback(new Blob(['jpeg'], { type }))),
    };
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'canvas' ? canvas : original(tag)));
    return { canvas, context };
  }

  it('decodifica, ridimensiona e converte in JPEG', async () => {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    const { canvas, context } = stubCanvas();

    const blob = await resizeToJpeg(new File(['x'], 'foto.heic', { type: 'image/heic' }));

    expect(blob.type).toBe('image/jpeg');
    expect(canvas.width).toBe(768);
    expect(canvas.height).toBe(576);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 768, 576);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', expect.any(Number));
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('lancia ImageReadError se la foto non si può leggere', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      throw new Error('formato non supportato');
    }));
    // jsdom non implementa decode(): lo simuliamo come un browser che non sa leggere il formato.
    HTMLImageElement.prototype.decode = vi.fn().mockRejectedValue(new Error('decode fallito'));
    await expect(resizeToJpeg(new File(['x'], 'rotta.jpg'))).rejects.toBeInstanceOf(ImageReadError);
  });
});
