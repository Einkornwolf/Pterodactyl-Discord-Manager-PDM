const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { UtilityCollection } = require('../classes/utilityCollection');

test('native canvas draws, encodes PNG, and decodes it with the correct dimensions', async () => {
    const canvas = createCanvas(32, 16);
    const context = canvas.getContext('2d');
    context.fillStyle = '#dc7726';
    context.fillRect(0, 0, 32, 16);
    expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([220, 119, 38, 255]);
    const buffer = canvas.toBuffer('image/png');
    expect(buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const decoded = await loadImage(buffer);
    expect([decoded.width, decoded.height]).toEqual([32, 16]);
});
test('font fitting works with real native text metrics', async () => {
    const canvas = createCanvas(160, 50);
    await new UtilityCollection().getCanvasFontSize(canvas, 'A user with a long name', 'sans-serif', 32, 20);
    expect(canvas.getContext('2d').measureText('A user with a long name').width).toBeLessThanOrEqual(140);
});
