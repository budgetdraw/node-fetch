
/**
 * body.js
 *
 * Body interface provides common methods for Request and Response
 */

import { ReadableStream, TransformStream } from "stream/web";

import Blob, { BUFFER } from './blob.js';
import FetchError from './fetch-error.js';
import Stream, { PassThrough } from "stream";
import Busboy from "busboy";
import FormData from "formdata-node";

export const INTERNALS = Symbol('Body internals');

export function getTypeOfBody(body) {
	if (body == null) {
		return "null";
	} else if (typeof body === 'string') {
		return "String";
	} else if (isURLSearchParams(body)) {
		return "URLSearchParams";
	} else if (body instanceof Blob) {
		return "Blob";
	} else if (Buffer.isBuffer(body)) {
		return "Buffer";
	} else if (Object.prototype.toString.call(body) === '[object ArrayBuffer]') {
		return "ArrayBuffer"
	} else if (ArrayBuffer.isView(body)) {
		return "ArrayBufferView";
	} else if (body.toString() ==='[object FormData]' || Object.prototype.toString.call(body) === '[object FormData]') {
		return "FormData";
	} else if (body instanceof Stream) {
		return "Stream"
	} else if (
		body instanceof ReadableStream ||
		// Allow detecting a "ReadableStream" from a different install/realm
		(body.constructor.name === "ReadableStream" && typeof body.getReader == "function")
	) {
		return "ReadableStream";
	} else {
		return "other";
	}
}

function readableNodeToWeb(nodeStream, instance) {
    return new ReadableStream({
        start(controller) {
            nodeStream.pause();
            nodeStream.on('data', chunk => {
				// TODO: Should we only do Buffer.from() if chunk is a UInt8Array?
				// Potentially it makes more sense for down-stream consumers of fetch to cast to Buffer, instead?
				// if(isUInt8Array(chunk)) {
				controller.enqueue(new Uint8Array(Buffer.from(chunk)));

				// HELP WANTED: The node-web-streams package pauses the nodeStream here, however,
				// if we do that, then it gets permanently paused. Why?
                // 		nodeStream.pause();
            });
            nodeStream.on('end', () => {
				controller.close();

				const pending = controller.byobRequest;
				if (pending) {
					pending.respond(0);
				}
			});
            nodeStream.on('error', (err) => {
				controller.error(new FetchError(`Invalid response body while trying to fetch ${instance.url}: ${err.message}`, 'system', err))
			});
        },
        pull(controller) {
            nodeStream.resume();
        },
        cancel(reason) {
            nodeStream.pause();
		},
		type: "bytes"
    });
}

export function createReadableStream(instance) {
	const body = getInstanceBody(instance);
	const bodyType = getTypeOfBody(body);

	if (bodyType === "null") {
		return null;
	}

	if (bodyType === 'ReadableStream') {
		return body.pipeThrough(new TransformStream({
			transform(chunk, controller) {
				// TODO: Should we only do Buffer.from() if chunk is a UInt8Array?
				// Potentially it makes more sense for down-stream consumers of fetch to cast to Buffer, instead?
				// if(isUInt8Array(chunk)) {
				const array = new Uint8Array(Buffer.from(chunk));
				if(array.length > 0) controller.enqueue(array);
			}
		}));
	}

	if (bodyType === "Stream") {
		body.pause();
		return readableNodeToWeb(body, instance);
	}

	const readable = new ReadableStream({
		start(controller) {
			let array = undefined;
			switch (bodyType) {
				case "String":
					// body is a string:
					array = new Uint8Array(Buffer.from(body));
					break;
				case "URLSearchParams":
					// body is a URLSearchParams
					array = new Uint8Array(Buffer.from(body.toString()));
					break;
				case "Blob":
					// body is blob
					array = new Uint8Array(Buffer.from(body[BUFFER]));
					break;
				case "Buffer":
					// body is Buffer
					array = new Uint8Array(Buffer.from(body));
					break;
				case "ArrayBuffer":
					// body is ArrayBuffer
					array = new Uint8Array(Buffer.from(body));
					break;
				case "ArrayBufferView":
					// body is ArrayBufferView
					array = new Uint8Array(Buffer.from(body.buffer));
					break;
				case "FormData":
					array = new Uint8Array(Buffer.from(body.toString()));
					break;
				case "other":
					array = new Uint8Array(Buffer.from(String(body)));
					break;
				default:
					throw new Error("createReadableStream received an instance body that getTypeOfBody could not understand");
			}
			if(array && array.length > 0) controller.enqueue(array);
			controller.close();
		},
		type: "bytes"
	});

	return readable;
}


