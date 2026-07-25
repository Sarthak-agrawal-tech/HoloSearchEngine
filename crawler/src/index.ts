import { CheerioCrawler, RequestHandlerResult } from 'crawlee';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PageResult {
    url: string;
    title: string | null;
    textContent: string | null;
    excerpt: string | null;
    textLength: number;
    wordCount: number;
}

const SEED_URLS = [
     // Individual popular anime (guaranteed coverage)
  'https://myanimelist.net/anime/1/Cowboy_Bebop',
  'https://myanimelist.net/anime/5114/Fullmetal_Alchemist_Brotherhood',
  'https://myanimelist.net/anime/16498/Shingeki_no_Kyojin',
  'https://myanimelist.net/anime/21/One_Piece',
  'https://myanimelist.net/anime/269/Bleach',
  'https://myanimelist.net/anime/30276/One_Punch_Man',
  'https://myanimelist.net/anime/11061/Hunter_x_Hunter',
  'https://myanimelist.net/anime/28977/Gintama',

  // Hub pages — each links to 40+ popular anime
  'https://myanimelist.net/anime/season/2024/spring',
  'https://myanimelist.net/anime/season/2024/summer',
  'https://myanimelist.net/anime/season/2024/fall',
  'https://myanimelist.net/anime/season/2025/winter',
  'https://myanimelist.net/anime/upcoming',

  // Top-rated list — another high-value hub
  'https://myanimelist.net/topanime.php',
]

const OUTPUT_PATH = path.resolve(
    __dirname, '..', 'data', 'crawl-results.json'
)

const results: PageResult[] = [];
let pagesProcessed = 0;
let pagesExtracted = 0;
const crawler = new CheerioCrawler({
    async requestHandler({ request, body, enqueueLinks}) {
        pagesProcessed++;
        await enqueueLinks({
            regexps: [
                // 1. Matches only the main Anime overview pages (stops exactly after the ID or slug)
                /^https:\/\/myanimelist\.net\/anime\/\d+(?:\/[\w-]+)?\/?$/,

                // 2. Matches Characters & Staff sub-pages for an anime (Crucial for search index!)
                /^https:\/\/myanimelist\.net\/anime\/\d+(?:\/[\w-]+)?\/characters(?:\/|$)/,

                // 3. Matches individual Character profile pages
                /^https:\/\/myanimelist\.net\/character\/\d+(?:\/[\w-]+)?\/?$/,

                // 4. Matches current, upcoming, AND all past archive season pages (e.g., /season/2023/fall)
                /^https:\/\/myanimelist\.net\/anime\/season(?:\/\d{4}\/\w+|\/|$)/,

                // 5. Matches the upcoming anime index
                /^https:\/\/myanimelist\.net\/anime\/upcoming(?:\/|$)/
                    ],
            limit: 20,
        })
        const html = body.toString();
        const dom = new JSDOM(html, { url: request.url })
        const article = new Readability(dom.window.document).parse();

        if(!article || !article.textContent){
            console.warn(`[SKIP] ${request.url} - no extractable content`);
            return;
        }

        const result: PageResult ={
            url: request.url,
            title: article.title,
            textContent: article.textContent.trim(),
            excerpt: article.excerpt || null,
            textLength: article.textContent.trim().length,
            wordCount: article.textContent.trim().split(/\s+/).length
        };

        results.push(result);
        pagesExtracted++;
        console.log(`[OK] ${article.title} (${result.wordCount} words)`);
    },

    failedRequestHandler({request}){
        console.error(`[FAIL] ${request.url} - ${request.errorMessages ?? 'Unknown error'}`)
    },

    maxRequestsPerCrawl: 300,
    maxConcurrency: 2,
    requestHandlerTimeoutSecs: 30,
});

async function main() {
    console.log(`Crawling ${SEED_URLS.length} seed URLs...\n`);

    await crawler.run(SEED_URLS);

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
    
    console.log(`Done. ${pagesExtracted}/${pagesProcessed} pages extracted.`)

    console.log(`Output → ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});