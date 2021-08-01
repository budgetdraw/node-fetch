This a modified fork of [dollarshaveclub/node-fetch](https://github.com/dollarshaveclub/node-fetch) tweaked to fit the use-case of [miniflare](https://github.com/mrbbot/miniflare).
This is not meant for general use.
It adds types, `Response.redirect`, Web Sockets to `Response`'s, the `cf` property to `Request`'s, support for empty bodies and has updated dependencies.
It uses Node's built-in Web Streams and Blob, so requires Node 16.5.0 or greater.
