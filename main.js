var ws = require('ws');
var shortid = require('shortid');
var Promise = require('bluebird');
var EventEmitter = require('events');

var URL = 'wss://pubsub-edge.twitch.tv';

class TwitchPubSub extends EventEmitter {
    constructor(options = {reconnect: true, defaultTopics: [], authToken: null}) {
        if (options.defaultTopics.length < 1)throw new Error('missing default topic');
        this._token = options.authToken;
        this._reconnect = options.reconnect;
        this._ws = new ws.WebSocket(URL);

        this._pending = {};
        this._initial = null;
        this._tries = 0;
        this._topics = options.defaultTopics;

        this._ws.on('open', ()=> {
            this._initial = shortid.generate();
            this._ws.send(JSON.stringify({
                type: 'LISTEN',
                nonce: this._initial,
                data: {topics: options.defaultTopics, auth_token: (this._token ? this._token : undefined)}
            }));
        });

        this._ws.on('close', ()=> {
            if (this._reconnect) {
                setTimeout(()=> {
                    this._ws = new ws.WebSocket(URL);
                }, 1000 * this._tries);
                this._tries++;
            }
            this.emit('close', this._reconnect);
        });

        this._ws.on('message', (msg)=> {
            try {
                msg = JSON.parse(msg);
                if (msg.type === 'RESPONSE') {
                    if (msg.nonce === this._initial) {
                        this._initial = null;
                        if (msg.error !== "")this.emit('error', 'Error while subscribing to initial topics', msg.error);
                    } else {
                        if (this._pending[msg.nonce]) {
                            if (msg.error !== "")this._pending[msg.nonce].reject(msg.error);
                            else this._pending[msg.nonce].resolve();
                            delete this._pending[msg.nonce];
                        } else this.emit('warn', 'Received message for unknown nonce.');
                    }
                } else if (msg.type === 'MESSAGE') {

                } else this.emit('warn', 'Received unknown message type. Maybe this package is outdated?');
            } catch (e) {
                this.emit('debug', e);
                this.emit('warn', 'Failed to parse websocket message', msg);
            }
        });
    }

    listen(topic) {
        if (!Array.isArray(topic)) {
            return new Promise((resolve, reject)=> {
                var nonce = shortid.generate();
                this._pending[nonce] = {resolve, reject};
                this._ws.send(JSON.stringify({
                    type: 'LISTEN',
                    nonce,
                    data: {auth_token: this._token, topics: [topic]}
                }));
                setTimeout(()=> {
                    this._pending[nonce].reject('timeout');
                    delete this._pending[nonce];
                }, 10000);
            });
        } else return new Promise((resolve, reject)=> {
            var nonce = shortid.generate();
            this._pending[nonce] = {resolve, reject};
            this._ws.send(JSON.stringify({
                type: 'LISTEN',
                nonce,
                data: {auth_token: this._token, topics: topic}
            }));
            setTimeout(()=> {
                this._pending[nonce].reject('timeout');
                delete this._pending[nonce];
            }, 10000);
        });
    }

    unlisten(topic) {
        if (!Array.isArray(topic)) {
            return new Promise((resolve, reject)=> {
                var nonce = shortid.generate();
                this._pending[nonce] = {resolve, reject};
                this._ws.send(JSON.stringify({
                    type: 'UNLISTEN',
                    nonce,
                    data: {auth_token: this._token, topics: [topic]}
                }));
                setTimeout(()=> {
                    this._pending[nonce].reject('timeout');
                    delete this._pending[nonce];
                }, 10000);
            });
        } else return new Promise((resolve, reject)=> {
            var nonce = shortid.generate();
            this._pending[nonce] = {resolve, reject};
            this._ws.send(JSON.stringify({
                type: 'UNLISTEN',
                nonce,
                data: {auth_token: this._token, topics: topic}
            }));
            setTimeout(()=> {
                this._pending[nonce].reject('timeout');
                delete this._pending[nonce];
            }, 10000);
        });
    }

    static TOPICS = {
        WHISPERS: 'whispers',

    };

    static topic(type, channel) {

    }
}

module.exports = TwitchPubSub;