/**
 * Body mixin
 *
 * Ref: https://fetch.spec.whatwg.org/#body
 *
 * @param   Stream  body  Readable stream
 * @param   Object  opts  Response options
 * @return  Void
 */
export default function Body(body, {
	size = 0,
	timeout = 0,
	name = "Body"
} = {}) {
	this.size = size;
	this.timeout = timeout;

	this[INTERNALS] = {
		body: body,
		readableStream: null,
		disturbed: false,
		name
	};

	const bodyType = getTypeOfBody(body);
	if (bodyType !== 'ReadableStream') {
		this[INTERNALS].readableStream = createReadableStream(this);
	} else {
		this[INTERNALS].readableStream = body;
	}
}

Body.prototype = {
	// NOTE: Firefox and Chrome return `undefined` if initial body is undefined, when looking at Request.body, they always return undefined.
	get body() {
		return getInstanceReadableStream(this);
	},

	get bodyUsed() {
		return this[INTERNALS].disturbed;
	},

	/**
	 * Decode response as ArrayBuffer
	 *
	 * @return  Promise
	 */
	arrayBuffer() {
		return consumeBody.call(this).then(buf => {
			var ab = new ArrayBuffer(buf.length);
			var view = new Uint8Array(ab);
			for (var i = 0; i < buf.length; ++i) {
				view[i] = buf[i];
			}
			return ab;
		});
	},

	/**
	 * Return raw response as Blob
	 *
	 * @return Promise
	 */
	blob() {
		let ct = this.headers && this.headers.get('content-type') || '';
		return consumeBody.call(this).then(buf => Object.assign(
			// Prevent copying
			new Blob([], {
				type: ct.toLowerCase()
			}),
			{
				[BUFFER]: buf
			}
		));
	},

	/**
	 * Decode response as json
	 *
	 * @return  Promise
	 */
	json() {
		return consumeBody.call(this).then((buffer) => {
			try {
				return JSON.parse(buffer.toString());
			} catch (err) {
				return Promise.reject(new FetchError(`invalid json response body at ${this.url} reason: ${err.message}`, 'invalid-json'));
			}
		})
	},

	/**
	 * Decode response as text
	 *
	 * @return  Promise
	 */
	text() {
		return consumeBody.call(this).then(buffer => buffer.toString());
	},

	/**
	 * Decode response as buffer (non-spec api)
	 *
	 * @return  Promise
	 */
	buffer() {
		return consumeBody.call(this);
	},

	formData() {
		return consumeBody.call(this).then(buffer => {
			return new Promise((resolve, reject) => {
				var formdata = new FormData();
				var busboy = new Busboy({headers: {
					'content-type': this.headers.get('content-type'),
				}});
				busboy.on('field', (fieldname, val) => formdata.append(fieldname, val));
				busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
					let val = "";
					file.on('data', (data) => val += data);
					file.on('end', () => formdata.append(fieldname, val, filename));
				});
				busboy.on('finish', () => resolve(formdata));
				writeToStream(busboy, this);
			});
		});
	},

};

// In browsers, all properties are enumerable.
Object.defineProperties(Body.prototype, {
	body: { enumerable: true },
	bodyUsed: { enumerable: true },
	arrayBuffer: { enumerable: true },
	blob: { enumerable: true },
	json: { enumerable: true },
	text: { enumerable: true }
});

