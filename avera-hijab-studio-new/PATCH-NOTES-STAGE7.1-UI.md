# Avera Hijab Studio — UI refinement patch

Basis: Stage 7.1 source ZIP supplied in this conversation.

## Changes
- Replaced the text navbar brand with the supplied transparent Avera wordmark at `public/img/brand/avera-wordmark.png`.
- Added the supplied hero artwork at `public/img/brand/avera-hero.jpg`.
- Reworked the hero area to use the supplied banner, with working `Shop Collection` and WhatsApp actions.
- Kept the existing featured-color selector (`#drapes`) below the banner.
- Updated product-card variant selection so choosing a variant updates the card image to that variant's `image` field and displays the selected color name. If a variant has no image, the product image is used as fallback.
- Kept the existing product detail color/image flow and cart variant slug flow intact.

## Files changed
- `public/index.html`
- `public/img/brand/avera-wordmark.png` (new)
- `public/img/brand/avera-hero.jpg` (new)

No SQL, Supabase schema, API, authentication, order, inventory, or shipping code was changed.

## Validation performed
- `npm test` — passed (smoke, reports, Stage 7.1).
- Inline JavaScript syntax checks — passed.

## Deployment
Upload/replace the project source in the connected GitHub repository, commit and push. Vercel should deploy from the connected repository. No Supabase SQL migration is required for this UI patch.
