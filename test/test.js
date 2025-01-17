// test tools
import chai from "chai";
import chaiPromised from "chai-as-promised";
import chaiIterator from "chai-iterator";
import chaiString from "chai-string";
import FormData from "formdata-node";
import { ReadableStream } from "stream/web";

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { parse: parseURL, URL, URLSearchParams } = require("url");
const { TextEncoder, TextDecoder } = require("util");
const { lookup } = require("dns");
const vm = require("vm");

const {
  ArrayBuffer: VMArrayBuffer,
  Uint8Array: VMUint8Array
} = vm.runInNewContext("this");

chai.use(chaiPromised);
chai.use(chaiIterator);
chai.use(chaiString);
const expect = chai.expect;

import TestServer from "./server";

// test subjects
import fetch, { FetchError, Headers, Request, Response } from "../src/";
import FetchErrorOrig from "../src/fetch-error.js";
import HeadersOrig from "../src/headers.js";
import RequestOrig from "../src/request.js";
import ResponseOrig from "../src/response.js";
import Body, {getInstanceBody} from "../src/body.js";
import { Blob } from "buffer";

const supportToString =
  {
    [Symbol.toStringTag]: "z"
  }.toString() === "[object z]";

const local = new TestServer();
const base = `http://${local.hostname}:${local.port}/`;

function stringToArrayBuffer(s) {
  return new TextEncoder().encode(s).buffer;
}

function stringToReadableStream(s) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(s);
      controller.close();
    },
  });
}

before(done => {
  local.start(done);
});

after(done => {
  local.stop(done);
});

