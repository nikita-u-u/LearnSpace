# LearnSpace, Vite + Express

A real monorepo starter for the LearnSpace Coursera-style app.

## Run locally

Requirements: Node.js 18+ and npm 9+.

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

The API runs on `http://localhost:4000`. Health check:

```bash
curl http://localhost:4000/api/health
```

## Seeded accounts

- Student: `priya@learnspace.dev` / `letmein123`
- Admin: `rio@learnspace.dev` / `letmein123`

## Production build

```bash
npm run build
NODE_ENV=production npm start
```

Express serves the compiled Vite app when `NODE_ENV=production`.

## Structure

```text
client/
  index.html
  src/main.js
  src/styles.css
  vite.config.js
server/
  src/index.js
  src/seed.js
```

## Next implementation steps

1. Add Mongoose User, Course, Lesson, and Enrollment models.
2. Move seeded catalog data into `server/src/seed.js` and persist it in MongoDB Atlas.
3. Add JWT middleware and role checks for admin routes.
4. Move video link verification to the server and cache provider, status, and checkedAt.
5. Add Stripe Checkout plus webhook-based enrollment confirmation.
6. Replace the current demo client state with API calls from `client/src/lib/api.js`.

Do not grant paid access from a browser-only flag. The backend must check the enrollment record for every protected lesson request.
