// Adapted from: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/node-fetch/index.d.ts
// (see CHANGE comments)

/*!
 * This project is licensed under the MIT license.
 * Copyrights are respective of each contributor listed at the beginning of each definition file.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
// Type definitions for node-fetch 2.5
// Project: https://github.com/bitinn/node-fetch
// Definitions by: Torsten Werner <https://github.com/torstenwerner>
//                 Niklas Lindgren <https://github.com/nikcorg>
//                 Vinay Bedre <https://github.com/vinaybedre>
//                 Antonio Román <https://github.com/kyranet>
//                 Andrew Leedham <https://github.com/AndrewLeedham>
//                 Jason Li <https://github.com/JasonLi914>
//                 Steve Faulkner <https://github.com/southpolesteve>
//                 ExE Boss <https://github.com/ExE-Boss>
//                 Alex Savin <https://github.com/alexandrusavin>
//                 Alexis Tyler <https://github.com/OmgImAlexis>
//                 Jakub Kisielewski <https://github.com/kbkk>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/// <reference types="node" />
/// <reference types="@cloudflare/workers-types" />

import FormData from "formdata-node";
import { Agent, IncomingHttpHeaders } from "http";
import { URLSearchParams, URL } from "url";
import { ReadableStream } from "web-streams-polyfill";

// `AbortSignal` is defined here to prevent a dependency on a particular
// implementation like the `abort-controller` package, and to avoid requiring
// the `dom` library in `tsconfig.json`.

export interface AbortSignal {
    aborted: boolean;

    addEventListener: (type: "abort", listener: ((this: AbortSignal, event: any) => any), options?: boolean | {
        capture?: boolean,
        once?: boolean,
        passive?: boolean
    }) => void;

    removeEventListener: (type: "abort", listener: ((this: AbortSignal, event: any) => any), options?: boolean | {
        capture?: boolean
    }) => void;

    dispatchEvent: (event: any) => boolean;

    onabort?: null | ((this: AbortSignal, event: any) => void);
}

interface RequestCfProperties extends Omit<IncomingRequestCfProperties, 'tlsClientAuth'> {
    tlsClientAuth?: IncomingRequestCfProperties['tlsClientAuth'] | null;
}

export class Request extends Body {
    constructor(input: RequestInfo, init?: RequestInit);
    clone(): Request;
    context: RequestContext;
    headers: Headers;
    method: string;
    redirect: RequestRedirect;
    referrer: string;
    url: string;

    // node-fetch extensions to the whatwg/fetch spec
    agent?: Agent | ((parsedUrl: URL) => Agent);
    compress: boolean;
    counter: number;
    follow: number;
    hostname: string;
    port?: number;
    protocol: string;
    size: number;
    timeout: number;
    cf: RequestCfProperties;
}

export interface RequestInit {
    // whatwg/fetch standard options
    body?: BodyInit;
    headers?: HeadersInit;
    method?: string;
    redirect?: RequestRedirect;
    signal?: AbortSignal | null;

    // node-fetch extensions
    agent?: Agent | ((parsedUrl: URL) => Agent); // =null http.Agent instance, allows custom proxy, certificate etc.
    compress?: boolean; // =true support gzip/deflate content encoding. false to disable
    follow?: number; // =20 maximum redirect count. 0 to not follow redirect
    size?: number; // =0 maximum response body size in bytes. 0 to disable
    timeout?: number; // =0 req/res timeout in ms, it resets on redirect. 0 to disable (OS limit applies)
    cf?: RequestCfProperties;

    // node-fetch does not support mode, cache or credentials options
}

export type RequestContext =
    "audio"
    | "beacon"
    | "cspreport"
    | "download"
    | "embed"
    | "eventsource"
    | "favicon"
    | "fetch"
    | "font"
    | "form"
    | "frame"
    | "hyperlink"
    | "iframe"
    | "image"
    | "imageset"
    | "import"
    | "internal"
    | "location"
    | "manifest"
    | "object"
    | "ping"
    | "plugin"
    | "prefetch"
    | "script"
    | "serviceworker"
    | "sharedworker"
    | "style"
    | "subresource"
    | "track"
    | "video"
    | "worker"
    | "xmlhttprequest"
    | "xslt";
export type RequestMode = "cors" | "no-cors" | "same-origin";
export type RequestRedirect = "error" | "follow" | "manual";
export type RequestCredentials = "omit" | "include" | "same-origin";

export type RequestCache =
    "default"
    | "force-cache"
    | "no-cache"
    | "no-store"
    | "only-if-cached"
    | "reload";

export interface WebSocketMessageEvent {
    type: "message";
    data: string;
}

export interface WebSocketCloseEvent {
    type: "close";
    code?: number;
    reason?: string;
}

export interface WebSocketErrorEvent {
    type: "error";
    error: any;
}

export interface WebSocket {
    accept(): void;
    addEventListener(type: "message", listener: (event: WebSocketMessageEvent) => void): void;
    addEventListener(type: "close", listener: (event: WebSocketCloseEvent) => void): void;
    addEventListener(type: "error", listener: (event: WebSocketErrorEvent) => void): void;
    dispatchEvent(type: "message", event: WebSocketMessageEvent): void;
    dispatchEvent(type: "close", event: WebSocketCloseEvent): void;
    dispatchEvent(type: "error", event: WebSocketErrorEvent): void;
    send(message: string): void;
    close(code?: number, reason?: string): void;
}

export class Headers implements Iterable<[string, string]> {
    constructor(init?: HeadersInit);
    forEach(callback: (value: string, name: string) => void): void;
    append(name: string, value: string): void;
    delete(name: string): void;
    get(name: string): string | null;
    has(name: string): boolean;
    raw(): { [k: string]: string[] };
    set(name: string, value: string): void;

    // Iterable methods
    entries(): IterableIterator<[string, string]>;
    keys(): IterableIterator<string>;
    values(): IterableIterator<[string]>;
    [Symbol.iterator](): Iterator<[string, string]>;
}

type BlobPart = ArrayBuffer | ArrayBufferView | Blob | string;

interface BlobOptions {
    type?: string;
    endings?: "transparent" | "native";
}

export class Blob {
    constructor(blobParts?: BlobPart[], options?: BlobOptions);
    readonly type: string;
    readonly size: number;
    slice(start?: number, end?: number): Blob;
}

export class Body {
    constructor(body?: any, opts?: { size?: number; timeout?: number });
    arrayBuffer(): Promise<ArrayBuffer>;
    blob(): Promise<Blob>;
    // CHANGE: Switched `NodeJS.ReadableStream` to `ReadableStream`
    body: ReadableStream;
    bodyUsed: boolean;
    buffer(): Promise<Buffer>;
    json(): Promise<any>;
    size: number;
    text(): Promise<string>;
    textConverted(): Promise<string>;
    // CHANGE: Added `formData()`
    formData(): Promise<FormData>;
    timeout: number;
}

interface SystemError extends Error {
    code?: string;
}

export class FetchError extends Error {
    name: "FetchError";
    constructor(message: string, type: string, systemError?: SystemError);
    type: string;
    code?: string;
    errno?: string;
}

export class Response extends Body {
    constructor(body?: BodyInit, init?: ResponseInit);
    static error(): Response;
    // CHANGE: made `status` optional
    static redirect(url: string, status?: number): Response;
    clone(): Response;
    headers: Headers;
    ok: boolean;
    redirected: boolean;
    status: number;
    statusText: string;
    type: ResponseType;
    url: string;
    webSocket?: WebSocket;
}

export type ResponseType =
    "basic"
    | "cors"
    | "default"
    | "error"
    | "opaque"
    | "opaqueredirect";

export interface ResponseInit {
    headers?: HeadersInit;
    size?: number;
    status?: number;
    statusText?: string;
    timeout?: number;
    url?: string;
    webSocket?: WebSocket;
}

interface URLLike {
    href: string;
}

// CHANGE: Added `| IncomingHttpHeaders`
export type HeadersInit = Headers | string[][] | { [key: string]: string } | IncomingHttpHeaders;
// HeaderInit is exported to support backwards compatibility. See PR #34382
export type HeaderInit = HeadersInit;
export type BodyInit =
    ArrayBuffer
    | ArrayBufferView
    | NodeJS.ReadableStream
    | string
    | URLSearchParams
    | FormData
    // CHANGE: Addded `ReadableStream` and `null`
    | ReadableStream
    | null;
export type RequestInfo = string | URLLike | Request;

declare function fetch(
    url: RequestInfo,
    init?: RequestInit
): Promise<Response>;

declare namespace fetch {
    function isRedirect(code: number): boolean;
}

export default fetch;
