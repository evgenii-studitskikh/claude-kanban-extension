# Publishing to the Chrome Web Store

## 1. Build the package

Every push to `main` and every pull request runs `.github/workflows/release.yml`, which type-checks, tests and
builds `claude-kanban-<version>.zip` (download it from the run's **Artifacts**).

For a release:

1. Bump `version` in **both** `package.json` and `public/manifest.json` (the store rejects an upload whose
   version is not higher than the published one).
2. Commit, then tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
3. The workflow attaches the zip to a GitHub Release named after the tag.

Locally: `npm ci && npm run package` → `release/claude-kanban-<version>.zip`.

## 2. Release checklist

- [ ] `npm run typecheck && npm test` pass.
- [ ] Loaded the zip's contents unpacked in Chrome and checked the board on a real claude.ai project.
- [ ] Decide whether console debug logging should stay on by default (`debug: true` in `src/content/storage.ts`).
- [ ] Screenshots ready (`store/SCREENSHOTS.md`).
- [ ] `PRIVACY.md` still matches what the code does.

## 3. One-time developer account setup

1. Open https://chrome.google.com/webstore/devconsole and sign in with the Google account that will own the item.
2. Accept the developer agreement and pay the one-time **$5** registration fee.
3. In **Account**, set a publisher display name and verify the contact email (required before publishing).
4. Turn on 2-Step Verification on the Google account (required to publish).

## 4. Create the item

1. Developer Dashboard → **Add new item** → upload the zip.
2. Fill in **Store listing**, **Privacy** and **Distribution** using `store/LISTING.md`.
3. Upload the icon, screenshots and the small promo tile.
4. **Submit for review.** Review usually takes from a few days to a few weeks. Broad host permissions or unclear
   privacy answers can make it longer.

## 5. Updates

Bump the version, push a new tag, upload the new zip in the dashboard (**Package → Upload new package**), and
submit again.

Possible later step: automate uploads with the Chrome Web Store API (needs an OAuth client and refresh token
stored as GitHub secrets).
