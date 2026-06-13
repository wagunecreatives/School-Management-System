import http from "node:http";
import server from "./dist/server/server.js";

const PORT = process.env.PORT || 10000;

const nodeServer = http.createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`;

  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
  });

  try {
    const response = await server.fetch(request, {}, {});

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

nodeServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

