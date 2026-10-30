// Lê feeds RSS/Atom da imprensa asiática e gera docs/photos.json.
// Uso: node scripts/update-feed.mjs   (Node 18+)
// Opcional: defina ANTHROPIC_API_KEY para gerar a descrição em português.
import { XMLParser } from "fast-xml-parser";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const OUT = "docs/photos.json";
const POR_FEED = 8, MAX_ITENS = 300, MAX_DIAS = 60;
const MODELO = "claude-haiku-5-5";

// Edite à vontade. Feeds que falharem são apenas ignorados (veja o log).
const FEEDS = [
  { veiculo: "SCMP (Xinhua)",       flag: "🇨🇳", url: "https://www.scmp.com/rss/21074/feed" },
  { veiculo: "China Daily",         flag: "🇨🇳", url: "https://www.chinadaily.com.cn/rss/china_rss.xml" },
  { veiculo: "CGTN",                flag: "🇨🇳", url: "https://www.cgtn.com/subscribe/rss/section/china.xml" },
  { veiculo: "NHK",                 flag: "🇯🇵", url: "https://www3.nhk.or.jp/rss/news/cat0.xml" },
  { veiculo: "The Japan Times",     flag: "🇯🇵", url: "https://www.japantimes.co.jp/feed/" },
  { veiculo: "The Straits Times",   flag: "🇸🇬", url: "https://www.straitstimes.com/news/singapore/rss.xml" },
  { veiculo: "Antara News",         flag: "🇮🇩", url: "https://en.antaranews.com/rss/top-news.xml" },
  { veiculo: "VnExpress Intl",      flag: "🇻🇳", url: "https://e.vnexpress.net/rss/news.rss" },
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const txt = v => (typeof v === "string" ? v : v?.["#text"] ?? "");
const limpa = s => txt(s).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();

function link(it) {
  if (typeof it.link === "string") return it.link;
  const ls = arr(it.link);
  const l = ls.find(x => x["@_rel"] === "alternate") ?? ls[0];
  return l?.["@_href"] ?? txt(l) ?? "";
}

function imagem(it) {
  const midia = [...arr(it["media:content"]), ...arr(it["media:thumbnail"]), ...arr(it["media:group"]?.["media:content"])];
  for (const m of midia) {
    const u = m?.["@_url"];
    if (u && !/video/.test(m["@_type"] || m["@_medium"] || "")) return u;
  }
  for (const e of arr(it.enclosure)) if ((e["@_type"] || "").startsWith("image") && e["@_url"]) return e["@_url"];
  const html = txt(it["content:encoded"]) || txt(it.description) || txt(it.content) || txt(it.summary);
  return html.match(/<img[^>]+src=["']([^"']+)/i)?.[1] ?? null;
}

async function lerFeed(f) {
  const r = await fetch(f.url, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "feed-asia/1.0" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const x = parser.parse(await r.text());
  const itens = arr(x.rss?.channel?.item ?? x.feed?.entry);
  const fotos = [];
  for (const it of itens) {
    const img = imagem(it), url = link(it);
    if (!img || !/^https?:\/\//.test(img) || !/^https?:\/\//.test(url)) continue;
    const d = new Date(txt(it.pubDate) || txt(it.published) || txt(it.updated) || txt(it["dc:date"]));
    const autor = limpa(it["dc:creator"] ?? it.author?.name ?? it.author ?? "");
    fotos.push({
      id: createHash("sha1").update(url).digest("hex").slice(0, 12),
      img, url, flag: f.flag,
      src: autor && autor.length < 60 ? `${autor} · ${f.veiculo}` : f.veiculo,
      titulo: limpa(it.title),
      resumo: limpa(it.description ?? it.summary ?? "").slice(0, 500),
      date: (isNaN(d) ? new Date() : d).toISOString().slice(0, 10),
    });
    if (fotos.length >= POR_FEED) break;
  }
  return fotos;
}

async function descricao(p) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return p.titulo;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO, max_tokens: 150,
        messages: [{ role: "user", content:
          `Título: ${p.titulo}\nResumo: ${p.resumo}\n\nEm português do Brasil, escreva UMA frase (máx. 25 palavras) ` +
          `explicando o que a foto que ilustra esta notícia representa. Use só o que está no texto; não invente fatos. ` +
          `Responda apenas com a frase.` }],
      }),
    });
    const d = await r.json();
    return d.content?.[0]?.text?.trim() || p.titulo;
  } catch { return p.titulo; }
}

let antigas = [];
try { antigas = JSON.parse(await readFile(OUT, "utf8")).fotos ?? []; } catch {}
const conhecidas = new Map(antigas.map(p => [p.id, p]));

const novas = [];
for (const f of FEEDS) {
  try {
    const fotos = await lerFeed(f);
    console.log(`✓ ${f.veiculo}: ${fotos.length} fotos`);
    novas.push(...fotos);
  } catch (e) { console.warn(`✗ ${f.veiculo}: ${e.message}`); }
}

for (const p of novas) {
  if (conhecidas.has(p.id)) continue;
  p.desc = await descricao(p);
  delete p.resumo;
  conhecidas.set(p.id, p);
}

const corte = Date.now() - MAX_DIAS * 864e5;
const fotos = [...conhecidas.values()]
  .filter(p => new Date(p.date).getTime() >= corte)
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, MAX_ITENS);

await mkdir("docs", { recursive: true });
await writeFile(OUT, JSON.stringify({ atualizado: new Date().toISOString(), fotos }, null, 1));
console.log(`Total no feed: ${fotos.length}`);
