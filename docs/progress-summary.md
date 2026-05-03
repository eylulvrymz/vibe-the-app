# Vibe Progress Summary

## 1. Status + Technical Progress

Estimated progress: 70%.

Completed:

- Monorepo project structure.
- React PWA frontend for auth, feed, profile, and trending screens.
- Java backend source for real auth, SQLite persistence, posts, likes, follows, search, and suggestions.
- Python algorithm service for BST friend recommendations and max-heap trending posts.
- Seeded Spotify-style demo data.

Working target:

- Login/register with hashed passwords.
- Feed and post creation.
- Like updates and trending view.
- Profile and social suggestions.

## 2. Demo / Screenshots

Required screenshots:

- Login/register screen.
- Home feed with vibe posts and composer.
- Profile screen with favorite genres and activity.
- Trending screen showing ranked posts.

Screenshots should be saved in `docs/screenshots/` after running the frontend.

## 3. Algorithms + One Key Challenge

Implemented algorithms:

- Max-heap trending ranking adapted from coursework.
- BST friend-of-friend suggestions adapted from coursework.

One key challenge:

- Making algorithms visible enough for evaluation without making the social app feel like a classroom data-structure demo. The solution is to keep algorithm code in a Python service with tests and document exactly where the app uses the same ranking/recommendation ideas.

## 4. Risks + Next Steps

Current risks:

- Local Java compiler was not on PATH at discovery time, so the repo includes a helper script to fetch/configure a portable JDK.
- Android is PWA-ready only; native Android wrapper is a later step.

Next steps:

- Verify backend on the local machine with the portable JDK.
- Capture final screenshots.
- Optionally add Capacitor for Android packaging.