describe("node-fetch", () => {
  it("should return a promise", function() {
    const url = `${base}hello`;
    const p = fetch(url);
    expect(p).to.be.an.instanceof(Promise);
    expect(p).to.have.property("then");
  });

  it("should expose Headers, Response and Request constructors", function() {
    expect(FetchError).to.equal(FetchErrorOrig);
    expect(Headers).to.equal(HeadersOrig);
    expect(Response).to.equal(ResponseOrig);
    expect(Request).to.equal(RequestOrig);
  });

  (supportToString ? it : it.skip)(
    "should support proper toString output for Headers, Response and Request objects",
    function() {
      expect(new Headers().toString()).to.equal("[object Headers]");
      expect(new Response().toString()).to.equal("[object Response]");
      expect(new Request(base).toString()).to.equal("[object Request]");
    }
  );

  it("should reject with error if url is protocol relative", function() {
    const url = "//example.com/";
    return expect(fetch(url)).to.eventually.be.rejectedWith(
      TypeError,
      "Only absolute URLs are supported"
    );
  });

  it("should reject with error if url is relative path", function() {
    const url = "/some/path";
    return expect(fetch(url)).to.eventually.be.rejectedWith(
      TypeError,
      "Only absolute URLs are supported"
    );
  });

  it("should reject with error if protocol is unsupported", function() {
    const url = "ftp://example.com/";
    return expect(fetch(url)).to.eventually.be.rejectedWith(
      TypeError,
      "Only HTTP(S) protocols are supported"
    );
  });

  it("should reject with error on network failure", function() {
    const url = "http://localhost:50000/";
    return expect(fetch(url))
      .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
      .and.include({
        type: "system",
        code: "ECONNREFUSED",
        errno: "ECONNREFUSED"
      });
  });

  it("should resolve into response", function() {
    const url = `${base}hello`;
    return fetch(url).then(res => {
      expect(res).to.be.an.instanceof(Response);
      expect(res.headers).to.be.an.instanceof(Headers);
      expect(res.body).to.be.an.instanceof(ReadableStream);
      expect(res.bodyUsed).to.be.false;

      expect(res.url).to.equal(url);
      expect(res.ok).to.be.true;
      expect(res.status).to.equal(200);
      expect(res.statusText).to.equal("OK");
    });
  });

  it("should accept plain text response", function() {
    const url = `${base}plain`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return res.text().then(result => {
        expect(res.bodyUsed).to.be.true;
        expect(result).to.be.a("string");
        expect(result).to.equal("text");
      });
    });
  });

  it("should accept html response (like plain text)", function() {
    const url = `${base}html`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/html");
      return res.text().then(result => {
        expect(res.bodyUsed).to.be.true;
        expect(result).to.be.a("string");
        expect(result).to.equal("<html></html>");
      });
    });
  });

  it("should accept json response", function() {
    const url = `${base}json`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("application/json");
      return res.json().then(result => {
        expect(res.bodyUsed).to.be.true;
        expect(result).to.be.an("object");
        expect(result).to.deep.equal({ name: "value" });
      });
    });
  });

  it("should send request with custom headers", function() {
    const url = `${base}inspect`;
    const opts = {
      headers: { "x-custom-header": "abc" }
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.headers["x-custom-header"]).to.equal("abc");
      });
  });

  it("should accept headers instance", function() {
    const url = `${base}inspect`;
    const opts = {
      headers: new Headers({ "x-custom-header": "abc" })
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.headers["x-custom-header"]).to.equal("abc");
      });
  });

  it("should accept custom host header", function() {
    const url = `${base}inspect`;
    const opts = {
      headers: {
        host: "example.com"
      }
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.headers["host"]).to.equal("example.com");
      });
  });

  it("should accept custom HoSt header", function() {
    const url = `${base}inspect`;
    const opts = {
      headers: {
        HoSt: "example.com"
      }
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.headers["host"]).to.equal("example.com");
      });
  });

  it("should follow redirect code 301", function() {
    const url = `${base}redirect/301`;
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
      expect(res.ok).to.be.true;
    });
  });

  it("should follow redirect code 302", function() {
    const url = `${base}redirect/302`;
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
    });
  });

  it("should follow redirect code 303", function() {
    const url = `${base}redirect/303`;
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
    });
  });

  it("should follow redirect code 307", function() {
    const url = `${base}redirect/307`;
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
    });
  });

  it("should follow redirect code 308", function() {
    const url = `${base}redirect/308`;
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
    });
  });

  it("should follow redirect chain", function() {
    const url = `${base}redirect/chain`;
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
    });
  });

  it("should follow POST request redirect code 301 with GET", function() {
    const url = `${base}redirect/301`;
    const opts = {
      method: "POST",
      body: "a=1"
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
      return res.json().then(result => {
        expect(result.method).to.equal("GET");
        expect(result.body).to.equal("");
      });
    });
  });

  it("should follow PATCH request redirect code 301 with PATCH", function() {
    const url = `${base}redirect/301`;
    const opts = {
      method: "PATCH",
      body: "a=1"
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
      return res.json().then(res => {
        expect(res.method).to.equal("PATCH");
        expect(res.body).to.equal("a=1");
      });
    });
  });

  it("should follow POST request redirect code 302 with GET", function() {
    const url = `${base}redirect/302`;
    const opts = {
      method: "POST",
      body: "a=1"
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
      return res.json().then(result => {
        expect(result.method).to.equal("GET");
        expect(result.body).to.equal("");
      });
    });
  });

  it("should follow PATCH request redirect code 302 with PATCH", function() {
    const url = `${base}redirect/302`;
    const opts = {
      method: "PATCH",
      body: "a=1"
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
      return res.json().then(res => {
        expect(res.method).to.equal("PATCH");
        expect(res.body).to.equal("a=1");
      });
    });
  });

  it("should follow redirect code 303 with GET", function() {
    const url = `${base}redirect/303`;
    const opts = {
      method: "PUT",
      body: "a=1"
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
      return res.json().then(result => {
        expect(result.method).to.equal("GET");
        expect(result.body).to.equal("");
      });
    });
  });

  it("should follow PATCH request redirect code 307 with PATCH", function() {
    const url = `${base}redirect/307`;
    const opts = {
      method: "PATCH",
      body: "a=1"
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
      return res.json().then(result => {
        expect(result.method).to.equal("PATCH");
        expect(result.body).to.equal("a=1");
      });
    });
  });

  it("should not follow non-GET redirect if body is a readable stream", function() {
    const url = `${base}redirect/307`;
    const opts = {
      method: "PATCH",
      body: stringToReadableStream("a=1")
    };
    return expect(fetch(url, opts))
      .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
      .and.have.property("type", "unsupported-redirect");
  });

  it("should obey maximum redirect, reject case", function() {
    const url = `${base}redirect/chain`;
    const opts = {
      follow: 1
    };
    return expect(fetch(url, opts))
      .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
      .and.have.property("type", "max-redirect");
  });

  it("should obey redirect chain, resolve case", function() {
    const url = `${base}redirect/chain`;
    const opts = {
      follow: 2
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(`${base}inspect`);
      expect(res.status).to.equal(200);
    });
  });

  it("should allow not following redirect", function() {
    const url = `${base}redirect/301`;
    const opts = {
      follow: 0
    };
    return expect(fetch(url, opts))
      .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
      .and.have.property("type", "max-redirect");
  });

  it("should support redirect mode, manual flag", function() {
    const url = `${base}redirect/301`;
    const opts = {
      redirect: "manual"
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(url);
      expect(res.status).to.equal(301);
      expect(res.headers.get("location")).to.equal(`${base}inspect`);
    });
  });

  it("should support redirect mode, error flag", function() {
    const url = `${base}redirect/301`;
    const opts = {
      redirect: "error"
    };
    return expect(fetch(url, opts))
      .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
      .and.have.property("type", "no-redirect");
  });

  it("should support redirect mode, manual flag when there is no redirect", function() {
    const url = `${base}hello`;
    const opts = {
      redirect: "manual"
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(url);
      expect(res.status).to.equal(200);
      expect(res.headers.get("location")).to.be.null;
    });
  });

  it("should follow redirect code 301 and keep existing headers", function() {
    const url = `${base}redirect/301`;
    const opts = {
      headers: new Headers({ "x-custom-header": "abc" })
    };
    return fetch(url, opts)
      .then(res => {
        expect(res.url).to.equal(`${base}inspect`);
        return res.json();
      })
      .then(res => {
        expect(res.headers["x-custom-header"]).to.equal("abc");
      });
  });

  it("should treat broken redirect as ordinary response (follow)", function() {
    const url = `${base}redirect/no-location`;
    return fetch(url).then(res => {
      expect(res.url).to.equal(url);
      expect(res.status).to.equal(301);
      expect(res.headers.get("location")).to.be.null;
    });
  });

  it("should treat broken redirect as ordinary response (manual)", function() {
    const url = `${base}redirect/no-location`;
    const opts = {
      redirect: "manual"
    };
    return fetch(url, opts).then(res => {
      expect(res.url).to.equal(url);
      expect(res.status).to.equal(301);
      expect(res.headers.get("location")).to.be.null;
    });
  });

  it("should reject invalid headers", function() {
    const url = `${base}invalid-header`;
    return expect(fetch(url))
      .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
      .and.have.property("type", "system");
  });

  it("should handle client-error response", function() {
    const url = `${base}error/400`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      expect(res.status).to.equal(400);
      expect(res.statusText).to.equal("Bad Request");
      expect(res.ok).to.be.false;
      return res.text().then(result => {
        expect(res.bodyUsed).to.be.true;
        expect(result).to.be.a("string");
        expect(result).to.equal("client error");
      });
    });
  });

  it("should handle server-error response", function() {
    const url = `${base}error/500`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      expect(res.status).to.equal(500);
      expect(res.statusText).to.equal("Internal Server Error");
      expect(res.ok).to.be.false;
      return res.text().then(result => {
        expect(res.bodyUsed).to.be.true;
        expect(result).to.be.a("string");
        expect(result).to.equal("server error");
      });
    });
  });

  it("should handle network-error response", function() {
    const url = `${base}error/reset`;
    return expect(fetch(url))
      .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
      .and.have.property("code", "ECONNRESET");
  });

  // This test relies on your DNS setup being 4.4.4.4, if you
  it.skip("should handle DNS-error response", function() {
    this.timeout(0);
    const url = "http://domain.invalid";
    return expect(fetch(url))
      .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
      .and.have.property("code", "ENOTFOUND");
  });

  it("should reject invalid json response", function() {
    const url = `${base}error/json`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("application/json");
      return expect(res.json())
        .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
        .and.include({ type: "invalid-json" });
    });
  });

  it("should handle no content response", function() {
    const url = `${base}no-content`;
    return fetch(url).then(res => {
      expect(res.status).to.equal(204);
      expect(res.statusText).to.equal("No Content");
      expect(res.ok).to.be.true;
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.be.empty;
      });
    });
  });

  it("should reject when trying to parse no content response as json", function() {
    const url = `${base}no-content`;
    return fetch(url).then(res => {
      expect(res.status).to.equal(204);
      expect(res.statusText).to.equal("No Content");
      expect(res.ok).to.be.true;
      return expect(res.json())
        .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
        .and.include({ type: "invalid-json" });
    });
  });

  it("should handle no content response with gzip encoding", function() {
    const url = `${base}no-content/gzip`;
    return fetch(url).then(res => {
      expect(res.status).to.equal(204);
      expect(res.statusText).to.equal("No Content");
      expect(res.headers.get("content-encoding")).to.equal("gzip");
      expect(res.ok).to.be.true;
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.be.empty;
      });
    });
  });

  it("should handle not modified response", function() {
    const url = `${base}not-modified`;
    return fetch(url).then(res => {
      expect(res.status).to.equal(304);
      expect(res.statusText).to.equal("Not Modified");
      expect(res.ok).to.be.false;
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.be.empty;
      });
    });
  });

  it("should handle not modified response with gzip encoding", function() {
    const url = `${base}not-modified/gzip`;
    return fetch(url).then(res => {
      expect(res.status).to.equal(304);
      expect(res.statusText).to.equal("Not Modified");
      expect(res.headers.get("content-encoding")).to.equal("gzip");
      expect(res.ok).to.be.false;
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.be.empty;
      });
    });
  });

  it("should decompress gzip response", function() {
    const url = `${base}gzip`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.equal("hello world");
      });
    });
  });

  it("should decompress slightly invalid gzip response", function() {
    const url = `${base}gzip-truncated`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.equal("hello world");
      });
    });
  });

  it("should decompress deflate response", function() {
    const url = `${base}deflate`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.equal("hello world");
      });
    });
  });

  it("should decompress deflate raw response from old apache server", function() {
    const url = `${base}deflate-raw`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.equal("hello world");
      });
    });
  });

  it("should skip decompression if unsupported", function() {
    const url = `${base}sdch`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.equal("fake sdch string");
      });
    });
  });

  it("should reject if response compression is invalid", function() {
    const url = `${base}invalid-content-encoding`;
    return fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return expect(res.text())
        .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
        .and.have.property("code", "Z_DATA_ERROR");
    });
  });

  it("should handle errors on the body stream even if it is not used", function(done) {
    const url = `${base}invalid-content-encoding`;
    fetch(url)
      .then(res => {
        expect(res.status).to.equal(200);
      })
      .catch(() => {})
      .then(() => {
        // Wait a few ms to see if a uncaught error occurs
        setTimeout(() => {
          done();
        }, 50);
      });
  });

  it("should collect handled errors on the body stream to reject if the body is used later", function() {
    function delay(value) {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(value);
        }, 100);
      });
    }

    const url = `${base}invalid-content-encoding`;
    return fetch(url)
      .then(delay)
      .then(res => {
        expect(res.headers.get("content-type")).to.equal("text/plain");
        return expect(res.text())
          .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
          .and.have.property("code", "Z_DATA_ERROR");
      });
  });

  it("should allow disabling auto decompression", function() {
    const url = `${base}gzip`;
    const opts = {
      compress: false
    };
    return fetch(url, opts).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return res.text().then(result => {
        expect(result).to.be.a("string");
        expect(result).to.not.equal("hello world");
      });
    });
  });

  it("should allow custom timeout", function() {
    this.timeout(500);
    const url = `${base}timeout`;
    const opts = {
      timeout: 100
    };
    return expect(fetch(url, opts))
      .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
      .and.have.property("type", "request-timeout");
  });

  it("should allow custom timeout on response body", function() {
    this.timeout(500);
    const url = `${base}slow`;
    const opts = {
      timeout: 100
    };
    return fetch(url, opts).then(res => {
      expect(res.ok).to.be.true;
      return expect(res.text())
        .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
        .and.have.property("type", "body-timeout");
    });
  });

  it("should clear internal timeout on fetch response", function(done) {
    this.timeout(2000);
    spawn("node", [
      "-e",
      `require('./')('${base}hello', { timeout: 10000 })`
    ]).on("exit", () => {
      done();
    });
  });

  it("should clear internal timeout on fetch redirect", function(done) {
    this.timeout(2000);
    spawn("node", [
      "-e",
      `require('./')('${base}redirect/301', { timeout: 10000 })`
    ]).on("exit", () => {
      done();
    });
  });

  it("should clear internal timeout on fetch error", function(done) {
    this.timeout(2000);
    spawn("node", [
      "-e",
      `require('./')('${base}error/reset', { timeout: 10000 })`
    ]).on("exit", () => {
      done();
    });
  });

  it("should set default User-Agent", function() {
    const url = `${base}inspect`;
    fetch(url)
      .then(res => res.json())
      .then(res => {
        expect(res.headers["user-agent"]).to.startWith("node-fetch/");
      });
  });

  it("should allow setting User-Agent", function() {
    const url = `${base}inspect`;
    const opts = {
      headers: {
        "user-agent": "faked"
      }
    };
    fetch(url, opts)
      .then(res => res.json())
      .then(res => {
        expect(res.headers["user-agent"]).to.equal("faked");
      });
  });

  it("should set default Accept header", function() {
    const url = `${base}inspect`;
    fetch(url)
      .then(res => res.json())
      .then(res => {
        expect(res.headers.accept).to.equal("*/*");
      });
  });

  it("should allow setting Accept header", function() {
    const url = `${base}inspect`;
    const opts = {
      headers: {
        accept: "application/json"
      }
    };
    fetch(url, opts)
      .then(res => res.json())
      .then(res => {
        expect(res.headers.accept).to.equal("application/json");
      });
  });

  it("should allow POST request", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "POST"
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.be.undefined;
        expect(res.headers["content-length"]).to.equal("0");
      });
  });

  it("should allow POST request with string body", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: "a=1"
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("a=1");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.equal(
          "text/plain;charset=UTF-8"
        );
        expect(res.headers["content-length"]).to.equal("3");
      });
  });

  it("should allow POST request with buffer body", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: Buffer.from("a=1", "utf-8")
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("a=1");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.be.undefined;
        expect(res.headers["content-length"]).to.equal("3");
      });
  });

  it("should allow POST request with ArrayBuffer body", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: stringToArrayBuffer("Hello, world!\n")
    };
    return fetch(url, opts)
      .then(res => res.json())
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("Hello, world!\n");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.be.undefined;
        expect(res.headers["content-length"]).to.equal("14");
      });
  });

  it("should allow POST request with ArrayBuffer body from a VM context", function() {
    // TODO: Node.js v4 doesn't support ArrayBuffer from other contexts, so we skip this test, drop this check once Node.js v4 support is not needed
    try {
      Buffer.from(new VMArrayBuffer());
    } catch (err) {
      this.skip();
    }
    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: new VMUint8Array(Buffer.from("Hello, world!\n")).buffer
    };
    return fetch(url, opts)
      .then(res => res.json())
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("Hello, world!\n");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.be.undefined;
        expect(res.headers["content-length"]).to.equal("14");
      });
  });

  it("should allow POST request with ArrayBufferView (Uint8Array) body", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: new Uint8Array(stringToArrayBuffer("Hello, world!\n"))
    };
    return fetch(url, opts)
      .then(res => res.json())
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("Hello, world!\n");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.be.undefined;
        expect(res.headers["content-length"]).to.equal("14");
      });
  });

  it("should allow POST request with ArrayBufferView (DataView) body", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: new DataView(stringToArrayBuffer("Hello, world!\n"))
    };
    return fetch(url, opts)
      .then(res => res.json())
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("Hello, world!\n");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.be.undefined;
        expect(res.headers["content-length"]).to.equal("14");
      });
  });

  it("should allow POST request with ArrayBufferView (Uint8Array) body from a VM context", function() {
    // TODO: Node.js v4 doesn't support ArrayBufferView from other contexts, so we skip this test, drop this check once Node.js v4 support is not needed
    try {
      Buffer.from(new VMArrayBuffer());
    } catch (err) {
      this.skip();
    }
    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: new VMUint8Array(Buffer.from("Hello, world!\n"))
    };
    return fetch(url, opts)
      .then(res => res.json())
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("Hello, world!\n");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.be.undefined;
        expect(res.headers["content-length"]).to.equal("14");
      });
  });

  // TODO: Node.js v4 doesn't support necessary Buffer API, so we skip this test, drop this check once Node.js v4 support is not needed
  (Buffer.from.length === 3 ? it : it.skip)(
    "should allow POST request with ArrayBufferView (Uint8Array, offset, length) body",
    function() {
      const url = `${base}inspect`;
      const opts = {
        method: "POST",
        body: new Uint8Array(stringToArrayBuffer("Hello, world!\n"), 7, 6)
      };
      return fetch(url, opts)
        .then(res => res.json())
        .then(res => {
          expect(res.method).to.equal("POST");
          expect(res.body).to.equal("world!");
          expect(res.headers["transfer-encoding"]).to.be.undefined;
          expect(res.headers["content-type"]).to.be.undefined;
          expect(res.headers["content-length"]).to.equal("6");
        });
    }
  );

  it("should allow POST request with blob body without type", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: new Blob(["a=1"])
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("a=1");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.be.undefined;
        expect(res.headers["content-length"]).to.equal("3");
      });
  });

  it("should allow POST request with blob body with type", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: new Blob(["a=1"], {
        type: "text/plain;charset=UTF-8"
      })
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("a=1");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.equal(
          "text/plain;charset=utf-8"
        );
        expect(res.headers["content-length"]).to.equal("3");
      });
  });

  it("should allow POST request with readable stream as body", function() {
    let body = stringToReadableStream("a=1");

    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("a=1");
        expect(res.headers["transfer-encoding"]).to.equal("chunked");
        expect(res.headers["content-type"]).to.be.undefined;
        expect(res.headers["content-length"]).to.be.undefined;
      });
  });

  it("should allow POST request with form-data as body", function() {
    const form = new FormData();
    form.append("a", "1");

    const url = `${base}multipart`;
    const opts = {
      method: "POST",
      body: form
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.headers["content-type"]).to.match(/^multipart\/form-data;\s?boundary\=/);
        expect(res.body).to.equal("a=1");
      });
  });

  it("should allow POST request with form-data using stream as body", function() {
    const form = new FormData();
    form.append(
      "my_field",
      fs.createReadStream(path.join(__dirname, "dummy.txt"))
    );

    const url = `${base}multipart`;
    const opts = {
      method: "POST",
      body: form
    };

    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.headers["content-type"]).to.match(/^multipart\/form-data;\s?boundary\=/);
        expect(res.headers["content-length"]).to.be.undefined;
        expect(res.body).to.contain("my_field=");
      });
  });

  it("should allow POST request with form-data as body and custom headers", function() {
    const form = new FormData();
    form.append("a", "1");

    const headers = {
      b: "2",
      ...form.headers
    };

    const url = `${base}multipart`;
    const opts = {
      method: "POST",
      body: form,
      headers
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.headers["content-type"]).to.match(/^multipart\/form-data;\s?boundary\=/);
        expect(res.headers.b).to.equal("2");
        expect(res.body).to.equal("a=1");
      });
  });

  it("should allow POST request with object body", function() {
    const url = `${base}inspect`;
    // note that fetch simply calls tostring on an object
    const opts = {
      method: "POST",
      body: { a: 1 }
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("[object Object]");
        expect(res.headers["content-type"]).to.equal(
          "text/plain;charset=UTF-8"
        );
        expect(res.headers["content-length"]).to.equal("15");
      });
  });

  const itUSP = typeof URLSearchParams === "function" ? it : it.skip;
  itUSP("should allow POST request with URLSearchParams as body", function() {
    const params = new URLSearchParams();
    params.append("a", "1");

    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: params
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.headers["content-type"]).to.equal(
          "application/x-www-form-urlencoded;charset=UTF-8"
        );
        expect(res.headers["content-length"]).to.equal("3");
        expect(res.body).to.equal("a=1");
      });
  });

  itUSP("should still recognize URLSearchParams when extended", function() {
    class CustomSearchParams extends URLSearchParams {}
    const params = new CustomSearchParams();
    params.append("a", "1");

    const url = `${base}inspect`;
    const opts = {
      method: "POST",
      body: params
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.headers["content-type"]).to.equal(
          "application/x-www-form-urlencoded;charset=UTF-8"
        );
        expect(res.headers["content-length"]).to.equal("3");
        expect(res.body).to.equal("a=1");
      });
  });

  it("should overwrite Content-Length if possible", function() {
    const url = `${base}inspect`;
    // note that fetch simply calls tostring on an object
    const opts = {
      method: "POST",
      headers: {
        "Content-Length": "1000"
      },
      body: "a=1"
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("POST");
        expect(res.body).to.equal("a=1");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-type"]).to.equal(
          "text/plain;charset=UTF-8"
        );
        expect(res.headers["content-length"]).to.equal("3");
      });
  });

  it("should allow PUT request", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "PUT",
      body: "a=1"
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("PUT");
        expect(res.body).to.equal("a=1");
      });
  });

  it("should allow DELETE request", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "DELETE"
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("DELETE");
      });
  });

  it("should allow DELETE request with string body", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "DELETE",
      body: "a=1"
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("DELETE");
        expect(res.body).to.equal("a=1");
        expect(res.headers["transfer-encoding"]).to.be.undefined;
        expect(res.headers["content-length"]).to.equal("3");
      });
  });

  it("should allow PATCH request", function() {
    const url = `${base}inspect`;
    const opts = {
      method: "PATCH",
      body: "a=1"
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.method).to.equal("PATCH");
        expect(res.body).to.equal("a=1");
      });
  });

  it("should allow HEAD request", function() {
    const url = `${base}hello`;
    const opts = {
      method: "HEAD"
    };
    return fetch(url, opts)
      .then(res => {
        expect(res.status).to.equal(200);
        expect(res.statusText).to.equal("OK");
        expect(res.headers.get("content-type")).to.equal("text/plain");
        expect(res.body).to.be.an.instanceof(ReadableStream);
        return res.text();
      })
      .then(text => {
        expect(text).to.equal("");
      });
  });

  it("should allow HEAD request with content-encoding header", function() {
    const url = `${base}error/404`;
    const opts = {
      method: "HEAD"
    };
    return fetch(url, opts)
      .then(res => {
        expect(res.status).to.equal(404);
        expect(res.headers.get("content-encoding")).to.equal("gzip");
        return res.text();
      })
      .then(text => {
        expect(text).to.equal("");
      });
  });

  it("should allow OPTIONS request", function() {
    const url = `${base}options`;
    const opts = {
      method: "OPTIONS"
    };
    return fetch(url, opts).then(res => {
      expect(res.status).to.equal(200);
      expect(res.statusText).to.equal("OK");
      expect(res.headers.get("allow")).to.equal("GET, HEAD, OPTIONS");
      expect(res.body).to.be.an.instanceof(ReadableStream);
    });
  });

  it("should reject decoding body twice", function(done) {
    const url = `${base}plain`;

    fetch(url).then(res => {
      expect(res.headers.get("content-type")).to.equal("text/plain");
      expect(res.bodyUsed).to.be.false;

      return res.text().then(() => res);
    }).then(res => {
      expect(res.bodyUsed).to.be.true;

      return res.text();
    }).then(() => {
      done(new Error("second call to res.text() was not rejected"));
    }, (err) => {
      expect(err).to.be.instanceOf(TypeError);
      done();
    });
  });

  it("should support timeouts", function() {
    // this.timeout(0);
    // Slow first writes a blob, then waits 1000ms, then ends the response
    const url = `${base}delayed`;
    const opts = {
      timeout: 100
    };
    return fetch(url, opts).then(res => {
      return expect(res.text()).to.eventually.be.rejectedWith(FetchError, /^Response timeout/)
    });
  });

  it("should support maximum response size, multiple chunk", function() {
    const url = `${base}size/chunk`;
    const opts = {
      size: 5
    };
    return fetch(url, opts).then(res => {
      expect(res.status).to.equal(200);
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return expect(res.text())
        .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
        .and.have.property("type", "max-size");
    });
  });

  it("should support maximum response size, single chunk", function() {
    const url = `${base}size/long`;
    const opts = {
      size: 5
    };
    return fetch(url, opts).then(res => {
      expect(res.status).to.equal(200);
      expect(res.headers.get("content-type")).to.equal("text/plain");
      return expect(res.text())
        .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
        .and.have.property("type", "max-size");
    });
  });

  it("should allow piping response body as stream", function() {
    const url = `${base}hello`;
    return fetch(url).then(res => {
      expect(res.body).to.be.an.instanceof(ReadableStream);
      return readableStreamToPromise(res.body, chunk => {
        if (chunk === null) {
          return;
        }
        expect(new TextDecoder().decode(chunk)).to.equal("world");
      });
    });
  });

  it("should allow cloning a response, and use both as stream", function() {
    const url = `${base}hello`;
    return fetch(url).then(res => {
      const r1 = res.clone();
      expect(res.body).to.be.an.instanceof(ReadableStream);
      expect(r1.body).to.be.an.instanceof(ReadableStream);
      const dataHandler = chunk => {
        if (chunk === null) {
          return;
        }
        expect(new TextDecoder().decode(chunk)).to.equal("world");
      };

      return Promise.all([
        readableStreamToPromise(res.body, dataHandler),
        readableStreamToPromise(r1.body, dataHandler)
      ]);
    });
  });

  it("should allow cloning a json response and log it as text response", function() {
    const url = `${base}json`;
    return fetch(url).then(res => {
      const r1 = res.clone();
      return Promise.all([res.json(), r1.text()]).then(results => {
        // expect(results[0]).to.equal('{"name":"value"}');
        expect(results[0]).to.deep.equal({ name: "value" });
        expect(results[1]).to.equal('{"name":"value"}');
      });
    });
  });

  it("should allow cloning a json response, and then log it as text response", function() {
    const url = `${base}json`;
    return fetch(url).then(res => {
      const r1 = res.clone();
      return res.json().then(result => {
        expect(result).to.deep.equal({ name: "value" });
        return r1.text().then(result => {
          expect(result).to.equal('{"name":"value"}');
        });
      });
    });
  });

  it("should allow cloning a json response, first log as text response, then return json object", function() {
    const url = `${base}json`;
    return fetch(url).then(res => {
      const r1 = res.clone();
      return r1.text().then(result => {
        expect(result).to.equal('{"name":"value"}');
        return res.json().then(result => {
          expect(result).to.deep.equal({ name: "value" });
        });
      });
    });
  });

  it("should not allow cloning a response after its been used", function() {
    const url = `${base}hello`;
    return fetch(url).then(res =>
      res.text().then(result => {
        expect(() => {
          res.clone();
        }).to.throw(Error);
      })
    );
  });

  it("should allow get all responses of a header", function() {
    const url = `${base}cookie`;
    return fetch(url).then(res => {
      const expected = "a=1, b=1";
      expect(res.headers.get("set-cookie")).to.equal(expected);
      expect(res.headers.get("Set-Cookie")).to.equal(expected);
    });
  });

  it("should allow getAll for set-cookie header", function() {
    const url = `${base}cookie`;
    return fetch(url).then(res => {
      const expected = ["a=1", "b=1"];
      expect(res.headers.getAll("set-cookie")).to.deep.equal(expected);
    });
  })

  it("should throw for getAll for headers other than set-cookie", function() {
    const url = `${base}cookie`;
    return fetch(url).then(res => {
      expect(() => res.headers.getAll("foo")).to.throw('getAll only supported for set-cookie');
    });
  })

  it("should return all headers using raw()", function() {
    const url = `${base}cookie`;
    return fetch(url).then(res => {
      const expected = ["a=1", "b=1"];
      expect(res.headers.raw()["set-cookie"]).to.deep.equal(expected);
    });
  });

  it("should allow deleting header", function() {
    const url = `${base}cookie`;
    return fetch(url).then(res => {
      res.headers.delete("set-cookie");
      expect(res.headers.get("set-cookie")).to.be.null;
    });
  });

  it("should send request with connection keep-alive if agent is provided", function() {
    const url = `${base}inspect`;
    const opts = {
      agent: new http.Agent({
        keepAlive: true
      })
    };
    return fetch(url, opts)
      .then(res => {
        return res.json();
      })
      .then(res => {
        expect(res.headers["connection"]).to.equal("keep-alive");
      });
  });

  it("should support fetch with Request instance", function() {
    const url = `${base}hello`;
    const req = new Request(url);
    return fetch(req).then(res => {
      expect(res.url).to.equal(url);
      expect(res.ok).to.be.true;
      expect(res.status).to.equal(200);
    });
  });

  it("should support fetch with Node.js URL object", function() {
    const url = `${base}hello`;
    const urlObj = parseURL(url);
    const req = new Request(urlObj);
    return fetch(req).then(res => {
      expect(res.url).to.equal(url);
      expect(res.ok).to.be.true;
      expect(res.status).to.equal(200);
    });
  });

  it("should support fetch with WHATWG URL object", function() {
    const url = `${base}hello`;
    const urlObj = new URL(url);
    const req = new Request(urlObj);
    return fetch(req).then(res => {
      expect(res.url).to.equal(url);
      expect(res.ok).to.be.true;
      expect(res.status).to.equal(200);
    });
  });

  it("should support blob round-trip", function() {
    const url = `${base}hello`;

    let length, type;

    return fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const url = `${base}inspect`;
        length = blob.size;
        type = blob.type;
        return fetch(url, {
          method: "POST",
          body: blob
        });
      })
      .then(res => res.json())
      .then(({ body, headers }) => {
        expect(body).to.equal("world");
        expect(headers["content-type"]).to.equal(type);
        expect(headers["content-length"]).to.equal(String(length));
      });
  });

  it("should support overwrite Request instance", function() {
    const url = `${base}inspect`;
    const req = new Request(url, {
      method: "POST",
      headers: {
        a: "1"
      }
    });
    return fetch(req, {
      method: "GET",
      headers: {
        a: "2"
      }
    })
      .then(res => {
        return res.json();
      })
      .then(body => {
        expect(body.method).to.equal("GET");
        expect(body.headers.a).to.equal("2");
      });
  });

  it("should support arrayBuffer(), blob(), text(), json() and buffer() method in Body constructor", function() {
    const body = new Body("a=1");
    expect(body).to.have.property("arrayBuffer");
    expect(body).to.have.property("blob");
    expect(body).to.have.property("text");
    expect(body).to.have.property("json");
    expect(body).to.have.property("buffer");
  });

  it("should create custom FetchError", function funcName() {
    const systemError = new Error("system");
    systemError.code = "ESOMEERROR";

    const err = new FetchError("test message", "test-error", systemError);
    expect(err).to.be.an.instanceof(Error);
    expect(err).to.be.an.instanceof(FetchError);
    expect(err.name).to.equal("FetchError");
    expect(err.message).to.equal("test message");
    expect(err.type).to.equal("test-error");
    expect(err.code).to.equal("ESOMEERROR");
    expect(err.errno).to.equal("ESOMEERROR");
    expect(err.stack)
      .to.include("funcName")
      .and.to.startWith(`${err.name}: ${err.message}`);
  });

  it("should support https request", function() {
    this.timeout(5000);
    const url = "https://github.com/";
    const opts = {
      method: "HEAD"
    };
    return fetch(url, opts).then(res => {
      expect(res.status).to.equal(200);
      expect(res.ok).to.be.true;
    });
  });

  describe("issue #414", function() {
    before(function() {
      this.bufferConcatErrorMsg = "test: Buffer.concat error";
      this.bufferConcat = Buffer.concat;
      Buffer.concat = () => {
        throw new Error(this.bufferConcatErrorMsg);
      };
    });

    after(function() {
      Buffer.concat = this.bufferConcat;
    });

    it("should reject if attempt to accumulate body stream throws", function() {
      let body = stringToReadableStream("a=1");

      const res = new Response(body);

      return expect(res.text())
        .to.eventually.be.rejected.and.be.an.instanceOf(FetchError)
        .and.include({ type: "system" })
        .and.have.property("message")
        .that.includes("Could not create Buffer")
        .and.that.includes(this.bufferConcatErrorMsg);
    });
  });

  it("supports supplying a lookup function to the agent", function() {
    const url = `${base}redirect/301`;
    let called = 0;
    function lookupSpy(hostname, options, callback) {
      called++;
      return lookup(hostname, options, callback);
    }
    const agent = http.Agent({ lookup: lookupSpy });
    return fetch(url, { agent }).then(() => {
      expect(called).to.equal(2);
    });
  });

  it("supports supplying a famliy option to the agent", function() {
    const url = `${base}redirect/301`;
    const families = [];
    const family = Symbol("family");
    function lookupSpy(hostname, options, callback) {
      families.push(options.family);
      return lookup(hostname, {}, callback);
    }
    const agent = http.Agent({ lookup: lookupSpy, family });
    return fetch(url, { agent }).then(() => {
      expect(families).to.have.length(2);
      expect(families[0]).to.equal(family);
      expect(families[1]).to.equal(family);
    });
  });
});

