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
    'https://myanimelist.net/anime.php?letter=A',
  'https://myanimelist.net/anime.php?letter=B',
  'https://myanimelist.net/anime.php?letter=C',
  'https://myanimelist.net/anime.php?letter=D',
  'https://myanimelist.net/anime.php?letter=E',
  'https://myanimelist.net/anime.php?letter=F',
  'https://myanimelist.net/anime.php?letter=G',
  'https://myanimelist.net/anime.php?letter=H',
  'https://myanimelist.net/anime.php?letter=I',
  'https://myanimelist.net/anime.php?letter=J',
  'https://myanimelist.net/anime.php?letter=K',
  'https://myanimelist.net/anime.php?letter=L',
  'https://myanimelist.net/anime.php?letter=M',
  'https://myanimelist.net/anime.php?letter=N',
  'https://myanimelist.net/anime.php?letter=O',
  'https://myanimelist.net/anime.php?letter=P',
  'https://myanimelist.net/anime.php?letter=Q',
  'https://myanimelist.net/anime.php?letter=R',
  'https://myanimelist.net/anime.php?letter=S',
  'https://myanimelist.net/anime.php?letter=T',
  'https://myanimelist.net/anime.php?letter=U',
  'https://myanimelist.net/anime.php?letter=V',
  'https://myanimelist.net/anime.php?letter=W',
  'https://myanimelist.net/anime.php?letter=X',
  'https://myanimelist.net/anime.php?letter=Y',
  'https://myanimelist.net/anime.php?letter=Z',
  'https://myanimelist.net/anime.php?letter=0-9',
]

const OUTPUT_PATH = path.resolve(
    __dirname, '..', 'data', 'crawl-results.json'
)

const results: PageResult[] = [];
let pagesProcessed = 0;
let pagesExtracted = 0;
const crawler = new CheerioCrawler({
    useSessionPool: true,
    sessionPoolOptions: {
        maxPoolSize: 25,
    },


    async requestHandler({ request, body, enqueueLinks}) {
        pagesProcessed++;
        await enqueueLinks({
            regexps: [
               // Anime detail pages (the pages we want content from)
                /^https:\/\/myanimelist\.net\/anime\/\d+/,
                // Index page pagination (to discover more anime)
                /^https:\/\/myanimelist\.net\/anime\.php\?letter=[\w-]+(&show=\d+)?$/,
                ],
            limit: 55,
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


    maxRequestsPerCrawl: 25000,
    maxConcurrency: 4,
    requestHandlerTimeoutSecs: 30,
    maxRequestRetries: 5,
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