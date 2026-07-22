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
    'https://myanimelist.net/anime/1/Cowboy_Bebop',
    'https://myanimelist.net/anime/5114/Fullmetal_Alchemist_Brotherhood',
    'https://myanimelist.net/anime/16498/Shingeki_no_Kyojin',
    'https://myanimelist.net/anime/21/One_Piece',
    'https://myanimelist.net/anime/269/Bleach',
]

const OUTPUT_PATH = path.resolve(
    __dirname, '..', 'data', 'crawl-results.json'
)

const results: PageResult[] = [];
const crawler = new CheerioCrawler({
    async requestHandler({ request, body}) {
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
        console.log(`[OK] ${article.title} (${result.wordCount} words)`);
    },

    failedRequestHandler({request}){
        console.error(`[FAIL] ${request.url} - ${request.errorMessages ?? 'Unknown error'}`)
    },

    maxRequestsPerCrawl: SEED_URLS.length,
    maxConcurrency: 2,
    requestHandlerTimeoutSecs: 30,
});

async function main() {
    console.log(`Crawling ${SEED_URLS.length} seed URLs...\n`);

    await crawler.run(SEED_URLS);

    console.log(`\nDone. ${results.length}/${SEED_URLS.length} pages extracted.`);

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');

    console.log(`Output → ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});