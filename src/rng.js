export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class Rng {
  constructor(seed) {
    this.s = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  }
  next() {
    let a = (this.s += 0x6d2b79f5);
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

const ADJ = ['amber', 'quiet', 'silver', 'still', 'golden', 'hollow', 'gentle', 'ivory', 'slow', 'vermilion', 'jade', 'distant', 'open', 'clear', 'lapis', 'saffron'];
const NOUN = ['lotus', 'river', 'moon', 'wheel', 'lantern', 'cloud', 'bell', 'dawn', 'pearl', 'stone', 'garden', 'flame', 'bowl', 'mountain', 'sky', 'path'];

export function randomSeed() {
  const r = new Rng((Math.random() * 4294967296) >>> 0);
  return `${r.pick(ADJ)}-${r.pick(NOUN)}-${r.int(1000, 9999)}`;
}
