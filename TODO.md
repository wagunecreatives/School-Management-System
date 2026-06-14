# TODO — Fix SSR + Static Assets

- [ ] Replace `server-node.js` with an Express-based server that serves `dist/client` static files and forwards all other requests to `dist/server/server.js`.
- [ ] Add `express` dependency if needed (`npm i express`).
- [ ] Run `npm install`, `npm run build`, then `npm start`.
- [ ] Verify that `/assets/*.js`, `/assets/*.css`, and images return 200 (no more 404).
- [ ] If SSR still shows branded error, temporarily modify the SSR catch block to print real stack traces and re-test.