describe("Headers", function() {
  it("should have attributes conforming to Web IDL", function() {
    const headers = new Headers();
    expect(Object.getOwnPropertyNames(headers)).to.be.empty;
    const enumerableProperties = [];
    for (const property in headers) {
      enumerableProperties.push(property);
    }
    for (const toCheck of [
      "append",
      "delete",
      "entries",
      "forEach",
      "get",
      "has",
      "keys",
      "set",
      "values"
    ]) {
      expect(enumerableProperties).to.contain(toCheck);
    }
  });

  it("should allow iterating through all headers with forEach", function() {
    const headers = new Headers([
      ["b", "2"],
      ["c", "4"],
      ["b", "3"],
      ["a", "1"]
    ]);
    expect(headers).to.have.property("forEach");

    const result = [];
    headers.forEach((val, key) => {
      result.push([key, val]);
    });

    expect(result).to.deep.equal([["a", "1"], ["b", "2, 3"], ["c", "4"]]);
  });

  it("should allow iterating through all headers with for-of loop", function() {
    const headers = new Headers([["b", "2"], ["c", "4"], ["a", "1"]]);
    headers.append("b", "3");
    expect(headers).to.be.iterable;

    const result = [];
    for (let pair of headers) {
      result.push(pair);
    }
    expect(result).to.deep.equal([["a", "1"], ["b", "2, 3"], ["c", "4"]]);
  });

  it("should allow iterating through all headers with entries()", function() {
    const headers = new Headers([["b", "2"], ["c", "4"], ["a", "1"]]);
    headers.append("b", "3");

    expect(headers.entries()).to.be.iterable.and.to.deep.iterate.over([
      ["a", "1"],
      ["b", "2, 3"],
      ["c", "4"]
    ]);
  });

  it("should allow iterating through all headers with keys()", function() {
    const headers = new Headers([["b", "2"], ["c", "4"], ["a", "1"]]);
    headers.append("b", "3");

    expect(headers.keys()).to.be.iterable.and.to.iterate.over(["a", "b", "c"]);
  });

  it("should allow iterating through all headers with values()", function() {
    const headers = new Headers([["b", "2"], ["c", "4"], ["a", "1"]]);
    headers.append("b", "3");

    expect(headers.values()).to.be.iterable.and.to.iterate.over([
      "1",
      "2, 3",
      "4"
    ]);
  });

  it("should reject illegal header", function() {
    const headers = new Headers();
    expect(() => new Headers({ "He y": "ok" })).to.throw(TypeError);
    expect(() => new Headers({ "Hé-y": "ok" })).to.throw(TypeError);
    expect(() => new Headers({ "He-y": "ăk" })).to.throw(TypeError);
    expect(() => headers.append("Hé-y", "ok")).to.throw(TypeError);
    expect(() => headers.delete("Hé-y")).to.throw(TypeError);
    expect(() => headers.get("Hé-y")).to.throw(TypeError);
    expect(() => headers.has("Hé-y")).to.throw(TypeError);
    expect(() => headers.set("Hé-y", "ok")).to.throw(TypeError);

    // 'o k' is valid value but invalid name
    new Headers({ "He-y": "o k" });
  });

  it("should ignore unsupported attributes while reading headers", function() {
    const FakeHeader = function() {};
    // prototypes are currently ignored
    // This might change in the future: #181
    FakeHeader.prototype.z = "fake";

    const res = new FakeHeader();
    res.a = "string";
    res.b = ["1", "2"];
    res.c = "";
    res.d = [];
    res.e = 1;
    res.f = [1, 2];
    res.g = { a: 1 };
    res.h = undefined;
    res.i = null;
    res.j = NaN;
    res.k = true;
    res.l = false;
    res.m = Buffer.from("test");

    const h1 = new Headers(res);
    h1.set("n", [1, 2]);
    h1.append("n", ["3", 4]);

    const h1Raw = h1.raw();

    expect(h1Raw["a"]).to.include("string");
    expect(h1Raw["b"]).to.include("1,2");
    expect(h1Raw["c"]).to.include("");
    expect(h1Raw["d"]).to.include("");
    expect(h1Raw["e"]).to.include("1");
    expect(h1Raw["f"]).to.include("1,2");
    expect(h1Raw["g"]).to.include("[object Object]");
    expect(h1Raw["h"]).to.include("undefined");
    expect(h1Raw["i"]).to.include("null");
    expect(h1Raw["j"]).to.include("NaN");
    expect(h1Raw["k"]).to.include("true");
    expect(h1Raw["l"]).to.include("false");
    expect(h1Raw["m"]).to.include("test");
    expect(h1Raw["n"]).to.include("1,2");
    expect(h1Raw["n"]).to.include("3,4");

    expect(h1Raw["z"]).to.be.undefined;
  });

  it("should wrap headers", function() {
    const h1 = new Headers({
      a: "1"
    });
    const h1Raw = h1.raw();

    const h2 = new Headers(h1);
    h2.set("b", "1");
    const h2Raw = h2.raw();

    const h3 = new Headers(h2);
    h3.append("a", "2");
    const h3Raw = h3.raw();

    expect(h1Raw["a"]).to.include("1");
    expect(h1Raw["a"]).to.not.include("2");

    expect(h2Raw["a"]).to.include("1");
    expect(h2Raw["a"]).to.not.include("2");
    expect(h2Raw["b"]).to.include("1");

    expect(h3Raw["a"]).to.include("1");
    expect(h3Raw["a"]).to.include("2");
    expect(h3Raw["b"]).to.include("1");
  });

  it("should accept headers as an iterable of tuples", function() {
    let headers;

    headers = new Headers([["a", "1"], ["b", "2"], ["a", "3"]]);
    expect(headers.get("a")).to.equal("1, 3");
    expect(headers.get("b")).to.equal("2");

    headers = new Headers([
      new Set(["a", "1"]),
      ["b", "2"],
      new Map([["a", null], ["3", null]]).keys()
    ]);
    expect(headers.get("a")).to.equal("1, 3");
    expect(headers.get("b")).to.equal("2");

    headers = new Headers(new Map([["a", "1"], ["b", "2"]]));
    expect(headers.get("a")).to.equal("1");
    expect(headers.get("b")).to.equal("2");
  });

  it("should throw a TypeError if non-tuple exists in a headers initializer", function() {
    expect(() => new Headers([["b", "2", "huh?"]])).to.throw(TypeError);
    expect(() => new Headers(["b2"])).to.throw(TypeError);
    expect(() => new Headers("b2")).to.throw(TypeError);
    expect(() => new Headers({ [Symbol.iterator]: 42 })).to.throw(TypeError);
  });
});

