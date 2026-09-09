# MSX Auction Tracker

A lightweight auction/marketplace tracker focused on MSX hardware and retro-computing items.

## Current features

- Add an item type and one or more search keywords/aliases.
- Choose target marketplaces for each keyword watch.
- Manually add any listing URL.
- Store current price, currency and auction end time.
- Live countdown until auction end.
- Mark a tracked listing as sold and preserve its final price in history.
- Filter completed-auction history by 7, 30, 90, 365 days or all time.
- Calculate lowest, highest and median completed-auction value.
- Plot completed prices over time.
- Browser-local persistence via `localStorage`.
- Responsive static UI suitable for GitHub Pages.

## Important: automatic marketplace tracking

The UI and data model support keyword watches, but real automatic discovery/price refresh requires marketplace APIs or collectors plus persistent storage. The browser cannot safely hold private API credentials.

Recommended production architecture:

1. **Frontend:** this static site (GitHub Pages, Cloudflare Pages or similar).
2. **Database:** Supabase/PostgreSQL using `supabase/schema.sql`.
3. **Collector:** scheduled GitHub Action or server process.
4. **Marketplace adapters:** official/provider APIs where available.

Amazon, Yahoo/Buyee and eBay should each be implemented as independent adapters. Do not put marketplace secrets in client-side JavaScript. Store secrets in GitHub Actions secrets or backend environment variables.

## GitHub Pages

A Pages workflow is included in `.github/workflows/pages.yml`. If Pages is not already enabled for the repository, select **GitHub Actions** as the Pages source in repository Settings > Pages.

## Local use

No build step is required. Serve the repository root with any static HTTP server, or deploy directly with GitHub Pages.

Opening `index.html` directly may work for the UI, but an HTTP server is recommended.

## Demo data

The UI has a **Load demo data** button. Demo prices are deliberately synthetic examples and are labelled as demo data; they are not real market observations.

## Database

`supabase/schema.sql` contains the initial production schema for:

- item types / watches
- search aliases
- marketplace sources
- discovered listings
- price observations
- completed auction outcomes

Once a Supabase project exists, apply the schema there and connect the frontend/backend through environment configuration.

## Next implementation step

Connect the first real marketplace adapter. For an MSX-first product, Yahoo Auctions/Buyee discovery is likely the most useful initial source, followed by eBay and Amazon Japan. The adapter should normalize every result into the same listing model and upsert observations instead of creating duplicate listings.