Body.mixIn = function (proto) {
	for (const name of Object.getOwnPropertyNames(Body.prototype)) {
		// istanbul ignore else: future proof
		if (!(name in proto)) {
			const desc = Object.getOwnPropertyDescriptor(Body.prototype, name);
			Object.defineProperty(proto, name, desc);
		}
	}
};

/**
 * Consume and convert an entire Body to a Buffer.
 *
 * Ref: https://fetch.spec.whatwg.org/#concept-body-consume-body
 *
 * @return  Promise
 */
function consumeBody() {
	const instance = this;

	if (instance[INTERNALS].disturbed) {
		return Promise.reject(new TypeError(`body used already for: ${instance.url}`));
	}

	instance[INTERNALS].disturbed = true;

	let resTimeout;
	const promise = new Promise((resolve, reject) => {
		const readable = getInstanceReadableStream(instance);

		if (readable == null) {
			return resolve(Buffer.alloc(0));
		}

		const reader = readable.getReader();
		let timedOut = false;

		// allow timeout on slow response body
		if (instance.timeout) {
			resTimeout = setTimeout(() => {
				timedOut = true;
				reject(new FetchError(`Response timeout while trying to fetch ${instance.url} (over ${instance.timeout}ms)`, 'body-timeout'));
			}, instance.timeout);
		}

		let buffers = [];
		let totalBytes = 0;

		function push() {
			reader.read().then(function(read) {
				let bufferedData;
				let chunk;

				if (timedOut) {
					return;
				}

				if (read.done) {
					try {
						bufferedData = Buffer.concat(buffers, totalBytes)
					} catch(err) {
						// handle streams that have accumulated too much data (issue #414)
						reject(new FetchError(`Could not create Buffer from response body for ${instance.url}: ${err.message}`, 'system', err));
						return;
					}

					resolve(bufferedData);
					return;
				}

				chunk = Buffer.from(read.value);

				if (instance.size && totalBytes + chunk.length > instance.size) {
					reject(new FetchError(`content size at ${instance.url} over limit: ${instance.size}`, 'max-size'));
					return;
				}


				buffers.push(chunk);
				totalBytes += chunk.length;

				push();
			}, function (err) {
				reject(err);
			});
		}

		push();
	});

	promise.then(
		() => resTimeout && clearTimeout(resTimeout),
		() => resTimeout && clearTimeout(resTimeout)
	);

	return promise;
}

/**
 * Detect a URLSearchParams object
 * ref: https://github.com/bitinn/node-fetch/issues/296#issuecomment-307598143
 *
 * @param   Object  obj     Object to detect by type or brand
 * @return  String
 */
function isURLSearchParams(obj) {
	// Duck-typing as a necessary condition.
	if (typeof obj !== 'object' ||
		typeof obj.append !== 'function' ||
		typeof obj.delete !== 'function' ||
		typeof obj.get !== 'function' ||
		typeof obj.getAll !== 'function' ||
		typeof obj.has !== 'function' ||
		typeof obj.set !== 'function') {
		return false;
	}

	// Brand-checking and more duck-typing as optional condition.
	return obj.constructor.name === 'URLSearchParams' ||
		Object.prototype.toString.call(obj) === '[object URLSearchParams]' ||
		typeof obj.sort === 'function';
}

/**
 * Clone body given Res/Req instance
 *
 * @param   Mixed  instance  Response or Request instance
 * @return  Mixed
 */
export function cloneBody(instance) {
	const body = getInstanceBody(instance);
	const bodyType = getTypeOfBody(body);
	// don't allow cloning a used body
	if (instance.bodyUsed) {
		throw new Error('cannot clone body after it is used');
	}

	// check that body is a stream and not form-data object
	// note: we can't clone the form-data object without having it as a dependency
	if (bodyType === "Stream") {
		// tee instance body
		let p1 = new PassThrough();
		let p2 = new PassThrough();

		// set instance body to teed body and return the other teed body
		instance[INTERNALS].body = p1;
		instance[INTERNALS].readableStream = createReadableStream(instance);

		body.pipe(p1);
		body.pipe(p2);
		// body.resume();

		return p2;
	} else if(bodyType === "ReadableStream") {
		let [p1, p2] = body.tee();

		// set instance body to teed body and return the other teed body
		instance[INTERNALS].body = p1;
		instance[INTERNALS].readableStream = p1;

		return p2;
	}

	// Note the early returns
	return body;
}