describe("Response", function() {
  it("should have attributes conforming to Web IDL", function() {
    const res = new Response();
    const enumerableProperties = [];
    for (const property in res) {
      enumerableProperties.push(property);
    }
    for (const toCheck of [
      "body",
      "bodyUsed",
      "arrayBuffer",
      "blob",
      "json",
      "text",
      "url",
      "status",
      "ok",
      "statusText",
      "headers",
      "clone"
    ]) {
      expect(enumerableProperties).to.contain(toCheck);
    }
    for (const toCheck of [
      "body",
      "bodyUsed",
      "url",
      "status",
      "ok",
      "statusText",
      "headers"
    ]) {
      expect(() => {
        res[toCheck] = "abc";
      }).to.throw();
    }
  });

  it("should support empty options", function() {
    let body = stringToReadableStream("a=1");
    const res = new Response(body);
    return res.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support parsing headers", function() {
    const res = new Response(null, {
      headers: {
        a: "1"
      }
    });
    expect(res.headers.get("a")).to.equal("1");
  });

  it("should support text() method", function() {
    const res = new Response("a=1");
    return res.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support json() method", function() {
    const res = new Response('{"a":1}');
    return res.json().then(result => {
      expect(result.a).to.equal(1);
    });
  });

  it("should support buffer() method", function() {
    const res = new Response("a=1");
    return res.buffer().then(result => {
      expect(result.toString()).to.equal("a=1");
    });
  });

  it("should support blob() method", function() {
    const res = new Response("a=1", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      }
    });
    return res.blob().then(function(result) {
      expect(result).to.be.an.instanceOf(Blob);
      expect(result.size).to.equal(3);
      expect(result.type).to.equal("text/plain");
    });
  });

  it("should support clone() method", function() {
    let body = stringToReadableStream("a=1");
    const res = new Response(body, {
      headers: {
        a: "1"
      },
      url: base,
      status: 346,
      statusText: "production"
    })
    const cl = res.clone();

    expect(cl.headers.get("a")).to.equal("1");
    expect(cl.url).to.equal(base);
    expect(cl.status).to.equal(346);
    expect(cl.statusText).to.equal("production");
    expect(cl.ok).to.be.false;
    // clone body shouldn't be the same body
    expect(cl.body).to.not.equal(body);
    return cl.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support stream as body", function() {
    let body = stringToReadableStream("a=1");
    const res = new Response(body);
    return res.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support string as body", function() {
    const res = new Response("a=1");
    return res.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support buffer as body", function() {
    const res = new Response(Buffer.from("a=1"));
    return res.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support ArrayBuffer as body", function() {
    const res = new Response(stringToArrayBuffer("a=1"));
    return res.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support blob as body", function() {
    const res = new Response(new Blob(["a=1"]));
    return res.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support Uint8Array as body", function() {
    const res = new Response(new Uint8Array(stringToArrayBuffer("a=1")));
    return res.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support DataView as body", function() {
    const res = new Response(new DataView(stringToArrayBuffer("a=1")));
    return res.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should default to null as body", function() {
    const res = new Response();
    expect(res.body).to.equal(null);

    return res.text().then(result => expect(result).to.equal(""));
  });

  it("should support empty body", function() {
    const res = new Response("");
    return res.text().then(result => {
      expect(result).to.equal("");
    });
  });

  it("should default to 200 as status code", function() {
    const res = new Response(null);
    expect(res.status).to.equal(200);
  });
});

