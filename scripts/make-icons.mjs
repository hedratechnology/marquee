// Genera le icone PNG della PWA da public/favicon.svg. Si esegue a mano quando cambia l'icona.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg')
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 }
for (const [name, size] of Object.entries(sizes)) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(`public/icons/${name}`)
  console.log(name)
}
