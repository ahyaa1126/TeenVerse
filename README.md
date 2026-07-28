# TeenVerse Tonight

This version runs without MongoDB. Accounts and messages are saved in local JSON files, so they remain after restarting the server.

## Start

1. Extract the ZIP.
2. Open the inner `TeenVerse_Tonight` folder in VS Code.
3. Run:
   npm install
4. Copy `.env.example` and rename the copy to `.env`.
5. Run:
   npm run dev
6. Open:
   http://localhost:3000

## Owner

Register using the username `ahya`. It becomes OWNER automatically.

## Clear a room

As OWNER, type:

/clear

## Important

This version is for local development. Before public deployment, connect a proper database and add stronger moderation and safety controls.