describe("Request", function() {
  it("should have attributes conforming to Web IDL", function() {
    const req = new Request("https://github.com/");
    const enumerableProperties = [];
    for (const property in req) {
      enumerableProperties.push(property);
    }
    for (const toCheck of [
      "body",
      "bodyUsed",
      "arrayBuffer",
      "blob",
      "json",
      "formData",
      "text",
      "method",
      "url",
      "headers",
      "redirect",
      "clone"
    ]) {
      expect(enumerableProperties).to.contain(toCheck);
    }
    for (const toCheck of [
      "body",
      "bodyUsed",
      "method",
      "url",
      "headers",
      "redirect"
    ]) {
      expect(() => {
        req[toCheck] = "abc";
      }).to.throw();
    }
  });

  describe("wrapping Request instance", function() {
    // FIXME: FormData should really be copied to be browser compliant:
    it("should not copy a FormData", function(){
      const url = `${base}hello`;

      const form = new FormData();
      form.append("a", "1");

      const r1 = new Request(url, {
        method: "POST",
        follow: 1,
        body: form
      });
      const r2 = new Request(r1, {
        follow: 2
      });

      expect(getInstanceBody(r2)).to.equal(getInstanceBody(r1));

      expect(r2.url).to.equal(url);
      expect(r2.method).to.equal("POST");
      // note that we didn't clone the body
      expect(getInstanceBody(r2)).to.equal(form);
      expect(r1.follow).to.equal(1);
      expect(r2.follow).to.equal(2);
      expect(r1.counter).to.equal(0);
      expect(r2.counter).to.equal(0);
    });

    it("should clone a Stream", function(){
      const url = `${base}hello`;

      let body = stringToReadableStream("a=1");

      const r1 = new Request(url, {
        method: "POST",
        follow: 1,
        body: body
      });
      const r2 = new Request(r1, {
        follow: 2
      });

      expect(getInstanceBody(r2)).to.not.equal(getInstanceBody(r1));

      expect(r2.url).to.equal(url);
      expect(r2.method).to.equal("POST");
      // note that we didn't clone the body
      expect(r2.text()).to.eventually.equal("a=1");
      expect(r1.follow).to.equal(1);
      expect(r2.follow).to.equal(2);
      expect(r1.counter).to.equal(0);
      expect(r2.counter).to.equal(0);
    });
  });

  it("should throw error with GET/HEAD requests with body", function() {
    expect(() => new Request(".", { body: "" })).to.throw(TypeError);
    expect(() => new Request(".", { body: "a" })).to.throw(TypeError);
    expect(() => new Request(".", { body: "", method: "HEAD" })).to.throw(
      TypeError
    );
    expect(() => new Request(".", { body: "a", method: "HEAD" })).to.throw(
      TypeError
    );
    expect(() => new Request(".", { body: "a", method: "get" })).to.throw(
      TypeError
    );
    expect(() => new Request(".", { body: "a", method: "head" })).to.throw(
      TypeError
    );
  });

  it("should default to null as body", function() {
    const req = new Request(".");
    expect(req.body).to.equal(null);
    return req.text().then(result => expect(result).to.equal(""));
  });

  it("should support empty body", function() {
    const req = new Request(".", { method: "POST", body: "" });
    return req.text().then(result => {
      expect(result).to.equal("");
    });
  });

  it("should support parsing headers", function() {
    const url = base;
    const req = new Request(url, {
      headers: {
        a: "1"
      }
    });
    expect(req.url).to.equal(url);
    expect(req.headers.get("a")).to.equal("1");
  });

  it("should support arrayBuffer() method", function() {
    const url = base;
    var req = new Request(url, {
      method: "POST",
      body: "a=1"
    });
    expect(req.url).to.equal(url);
    return req.arrayBuffer().then(function(result) {
      expect(result).to.be.an.instanceOf(ArrayBuffer);
      const str = String.fromCharCode.apply(null, new Uint8Array(result));
      expect(str).to.equal("a=1");
    });
  });

  it("should support text() method", function() {
    const url = base;
    const req = new Request(url, {
      method: "POST",
      body: "a=1"
    });
    expect(req.url).to.equal(url);
    return req.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support json() method", function() {
    const url = base;
    const req = new Request(url, {
      method: "POST",
      body: '{"a":1}'
    });
    expect(req.url).to.equal(url);
    return req.json().then(result => {
      expect(result.a).to.equal(1);
    });
  });

  it("should support formData() method", function() {
    const url = base;
    const req = new Request(url, {
      method: "POST",
      body: 'a=1&b=2',
	  headers: {
        "Content-Type": "application/x-www-form-urlencoded"
	  }
    });
    expect(req.url).to.equal(url);
    return req.formData().then(result => {
      expect(result.get('a')).to.equal('1');
      expect(result.get('b')).to.equal('2');
    });
  });

  it("should support buffer() method", function() {
    const url = base;
    const req = new Request(url, {
      method: "POST",
      body: "a=1"
    });
    expect(req.url).to.equal(url);
    return req.buffer().then(result => {
      expect(result.toString()).to.equal("a=1");
    });
  });

  it("should support blob() method", function() {
    const url = base;
    var req = new Request(url, {
      method: "POST",
      body: Buffer.from("a=1")
    });
    expect(req.url).to.equal(url);
    return req.blob().then(function(result) {
      expect(result).to.be.an.instanceOf(Blob);
      expect(result.size).to.equal(3);
      expect(result.type).to.equal("");
    });
  });

  it("should support arbitrary url", function() {
    const url = "anything";
    const req = new Request(url);
    expect(req.url).to.equal("anything");
  });

  it("should support clone() method", function() {
    const url = base;
    let body = stringToReadableStream("a=1");
    const agent = new http.Agent();
    const req = new Request(url, {
      body,
      method: "POST",
      redirect: "manual",
      headers: {
        b: "2"
      },
      follow: 3,
      compress: false,
      agent
    });
    const cl = req.clone();
    expect(cl.url).to.equal(url);
    expect(cl.method).to.equal("POST");
    expect(cl.redirect).to.equal("manual");
    expect(cl.headers.get("b")).to.equal("2");
    expect(cl.follow).to.equal(3);
    expect(cl.compress).to.equal(false);
    expect(cl.method).to.equal("POST");
    expect(cl.counter).to.equal(0);
    expect(cl.agent).to.equal(agent);
    // clone body shouldn't be the same body
    expect(cl.body).to.not.equal(body);
    return Promise.all([cl.text(), req.text()]).then(results => {
      expect(results[0]).to.equal("a=1");
      expect(results[1]).to.equal("a=1");
    });
  });

  it("should support ArrayBuffer as body", function() {
    const req = new Request("", {
      method: "POST",
      body: stringToArrayBuffer("a=1")
    });
    return req.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support Uint8Array as body", function() {
    const req = new Request("", {
      method: "POST",
      body: new Uint8Array(stringToArrayBuffer("a=1"))
    });
    return req.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });

  it("should support DataView as body", function() {
    const req = new Request("", {
      method: "POST",
      body: new DataView(stringToArrayBuffer("a=1"))
    });
    return req.text().then(result => {
      expect(result).to.equal("a=1");
    });
  });
});

function readableStreamToPromise(stream, dataHandler) {
  return new Promise(resolve => {
    const reader = stream.getReader();

    reader.read().then(function bufferData(read) {
      if (read.done) {
        resolve();
        return;
      }

      dataHandler(read.value);

      return reader.read().then(bufferData);
    });
  });
}