/**
 * Performs the operation "extract a `Content-Type` value from |object|" as
 * specified in the specification:
 * https://fetch.spec.whatwg.org/#concept-bodyinit-extract
 *
 * This function assumes that instance.body is present.
 *
 * @param   Mixed  instance  Response or Request instance
 */
export function extractContentType(instance) {
	const body = getInstanceBody(instance);
	const bodyType = getTypeOfBody(body);

	switch(bodyType) {
		case "String":
		case "other":
			return 'text/plain;charset=UTF-8';
		case "URLSearchParams":
			return 'application/x-www-form-urlencoded;charset=UTF-8';
		case "Blob":
			return body.type || null;
		case "FormData":
			return `multipart/form-data;boundary=${body.boundary}`;
		default:
			return null;
	}
}

/**
 * The Fetch Standard treats this as if "total bytes" is a property on the body.
 * For us, we have to explicitly get it with a function.
 *
 * ref: https://fetch.spec.whatwg.org/#concept-body-total-bytes
 *
 * @param   Body    instance   Instance of Body
 * @return  Number?            Number of bytes, or null if not possible
 */
export function getTotalBytes(instance) {
	const body = getInstanceBody(instance);
	const bodyType = getTypeOfBody(body);

	switch (bodyType) {
		case "null":
			return 0;
		case "String":
			return Buffer.byteLength(body);
		case "URLSearchParams":
		case "other":
			return Buffer.byteLength(String(body));
		case "Blob":
			return body.size;
		case "Buffer":
			return body.length;
		case "ArrayBuffer":
		case "ArrayBufferView":
			return body.byteLength;
		case "FormData":
			if (
				(body._lengthRetrievers && body._lengthRetrievers.length == 0) || // 1.x
				(body.hasKnownLength && body.hasKnownLength())
			) { // 2.x
				return body.getLengthSync();
			}
		default:
			return null;
	}
}

/**
 * Write a Body to a Node.js (e.g. http.Request) object.
 *
 * @param   Body    instance   Instance of Body
 * @return  Void
 */
export function writeToStream(dest, instance) {
	const body = getInstanceBody(instance);
	const bodyType = getTypeOfBody(body);

	switch(bodyType) {
		case "null":
			dest.end();
			break;
		case "Stream":
			body.pipe(dest);
			break;
		case "ReadableStream":
			const [out1, out2] = body.tee();
			const reader = out2.getReader();

			function push() {
				reader.read().then(function(read) {
					if (read.done) {
						dest.end();
						return;
					}

					// TODO: Should we only do Buffer.from() if chunk is a UInt8Array?
					// if(isUInt8Array(chunk)) {
					dest.write(Buffer.from(read.value));
					push();
				});
			}

			instance[INTERNALS].body = out1;

			push();
			break;
		case "String":
			dest.write(body);
			dest.end();
			break;
		// case "URLSearchParams":
		// 	dest.write(body.toString());
		// 	dest.end();
		// 	break;
		case "Blob":
			dest.write(body[BUFFER]);
			dest.end();
			break;
		case "Buffer":
			dest.write(body);
			dest.end();
			break;
		case "ArrayBuffer":
			dest.write(Buffer.from(body));
			dest.end();
			break;
		case "ArrayBufferView":
			dest.write(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
			dest.end();
			break;
		case "FormData":
			body.stream.pipe(dest);
			break;
		default:
			dest.write(String(body));
			dest.end();
			break;
	}
}

export function getInstanceName(instance) {
	return instance[INTERNALS].name;
}

export function getInstanceBody(instance) {
	return instance[INTERNALS].body;
}

export function setInstanceBody(instance, newBody) {
	return instance[INTERNALS].body = newBody;
}

export function getInstanceReadableStream(instance) {
	return instance[INTERNALS].readableStream;
}
