// Responsive images for every picture in public/img, in AVIF and WebP with a JPEG fallback.
// Re-run after adding or replacing an image:  npm run images
//
//   public/img/thumb/<name>-{400,800}.{avif,webp,jpg}   card thumbnails: the top 16:9 slice the card shows
//   public/img/opt/<name>-{800,1600}.{avif,webp}        project-page images at their own aspect ratio
//   src/data/images.json                                 each original's width and height, so pages can
//                                                        reserve the space before the image arrives
// public/img/demo/<slug>.jpg (frames of each live demo running, a project's demo_poster) get thumbnails only,
// in thumb/demo/.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'public/img');
const out = { thumb: path.join(src, 'thumb'), opt: path.join(src, 'opt') };
const SUBDIRS = ['', 'demo'];
fs.mkdirSync(path.join(out.opt), { recursive: true });
for (const sub of SUBDIRS) fs.mkdirSync(path.join(out.thumb, sub), { recursive: true });

const encode = {
  avif: (s) => s.avif({ quality: 50, effort: 6 }),
  webp: (s) => s.webp({ quality: 74 }),
  jpg: (s) => s.jpeg({ quality: 78, mozjpeg: true }),
};
const fresh = (file, than) => fs.existsSync(file) && fs.statSync(file).mtimeMs >= fs.statSync(than).mtimeMs;

const manifest = {};
const files = SUBDIRS.flatMap((sub) => (fs.existsSync(path.join(src, sub)) ? fs.readdirSync(path.join(src, sub)) : [])
  .filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => path.posix.join(sub, f)));
for (const f of files) {
  const file = path.join(src, f);
  const name = f.replace(/\.[^.]+$/, '');
  const { width, height } = await sharp(file).metadata();
  // Page-image widths: 800 and 1600 where the original is bigger, plus the original itself up to 1600. Demo
  // posters only ever show as thumbnails, so they get none.
  const opt = f.startsWith('demo/') ? [] : [800, 1600].filter((w) => w < width);
  if (width <= 1600 && !f.startsWith('demo/')) opt.push(width);
  manifest[`/img/${f}`] = { width, height, opt };
  let made = 0;
  for (const w of [400, 800]) {
    for (const [ext, enc] of Object.entries(encode)) {
      const dest = path.join(out.thumb, `${name}-${w}.${ext}`);
      if (fresh(dest, file)) continue;
      await enc(sharp(file).resize(w, Math.round((w * 9) / 16), { fit: 'cover', position: 'top' })).toFile(dest);
      made++;
    }
  }
  for (const w of manifest[`/img/${f}`].opt) {
    for (const ext of ['avif', 'webp']) {
      const dest = path.join(out.opt, `${name}-${w}.${ext}`);
      if (fresh(dest, file)) continue;
      await encode[ext](sharp(file).resize({ width: w, withoutEnlargement: true })).toFile(dest);
      made++;
    }
  }
  if (made) console.log(`${f}: ${made} files`);
}
fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/data/images.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`${Object.keys(manifest).length} images in src/data/images.json`);
