import { CheerioCrawler } from 'crawlee';

function extractGenres(sidebarInfo: string): string[] {
  // Get everything after "Genres:" until the next section
  const match = sidebarInfo.match(
    /Genres:\s*([\s\S]*?)(?:Themes?:|Demographic:|Duration:|Rating:)/i
  );

  if (!match) return [];

  const raw = match[1];

  return raw
    .split(",")
    .map(g => g.replace(/\s+/g, "").trim()) // Remove spaces/newlines
    .filter(Boolean)
    .map(g => {
      // ActionAction -> Action
      const half = Math.floor(g.length / 2);
      return g.slice(0, half) === g.slice(half) ? g.slice(0, half) : g;
    });
}

const crawler = new CheerioCrawler({
    async requestHandler({ request, $ }) {
        console.log("\n\n--- Testing Streaming Selectors on:", request.url, "---");
        
        // Let's test a few different CSS selectors
        
        const try1 = $('.pb16 a').map((_, el) => $(el).attr('title') || $(el).text().trim()).get();
        console.log("Selector .pb16 a:", try1);
        
        const try2 = $('.broadcast a').map((_, el) => $(el).attr('title') || $(el).text().trim()).get();
        console.log("Selector .broadcast a:", try2);
        
        const try3 = $('.js-streaming-platforms a').map((_, el) => $(el).attr('title') || $(el).text().trim()).get();
        console.log("Selector .js-streaming-platforms a:", try3);

        const try4 = $('.anime-detail-header-stats a').map((_, el) => $(el).attr('title') || $(el).text().trim()).get();
        console.log("Selector .anime-detail-header-stats a:", try4);

        // Find all links containing crunchyroll or netflix just to be sure
        const crLinks = $('a[href*="crunchyroll.com"], a[href*="netflix.com"]').map((_, el) => ({
            title: $(el).attr('title'),
            href: $(el).attr('href'),
            parentClass: $(el).parent().attr('class'),
            score : $('.score-label').text().trim(),
            genre : extractGenres($('.spaceit_pad').text().trim()),
        })).get();
        console.log("Hardcoded platform links found:", crLinks);
    }
});

crawler.run(['https://myanimelist.net/anime/21/One_Piece']);
